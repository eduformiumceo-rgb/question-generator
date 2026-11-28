// Regression tests for the bugs found in the full-app audit. Each one failed before its fix.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onRequest as authHandler } from "../functions/api/auth/[[path]].js";
import { onRequest as accountHandler } from "../functions/api/exam-account/[[path]].js";
import { onRequest as paymentHandler } from "../functions/api/exam-payment/[[path]].js";
import { onRequest as generateHandler } from "../functions/api/generate-exam.js";
import { streamExamAPI } from "../src/examApi.js";
import { readFileSync, existsSync } from "node:fs";

const U1 = "11111111-1111-4111-8111-111111111111";
const b64u = (s) => Buffer.from(s).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
async function token(secret, sub = U1) {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ sub, email: "t@x.com", exp: Math.floor(Date.now() / 1000) + 3600 }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${h}.${p}`))).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${h}.${p}.${sig}`;
}
const ENV = { SUPABASE_URL: "http://sb.test", SUPABASE_SERVICE_KEY: "k", JWT_SECRET: "secret", ALLOWED_ORIGIN: "https://app.test", PAYSTACK_SECRET_KEY: "ps", GEMINI_API_KEY: "g" };
const ok = (d, s = 200) => new Response(d === undefined ? "" : JSON.stringify(d), { status: s });

afterEach(() => vi.restoreAllMocks());

/* ───────────── /api/auth/coins/deduct ───────────── */
describe("REGRESSION: /api/auth/coins/deduct cannot be used to mint coins", () => {
  let balance, writes;
  beforeEach(() => {
    balance = 10; writes = [];
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = new URL(String(url)), method = (init.method || "GET").toUpperCase();
      if (u.pathname === "/rest/v1/rpc/decrement_coins") {
        const amt = JSON.parse(init.body).p_amount;
        if (balance < amt) return ok({ message: "insufficient_coins" }, 400);
        balance -= amt; writes.push(["rpc", amt]); return ok(balance);
      }
      if (u.pathname === "/rest/v1/coins" && method === "GET") return ok([{ balance }]);
      if (u.pathname === "/rest/v1/coins" && method === "PATCH") { balance = JSON.parse(init.body).balance; writes.push(["patch", balance]); return ok([{ balance }]); }
      return ok([]);
    });
  });
  const deduct = async (body) => {
    const res = await authHandler({ request: new Request("https://app.test/api/auth/coins/deduct", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token("secret")}` }, body: JSON.stringify(body) }), env: { ...ENV, OTP_KV: undefined } });
    return { status: res.status, json: await res.json().catch(() => null) };
  };

  it("a NEGATIVE amount is refused and the balance is untouched", async () => {
    const r = await deduct({ amount: -1000 });
    expect(r.status).toBe(400);
    expect(balance).toBe(10);
    expect(writes).toEqual([]);
  });
  it("zero, NaN-like, text and huge amounts are refused", async () => {
    for (const amount of [0, "abc", 1e9, null, "-5", false]) {
      const r = await deduct({ amount });
      expect(r.status, JSON.stringify(amount)).toBe(400);
    }
    expect(balance).toBe(10);
  });
  it("a normal amount still works and uses the atomic decrement", async () => {
    const r = await deduct({ amount: 3 });
    expect(r.status).toBe(200);
    expect(r.json.balance).toBe(7);
    expect(writes).toEqual([["rpc", 3]]);
  });
  it("not enough coins is a 402 and nothing is taken", async () => {
    const r = await deduct({ amount: 50 });
    expect(r.status).toBe(402);
    expect(balance).toBe(10);
  });
  it("an unreadable body is a clean 400, not a crash", async () => {
    const res = await authHandler({ request: new Request("https://app.test/api/auth/coins/deduct", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token("secret")}` }, body: "{not json" }), env: { ...ENV, OTP_KV: undefined } });
    expect(res.status).toBe(400);
  });
});

/* ───────────── /api/exam-account ───────────── */
describe("REGRESSION: exam-account", () => {
  let gens, history;
  beforeEach(() => {
    history = []; gens = [
      { curriculum: "GES", tier: "free" },        // one real free quiz
      { curriculum: "REPLACE", tier: "free" },    // two question replacements: these are NOT quizzes
      { curriculum: "REPLACE", tier: "free" },
      { curriculum: "GES", tier: "premium" },
    ];
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = new URL(String(url)), method = (init.method || "GET").toUpperCase();
      if (u.pathname === "/rest/v1/exam_generations") {
        const p = u.searchParams;
        return ok(gens.filter(g => (!p.get("curriculum") || g.curriculum === p.get("curriculum").replace(/^eq\./, "")) && (!p.get("tier") || g.tier === p.get("tier").replace(/^eq\./, ""))));
      }
      if (u.pathname === "/rest/v1/exam_history") {
        if (method === "POST") { const r = { id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", created_at: new Date().toISOString(), ...JSON.parse(init.body) }; history.push(r); return ok([r], 201); }
        return ok([]);
      }
      return ok([]);
    });
  });
  const call = async (method, path, body) => {
    const res = await accountHandler({ request: new Request(`https://app.test/api/exam-account${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token("secret")}` }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env: ENV });
    return { status: res.status, json: await res.json().catch(() => null) };
  };

  it("free-usage counts only real free quizzes, exactly as generate-exam's own limit does (question replacements are not quizzes)", async () => {
    const r = await call("GET", "/free-usage");
    expect(r.status).toBe(200);
    expect(r.json.used).toBe(1);
    expect(r.json.remaining).toBe(r.json.limit - 1);
  });
  it("an oversized meta_json is refused on save and on update", async () => {
    const huge = { blob: "x".repeat(150 * 1024) };
    const exam = { sections: [{ id: "A", questions: [{ number: 1, text: "q" }] }] };
    expect((await call("POST", "/history", { title: "T", exam_json: exam, meta_json: huge })).status).toBe(413);
    expect((await call("PUT", `/history/aaaaaaaa-aaaa-4aaa-8aaa-000000000001`, { meta_json: huge })).status).toBe(413);
    expect(history).toEqual([]);
  });
  it("a normal meta_json still saves", async () => {
    const r = await call("POST", "/history", { title: "T", exam_json: { sections: [] }, meta_json: { schoolName: "S" } });
    expect(r.status).toBe(200);
    expect(history[0].meta_json).toEqual({ schoolName: "S" });
  });
});

/* ───────────── /api/exam-payment ───────────── */
describe("REGRESSION: exam-payment", () => {
  const call = async (method, path, body) => {
    const res = await paymentHandler({ request: new Request(`https://app.test/api/exam-payment${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token("secret")}` }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env: ENV });
    return { res, json: await res.json().catch(() => null) };
  };

  it("a database outage comes back as a normal JSON error WITH CORS headers (it used to escape as a bare 500)", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("network down"); });
    const { res, json } = await call("POST", "/initialize", { package_id: "trial" });
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.test");
    expect(json.error.message).toMatch(/went wrong/i);
  });
  it("when Paystack refuses to start the payment, the pending row is closed instead of left behind", async () => {
    const patched = [];
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = String(url), method = (init.method || "GET").toUpperCase();
      if (u.startsWith("https://api.paystack.co")) return ok({ status: false, message: "nope" });
      if (u.includes("/transactions") && method === "PATCH") { patched.push(JSON.parse(init.body)); return ok([{}]); }
      return ok([{}], 201);
    });
    const { res } = await call("POST", "/initialize", { package_id: "trial" });
    expect(res.status).toBe(500);
    expect(patched).toEqual([{ status: "failed" }]);
  });
  it("(migration 004 NOT installed) credits are ADDED and the purchase is reported as a success even if the final 'completed' bookkeeping write fails", async () => {
    let credited = 0;
    const REF = "eduq_11111111_1700000000000";
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = new URL(String(url)), method = (init.method || "GET").toUpperCase();
      if (u.hostname === "api.paystack.co") return ok({ status: true, data: { status: "success", amount: 600, metadata: { user_id: U1 } } });
      if (u.pathname === "/rest/v1/rpc/exam_credit_purchase") return ok({ code: "PGRST202", message: "Could not find the function public.exam_credit_purchase(p_ref, p_user_id) in the schema cache" }, 404);   // migration 004 not installed
      if (u.pathname === "/rest/v1/rpc/increment_coins") { credited += JSON.parse(init.body).p_amount; return ok(null); }
      if (u.pathname === "/rest/v1/coins") return ok([{ balance: 4 }]);
      if (u.pathname === "/rest/v1/transactions") {
        const st = u.searchParams.get("status");
        if (method === "GET" && st === "eq.completed") return ok([]);
        if (method === "GET") return ok([{ id: 1, user_id: U1, coins_purchased: 4, status: "pending", amount_ghs: 6 }]);
        if (method === "PATCH") { const b = JSON.parse(init.body); if (b.status === "completed") return ok({ message: "db down" }, 500); return ok([{ id: 1 }]); }
      }
      return ok([]);
    });
    const { res, json } = await call("POST", "/verify", { reference: REF });
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(credited).toBe(4);
  });
});

/* ───────────── /api/generate-exam: section validation ───────────── */
describe("REGRESSION: generate-exam refuses malformed sections BEFORE spending credits or AI calls", () => {
  let aiCalls, coinCalls;
  beforeEach(() => {
    aiCalls = 0; coinCalls = 0;
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("generativelanguage")) { aiCalls++; return ok({}); }
      if (u.includes("/rpc/decrement_coins") || u.includes("/rpc/increment_coins")) { coinCalls++; return ok(5); }
      return ok([]);
    });
  });
  const gen = async (sections) => {
    const res = await generateHandler({ request: new Request("https://app.test/api/generate-exam", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token("secret")}` }, body: JSON.stringify({ subject: "Biology", className: "SHS 1", tier: "premium", sections }) }), env: ENV });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const good = { id: "A", label: "Section A", type: "objective", questionCount: 5, marksPerQuestion: 1 };

  for (const [name, bad] of [
    ["zero questions", { ...good, questionCount: 0 }],
    ["negative questions", { ...good, questionCount: -3 }],
    ["fractional questions", { ...good, questionCount: 2.5 }],
    ["text for a count", { ...good, questionCount: "lots" }],
    ["zero marks", { ...good, marksPerQuestion: 0 }],
    ["negative marks", { ...good, marksPerQuestion: -1 }],
    ["huge marks", { ...good, marksPerQuestion: 5000 }],
    ["a null section", null],
  ]) {
    it(`rejects ${name} with a 400 and touches neither the wallet nor the AI`, async () => {
      const r = await gen([good, bad]);
      expect(r.status).toBe(400);
      expect(aiCalls).toBe(0);
      expect(coinCalls).toBe(0);
    });
  }
  it("rejects an unbounded number of sections", async () => {
    const r = await gen(Array.from({ length: 40 }, (_, i) => ({ ...good, id: `S${i}` })));
    expect(r.status).toBe(400);
    expect(coinCalls).toBe(0);
  });
});

/* ───────────── client: streaming reader ───────────── */
describe("REGRESSION: streamExamAPI keeps a final line that has no trailing newline", () => {
  const streamOf = (text) => ({ ok: true, body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } }) });
  it("returns the 'done' event even when the proxy dropped its newline", async () => {
    const done = { type: "done", examData: { title: "T", sections: [] }, creditsRemaining: 3 };
    globalThis.fetch = vi.fn(async () => streamOf(JSON.stringify({ type: "progress" }) + "\n" + JSON.stringify(done)));
    const seen = [];
    const r = await streamExamAPI({}, "t", e => seen.push(e.type));
    expect(r.examData.title).toBe("T");
    expect(seen).toEqual(["progress", "done"]);
  });
  it("still works with the normal newline-terminated stream", async () => {
    globalThis.fetch = vi.fn(async () => streamOf(JSON.stringify({ type: "done", examData: { sections: [] } }) + "\n"));
    expect((await streamExamAPI({}, "t")).type).toBe("done");
  });
  it("a half-written last line is ignored, not a crash", async () => {
    globalThis.fetch = vi.fn(async () => streamOf(JSON.stringify({ type: "done", examData: { sections: [] } }) + "\n" + '{"type":"pro'));
    expect((await streamExamAPI({}, "t")).type).toBe("done");
  });
});

/* ───────────── project hygiene ───────────── */
describe("REGRESSION: the Cloudflare functions folder holds only the live API", () => {
  it("has no stale nested copy of the project (it would be published as extra, outdated API routes)", () => {
    for (const stale of ["functions/functions", "functions/src", "functions/tests", "functions/package.json", "functions/index.html"]) {
      expect(existsSync(stale), stale).toBe(false);
    }
    for (const live of ["functions/api/generate-exam.js", "functions/api/auth/[[path]].js", "functions/api/exam-account/[[path]].js", "functions/api/exam-payment/[[path]].js"]) {
      expect(existsSync(live), live).toBe(true);
    }
  });
  it("the service worker only caches good navigations and keeps the offline shell fresh", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toMatch(/if \(res\.ok\) \{\s*const forRoute/);
    expect(sw).toContain("c.put(OFFLINE_PAGE, forShell)");
  });
});

/* ───────────── password-reset tokens are not login tokens ───────────── */
describe("REGRESSION: a password-reset token cannot be used as a login session", () => {
  async function resetToken() {
    const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ sub: U1, purpose: "reset", exp: Math.floor(Date.now() / 1000) + 900 }));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${h}.${p}`))).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    return `${h}.${p}.${sig}`;
  }
  beforeEach(() => { globalThis.fetch = vi.fn(async () => ok([])); });
  const withTok = (url, tok, init = {}) => new Request(url, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` } });

  it("is refused by every endpoint that means 'a signed-in user'", async () => {
    const tok = await resetToken();
    expect((await authHandler({ request: withTok("https://app.test/api/auth/coins/deduct", tok, { method: "POST", body: JSON.stringify({ amount: 1 }) }), env: { ...ENV, OTP_KV: undefined } })).status).toBe(401);
    expect((await accountHandler({ request: withTok("https://app.test/api/exam-account/free-usage", tok), env: ENV })).status).toBe(401);
    expect((await paymentHandler({ request: withTok("https://app.test/api/exam-payment/pending", tok), env: ENV })).status).toBe(401);
    expect((await generateHandler({ request: withTok("https://app.test/api/generate-exam", tok, { method: "POST", body: JSON.stringify({ subject: "Biology", sections: [] }) }), env: ENV })).status).toBe(401);
  });
  it("a normal login token still works on the same endpoints", async () => {
    const tok = await token("secret");
    expect((await accountHandler({ request: withTok("https://app.test/api/exam-account/free-usage", tok), env: ENV })).status).toBe(200);
  });
});

/* ───────────── sign-in does not reveal which emails exist ───────────── */
describe("REGRESSION: sign-in answers the same for an unknown email and a wrong password", () => {
  it("uses one generic message", async () => {
    globalThis.fetch = vi.fn(async (url) => ok(String(url).includes("/users") ? [] : []));
    const r = await authHandler({ request: new Request("https://app.test/api/auth/sign-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "nobody@x.com", password: "whatever123" }) }), env: { ...ENV, OTP_KV: { get: async () => null, put: async () => {}, delete: async () => {} } } });
    const j = await r.json();
    expect(r.status).toBe(401);
    expect(j.error).toBe("Incorrect email or password.");
    expect(j.error).not.toMatch(/no account|sign up/i);
  });
});

/* ───────────── service worker behaviour (run in a simulated worker) ───────────── */
import vm from "node:vm";
describe("service worker", () => {
  function boot({ online = true, serverStatus = 200 } = {}) {
    const store = new Map(); // cache name -> Map(absolute url -> Response)
    const listeners = {};
    const norm = (r) => new URL(typeof r === "string" ? r : r.url, "https://app.test").href;   // a real Cache stores absolute URLs
    const cacheApi = {
      open: async (n) => { if (!store.has(n)) store.set(n, new Map()); const m = store.get(n);
        return { put: async (req, res) => { const k = norm(req); m.delete(k); m.set(k, res); },
                 match: async (req) => m.get(norm(req)),
                 keys: async () => [...m.keys()].map((u) => ({ url: u })), delete: async (r) => m.delete(r.url),
                 addAll: async () => {} }; },
      match: async (req) => { for (const m of store.values()) { if (m.has(norm(req))) return m.get(norm(req)); } return undefined; },
      keys: async () => [...store.keys()], delete: async (n) => store.delete(n),
    };
    const state = { online, serverStatus };
    const self = { location: { hostname: "app.test" }, addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting() {}, clients: { claim() {} } };
    const ctx = vm.createContext({ self, caches: cacheApi, URL, Request, Response, console,
      fetch: async (req) => { if (!state.online) throw new TypeError("offline"); return new Response("body", { status: state.serverStatus }); } });
    vm.runInContext(readFileSync("public/sw.js", "utf8"), ctx);
    const fire = (url, mode) => { let p; listeners.fetch({ request: Object.assign(new Request(url), { }), respondWith: (x) => { p = Promise.resolve(x); } }); return p; };
    const nav = (url) => { const req = new Request(url); Object.defineProperty(req, "mode", { value: "navigate" }); let p; listeners.fetch({ request: req, respondWith: (x) => { p = Promise.resolve(x); } }); return p; };
    return { store, state, fire, nav, cache: () => store.get("eduformium-questions-v2") };
  }
  const settle = () => new Promise((r) => setTimeout(r, 20));

  it("does not keep an error page from the server", async () => {
    const w = boot({ serverStatus: 500 });
    await w.nav("https://app.test/some/route"); await settle();
    expect(w.cache()?.has("https://app.test/some/route") ?? false).toBe(false);
  });
  it("keeps a good page AND refreshes the offline shell from it", async () => {
    const w = boot();
    await w.nav("https://app.test/some/route"); await settle();
    expect(w.cache().has("https://app.test/some/route")).toBe(true);
    expect(w.cache().has("https://app.test/index.html")).toBe(true);
  });
  it("offline with nothing saved gives a clean network error, not a crash", async () => {
    const w = boot({ online: false });
    const res = await w.nav("https://app.test/x");
    expect(res.type).toBe("error");
  });
  it("offline with a saved shell serves it", async () => {
    const w = boot();
    await w.nav("https://app.test/"); await settle();
    w.state.online = false;
    const res = await w.nav("https://app.test/anything");
    expect(res.status).toBe(200);
  });
  it("caps the number of cached files and never drops the app shell", async () => {
    const w = boot();
    await w.nav("https://app.test/"); await settle();                    // shell present
    for (let i = 0; i < 300; i++) { await w.fire(`https://app.test/assets/chunk-${i}.js`); }
    await settle();
    const keys = [...w.cache().keys()];
    expect(keys.length).toBeLessThanOrEqual(250);
    expect(keys).toContain("https://app.test/index.html");
    expect(keys).toContain("https://app.test/assets/chunk-299.js");      // newest survives
    expect(keys).not.toContain("https://app.test/assets/chunk-0.js");    // oldest was dropped
  });
});


/* ───────────── exam-payment: the atomic claim+credit database function (supabase/004) ───────────── */
describe("exam_credit_purchase (migration 004): one database transaction claims AND credits", () => {
  const REF = "eduq_11111111_1700000000001";
  let seen;
  function setup(rpc) {
    seen = { legacyClaim: 0, increment: 0, rpcCalls: [] };
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = new URL(String(url)), method = (init.method || "GET").toUpperCase();
      if (u.hostname === "api.paystack.co") return ok({ status: true, data: { status: "success", amount: 600, metadata: { user_id: U1 } } });
      if (u.pathname === "/rest/v1/rpc/exam_credit_purchase") { seen.rpcCalls.push(JSON.parse(init.body)); return rpc(); }
      if (u.pathname === "/rest/v1/rpc/increment_coins") { seen.increment++; return ok(null); }
      if (u.pathname === "/rest/v1/transactions") {
        const st = u.searchParams.get("status");
        if (method === "GET" && st === "eq.completed") return ok([]);
        if (method === "GET") return ok([{ id: 1, user_id: U1, coins_purchased: 4, status: "pending", amount_ghs: 6 }]);
        if (method === "PATCH") { seen.legacyClaim++; return ok([{ id: 1 }]); }
      }
      return ok([]);
    });
  }
  const verify = async () => {
    const res = await paymentHandler({ request: new Request("https://app.test/api/exam-payment/verify", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token("secret")}` }, body: JSON.stringify({ reference: REF }) }), env: ENV });
    return { status: res.status, json: await res.json().catch(() => null) };
  };

  it("when installed: credits through it, returns the new balance, and never touches the three-step flow", async () => {
    setup(() => ok(14));
    const r = await verify();
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ success: true, credits_added: 4, new_balance: 14 });
    expect(seen.rpcCalls).toEqual([{ p_ref: REF, p_user_id: U1 }]);
    expect(seen.legacyClaim).toBe(0);
    expect(seen.increment).toBe(0);
  });
  it("when it answers NULL (already completed / being processed), nothing is credited a second time", async () => {
    setup(() => ok(null));
    const r = await verify();
    expect(r.status).toBe(200);
    expect(r.json.already_credited).toBe(true);
    expect(r.json.success).toBeUndefined();
    expect(seen.legacyClaim + seen.increment).toBe(0);
  });
  it("a database error inside it is reported honestly and NEVER falls back to the three-step flow (no double credit)", async () => {
    setup(() => ok({ message: "deadlock detected" }, 500));
    const r = await verify();
    expect(r.status).toBe(500);
    expect(r.json.error.message).toMatch(/Restore Previous Purchase/);
    expect(seen.legacyClaim + seen.increment).toBe(0);
  });
  it("an unexpected answer is treated as a failure, not as a credit", async () => {
    for (const odd of [[], { a: 1 }, "ok", 0.5 === 1]) {
      setup(() => ok(odd));
      const r = await verify();
      expect(r.status, JSON.stringify(odd)).toBe(500);
      expect(seen.legacyClaim + seen.increment).toBe(0);
    }
  });
  it("is never called for someone else's purchase (ownership is checked first)", async () => {
    setup(() => ok(14));
    const other = "22222222-2222-4222-8222-222222222222";
    const res = await paymentHandler({ request: new Request("https://app.test/api/exam-payment/verify", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token("secret", other)}` }, body: JSON.stringify({ reference: REF }) }), env: ENV });
    expect(res.status).toBe(404);
    expect(seen.rpcCalls).toEqual([]);
  });
});
