// The REAL account handler (My Exams history) against an in-memory Supabase.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onRequest } from "../functions/api/exam-account/[[path]].js";

const ENV = { SUPABASE_URL: "http://sb.test", SUPABASE_SERVICE_KEY: "k", JWT_SECRET: "secret", ALLOWED_ORIGIN: "https://app.test" };
const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";
const b64u = (s) => Buffer.from(s).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
async function token(sub = U1) {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ sub, email: "t@x.com", exp: Math.floor(Date.now() / 1000) + 3600 }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(ENV.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${h}.${p}`))).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${h}.${p}.${sig}`;
}

let rows, sbCalls, seq;
const uuid = () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++seq).padStart(12, "0")}`;
function matches(row, params) {
  for (const [k, v] of params) {
    if (["select", "order", "limit"].includes(k)) continue;
    if (v.startsWith("eq.")) { if (String(row[k]) !== v.slice(3)) return false; }
    else if (v.startsWith("in.(")) { if (!v.slice(4, -1).split(",").includes(String(row[k]))) return false; }
  }
  return true;
}
beforeEach(() => {
  rows = []; sbCalls = 0; seq = 0;
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    if (!String(url).startsWith("http://sb.test")) throw new Error("unexpected fetch " + url);
    sbCalls++;
    const method = (init.method || "GET").toUpperCase(), body = init.body ? JSON.parse(init.body) : null;
    const ok = (d, s = 200) => new Response(d === undefined ? "" : JSON.stringify(d), { status: s });
    if (u.pathname !== "/rest/v1/exam_history") return ok([]);
    const params = [...u.searchParams.entries()];
    if (method === "POST") { const r = { id: uuid(), created_at: new Date(2026, 0, 1, 0, 0, seq).toISOString(), ...body }; rows.push(r); return ok([r], 201); }
    const hit = rows.filter(r => matches(r, params));
    if (method === "GET") { let out = hit.slice(); if (u.searchParams.get("order") === "created_at.asc") out.sort((a, b) => a.created_at < b.created_at ? -1 : 1); if (u.searchParams.get("order") === "created_at.desc") out.sort((a, b) => a.created_at < b.created_at ? 1 : -1); const lim = Number(u.searchParams.get("limit")); if (lim) out = out.slice(0, lim); return ok(out); }
    if (method === "PATCH") { hit.forEach(r => Object.assign(r, body)); return ok(hit); }
    if (method === "DELETE") { rows = rows.filter(r => !hit.includes(r)); return ok(hit); }
    return ok([]);
  });
});
afterEach(() => vi.restoreAllMocks());

async function call(method, path, { body, sub = U1, auth = true, raw } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${await token(sub)}`;
  const res = await onRequest({ request: new Request(`https://app.test/api/exam-account${path}`, { method, headers, ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}) }), env: ENV });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const exam = (n = 1) => ({ title: `Exam ${n}`, subject: "Biology", class: "SHS 3", exam_type: "Mock Exam", exam_json: { sections: [{ id: "A", questions: [{ number: 1, text: "q" }] }] }, meta_json: { schoolName: "T" } });

describe("exam-account: My Exams", () => {
  it("saves, lists, opens, renames and deletes an exam", async () => {
    const s = await call("POST", "/history", { body: exam(1) });
    expect(s.status).toBe(200); const id = s.json.id;
    const list = await call("GET", "/history");
    expect(list.json.exams.map(e => e.id)).toEqual([id]);
    const opened = await call("GET", `/history/${id}`);
    expect(opened.status).toBe(200);
    expect(opened.json.exam_json.sections[0].id).toBe("A");
    expect(opened.json.id).toBe(id);
    const put = await call("PUT", `/history/${id}`, { body: { title: "  Renamed  " } });
    expect(put.status).toBe(200); expect(put.json.title).toBe("Renamed");
    expect((await call("DELETE", `/history/${id}`)).status).toBe(200);
    expect((await call("GET", "/history")).json.exams).toEqual([]);
  });
  it("keeps at most 10 exams per user, evicting the oldest first", async () => {
    const ids = [];
    for (let i = 1; i <= 11; i++) { const r = await call("POST", "/history", { body: exam(i) }); ids.push(r.json.id); if (i === 11) expect(r.json.deletedCount).toBe(1); }
    const list = (await call("GET", "/history")).json.exams.map(e => e.id);
    expect(list).toHaveLength(10);
    expect(list).not.toContain(ids[0]);
    expect(list).toContain(ids[10]);
  });
  it("one user can never see, change or delete another user's exam", async () => {
    const id = (await call("POST", "/history", { body: exam(1) })).json.id;
    expect((await call("GET", `/history/${id}`, { sub: U2 })).status).toBe(404);
    expect((await call("PUT", `/history/${id}`, { sub: U2, body: { title: "hacked" } })).status).toBe(404);
    await call("DELETE", `/history/${id}`, { sub: U2 });
    expect(rows).toHaveLength(1); expect(rows[0].title).toBe("Exam 1");
    expect((await call("GET", "/history", { sub: U2 })).json.exams).toEqual([]);
  });
  it("REGRESSION: ids that are not UUIDs get a clean 404 and never reach the database", async () => {
    for (const bad of ["abc", "123", "abc&user_id=neq.zzz", "..%2F..", "x".repeat(300)]) {
      const before = sbCalls;
      expect((await call("GET", `/history/${bad}`)).status, bad).toBe(404);
      expect((await call("PUT", `/history/${bad}`, { body: { title: "t" } })).status, bad).toBe(404);
      expect((await call("DELETE", `/history/${bad}`)).status, bad).toBe(200);
      expect(sbCalls, bad).toBe(before);
    }
  });
  it("REGRESSION: a malformed JSON body is a 400, not a server error", async () => {
    expect((await call("POST", "/history", { raw: "{not json" })).status).toBe(400);
    const id = (await call("POST", "/history", { body: exam(1) })).json.id;
    expect((await call("PUT", `/history/${id}`, { raw: "{not json" })).status).toBe(400);
    expect((await call("PUT", `/history/${id}`, { raw: "null" })).status).toBe(400);
    expect((await call("POST", "/history", { raw: "null" })).status).toBe(400);
  });
  it("rejects empty updates and missing exam data", async () => {
    const id = (await call("POST", "/history", { body: exam(1) })).json.id;
    expect((await call("PUT", `/history/${id}`, { body: {} })).status).toBe(400);
    expect((await call("POST", "/history", { body: { title: "x" } })).status).toBe(400);
  });
  it("refuses a single saved exam larger than the 600 KB ceiling", async () => {
    const big = { ...exam(1), exam_json: { sections: [{ id: "A", questions: [{ number: 1, text: "x".repeat(700 * 1024) }] }] } };
    const r = await call("POST", "/history", { body: big });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(rows).toHaveLength(0);
  });
  it("requires sign-in on every route", async () => {
    expect((await call("GET", "/history", { auth: false })).status).toBe(401);
    expect((await call("POST", "/history", { auth: false, body: exam(1) })).status).toBe(401);
    expect((await call("DELETE", "/history", { auth: false })).status).toBe(401);
  });
  it("clearing My Exams only clears the caller's own", async () => {
    await call("POST", "/history", { body: exam(1) }); await call("POST", "/history", { body: exam(2), sub: U2 });
    await call("DELETE", "/history");
    expect(rows.map(r => r.user_id)).toEqual([U2]);
  });
});
