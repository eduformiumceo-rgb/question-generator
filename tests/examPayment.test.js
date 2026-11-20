// The REAL payment handler against an in-memory Supabase and a fake Paystack.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onRequest } from "../functions/api/exam-payment/[[path]].js";

const ENV = { SUPABASE_URL: "http://sb.test", SUPABASE_SERVICE_KEY: "k", JWT_SECRET: "secret", ALLOWED_ORIGIN: "https://app.test", PAYSTACK_SECRET_KEY: "sk_test" };
const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";
const b64u = (s) => Buffer.from(s).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
async function token(sub = U1) {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ sub, email: "t@x.com", exp: Math.floor(Date.now() / 1000) + 3600 }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(ENV.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${h}.${p}`))).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${h}.${p}.${sig}`;
}

let db, o, sbCalls;
const q = (url) => { const u = new URL(url); const f = {}; u.searchParams.forEach((v, k) => { if (k !== "select") f[k] = v.replace(/^eq\./, ""); }); return { path: u.pathname.replace("/rest/v1", ""), f }; };
const match = (row, f) => Object.entries(f).every(([k, v]) => String(row[k]) === v);

beforeEach(() => {
  db = { transactions: [], coins: [{ user_id: U1, balance: 10 }] };
  o = { failRpc: false, failBalanceReadAfterRpc: false, failFallbackWrite: false, paystackStatus: "success", paystackAmount: undefined };
  sbCalls = 0;
  let rpcDone = false;
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url), method = (init.method || "GET").toUpperCase();
    if (u.startsWith("https://api.paystack.co/transaction/initialize")) return new Response(JSON.stringify({ status: true, data: { authorization_url: "https://pay.test/x" } }));
    if (u.startsWith("https://api.paystack.co/transaction/verify/")) {
      const ref = decodeURIComponent(u.split("/verify/")[1]); const t = db.transactions.find(x => x.paystack_ref === ref);
      return new Response(JSON.stringify({ status: true, data: { status: o.paystackStatus, amount: o.paystackAmount ?? (t ? t.amount_ghs * 100 : 0), metadata: { user_id: t && t.user_id } } }));
    }
    if (!u.startsWith("http://sb.test")) throw new Error("unexpected fetch " + u);
    sbCalls++;
    const { path, f } = q(u); const body = init.body ? JSON.parse(init.body) : null;
    const ok = (d, s = 200) => new Response(d === undefined ? "" : JSON.stringify(d), { status: s });
    if (path === "/rpc/increment_coins") { if (o.failRpc) return ok({ message: "rpc down" }, 500); db.coins.find(c => c.user_id === body.p_user_id).balance += body.p_amount; rpcDone = true; return ok(); }
    if (path === "/coins") {
      if (method === "GET") { if (o.failBalanceReadAfterRpc && rpcDone) return ok({ message: "read failed" }, 500); return ok(db.coins.filter(c => match(c, f)).map(c => ({ balance: c.balance }))); }
      if (o.failFallbackWrite && method !== "GET") return ok({ message: "write failed" }, 500);
      if (method === "POST") { db.coins.push({ user_id: body.user_id, balance: body.balance }); return ok([body]); }
      if (method === "PATCH") { db.coins.filter(c => match(c, f)).forEach(c => Object.assign(c, body)); return ok([body]); }
    }
    if (path === "/transactions") {
      if (method === "POST") { db.transactions.push({ id: "t" + db.transactions.length, ...body }); return ok([body], 201); }
      const rows = db.transactions.filter(t => match(t, f));
      if (method === "GET") return ok(rows);
      if (method === "PATCH") { rows.forEach(t => Object.assign(t, body)); return ok(rows); }
    }
    return ok([]);
  });
});
afterEach(() => vi.restoreAllMocks());

async function call(action, { method = "POST", body = {}, sub = U1, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${await token(sub)}`;
  const res = await onRequest({ request: new Request(`https://app.test/api/exam-payment/${action}`, { method, headers, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) }), env: ENV });
  return { status: res.status, json: await res.json() };
}
const seed = (over = {}) => { const t = { id: "t0", user_id: U1, amount_ghs: 30, coins_purchased: 25, paystack_ref: "eduq_11111111_1700000000000", status: "pending", ...over }; db.transactions.push(t); return t; };
const balance = (u = U1) => db.coins.find(c => c.user_id === u).balance;

describe("exam-payment: initialize", () => {
  it("creates a pending transaction and a well-formed reference", async () => {
    const r = await call("initialize", { body: { package_id: "standard" } });
    expect(r.status).toBe(200);
    expect(r.json.reference).toMatch(/^[A-Za-z0-9_.=-]{6,100}$/);
    expect(db.transactions[0]).toMatchObject({ user_id: U1, coins_purchased: 25, amount_ghs: 30, status: "pending" });
  });
  it("rejects an unknown package and anonymous callers", async () => {
    expect((await call("initialize", { body: { package_id: "free-lunch" } })).status).toBe(400);
    expect((await call("initialize", { body: { package_id: "pro" }, auth: false })).status).toBe(401);
  });
});

describe("exam-payment: verify", () => {
  it("credits exactly once, and a second verify does not credit again", async () => {
    seed();
    const a = await call("verify", { body: { reference: "eduq_11111111_1700000000000" } });
    expect(a.status).toBe(200); expect(a.json.credits_added).toBe(25); expect(a.json.new_balance).toBe(35);
    const b = await call("verify", { body: { reference: "eduq_11111111_1700000000000" } });
    expect(b.json.already_credited).toBe(true);
    expect(balance()).toBe(35);
    expect(db.transactions[0].status).toBe("completed");
  });
  it("REGRESSION: a failed balance read after a successful credit must not credit a second time", async () => {
    seed(); o.failBalanceReadAfterRpc = true;
    const r = await call("verify", { body: { reference: "eduq_11111111_1700000000000" } });
    expect(r.status).toBe(200);
    expect(r.json.credits_added).toBe(25);
    expect(r.json).not.toHaveProperty("new_balance");
    expect(balance()).toBe(35);                                  // 10 + 25, not 10 + 25 + 25
    expect(db.transactions[0].status).toBe("completed");
  });
  it("uses the read-then-write fallback when the atomic RPC fails, crediting once", async () => {
    seed(); o.failRpc = true;
    const r = await call("verify", { body: { reference: "eduq_11111111_1700000000000" } });
    expect(r.status).toBe(200); expect(r.json.new_balance).toBe(35);
    expect(balance()).toBe(35);
  });
  it("when both ways of crediting fail, nothing is credited and the transaction can be retried", async () => {
    seed(); o.failRpc = true; o.failFallbackWrite = true;
    const r = await call("verify", { body: { reference: "eduq_11111111_1700000000000" } });
    expect(r.status).toBe(500);
    expect(balance()).toBe(10);
    expect(db.transactions[0].status).toBe("pending");
  });
  it("two simultaneous verifications still credit once", async () => {
    seed();
    const [a, b] = await Promise.all([call("verify", { body: { reference: "eduq_11111111_1700000000000" } }), call("verify", { body: { reference: "eduq_11111111_1700000000000" } })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(balance()).toBe(35);
  });
  it("refuses malformed references before touching the database", async () => {
    for (const bad of ["abc", "a&user_id=neq.0xxx", "ref with spaces", "x".repeat(200), "ab;drop", 123, null, ""]) {
      const before = sbCalls;
      const r = await call("verify", { body: { reference: bad } });
      expect([400], String(bad)).toContain(r.status);
      expect(sbCalls, String(bad)).toBe(before);
    }
  });
  it("accepts Paystack's own reference characters (letters, digits, - _ . =)", async () => {
    seed({ paystack_ref: "T123-abc_9.x=" });
    const r = await call("verify", { body: { reference: "T123-abc_9.x=" } });
    expect(r.status).toBe(200);
  });
  it("another user's transaction is 'not found', never credited to the caller", async () => {
    seed({ user_id: U2 }); db.coins.push({ user_id: U2, balance: 0 });
    const r = await call("verify", { body: { reference: "eduq_11111111_1700000000000" }, sub: U1 });
    expect(r.status).toBe(404);
    expect(balance(U1)).toBe(10); expect(balance(U2)).toBe(0);
  });
  it("a payment that was not successful, or too small, credits nothing", async () => {
    seed(); o.paystackStatus = "abandoned";
    expect((await call("verify", { body: { reference: "eduq_11111111_1700000000000" } })).status).toBe(400);
    o.paystackStatus = "success"; o.paystackAmount = 100;
    expect((await call("verify", { body: { reference: "eduq_11111111_1700000000000" } })).status).toBe(400);
    expect(balance()).toBe(10); expect(db.transactions[0].status).toBe("pending");
  });
  it("requires sign-in", async () => {
    expect((await call("verify", { body: { reference: "eduq_11111111_1700000000000" }, auth: false })).status).toBe(401);
  });
});
