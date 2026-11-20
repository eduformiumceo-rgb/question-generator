// The REAL auth handler: sign-up codes, sign-up, sign-in lockout, password reset. In-memory KV + Supabase, fake Brevo.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onRequest } from "../functions/api/auth/[[path]].js";

const makeKV = () => { const m = new Map(); return { m, get: async k => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); } }; };
let ENV, users, coins, emails;
const sha256 = async (t) => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t))).toString("hex");

beforeEach(() => {
  ENV = { SUPABASE_URL: "http://sb.test", SUPABASE_SERVICE_KEY: "k", JWT_SECRET: "secret", ALLOWED_ORIGIN: "https://app.test", BREVO_API_KEY: "b", BREVO_FROM: "noreply@x.com", OTP_KV: makeKV() };
  users = []; coins = []; emails = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url), method = (init.method || "GET").toUpperCase();
    if (u.startsWith("https://api.brevo.com")) { const b = JSON.parse(init.body); emails.push({ to: b.to[0].email, subject: b.subject, html: b.htmlContent }); return new Response("{}", { status: 201 }); }
    if (!u.startsWith("http://sb.test")) throw new Error("unexpected fetch " + u);
    const url2 = new URL(u), body = init.body ? JSON.parse(init.body) : null;
    const ok = (d, s = 200) => new Response(d === undefined ? "" : JSON.stringify(d), { status: s });
    if (url2.pathname === "/rest/v1/users") {
      const em = url2.searchParams.get("email"), id = url2.searchParams.get("id");
      const hit = users.filter(x => (!em || x.email === decodeURIComponent(em.replace(/^eq\./, ""))) && (!id || x.id === id.replace(/^eq\./, "")));
      if (method === "GET") return ok(hit);
      if (method === "POST") { users.push(body); return ok([body], 201); }
      if (method === "PATCH") { hit.forEach(x => Object.assign(x, body)); return ok(hit); }
    }
    if (url2.pathname === "/rest/v1/coins") { if (method === "POST") { coins.push(body); return ok([body], 201); } return ok([]); }
    return ok([]);
  });
});
afterEach(() => vi.restoreAllMocks());

async function call(path, body, { method = "POST", env = ENV } = {}) {
  const res = await onRequest({ request: new Request(`https://app.test/api/auth${path}`, { method, headers: { "Content-Type": "application/json" }, ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) }), env });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const codeFrom = (e) => /\b(\d{6})\b/.exec(e.subject)[1];

describe("auth: sending verification codes", () => {
  it("e-mails a 6-digit code and stores only its hash", async () => {
    const r = await call("/send-otp", { email: "Ama@Example.com" });
    expect(r.status).toBe(200);
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe("ama@example.com");
    const code = codeFrom(emails[0]);
    expect(code).toMatch(/^\d{6}$/);
    expect(ENV.OTP_KV.m.get("otp:verify:ama@example.com")).toBe(await sha256(code));
    expect(JSON.stringify([...ENV.OTP_KV.m.values()])).not.toContain(code);
  });
  it("codes are always 6 digits (no leading zero) and well spread (secure random)", async () => {
    const seen = new Set();
    for (let i = 0; i < 60; i++) { await call("/send-otp", { email: `u${i}@example.com` }); }
    for (const e of emails) { const c = codeFrom(e); expect(c).toMatch(/^[1-9]\d{5}$/); seen.add(c); }
    expect(seen.size).toBeGreaterThan(55);
  });
  it("REGRESSION: without the OTP storage binding it refuses up front and sends NO e-mail", async () => {
    const env = { ...ENV, OTP_KV: undefined };
    const r = await call("/send-otp", { email: "ama@example.com" }, { env });
    expect(r.status).toBe(503);
    expect(emails).toHaveLength(0);
  });
  it("limits to 5 codes per e-mail per hour, per purpose", async () => {
    for (let i = 0; i < 5; i++) expect((await call("/send-otp", { email: "ama@example.com" })).status).toBe(200);
    expect((await call("/send-otp", { email: "ama@example.com" })).status).toBe(429);
    expect((await call("/send-otp", { email: "kofi@example.com" })).status).toBe(200);
  });
  it("rejects an invalid e-mail and only accepts the two known purposes", async () => {
    expect((await call("/send-otp", { email: "nope" })).status).toBe(400);
    await call("/send-otp", { email: "ama@example.com", purpose: "verify:admin@x.com\nreset" });
    expect([...ENV.OTP_KV.m.keys()].filter(k => k.startsWith("otp:"))).toEqual(["otp:verify:ama@example.com"]);
  });
  it("password reset codes are only sent to existing accounts", async () => {
    expect((await call("/send-otp", { email: "ghost@example.com", purpose: "reset" })).status).toBe(404);
    expect(emails).toHaveLength(0);
  });
});

describe("auth: sign-up", () => {
  const signUp = async (over = {}) => { await call("/send-otp", { email: "ama@example.com" }); return call("/sign-up", { email: "ama@example.com", password: "longenough1", name: "Ama", school: "ASHS", role: "teacher", otp: codeFrom(emails.at(-1)), ...over }); };
  it("creates the account, a wallet and a token with the right code", async () => {
    const r = await signUp();
    expect(r.status).toBe(200); expect(r.json.token).toBeTruthy();
    expect(users).toHaveLength(1);
    expect(users[0].password_hash).toMatch(/^pbkdf2:/);
    expect(users[0].password_hash).not.toContain("longenough1");
    expect(coins[0]).toMatchObject({ user_id: users[0].id, balance: 0 });
  });
  it("a wrong code burns that code (one guess), so it cannot be brute-forced", async () => {
    await call("/send-otp", { email: "ama@example.com" });
    const good = codeFrom(emails[0]);
    const wrong = good === "123456" ? "654321" : "123456";
    expect((await call("/sign-up", { email: "ama@example.com", password: "longenough1", otp: wrong })).status).toBe(400);
    expect((await call("/sign-up", { email: "ama@example.com", password: "longenough1", otp: good })).status).toBe(400);   // now expired
    expect(users).toHaveLength(0);
  });
  it("a code works only once", async () => {
    await signUp();
    const again = await call("/sign-up", { email: "ama@example.com", password: "longenough1", otp: codeFrom(emails[0]) });
    expect(again.status).toBe(400);
  });
  it("rejects short passwords and an existing e-mail", async () => {
    expect((await signUp({ password: "short" })).status).toBe(400);
    await signUp({ password: "longenough1" });
    await call("/send-otp", { email: "ama@example.com" });
    expect((await call("/sign-up", { email: "ama@example.com", password: "longenough1", otp: codeFrom(emails.at(-1)) })).status).toBe(409);
  });
  it("ignores an unknown role", async () => { await signUp({ role: "superadmin" }); expect(users[0].role).toBe(""); });
});

describe("auth: sign-in", () => {
  const register = async () => { await call("/send-otp", { email: "ama@example.com" }); await call("/sign-up", { email: "ama@example.com", password: "longenough1", otp: codeFrom(emails.at(-1)) }); };
  it("signs in with the right password and refuses the wrong one", async () => {
    await register();
    expect((await call("/sign-in", { email: "AMA@example.com", password: "longenough1" })).json.token).toBeTruthy();
    const bad = await call("/sign-in", { email: "ama@example.com", password: "wrong-password" });
    expect(bad.status).toBe(401); expect(bad.json.token).toBeUndefined();
  });
  it("locks an e-mail after 10 attempts, and a good sign-in clears the counter", async () => {
    await register();
    for (let i = 0; i < 9; i++) await call("/sign-in", { email: "ama@example.com", password: "nope" + i });
    expect((await call("/sign-in", { email: "ama@example.com", password: "longenough1" })).status).toBe(200);   // 10th attempt, correct
    expect(ENV.OTP_KV.m.has("signin_rl:ama@example.com")).toBe(false);
    for (let i = 0; i < 10; i++) await call("/sign-in", { email: "ama@example.com", password: "nope" + i });
    expect((await call("/sign-in", { email: "ama@example.com", password: "longenough1" })).status).toBe(429);
  });
  it("blocks suspended and deleted accounts", async () => {
    await register();
    users[0].status = "suspended";
    expect((await call("/sign-in", { email: "ama@example.com", password: "longenough1" })).status).toBe(403);
    users[0].status = "active"; users[0].is_deleted = true;
    expect((await call("/sign-in", { email: "ama@example.com", password: "longenough1" })).status).toBe(403);
  });
  it("tells Google-only accounts to use Google, without crashing", async () => {
    users.push({ id: "g1", email: "g@example.com", password_hash: null, email_verified: true });
    const r = await call("/sign-in", { email: "g@example.com", password: "whatever12" });
    expect(r.status).toBe(401); expect(r.json.error).toMatch(/Google/);
  });
  it("requires both fields", async () => { expect((await call("/sign-in", { email: "a@b.com" })).status).toBe(400); });
});

describe("auth: password reset", () => {
  it("full reset works once; the reset token cannot be replayed; the new password signs in", async () => {
    await call("/send-otp", { email: "ama@example.com" });
    await call("/sign-up", { email: "ama@example.com", password: "longenough1", otp: codeFrom(emails.at(-1)) });
    await call("/send-otp", { email: "ama@example.com", purpose: "reset" });
    const v = await call("/verify-reset-otp", { email: "ama@example.com", otp: codeFrom(emails.at(-1)) });
    expect(v.status).toBe(200);
    const tok = v.json.reset_token;
    expect((await call("/reset-password", { email: "ama@example.com", new_password: "brandnewpass1", reset_token: tok })).status).toBe(200);
    expect((await call("/reset-password", { email: "ama@example.com", new_password: "another-pass22", reset_token: tok })).status).toBe(401);
    expect((await call("/sign-in", { email: "ama@example.com", password: "brandnewpass1" })).status).toBe(200);
    expect((await call("/sign-in", { email: "ama@example.com", password: "longenough1" })).status).toBe(401);
  });
  it("a reset token for one e-mail cannot reset another account", async () => {
    users.push({ id: "u2", email: "kofi@example.com", password_hash: "x", email_verified: true });
    await call("/send-otp", { email: "ama@example.com" });
    await call("/sign-up", { email: "ama@example.com", password: "longenough1", otp: codeFrom(emails.at(-1)) });
    await call("/send-otp", { email: "ama@example.com", purpose: "reset" });
    const tok = (await call("/verify-reset-otp", { email: "ama@example.com", otp: codeFrom(emails.at(-1)) })).json.reset_token;
    expect((await call("/reset-password", { email: "kofi@example.com", new_password: "hijacked-pass1", reset_token: tok })).status).toBe(401);
    expect(users.find(x => x.id === "u2").password_hash).toBe("x");
  });
  it("a forged or sign-in token is not a reset token", async () => {
    expect((await call("/reset-password", { email: "ama@example.com", new_password: "newpassword1", reset_token: "a.b.c" })).status).toBe(401);
  });
});
