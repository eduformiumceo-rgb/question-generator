/**
 * ═══════════════════════════════════════════════════════════════════
 * Cloudflare Pages Function — Eduformium Auth
 * FILE: functions/api/auth/[[path]].js
 *
 * Handles all routes under /api/auth/*
 *
 * Branch-aware (same pattern as the admin API / Timetable app): the
 * request hostname decides which Supabase project + JWT secret this
 * runs against. dev.yourdomain.com → DEV_* vars, everything else → PROD_*.
 * (CF_PAGES_BRANCH is build-time only and NOT available in Functions env,
 * so detection happens at runtime from the hostname instead.)
 *
 * ENV VARS needed (Cloudflare Pages → Settings → Variables and secrets):
 *   PROD_SUPABASE_URL, PROD_SUPABASE_SERVICE_KEY, PROD_JWT_SECRET, PROD_ALLOWED_ORIGIN
 *   DEV_SUPABASE_URL,  DEV_SUPABASE_SERVICE_KEY,  DEV_JWT_SECRET,  DEV_ALLOWED_ORIGIN
 *   OTP_KV, BREVO_API_KEY, BREVO_FROM — shared across branches (not prefixed)
 * ═══════════════════════════════════════════════════════════════════
 */

/* ── Branch-aware environment (same detection as the admin API) ── */
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

/* ── Cloudflare Pages Functions use "onRequest", NOT "export default" ── */
export async function onRequest(context) {
  const { request } = context;
  const env = resolveEnv(context.env, request);

  const url    = new URL(request.url);
  const method = request.method;

  // Extract just the sub-path after /api/auth
  // e.g. /api/auth/send-otp  →  /send-otp
  const path = url.pathname.replace(/^\/api\/auth/, "") || "/";

  // Allow browser preflight requests (CORS)
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(env),
    });
  }

  let response;
  try {
    if (method === "POST" && path === "/sign-in")           response = await handleSignIn(request, env);
    else if (method === "POST" && path === "/sign-up")      response = await handleSignUp(request, env);
    else if (method === "POST" && path === "/google")       response = await handleGoogleSignIn(request, env);
    else if (method === "POST" && path === "/send-otp")     response = await handleSendOTP(request, env);
    else if (method === "POST" && path === "/verify-reset-otp") response = await handleVerifyResetOTP(request, env);
    else if (method === "POST" && path === "/reset-password")   response = await handleResetPassword(request, env);
    else if (method === "GET"  && path === "/coins")            response = await handleGetCoins(request, env, url);
    else if (method === "POST" && path === "/coins/deduct")     response = await handleDeductCoins(request, env);
    else if (method === "POST" && path === "/generations")      response = await handleLogGen(request, env);
    else if (method === "GET"  && path === "/generations/today") response = await handleGenToday(request, env, url);
    else if (method === "GET"  && path === "/me")             response = await handleMe(request, env);
    else if (method === "POST" && path === "/update-profile")    response = await handleUpdateProfile(request, env);
    else if (method === "POST" && path === "/upload-avatar")     response = await handleUploadAvatar(request, env);
    else response = jsonResp({ error: "Not found." }, 404);
  } catch (e) {
    // Log the full detail server-side (visible in Cloudflare logs) so we can
    // debug it — but NEVER hand raw internals (URLs, DB errors, stack info)
    // back to the browser. Anything that reaches this catch is unexpected;
    // known, safe, user-facing errors (bad password, rate limit, etc.) are
    // already returned directly by the handlers above with their own message.
    console.error("[auth error]", e?.stack || e?.message || e);
    response = jsonResp(
      { error: "Something went wrong on our end. Please try again in a moment." },
      500
    );
  }

  // Add CORS headers to every response
  const r = new Response(response.body, response);
  const ch = corsHeaders(env);
  Object.entries(ch).forEach(([k, v]) => r.headers.set(k, v));
  return r;
}

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */

/* ── Sign-in rate-limit: max 10 attempts per email per 15 minutes ──
   Prevents password brute-force. Counter stored in KV with 15-min TTL.
   Counter is cleared on successful login so legitimate users are never locked out. */
async function checkSignInRate(env, email) {
  if (!env.OTP_KV) return;
  const key = `signin_rl:${email}`;
  try {
    const current = parseInt(await env.OTP_KV.get(key) || "0", 10);
    if (current >= 10) {
      throw new Error("Too many failed sign-in attempts. Please wait 15 minutes and try again.");
    }
    await env.OTP_KV.put(key, String(current + 1), { expirationTtl: 900 });
  } catch (e) {
    if (e.message.includes("Too many")) throw e;
  }
}
async function clearSignInRate(env, email) {
  if (!env.OTP_KV) return;
  await env.OTP_KV.delete(`signin_rl:${email}`).catch(() => {});
}

function corsHeaders(env) {
  // SECURITY FIX: fail closed (omit the header) rather than reflecting the
  // caller's Origin (or "*") when ALLOWED_ORIGIN isn't configured. This is
  // the auth endpoint (sign-in/sign-up/password-reset) — the previous
  // fallback would have let ANY website make credentialed auth requests
  // here if the env var was ever missing in a given deployment.
  const allowed = (env?.ALLOWED_ORIGIN || "").trim().replace(/\/+$/, "");
  if (!allowed) console.error("[auth] ALLOWED_ORIGIN is not set for this environment — cross-origin requests will be blocked until it is configured.");
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": allowed } : {}),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

/* ── Password hashing (PBKDF2 + random salt) ──
   Used for new sign-ups and password resets.
   Format: "pbkdf2:<saltHex>:<hashHex>"
   Legacy SHA-256 hashes (no "pbkdf2:" prefix) are verified with sha256()
   and transparently upgraded to PBKDF2 on next sign-in. ── */
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key  = await crypto.subtle.importKey("raw", new TextEncoder().encode(password),
    { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2,"0")).join("");
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,"0")).join("");
  return `pbkdf2:${saltHex}:${hashHex}`;
}

async function verifyPassword(password, stored) {
  if (!stored) return false; // no password set (e.g. Google-only account)
  // Legacy path: plain SHA-256 hash (no prefix)
  if (!stored.startsWith("pbkdf2:")) {
    return await sha256(password) === stored;
  }
  // PBKDF2 path
  try {
    const [, saltHex, storedHash] = stored.split(":");
    const salt = Uint8Array.from(saltHex.match(/.{2}/g), h => parseInt(h, 16));
    const key  = await crypto.subtle.importKey("raw", new TextEncoder().encode(password),
      { name: "PBKDF2" }, false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
    const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,"0")).join("");
    return hashHex === storedHash;
  } catch { return false; }
}

function makeOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function makeJWT(payload, secret) {
  const enc    = new TextEncoder();
  const key    = await crypto.subtle.importKey("raw", enc.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  // Use proper base64url encoding (replace +→- /→_ and strip =) on ALL three parts
  const toB64url = (str) => btoa(str).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const header = toB64url(JSON.stringify({ alg:"HS256", typ:"JWT" }));
  const body   = toB64url(JSON.stringify(payload));
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${body}`));
  const sig    = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  return `${header}.${body}.${sig}`;
}

async function verifyJWT(token, secret) {
  try {
    const [header, body, sig] = token.split(".");
    const enc      = new TextEncoder();
    const key      = await crypto.subtle.importKey("raw", enc.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["verify"]);
    const sigBytes = Uint8Array.from(atob(sig.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0));
    const valid    = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(`${header}.${body}`));
    if (!valid) return null;
    // Decode base64url body (replace -→+ _→/) before parsing
    const payload  = JSON.parse(atob(body.replace(/-/g,"+").replace(/_/g,"/")));
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}

async function sb(env, path, opts = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    // Clear, greppable message in Cloudflare logs — instead of the cryptic
    // native "Invalid URL: undefined/rest/v1/..." that a missing env var
    // otherwise produces. The client never sees this string (see the
    // top-level catch in onRequest), only the generic fallback message.
    throw new Error(
      "Server misconfigured: SUPABASE_URL / SUPABASE_SERVICE_KEY not set for this environment."
    );
  }
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      "Content-Type":  "application/json",
      "apikey":        env.SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Prefer":        "return=representation",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || data?.error || `Supabase ${res.status}`);
  return data;
}

/* ══════════════════════════════════════
   SIGN IN — email + password
══════════════════════════════════════ */
async function handleSignIn(request, env) {
  const { email, password } = await request.json();
  const normalEmail = email?.trim().toLowerCase();

  if (!normalEmail || !password) {
    return jsonResp({ error: "Email and password are required." }, 400);
  }

  // Rate-limit sign-in attempts per email to prevent brute-force
  try {
    await checkSignInRate(env, normalEmail);
  } catch (e) {
    return jsonResp({ error: e.message }, 429);
  }

  const rows = await sb(env, `/users?email=eq.${encodeURIComponent(normalEmail)}&select=*&limit=1`);
  if (!rows?.length) {
    return jsonResp({ error: "No account found with that email. Please sign up first." }, 401);
  }

  const user = rows[0];

  // Google accounts have password_hash: null — verifyPassword() would crash
  // trying to call .startsWith() on null. Give a clear, actionable message
  // instead of the generic "Something went wrong" 500 error.
  if (!user.password_hash) {
    return jsonResp({ error: "This account uses Google Sign-In. Please use \"Continue with Google\" to log in." }, 401);
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    return jsonResp({ error: "Incorrect password. Please try again." }, 401);
  }

  // Transparent upgrade: if stored hash is legacy SHA-256, re-hash with PBKDF2
  if (!user.password_hash.startsWith("pbkdf2:")) {
    const upgraded = await hashPassword(password);
    await sb(env, `/users?id=eq.${user.id}`, {
      method: "PATCH",
      body:   JSON.stringify({ password_hash: upgraded }),
    }).catch(() => {}); // best-effort; don't fail login on upgrade error
  }

  if (!user.email_verified) {
    return jsonResp({ error: "Please verify your email first. Check your inbox for the verification code." }, 403);
  }

  // ── Account status checks ──────────────────────────────────────
  if (user.is_deleted) {
    return jsonResp({ error: "This account has been removed. Please contact support if you think this is a mistake." }, 403);
  }
  if (user.status === "suspended") {
    const reason = user.suspension_reason ? ` Reason: ${user.suspension_reason}` : "";
    return jsonResp({ error: `Your account has been suspended.${reason} Please contact support.` }, 403);
  }
  // Flagged users can still sign in — flagging is an internal admin marker,
  // not a hard block. Only suspension and deletion prevent access.
  // ──────────────────────────────────────────────────────────────

  // Clear rate-limit counter only after ALL checks pass — password correct AND
  // account is active. Clearing earlier (e.g. on correct password but suspended
  // account) would reset the brute-force counter for a blocked account.
  await clearSignInRate(env, normalEmail);

  const token = await makeJWT(
    { sub: user.id, email: normalEmail, exp: Math.floor(Date.now()/1000) + 30*86400 },
    env.JWT_SECRET
  );

  return jsonResp({ token, user: { id: user.id, email: normalEmail, name: user.name||"", school: user.school||"", role: user.role||"", avatar_url: user.avatar_url||null } });
}

/* ══════════════════════════════════════
   GOOGLE SIGN IN / SIGN UP
   Receives the Supabase access_token from the frontend after OAuth redirect.
   Verifies it with Supabase, upserts the user in our own users table,
   then returns our own app JWT — so the rest of the app works identically
   whether the user signed in via email or Google.
══════════════════════════════════════ */
async function handleGoogleSignIn(request, env) {
  const { access_token } = await request.json();
  if (!access_token) return jsonResp({ error: "Missing Google access token." }, 400);

  // 1. Verify the Supabase access token by calling Supabase Auth /user endpoint
  const supaRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      "apikey":        env.SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${access_token}`,
    },
  });

  if (!supaRes.ok) {
    return jsonResp({ error: "Invalid or expired Google session. Please try again." }, 401);
  }

  const supaUser = await supaRes.json();
  const email    = supaUser?.email?.trim().toLowerCase();
  const name     = supaUser?.user_metadata?.full_name || supaUser?.user_metadata?.name || "";
  // Google issues every account a picture URL, even ones that never set a
  // custom photo — those come back as a generic silhouette placeholder
  // (URL contains "default-user"). Treat that as "no photo" so the app
  // falls back to initials instead of showing Google's placeholder image.
  const rawAvatar = supaUser?.user_metadata?.avatar_url || "";
  const avatar    = rawAvatar.includes("default-user") ? "" : rawAvatar;

  if (!email) return jsonResp({ error: "Could not read email from Google account." }, 400);

  // 2. Upsert into our own users table (create if new, skip if existing)
  //    We match on email. Google users have no password_hash — that's fine,
  //    they can never use email+password sign-in, only Google.
  const existing = await sb(env, `/users?email=eq.${encodeURIComponent(email)}&select=*&limit=1`);

  let userId;
  let userName   = name;
  let userSchool = "";
  let userAvatar = avatar; // from Google token — freshest source

  if (existing?.length) {
    // Existing user — check account status before issuing a token
    const existingUser = existing[0];

    if (existingUser.is_deleted) {
      return jsonResp({ error: "This account has been removed. Please contact support if you think this is a mistake." }, 403);
    }
    if (existingUser.status === "suspended") {
      const reason = existingUser.suspension_reason ? ` Reason: ${existingUser.suspension_reason}` : "";
      return jsonResp({ error: `Your account has been suspended.${reason} Please contact support.` }, 403);
    }

    userId     = existingUser.id;
    userName   = existingUser.name   || name;
    userSchool = existingUser.school || "";
    // Prefer the fresh Google avatar; fall back to whatever is stored in DB
    userAvatar = avatar || existingUser.avatar_url || "";

    // If they previously signed up with email+password, link their Google avatar & ID
    if (avatar && !existingUser.avatar_url) {
      await sb(env, `/users?id=eq.${userId}`, {
        method: "PATCH",
        body:   JSON.stringify({ avatar_url: avatar, google_id: supaUser.id }),
      }).catch(() => {});
    }
  } else {
    // New user — create their record
    userId = crypto.randomUUID();
    await sb(env, "/users", {
      method: "POST",
      body: JSON.stringify({
        id:             userId,
        email,
        name:           name.slice(0, 200),
        school:         "",
        password_hash:  null,
        email_verified: true,
        google_id:      supaUser.id   || null,
        avatar_url:     avatar        || null,
      }),
    });

    // Give them a coin balance row
    await sb(env, "/coins", {
      method: "POST",
      body:   JSON.stringify({ user_id: userId, balance: 0 }),
    }).catch(() => {});
  }

  // 3. Issue our own app JWT — same 30-day token as email sign-in
  const token = await makeJWT(
    { sub: userId, email, exp: Math.floor(Date.now() / 1000) + 30 * 86400 },
    env.JWT_SECRET
  );

  return jsonResp({
    token,
    user: { id: userId, email, name: userName, school: userSchool, avatar_url: userAvatar },
  });
}


/* ── OTP send rate-limit: max 5 sends per email per hour ──
   Stored in KV as a counter with 1-hour TTL.
   Prevents an attacker from abusing the email API (Brevo) at no cost to them. */
async function checkOTPSendRate(env, email, purpose) {
  if (!env.OTP_KV) return; // KV not bound — fail open (dev environment)
  const key = `otp_rate:${purpose}:${email}`;
  try {
    const current = parseInt(await env.OTP_KV.get(key) || "0", 10);
    if (current >= 5) {
      throw new Error("Too many code requests. Please wait before trying again.");
    }
    await env.OTP_KV.put(key, String(current + 1), { expirationTtl: 3600 });
  } catch (e) {
    if (e.message.includes("Too many")) throw e;
    // KV errors fail open so a KV outage never blocks legitimate sends
  }
}

/* ══════════════════════════════════════
   SEND OTP — for signup verification or password reset
══════════════════════════════════════ */
async function handleSendOTP(request, env) {
  const { email, purpose: rawPurpose = "verify" } = await request.json();
  const normalEmail = email?.trim().toLowerCase();

  if (!normalEmail || !/\S+@\S+\.\S+/.test(normalEmail)) {
    return jsonResp({ error: "Please enter a valid email address." }, 400);
  }

  // Whitelist purpose to prevent KV key injection via crafted purpose values
  // (e.g. purpose="verify:admin@x.com\nreset" could poison other KV keys)
  const purpose = rawPurpose === "reset" ? "reset" : "verify";

  // Rate-limit: max 5 OTP sends per email per hour per purpose
  try {
    await checkOTPSendRate(env, normalEmail, purpose);
  } catch (e) {
    return jsonResp({ error: e.message }, 429);
  }

  if (purpose === "reset") {
    const rows = await sb(env, `/users?email=eq.${encodeURIComponent(normalEmail)}&select=id&limit=1`);
    if (!rows?.length) return jsonResp({ error: "No account found with that email address." }, 404);
  }

  const code   = makeOTP();
  const hashed = await sha256(code);

  const isReset  = purpose === "reset";
  const subject  = isReset ? `${code}: Your Eduformium password reset code` : `${code}: Verify your Eduformium email`;
  const headline = isReset ? "Reset your password" : "Verify your email address";
  const bodyText = isReset
    ? "You requested a password reset. Enter this code to continue."
    : "Thanks for signing up! Enter this code to verify your email and activate your account.";

  // Send email FIRST — only store the OTP in KV if the send succeeds.
  // Previously the OTP was written before the send, leaving a phantom KV entry
  // if Brevo failed. That gave a 10-minute brute-force window for an OTP the
  // user never received.
  const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
    method:  "POST",
    headers: { "Accept":"application/json", "Content-Type":"application/json", "api-key": env.BREVO_API_KEY },
    body: JSON.stringify({
      sender:      { name: "Eduformium", email: env.BREVO_FROM },
      to:          [{ email: normalEmail }],
      subject,
      htmlContent: buildEmailHTML(code, headline, bodyText),
    }),
  });

  if (!brevoRes.ok) {
    const err = await brevoRes.json().catch(() => ({}));
    console.error("Brevo error:", JSON.stringify(err));
    return jsonResp({ error: "Failed to send email. Please try again." }, 502);
  }

  // Email confirmed sent — now safe to store the OTP
  await env.OTP_KV.put(`otp:${purpose}:${normalEmail}`, hashed, { expirationTtl: 600 });

  return jsonResp({ ok: true });
}

/* ══════════════════════════════════════
   SIGN UP — verify OTP then create account
══════════════════════════════════════ */
// FIX: `role` here is a self-described profile field the user picks on the
// sign-up form ("Teacher", "Head Teacher / Principal", etc. — see the
// dropdown in AuthModal_upgraded.jsx). It is display/personalization data
// only, never an authorization control — admin access is entirely
// independent (separate `admins` table + credentials + JWT). Previously
// this field was collected from the user (with a required-field validator
// in the UI) but silently discarded on the server, so it was never saved.
// Validated against an exact allowlist so an arbitrary string can never
// land in this column, regardless of what a direct API call sends.
const ALLOWED_SIGNUP_ROLES = new Set([
  "Teacher",
  "Assistant Head Teacher",
  "Head Teacher / Principal",
  "Circuit Supervisor",
  "District Education Officer",
  "Regional Education Director",
  "Curriculum Developer",
  "Instructional Coach",
  "Education Consultant",
  "Other",
]);

async function handleSignUp(request, env) {
  const { email, password, name, school, role, otp } = await request.json();
  const normalEmail = email?.trim().toLowerCase();
  const safeRole = ALLOWED_SIGNUP_ROLES.has(role) ? role : "";

  if (!normalEmail || !password || !otp) {
    return jsonResp({ error: "Missing required fields." }, 400);
  }

  if (password.length < 8) {
    return jsonResp({ error: "Password must be at least 8 characters." }, 400);
  }

  const kvKey  = `otp:verify:${normalEmail}`;
  const stored = await env.OTP_KV.get(kvKey);
  if (!stored) return jsonResp({ error: "Verification code expired. Please request a new one." }, 400);

  const hashed = await sha256(otp.trim());
  if (hashed !== stored) {
    // Delete OTP on wrong guess — prevents brute-force of the 6-digit code.
    await env.OTP_KV.delete(kvKey);
    return jsonResp({ error: "Incorrect verification code. Please request a new one." }, 400);
  }

  await env.OTP_KV.delete(kvKey);

  const existing = await sb(env, `/users?email=eq.${encodeURIComponent(normalEmail)}&select=id&limit=1`);
  if (existing?.length) return jsonResp({ error: "An account with this email already exists. Please sign in." }, 409);

  const id           = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await sb(env, "/users", {
    method: "POST",
    body:   JSON.stringify({ id, email: normalEmail, name: name?.trim()||"", school: school?.trim()||"", role: safeRole, password_hash: passwordHash, email_verified: true }),
  });

  await sb(env, "/coins", {
    method: "POST",
    body:   JSON.stringify({ user_id: id, balance: 0 }),
  }).catch(() => {});

  const token = await makeJWT(
    { sub: id, email: normalEmail, exp: Math.floor(Date.now()/1000) + 30*86400 },
    env.JWT_SECRET
  );

  return jsonResp({ token, user: { id, email: normalEmail, name: name?.trim()||"", school: school?.trim()||"", role: safeRole } });
}

/* ══════════════════════════════════════
   VERIFY RESET OTP
══════════════════════════════════════ */
async function handleVerifyResetOTP(request, env) {
  const { email, otp } = await request.json();
  const normalEmail = email?.trim().toLowerCase();

  if (!normalEmail || !otp) return jsonResp({ error: "Missing email or code." }, 400);

  const kvKey  = `otp:reset:${normalEmail}`;
  const stored = await env.OTP_KV.get(kvKey);
  if (!stored) return jsonResp({ error: "Code expired or not found. Please request a new one." }, 400);

  const hashed = await sha256(otp.trim());
  if (hashed !== stored) {
    // Delete the OTP on any wrong guess — prevents brute-force enumeration of the 6-digit code.
    // The user must request a new OTP to try again.
    await env.OTP_KV.delete(kvKey);
    return jsonResp({ error: "Incorrect code. Please request a new one." }, 400);
  }

  await env.OTP_KV.delete(kvKey);

  const jti = crypto.randomUUID();
  const reset_token = await makeJWT(
    { sub: normalEmail, purpose: "reset", exp: Math.floor(Date.now()/1000) + 900, jti },
    env.JWT_SECRET
  );

  return jsonResp({ ok: true, reset_token });
}

/* ══════════════════════════════════════
   RESET PASSWORD
══════════════════════════════════════ */
async function handleResetPassword(request, env) {
  const { email, new_password, reset_token } = await request.json();
  const normalEmail = email?.trim().toLowerCase();

  if (!normalEmail || !new_password || !reset_token) {
    return jsonResp({ error: "Missing required fields." }, 400);
  }

  const payload = await verifyJWT(reset_token, env.JWT_SECRET);
  if (!payload || payload.purpose !== "reset" || payload.sub !== normalEmail) {
    return jsonResp({ error: "Reset session expired. Please start over." }, 401);
  }

  // One-time-use check: if this reset_token has already been used, block replay.
  const jtiKey = `used_reset:${payload.jti || "nojti"}`;
  if (payload.jti) {
    const alreadyUsed = await env.OTP_KV.get(jtiKey);
    if (alreadyUsed) return jsonResp({ error: "Reset link already used. Please request a new one." }, 401);
  }

  if (new_password.length < 8) return jsonResp({ error: "Password must be at least 8 characters." }, 400);

  // Mark token as used BEFORE writing the new password (fail-safe ordering).
  if (payload.jti) {
    await env.OTP_KV.put(jtiKey, "1", { expirationTtl: 900 }); // TTL matches token expiry
  }

  const passwordHash = await hashPassword(new_password);
  await sb(env, `/users?email=eq.${encodeURIComponent(normalEmail)}`, {
    method: "PATCH",
    body:   JSON.stringify({ password_hash: passwordHash }),
  });

  return jsonResp({ ok: true });
}

/* ══════════════════════════════════════
   COINS
══════════════════════════════════════ */
async function handleGetCoins(request, env, url) {
  // Verify JWT — user can only read their own balance
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return jsonResp({ error: "Authentication required." }, 401);
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) return jsonResp({ error: "Invalid or expired session." }, 401);

  // Use the authenticated user's ID from the JWT — never trust the query param alone
  const userId = payload.sub;
  const rows = await sb(env, `/coins?user_id=eq.${userId}&select=balance`);
  return jsonResp({ balance: rows?.[0]?.balance ?? 0 });
}

async function handleDeductCoins(request, env) {
  // Verify JWT — user can only deduct from their own balance
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return jsonResp({ error: "Authentication required." }, 401);
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) return jsonResp({ error: "Invalid or expired session." }, 401);

  const { amount = 1 } = await request.json();
  // Always use the authenticated user's ID — ignore any user_id in the body
  const user_id = payload.sub;
  const rows    = await sb(env, `/coins?user_id=eq.${user_id}&select=balance`);
  const current = rows?.[0]?.balance ?? 0;
  if (current < amount) return jsonResp({ error: "Not enough coins." }, 402);
  const newBalance = current - amount;
  await sb(env, `/coins?user_id=eq.${user_id}`, {
    method: "PATCH",
    body:   JSON.stringify({ balance: newBalance, updated_at: new Date().toISOString() }),
  });
  return jsonResp({ balance: newBalance });
}

/* ══════════════════════════════════════
   GENERATIONS
══════════════════════════════════════ */
async function handleLogGen(request, env) {
  // Verify JWT — user can only log generations for themselves
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return jsonResp({ error: "Authentication required." }, 401);
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) return jsonResp({ error: "Invalid or expired session." }, 401);

  const { subject, class: cls, tier: rawTier, coins_used: rawCoinsUsed = 0,
          fingerprint: rawFp = "", ip_hash: rawIpHash = "" } = await request.json();
  // Always use the authenticated user's ID — ignore any user_id in the body
  const user_id = payload.sub;
  // Sanitize user-supplied fields — these go directly into the DB
  const tier        = rawTier === "premium" ? "premium" : "free";
  const coins_used  = Math.max(0, parseInt(rawCoinsUsed, 10) || 0);
  // Sanitize fingerprint / ip_hash — alphanumeric only, max 64 chars
  const fingerprint = String(rawFp   || "").replace(/[^a-f0-9]/gi, "").slice(0, 64) || null;
  const ip_hash     = String(rawIpHash || "").replace(/[^a-f0-9]/gi, "").slice(0, 64) || null;
  await sb(env, "/generations", {
    method: "POST",
    body:   JSON.stringify({
      user_id,
      subject:     String(subject || "").slice(0, 200),
      class:       String(cls || "").slice(0, 100),
      tier,
      coins_used,
      fingerprint,
      ip_hash,
    }),
  });
  return jsonResp({ ok: true });
}

async function handleGenToday(request, env, url) {
  // Verify JWT — user can only query their own daily usage
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return jsonResp({ error: "Authentication required." }, 401);
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) return jsonResp({ error: "Invalid or expired session." }, 401);

  // Use the JWT subject as the authoritative user ID
  const userId = payload.sub;
  const tier   = url.searchParams.get("tier") || "free";
  const today  = new Date().toISOString().slice(0, 10);
  const rows   = await sb(env, `/generations?user_id=eq.${userId}&tier=eq.${tier}&created_at=gte.${today}T00:00:00Z&select=id`);

  // Next UTC midnight — this is exactly when the daily window resets
  const resetAt = new Date(`${today}T00:00:00Z`);
  resetAt.setUTCDate(resetAt.getUTCDate() + 1);

  return jsonResp({ count: rows?.length ?? 0, reset_at: resetAt.toISOString() });
}

/* ══════════════════════════════════════
   EMAIL TEMPLATE
══════════════════════════════════════ */
function buildEmailHTML(code, headline, bodyText) {
  const digitBoxes = code.split("").map(d =>
    `<td style="padding:0 4px;"><div style="width:46px;height:58px;line-height:58px;background:#0F172A;border:2px solid #0D9488;border-radius:10px;font-size:28px;font-weight:700;color:#0D9488;text-align:center;font-family:'Courier New',Courier,monospace;">${d}</div></td>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0F172A;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F172A;padding:40px 16px;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="background:#1E293B;border-radius:16px;border:1px solid #334155;overflow:hidden;max-width:500px;width:100%;">
        <tr><td style="background:linear-gradient(135deg,#0D9488,#0F766E);padding:28px 32px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#fff;">Eduformium</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:6px;letter-spacing:0.08em;text-transform:uppercase;">Ghana NaCCA Lesson Planner</div>
        </td></tr>
        <tr><td style="padding:40px 32px;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#F1F5F9;margin-bottom:8px;">${headline}</div>
          <div style="font-size:14px;color:#64748B;margin-bottom:30px;line-height:1.6;">${bodyText}<br>Expires in <strong style="color:#94A3B8;">10 minutes</strong>.</div>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 30px;"><tr>${digitBoxes}</tr></table>
          <div style="font-size:13px;color:#475569;line-height:1.7;">If you didn't request this, ignore this email.<br><strong style="color:#64748B;">Never share this code with anyone.</strong></div>
        </td></tr>
        <tr><td style="border-top:1px solid #334155;padding:18px 32px;text-align:center;">
          <div style="font-size:12px;color:#334155;">© ${new Date().getFullYear()} Eduformium · Ghana · NaCCA Curriculum</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
/* ══════════════════════════════════════
   GET /me — return fresh user profile
   Called on every app load to sync cross-device changes (e.g. avatar)
══════════════════════════════════════ */
async function handleMe(request, env) {
  const auth  = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) return jsonResp({ error: "Unauthorised." }, 401);

  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) return jsonResp({ error: "Invalid or expired token." }, 401);

  const rows = await sb(env, `/users?id=eq.${payload.sub}&select=id,email,name,school,role,avatar_url&limit=1`);
  if (!rows?.length) return jsonResp({ error: "User not found." }, 404);

  const u = rows[0];
  return jsonResp({ user: { id: u.id, email: u.email||"", name: u.name||"", school: u.school||"", role: u.role||"", avatar_url: u.avatar_url||null } });
}

async function handleUpdateProfile(request, env) {
  const auth  = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) return jsonResp({ error: "Unauthorised." }, 401);

  let userId;
  try {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) throw new Error("invalid");
    userId = payload.sub;
  } catch {
    return jsonResp({ error: "Invalid or expired token." }, 401);
  }

  let body;
  try { body = await request.json(); } catch { return jsonResp({ error: "Invalid JSON." }, 400); }

  const name   = (body.name   || "").trim().slice(0, 200);
  const school = (body.school || "").trim().slice(0, 200);
  if (!name) return jsonResp({ error: "Name cannot be empty." }, 400);

  try {
    await sb(env, `/users?id=eq.${userId}`, {
      method: "PATCH",
      body:   JSON.stringify({ name, school }),
    });
    return jsonResp({ ok: true, name, school });
  } catch(e) {
    return jsonResp({ error: e.message || "Failed to update profile." }, 500);
  }
}

async function handleUploadAvatar(request, env) {
  /* ── verify JWT ── */
  const auth  = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) return jsonResp({ error: "Unauthorised." }, 401);

  let userId;
  try {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) throw new Error("invalid");
    userId = payload.sub;
  } catch {
    return jsonResp({ error: "Invalid or expired token." }, 401);
  }

  /* ── parse body: { dataURL: "data:image/jpeg;base64,..." } ── */
  let body;
  try { body = await request.json(); } catch { return jsonResp({ error: "Invalid JSON." }, 400); }

  const dataURL = body.dataURL || "";
  const match   = dataURL.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) return jsonResp({ error: "Invalid image format. JPEG, PNG or WebP required." }, 400);

  const mimeType   = match[1];                          // e.g. "image/jpeg"
  const base64Data = match[2];
  const ext        = mimeType.split("/")[1];            // "jpeg" | "png" | "webp"
  const filePath   = `${userId}/avatar.${ext}`;         // avatars/userId/avatar.jpeg

  /* ── decode base64 → binary ── */
  const binaryStr = atob(base64Data);
  const bytes     = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  /* ── size guard: reject anything over 300 KB after compression ── */
  if (bytes.length > 300 * 1024) {
    return jsonResp({ error: "Image too large. Please upload an image under 300 KB." }, 400);
  }

  /* ── upload to Supabase Storage (bucket: avatars) ── */
  const uploadRes = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/avatars/${filePath}`,
    {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "apikey":        env.SUPABASE_SERVICE_KEY,
        "Content-Type":  mimeType,
        "x-upsert":      "true",   // overwrite existing avatar
      },
      body: bytes,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text().catch(() => "");
    return jsonResp({ error: `Upload failed: ${err}` }, 500);
  }

  /* ── build the public URL ── */
  const publicURL = `${env.SUPABASE_URL}/storage/v1/object/public/avatars/${filePath}`;

  /* ── save URL to users table ── */
  try {
    await sb(env, `/users?id=eq.${userId}`, {
      method: "PATCH",
      body:   JSON.stringify({ avatar_url: publicURL }),
    });
  } catch(e) {
    return jsonResp({ error: `Saved to storage but failed to update profile: ${e.message}` }, 500);
  }

  return jsonResp({ ok: true, avatar_url: publicURL });
}