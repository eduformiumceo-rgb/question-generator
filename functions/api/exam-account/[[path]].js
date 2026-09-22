/**
 * ═══════════════════════════════════════════════════════════════════
 * Cloudflare Pages Function — EDUFORMIUM Questions Generator
 * FILE: functions/api/exam-account/[[path]].js
 *
 * Routes:
 *   GET  /api/exam-account/balance          → { balance }
 *   GET  /api/exam-account/history          → [{ id, title, subject, class, exam_type, created_at }]
 *   GET  /api/exam-account/history/:id      → full saved exam (exam_json + meta_json)
 *   POST /api/exam-account/history          → save a generated exam { title, subject, class, exam_type, exam_json, meta_json }
 *   DEL  /api/exam-account/history/:id      → delete a saved exam
 *
 * Same shared-Supabase-project / shared-JWT-secret pattern as
 * generate-exam.js — see that file's header comment for the env vars.
 * ═══════════════════════════════════════════════════════════════════
 */

const MAX_EXAM_HISTORY_PER_USER = 10; // mirrors DB.MAX_PLANS_PER_USER in the Lesson Planner's db.js

function resolveEnv(raw, request) {
  const isDev = new URL(request.url).hostname.startsWith("dev.");
  return {
    ...raw,
    SUPABASE_URL:         isDev ? raw.DEV_SUPABASE_URL         : (raw.PROD_SUPABASE_URL         || raw.SUPABASE_URL),
    SUPABASE_SERVICE_KEY: isDev ? raw.DEV_SUPABASE_SERVICE_KEY : (raw.PROD_SUPABASE_SERVICE_KEY || raw.SUPABASE_SERVICE_KEY),
    JWT_SECRET:           isDev ? raw.DEV_JWT_SECRET           : (raw.PROD_JWT_SECRET           || raw.JWT_SECRET),
    ALLOWED_ORIGIN:       isDev ? raw.DEV_ALLOWED_ORIGIN       : (raw.PROD_ALLOWED_ORIGIN       || raw.ALLOWED_ORIGIN),
  };
}
function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
function jsonResp(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }

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
async function sb(env, path, opts = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "apikey": env.SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Prefer": "return=representation", ...(opts.headers || {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || data?.error || `Supabase ${res.status}`);
  return data;
}
async function requireUser(request, env) {
  const token = (request.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!token) return null;
  return verifyJWT(token, env.JWT_SECRET);
}

export async function onRequest(context) {
  const { request } = context;
  const env = resolveEnv(context.env, request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env) });

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/exam-account/, "") || "/";
  let response;
  try {
    const user = await requireUser(request, env);
    if (!user) { response = jsonResp({ error: "Please sign in." }, 401); return withCORS(response, env); }

    if (request.method === "GET" && path === "/balance") response = await getBalance(env, user);
    else if (request.method === "GET" && path === "/history") response = await listHistory(env, user);
    else if (request.method === "GET" && path.startsWith("/history/")) response = await getHistoryItem(env, user, path.split("/")[2]);
    else if (request.method === "GET" && path === "/sol-lookup") response = await lookupScheme(env, user, url);
    else if (request.method === "POST" && path === "/history") response = await saveHistory(request, env, user);
    else if (request.method === "DELETE" && path.startsWith("/history/")) response = await deleteHistory(env, user, path.split("/")[2]);
    else response = jsonResp({ error: "Not found." }, 404);
  } catch (e) {
    console.error("[exam-account error]", e?.stack || e?.message || e);
    response = jsonResp({ error: "Something went wrong. Please try again." }, 500);
  }
  return withCORS(response, env);
}
function withCORS(response, env) {
  const r = new Response(response.body, response);
  Object.entries(corsHeaders(env)).forEach(([k, v]) => r.headers.set(k, v));
  return r;
}

async function getBalance(env, user) {
  const rows = await sb(env, `/exam_credits?user_id=eq.${user.sub}&select=balance`);
  return jsonResp({ balance: rows?.[0]?.balance ?? 0 });
}

async function listHistory(env, user) {
  const rows = await sb(env, `/exam_history?user_id=eq.${user.sub}&select=id,title,subject,class,exam_type,created_at&order=created_at.desc&limit=${MAX_EXAM_HISTORY_PER_USER}`);
  return jsonResp({ exams: rows || [] });
}

async function getHistoryItem(env, user, id) {
  if (!id) return jsonResp({ error: "Missing id." }, 400);
  const rows = await sb(env, `/exam_history?id=eq.${id}&user_id=eq.${user.sub}&select=*&limit=1`);
  if (!rows?.length) return jsonResp({ error: "Not found." }, 404);
  return jsonResp(rows[0]);
}

async function saveHistory(request, env, user) {
  const { title, subject, class: cls, exam_type, exam_json, meta_json } = await request.json();
  if (!exam_json) return jsonResp({ error: "Missing exam data." }, 400);

  // Enforce the per-user cap server-side — a client-supplied count can't be trusted.
  const existing = await sb(env, `/exam_history?user_id=eq.${user.sub}&select=id,created_at&order=created_at.asc`);
  if ((existing || []).length >= MAX_EXAM_HISTORY_PER_USER) {
    const oldest = existing[0];
    await sb(env, `/exam_history?id=eq.${oldest.id}`, { method: "DELETE" }).catch(() => {});
  }

  const saved = await sb(env, "/exam_history", {
    method: "POST",
    body: JSON.stringify({
      user_id: user.sub,
      title: String(title || "Untitled Exam").slice(0, 200),
      subject: String(subject || "").slice(0, 200),
      class: String(cls || "").slice(0, 100),
      exam_type: String(exam_type || "").slice(0, 100),
      exam_json,
      meta_json: meta_json || {},
    }),
  });
  return jsonResp(saved?.[0] || { ok: true });
}

async function deleteHistory(env, user, id) {
  if (!id) return jsonResp({ error: "Missing id." }, 400);
  await sb(env, `/exam_history?id=eq.${id}&user_id=eq.${user.sub}`, { method: "DELETE" });
  return jsonResp({ ok: true });
}

async function lookupScheme(env, user, url) {
  const subject = url.searchParams.get("subject") || "";
  const className = url.searchParams.get("className") || "";
  const term = url.searchParams.get("term") || "";
  if (!subject || !className) return jsonResp({ error: "Subject and class are required." }, 400);

  // Read-only access to the Lesson Planner's own `lesson_plans` table — same
  // Supabase project, same user_id. This app never writes to that table.
  const q = (extra) => `/lesson_plans?user_id=eq.${user.sub}&subject=eq.${encodeURIComponent(subject)}&class_name=eq.${encodeURIComponent(className)}${term ? `&term=eq.${encodeURIComponent(term)}` : ""}${extra}`;

  // 1. Prefer a saved Scheme of Learning (type="term") — one row covers the
  //    whole term's Week|Strand|Sub-Strand breakdown, most reliable source.
  const solRows = await sb(env, q(`&type=eq.term&select=strand,sub_strand,term,saved_at,raw_data&order=saved_at.desc&limit=1`));
  if (solRows?.length) {
    const sol = solRows[0];
    const rows = Array.isArray(sol.raw_data?.rows) ? sol.raw_data.rows : [];
    const strandMap = {};
    rows.forEach(r => {
      const strand = r.strand || r.Strand;
      const subStrand = r.subStrand || r.sub_strand || r.SubStrand;
      if (!strand || !subStrand) return;
      if (!strandMap[strand]) strandMap[strand] = new Set();
      strandMap[strand].add(subStrand);
    });
    const strands = Object.entries(strandMap).map(([strand, set]) => ({ strand, subStrands: [...set] }));
    if (strands.length) {
      return jsonResp({ source: "scheme_of_learning", savedAt: sol.saved_at, term: sol.term, strands });
    }
  }

  // 2. Fall back to aggregating individual saved weekly lesson plans
  //    (type="single") for this subject/class/term — partial by nature,
  //    since the 10-plan retention cap may have evicted earlier weeks.
  const singleRows = await sb(env, q(`&type=eq.single&select=strand,sub_strand,week,saved_at&order=week.asc`));
  if (singleRows?.length) {
    const strandMap = {};
    singleRows.forEach(r => {
      if (!r.strand || !r.sub_strand) return;
      if (!strandMap[r.strand]) strandMap[r.strand] = new Set();
      strandMap[r.strand].add(r.sub_strand);
    });
    const strands = Object.entries(strandMap).map(([strand, set]) => ({ strand, subStrands: [...set] }));
    if (strands.length) {
      return jsonResp({ source: "weekly_plans_partial", weeksFound: singleRows.length, strands });
    }
  }

  return jsonResp({ source: "none", strands: [] });
}

