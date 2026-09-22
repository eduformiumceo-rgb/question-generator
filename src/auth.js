/**
 * ═══════════════════════════════════════════════════════════════════
 * EDUFORMIUM — src/auth.js
 *
 * How auth works:
 *   SIGN UP  → user fills form (name, school, email, password)
 *              → OTP emailed via Brevo to verify the email address
 *              → user enters OTP → account created in Supabase
 *
 *   SIGN IN  → email + password → logged in immediately (no OTP)
 *
 *   FORGOT   → user enters email → OTP emailed via Brevo
 *              → user enters OTP to prove ownership
 *              → user sets new password
 * ═══════════════════════════════════════════════════════════════════
 */

import { createClient } from "@supabase/supabase-js";

const AUTH_API = "/api/auth"; // Cloudflare Worker route base

/* ══════════════════════════════
   SUPABASE CLIENT (for Google OAuth only)
   Uses the same npm package/bundling approach as src/db.js — no runtime
   CDN import needed. A runtime `import("https://esm.sh/...")` was blocked
   by this site's Content-Security-Policy (script-src doesn't allow
   esm.sh), which is what caused "Failed to fetch dynamically imported
   module" on the sign-in screen.
══════════════════════════════ */
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

const supabase = SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // We parse the OAuth hash ourselves (see extractHashSession below)
        // instead of letting the client auto-detect it. Automatic detection
        // races against our own code depending on which page/component
        // mounts first, is a likely source of the "Multiple GoTrueClient
        // instances" warning, and gave inconsistent results across many
        // real test attempts. Manual control removes that ambiguity.
        detectSessionInUrl: false,
        // supabase-js defaults to the PKCE flow, which returns the session
        // as "?code=..." in the URL's QUERY STRING after the OAuth redirect.
        // extractHashSession() below only ever looks in the URL HASH
        // (#access_token=...), which is how the older "implicit" flow
        // returns tokens. Without this override, PKCE's "?code=" is never
        // read, handleGoogleCallback() throws "Could not retrieve Google
        // session", and the user is bounced back to signed-out — even
        // though Google/Supabase already created their account on
        // Supabase's side. Forcing "implicit" here makes the redirect
        // actually carry #access_token/#refresh_token, matching what the
        // rest of this file expects.
        flowType: "implicit",
      },
    })
  : null;

/* Parses access_token/refresh_token (or error) directly out of the URL
   hash. Returns null if there's nothing OAuth-related in the hash at all. */
function extractHashSession() {
  if (!window.location.hash) return null;
  const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const error = p.get("error_description") || p.get("error");
  if (error) return { error: decodeURIComponent(error) };
  const access_token  = p.get("access_token");
  const refresh_token = p.get("refresh_token");
  if (!access_token) return null;
  return { access_token, refresh_token };
}

/* ══════════════════════════════
   LOCAL STORAGE  (session data)
══════════════════════════════ */
export function getToken() {
  try { return localStorage.getItem("edu_token"); } catch { return null; }
}
export function setToken(t) {
  try { localStorage.setItem("edu_token", t); } catch {}
}
export function clearToken() {
  try {
    localStorage.removeItem("edu_token");
    localStorage.removeItem("edu_user");
  } catch {}
}
export function getUser() {
  try {
    const raw = localStorage.getItem("edu_user");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function setUser(u) {
  try { localStorage.setItem("edu_user", JSON.stringify(u)); } catch {}
}

/* ══════════════════════════════
   POST helper
══════════════════════════════ */
async function post(path, body) {
  const res = await fetch(`${AUTH_API}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

async function authedPost(path, body) {
  const res = await fetch(`${AUTH_API}${path}`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${getToken() || ""}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

async function authedGet(path) {
  const res = await fetch(`${AUTH_API}${path}`, {
    headers: { "Authorization": `Bearer ${getToken() || ""}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

/* ══════════════════════════════
   SIGN IN
   email + password → returns user, saves session
══════════════════════════════ */
export async function signIn(email, password) {
  const data = await post("/sign-in", { email, password });
  setToken(data.token);
  setUser(data.user);
  return data.user;
}

/* ══════════════════════════════
   GOOGLE SIGN IN / SIGN UP
   Opens Google OAuth popup via Supabase, then exchanges the
   Supabase session token for our own app JWT via /api/auth/google.
══════════════════════════════ */
export async function signInWithGoogle() {
  // We use the PUBLIC anon key here — this is intentional and safe.
  // The anon key only starts the OAuth handshake; our server validates
  // the resulting session with the service key before issuing our JWT.
  if (!SUPABASE_CONFIGURED) {
    throw new Error("Google sign-in is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.");
  }

  const redirectTo = `${window.location.origin}/auth/callback`;
  // Debug: compare this EXACT string, character for character, against the
  // entry in Supabase → Authentication → URL Configuration → Redirect URLs.
  // If Supabase doesn't redirect to /auth/callback after Google consent,
  // it's because this string doesn't byte-for-byte match an allow-listed URL.
  console.log("[signInWithGoogle] redirectTo:", JSON.stringify(redirectTo));

  // Clear any stale local Supabase session first. Without this, a leftover
  // expired/invalid session (e.g. from device clock skew, or an interrupted
  // previous attempt) can be picked up instead of the fresh one this login
  // is about to create, causing "Invalid or expired Google session" even
  // right after a successful Google consent screen.
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});

  // Open the Google OAuth popup
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });

  if (error) throw new Error(error.message || "Google sign-in failed.");

  // signInWithOAuth redirects — so we handle the session on /auth/callback.
  // The callback page calls handleGoogleCallback() below.
  return data;
}

/* ══════════════════════════════
   GOOGLE CALLBACK HANDLER
   Call this from your /auth/callback route after Google redirects back.
   It reads the Supabase session, sends it to our worker to get our app JWT,
   then saves the session the same way as email/password sign-in.
══════════════════════════════ */
export async function handleGoogleCallback() {
  if (!SUPABASE_CONFIGURED) {
    throw new Error("Google sign-in is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.");
  }

  const hashSession = extractHashSession();
  console.log("[handleGoogleCallback] hash contained:", hashSession ? (hashSession.error ? "error" : "tokens") : "nothing");

  if (hashSession?.error) {
    throw new Error(`Google sign-in failed: ${hashSession.error}`);
  }
  if (!hashSession?.access_token) {
    throw new Error("Could not retrieve Google session. No access token was found in the redirect URL. This usually means the redirect URL Supabase used doesn't exactly match one in your Redirect URLs allow-list.");
  }

  // Exchange Supabase's access token for our own app JWT
  const data = await post("/google", { access_token: hashSession.access_token });

  // Now that our own login succeeded, also hand the tokens to the Supabase
  // client so features that use it directly (if any) stay in sync.
  if (hashSession.refresh_token) {
    await supabase.auth.setSession({
      access_token: hashSession.access_token,
      refresh_token: hashSession.refresh_token,
    }).catch(() => {});
  }

  setToken(data.token);
  setUser(data.user);
  return data.user;
}

/* ══════════════════════════════
   SAFETY NET — completes a stranded Google login from ANY page.
   Why this exists: Google/Supabase may redirect back to "/" instead of
   "/auth/callback" (misconfigured Redirect URL, cached link, etc.) — in
   which case the OAuth tokens land in the URL hash on the homepage
   instead. This checks for that on every page load (see App.jsx) so
   login still completes wherever the user happens to land. Unlike
   handleGoogleCallback(), this never throws — it runs quietly.
══════════════════════════════ */
export async function completePendingGoogleSignIn() {
  if (!SUPABASE_CONFIGURED) return null;
  if (getToken()) {
    console.log("[completePendingGoogleSignIn] already logged in, skipping.");
    return null;
  }

  const hashSession = extractHashSession();
  if (!hashSession || hashSession.error || !hashSession.access_token) {
    console.log("[completePendingGoogleSignIn] no OAuth tokens in URL — nothing to recover.");
    return null;
  }
  console.log("[completePendingGoogleSignIn] found OAuth tokens in URL, exchanging...");

  try {
    const data = await post("/google", { access_token: hashSession.access_token });
    console.log("[completePendingGoogleSignIn] backend exchange succeeded for:", data.user?.email);
    setToken(data.token);
    setUser(data.user);

    if (hashSession.refresh_token) {
      await supabase.auth.setSession({
        access_token: hashSession.access_token,
        refresh_token: hashSession.refresh_token,
      }).catch(() => {});
    }

    // Clean the OAuth params from the URL now that they've been used.
    window.history.replaceState({}, "", window.location.pathname + window.location.search);
    return data.user;
  } catch (e) {
    console.error("[completePendingGoogleSignIn] failed:", e.message || e);
    return null;
  }
}

/* ══════════════════════════════
   SIGN OUT
══════════════════════════════ */
export function signOut() {
  clearToken();
}

/* ══════════════════════════════
   SEND OTP
   purpose: "verify"  (sign-up email verification)
            "reset"   (forgot password)
══════════════════════════════ */
export async function sendOTP(email, purpose = "verify") {
  await post("/send-otp", { email, purpose });
}

/* ══════════════════════════════
   SIGN UP
   Called after OTP verified.
   Passes the OTP code so the worker can verify + create account atomically.
══════════════════════════════ */
export async function signUp(email, password, name, school, otpCode, role = "") {
  // `role` here is a self-selected profile field ("Teacher" / "Head Teacher" /
  // etc., see AuthModal_upgraded.jsx) — NOT an authorization role. It is
  // display/personalization data only. Admin privilege is never derived
  // from this field: the admin panel uses an entirely separate `admins`
  // table with its own credentials, so a user cannot self-select their way
  // to elevated access via this value no matter what string is sent here.
  const data = await post("/sign-up", { email, password, name, school, role, otp: otpCode });
  setToken(data.token);
  setUser(data.user);
  return data.user;
}

/* ══════════════════════════════
   VERIFY RESET OTP
   Confirms the user owns the email before letting them set a new password.
   The worker marks the OTP as verified and returns a short-lived reset token.
══════════════════════════════ */
export async function verifyResetOTP(email, otpCode) {
  const data = await post("/verify-reset-otp", { email, otp: otpCode });
  // Store the short-lived reset token alongside a timestamp so resetPassword
  // can detect client-side expiry before wasting a network round-trip.
  try {
    localStorage.setItem("edu_reset_token",    data.reset_token);
    localStorage.setItem("edu_reset_token_at", String(Date.now()));
  } catch {}
  return data;
}

/* ══════════════════════════════
   RESET PASSWORD
   Uses the reset token saved by verifyResetOTP
══════════════════════════════ */
export async function resetPassword(email, newPassword) {
  let resetToken = "";
  try {
    resetToken = localStorage.getItem("edu_reset_token") || "";
    // Client-side guard: if the token is older than 15 minutes, reject early
    // rather than sending a stale token and confusing the user with a server error.
    const issuedAt = parseInt(localStorage.getItem("edu_reset_token_at") || "0", 10);
    if (resetToken && issuedAt && Date.now() - issuedAt > 15 * 60 * 1000) {
      localStorage.removeItem("edu_reset_token");
      localStorage.removeItem("edu_reset_token_at");
      throw new Error("Password reset link has expired. Please request a new one.");
    }
  } catch (e) {
    // Re-throw expiry errors; swallow storage access errors
    if (e.message.includes("expired")) throw e;
  }
  await post("/reset-password", { email, new_password: newPassword, reset_token: resetToken });
  try {
    localStorage.removeItem("edu_reset_token");
    localStorage.removeItem("edu_reset_token_at");
  } catch {}
}

/* ══════════════════════════════
   REFRESH USER
   Silently re-fetches the latest user profile from the server on every
   app load. This syncs cross-device changes (e.g. avatar uploaded on
   mobile) to the current device without requiring re-login.
   Requires a GET /api/auth/me endpoint that reads the Bearer JWT and
   returns { user: { id, name, email, avatar_url, school, role } }.
══════════════════════════════ */
export async function refreshUser() {
  try {
    const tok = getToken();
    if (!tok) return null;
    const data = await authedGet("/me");
    if (!data?.user) return null;
    const current = getUser() || {};
    const merged  = { ...current, ...data.user };
    setUser(merged);
    return merged;
  } catch { return null; }
}

/* ══════════════════════════════
   COINS
══════════════════════════════ */
// The userId parameter is intentionally ignored — the server resolves the user
// from the Bearer JWT to prevent one user querying another's balance.
// Kept as an optional param so existing call-sites (getCoinBalance(user?.id))
// don't need to be updated all at once.
export async function getCoinBalance(_userId) {
  try {
    const res = await fetch("/api/payment/balance", {
      headers: { "Authorization": `Bearer ${getToken() || ""}` },
    });
    const data = await res.json().catch(() => ({}));
    return data?.balance ?? 0;
  } catch { return 0; }
}

// ⚠️  REMOVED — coin deduction is handled server-side in generate-premium.js.
// Throws in all environments so accidental callers are caught immediately.
export async function deductCoins(_userId, _amount = 1) {
  throw new Error("[auth.js] deductCoins() is removed. Coin deduction is handled server-side in generate-premium.js.");
}

/* ══════════════════════════════
   GENERATION LOGS
══════════════════════════════ */
export async function logGeneration(userId, subject, cls, tier, coinsUsed = 0) {
  await authedPost("/generations", {
    user_id: userId, subject, class: cls, tier, coins_used: coinsUsed,
  }).catch(() => {});
}

export async function getFreeGenerationsToday(userId) {
  try {
    const data = await authedGet(`/generations/today?user_id=${userId}&tier=free`);
    // Return full object so App.jsx can read both count and reset_at
    return { count: data?.count ?? 0, reset_at: data?.reset_at ?? null };
  } catch { return { count: 0, reset_at: null }; }
}