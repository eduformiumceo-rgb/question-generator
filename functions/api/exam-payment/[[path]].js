/**
 * ═══════════════════════════════════════════════════════════════════
 * Cloudflare Pages Function — EDUFORMIUM Questions Generator
 * FILE: functions/api/exam-payment/[[path]].js
 *
 * Paystack top-up for THIS app's exam_credits wallet — a deliberate,
 * close mirror of the Lesson Planner's functions/api/payment/[[path]].js,
 * carrying over every security property that file already earned:
 *   - server is the source of truth for pricing (never trust a client amount)
 *   - transaction row created BEFORE calling Paystack (prevents fabricated refs)
 *   - ownership check on verify (prevents IDOR — claiming someone else's ref)
 *   - amount-match check against what Paystack actually confirms
 *   - atomic claim (status pending→processing) to prevent double-credit races
 *   - atomic RPC increment with a read-then-write fallback
 *   - failed credit step resets the transaction to "pending" so the user
 *     can recover via "restore previous purchase" instead of losing it
 *
 * Routes:
 *   GET  /api/exam-payment/balance      → { balance, packages }
 *   GET  /api/exam-payment/pending      → { pending_refs: string[] }
 *   POST /api/exam-payment/initialize   → { authorization_url, reference, package, amount_pesewas }
 *   POST /api/exam-payment/verify       → { success, credits_added, new_balance }
 *
 * ENV VARS — same PROD_/DEV_ SUPABASE_URL/SERVICE_KEY/JWT_SECRET/ALLOWED_ORIGIN
 * as generate-exam.js, plus PROD_PAYSTACK_SECRET_KEY / DEV_PAYSTACK_SECRET_KEY
 * (can be the SAME Paystack account as the Lesson Planner, or a separate one
 * if you want exam-credit revenue tracked apart from lesson-plan coin revenue —
 * either works; Paystack doesn't care which app calls it).
 * ═══════════════════════════════════════════════════════════════════
 */

function resolveEnv(raw, request) {
  const isDev = new URL(request.url).hostname.startsWith("dev.");
  return {
    ...raw,
    SUPABASE_URL:         isDev ? raw.DEV_SUPABASE_URL         : (raw.PROD_SUPABASE_URL         || raw.SUPABASE_URL),
    SUPABASE_SERVICE_KEY: isDev ? raw.DEV_SUPABASE_SERVICE_KEY : (raw.PROD_SUPABASE_SERVICE_KEY || raw.SUPABASE_SERVICE_KEY),
    JWT_SECRET:           isDev ? raw.DEV_JWT_SECRET           : (raw.PROD_JWT_SECRET           || raw.JWT_SECRET),
    ALLOWED_ORIGIN:       isDev ? raw.DEV_ALLOWED_ORIGIN       : (raw.PROD_ALLOWED_ORIGIN       || raw.ALLOWED_ORIGIN),
    PAYSTACK_SECRET_KEY:  isDev ? raw.DEV_PAYSTACK_SECRET_KEY  : (raw.PROD_PAYSTACK_SECRET_KEY   || raw.PAYSTACK_SECRET_KEY),
  };
}
function corsHeaders(env) { return { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" }; }
function jsonResp(data, status = 200, cors = {}) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors } }); }
function errResp(msg, status, cors) { return jsonResp({ error: { message: msg } }, status, cors); }

// Same GHS/credit exchange rate as the Lesson Planner's real COIN_PACKAGES
// (functions/api/payment/[[path]].js) — not a new, unrelated price point.
// A teacher moving between the two apps sees the same value per unit, even
// though the wallets are deliberately separate (see README §0/§7 history).
const CREDIT_PACKAGES = [
  { id: "trial",    credits: 4,  ghs: 600,  label: "4 Credits"  },
  { id: "starter",  credits: 7,  ghs: 1000, label: "7 Credits"  },
  { id: "standard", credits: 25, ghs: 3000, label: "25 Credits" },
  { id: "plus",     credits: 44, ghs: 5000, label: "44 Credits" },
  { id: "advanced", credits: 67, ghs: 7000, label: "67 Credits" },
  { id: "pro",      credits: 97, ghs: 9500, label: "97 Credits" },
];

async function verifyJWT(token, secret) {
  try {
    const [header, body, sig] = token.split(".");
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(`${header}.${body}`));
    if (!valid) return null;
    const payload = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}
async function verifyToken(env, token) {
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) throw new Error("Session expired. Please sign in again.");
  return { id: payload.sub, email: payload.email };
}
async function sbAdmin(env, path, opts = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "apikey": env.SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Prefer": "return=representation", ...(opts.headers || {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) { const e = new Error(data?.message || data?.error || `Supabase ${res.status}`); e.dbError = true; throw e; }
  return data;
}

export async function onRequest(context) {
  const { request } = context;
  const env = resolveEnv(context.env, request);
  const corsHdrs = corsHeaders(env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHdrs });

  const url = new URL(request.url);
  const action = url.pathname.replace(/^\/api\/exam-payment\//, "");
  const token = (request.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  const allowedOrigin = (env.ALLOWED_ORIGIN || "").trim().replace(/\/+$/, "");

  /* GET /balance */
  if (request.method === "GET" && action === "balance") {
    if (!token) return errResp("Not authenticated.", 401, corsHdrs);
    try {
      const user = await verifyToken(env, token);
      const rows = await sbAdmin(env, `/exam_credits?user_id=eq.${user.id}&select=balance`);
      if (!rows || rows.length === 0) {
        await sbAdmin(env, "/exam_credits", { method: "POST", body: JSON.stringify({ user_id: user.id, balance: 0 }) }).catch(() => {});
      }
      return jsonResp({ balance: rows?.[0]?.balance ?? 0, packages: CREDIT_PACKAGES }, 200, corsHdrs);
    } catch (e) { return errResp(e.message, e.dbError ? 500 : 401, corsHdrs); }
  }

  /* GET /pending */
  if (request.method === "GET" && action === "pending") {
    if (!token) return errResp("Not authenticated.", 401, corsHdrs);
    try {
      const user = await verifyToken(env, token);
      const rows = await sbAdmin(env, `/exam_transactions?user_id=eq.${user.id}&status=eq.pending&select=paystack_ref,created_at&order=created_at.desc&limit=20`);
      return jsonResp({ pending_refs: (rows || []).map(r => r.paystack_ref) }, 200, corsHdrs);
    } catch (e) { return errResp(e.message, e.dbError ? 500 : 401, corsHdrs); }
  }

  if (request.method !== "POST") return errResp("Method not allowed.", 405, corsHdrs);
  let body;
  try { body = await request.json(); } catch { return errResp("Invalid request.", 400, corsHdrs); }

  /* POST /initialize */
  if (action === "initialize") {
    if (!token) return errResp("Please log in to purchase credits.", 401, corsHdrs);
    let user;
    try { user = await verifyToken(env, token); } catch (e) { return errResp(e.message, 401, corsHdrs); }

    const pkg = CREDIT_PACKAGES.find(p => p.id === body.package_id);
    if (!pkg) return errResp("Invalid package.", 400, corsHdrs);

    const ref = `eduq_${user.id.slice(0, 8)}_${Date.now()}`;
    await sbAdmin(env, "/exam_transactions", {
      method: "POST",
      body: JSON.stringify({ user_id: user.id, amount_ghs: pkg.ghs / 100, credits_purchased: pkg.credits, paystack_ref: ref, status: "pending" }),
    });

    const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.PAYSTACK_SECRET_KEY}` },
      body: JSON.stringify({
        email: user.email, amount: pkg.ghs, currency: "GHS", reference: ref,
        metadata: { user_id: user.id, credits: pkg.credits, package_id: pkg.id },
        callback_url: `${allowedOrigin}/payment-success`,
      }),
    });
    const psData = await psRes.json();
    if (!psData.status) return errResp("Payment initialization failed. Please try again.", 500, corsHdrs);

    return jsonResp({ authorization_url: psData.data.authorization_url, reference: ref, package: pkg, amount_pesewas: pkg.ghs }, 200, corsHdrs);
  }

  /* POST /verify */
  if (action === "verify") {
    if (!token) return errResp("Not authenticated.", 401, corsHdrs);
    let verifyUser;
    try { verifyUser = await verifyToken(env, token); } catch (e) { return errResp(e.message, 401, corsHdrs); }

    const ref = body.reference;
    if (!ref) return errResp("Missing reference.", 400, corsHdrs);

    const existing = await sbAdmin(env, `/exam_transactions?paystack_ref=eq.${ref}&status=eq.completed&select=id,user_id,credits_purchased`);
    if (existing?.length > 0) {
      if (existing[0].user_id !== verifyUser.id) return errResp("Transaction not found. Please contact support.", 404, corsHdrs);
      return jsonResp({ message: "Already processed.", already_credited: true, credits_added: existing[0].credits_purchased }, 200, corsHdrs);
    }

    const pending = await sbAdmin(env, `/exam_transactions?paystack_ref=eq.${ref}&select=id,user_id,credits_purchased,status,amount_ghs`);
    if (!pending?.length) return errResp("Transaction not found. Please contact support.", 404, corsHdrs);
    const txn = pending[0];

    let psData;
    try {
      const psRes = await fetch(`https://api.paystack.co/transaction/verify/${ref}`, { headers: { "Authorization": `Bearer ${env.PAYSTACK_SECRET_KEY}` } });
      psData = await psRes.json();
    } catch (e) { return errResp("Could not reach Paystack to verify payment. Please try again.", 502, corsHdrs); }

    if (!psData.status || psData.data?.status !== "success") return errResp("Payment not confirmed by Paystack. If you were charged, please contact support.", 400, corsHdrs);

    const userId = txn.user_id;
    if (verifyUser.id !== userId) return errResp("Transaction not found. Please contact support.", 404, corsHdrs); // ownership / IDOR guard

    const psUserId = psData.data?.metadata?.user_id;
    if (psUserId && psUserId !== userId) return errResp("Transaction mismatch. Please contact support.", 400, corsHdrs);

    const expectedPesewas = Math.round((txn.amount_ghs || 0) * 100);
    const actualPesewas = psData.data?.amount;
    if (expectedPesewas > 0 && actualPesewas !== undefined && actualPesewas < expectedPesewas) {
      return errResp("Payment amount mismatch. Please contact support.", 400, corsHdrs);
    }

    const credits = txn.credits_purchased ?? parseInt(psData.data?.metadata?.credits ?? "0");
    if (!credits || credits <= 0) return errResp("Invalid credit amount. Please contact support.", 400, corsHdrs);

    // Atomic claim — PATCH only succeeds if status is still "pending", preventing a double-credit race.
    const claimResult = await sbAdmin(env, `/exam_transactions?paystack_ref=eq.${ref}&status=eq.pending`, {
      method: "PATCH", headers: { "Prefer": "return=representation" }, body: JSON.stringify({ status: "processing" }),
    });
    if (!claimResult?.length) return jsonResp({ message: "Already processed.", already_credited: true, credits_added: credits }, 200, corsHdrs);

    let newTotalBalance;
    try {
      await sbAdmin(env, `/rpc/increment_exam_credits`, { method: "POST", body: JSON.stringify({ p_user_id: userId, p_amount: credits }) });
      const balRows = await sbAdmin(env, `/exam_credits?user_id=eq.${userId}&select=balance`);
      newTotalBalance = balRows?.[0]?.balance ?? credits;
    } catch {
      try {
        const balRows = await sbAdmin(env, `/exam_credits?user_id=eq.${userId}&select=balance`);
        const current = balRows?.[0]?.balance ?? 0;
        newTotalBalance = current + credits;
        if (!balRows || balRows.length === 0) {
          await sbAdmin(env, "/exam_credits", { method: "POST", body: JSON.stringify({ user_id: userId, balance: newTotalBalance, updated_at: new Date().toISOString() }) });
        } else {
          await sbAdmin(env, `/exam_credits?user_id=eq.${userId}`, { method: "PATCH", body: JSON.stringify({ balance: newTotalBalance, updated_at: new Date().toISOString() }) });
        }
      } catch (creditErr) {
        await sbAdmin(env, `/exam_transactions?paystack_ref=eq.${ref}`, { method: "PATCH", body: JSON.stringify({ status: "pending" }) }).catch(() => {});
        return errResp("Payment verified but your credit top-up failed. Please use 'Restore Previous Purchase'. If this persists, contact support.", 500, corsHdrs);
      }
    }

    await sbAdmin(env, `/exam_transactions?paystack_ref=eq.${ref}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) });
    return jsonResp({ success: true, credits_added: credits, new_balance: newTotalBalance }, 200, corsHdrs);
  }

  return errResp("Unknown action.", 400, corsHdrs);
}
