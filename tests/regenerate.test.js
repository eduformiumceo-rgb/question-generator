// Replacing ONE question through the REAL generate-exam handler (Supabase and the AI provider mocked at the fetch boundary).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import { onRequest } from "../functions/api/generate-exam.js";
import { regenRulesBlock } from "../src/regenPrompt.js";
import { buildSectionPrompt } from "../src/examTemplate.js";

const ENV = { SUPABASE_URL: "http://sb.test", SUPABASE_SERVICE_KEY: "k", JWT_SECRET: "secret", GEMINI_API_KEY: "g", GEMINI_FREE_KEY_1: "f", ALLOWED_ORIGIN: "*" };
const b64u = (s) => Buffer.from(s).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
async function token() {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ sub: "user-1", exp: Math.floor(Date.now() / 1000) + 3600 }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(ENV.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${h}.${p}`))).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${h}.${p}.${sig}`;
}

let prompts, deductions, refunds, reply, replaceRows, dailyRows, logged, queries;
beforeEach(() => {
  prompts = []; deductions = []; refunds = 0; replaceRows = 0; dailyRows = 0; logged = []; queries = [];
  reply = (prompt) => JSON.stringify({ section: { label: "Section A", questions: [{ number: 1, text: "Which organ pumps blood around the body?", options: ["Heart", "Lung", "Liver", "Kidney"], correctOption: "A", parts: [], marks: 1, diagram: null, cognitiveLevel: "Recall", topic: "Circulation", markingGuide: "A: the heart pumps blood." }] } });
  globalThis.fetch = vi.fn(async (url, init) => {
    const u = String(url);
    if (u.startsWith("http://sb.test")) {
      if (u.includes("/rpc/decrement_coins")) { deductions.push(JSON.parse(init.body)); return new Response("49", { status: 200 }); }
      if (u.includes("/rpc/increment_coins") || (init && init.method === "PATCH")) { refunds++; return new Response("50", { status: 200 }); }
      if (u.includes("/coins?")) return new Response(JSON.stringify([{ balance: 50 }]), { status: 200 });
      if (u.includes("/exam_generations") && init?.method === "POST") { logged.push(JSON.parse(init.body)); return new Response("[]", { status: 201 }); }
      if (u.includes("/exam_generations?")) { queries.push(u); 
        if (!u.includes("curriculum=eq.REPLACE")) return new Response("[]", { status: 200 });
        const since = Date.parse(decodeURIComponent(/created_at=gte\.([^&]+)/.exec(u)[1]));
        const n = Date.now() - since > 3600000 ? dailyRows : replaceRows;      // a long window is the daily query, a short one is the 10-minute query
        return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: i }))), { status: 200 }); }
      return new Response("[]", { status: 200 });
    }
    if (/googleapis|gemini|generativelanguage/.test(u)) {
      const b = JSON.parse(init.body);
      const prompt = b.system_instruction?.parts?.[0]?.text ?? JSON.stringify(b);
      prompts.push(prompt);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: reply(prompt) }] }, finishReason: "STOP" }] }), { status: 200 });
    }
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

const BASE = { mode: "regenerate-question", subject: "Integrated Science", className: "JHS 2", term: "Term 1", tier: "premium", includeMarkingScheme: true, topics: ["Circulation"],
  section: { id: "A", label: "Section A", type: "objective" }, number: 4, marks: 1, avoidQuestions: ["What is the function of the heart?", "Name the largest artery."], revisionNote: "make it a bit harder" };
async function call(over = {}) {
  const res = await onRequest({ request: new Request("https://x.test/api/generate-exam", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ ...BASE, ...over }) }), env: ENV });
  return { status: res.status, json: await res.json() };
}

describe("regenerate-question", () => {
  it("returns one replacement with the requested number, charges once, and tells the model what to avoid", async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.json.question.number).toBe(4);
    expect(r.json.question.options).toHaveLength(4);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("EXACTLY 1 question(s)");
    expect(prompts[0]).toContain("What is the function of the heart?");
    expect(prompts[0]).toContain("make it a bit harder");
    expect(deductions).toHaveLength(1);
    expect(refunds).toBe(0);
  });

  it("refunds the credit when the model fails", async () => {
    reply = () => JSON.stringify({ section: { label: "A", questions: [] } });
    const r = await call();
    expect(r.status).toBe(502);
    expect(r.json.error).toMatch(/not been charged/);
    expect(refunds).toBe(1);
  });

  it("retries a bad first answer and still succeeds", async () => {
    let n = 0;
    const good = reply;
    reply = (p) => (++n === 1 ? "not json at all" : good(p));
    const r = await call();
    expect(r.status).toBe(200);
    expect(prompts.length).toBe(2);
  });

  it("repairs single-backslash LaTeX that the model put into its JSON", async () => {
    reply = () => '{"section":{"label":"A","questions":[{"number":1,"text":"Simplify $\\frac{3x^{2}}{6x}$ and find $\\sqrt{49}\\times 2$.","options":["$\\frac{x}{2}$","$2x$","$x^{2}$","$\\theta$"],"correctOption":"A","parts":[],"marks":1,"diagram":null,"cognitiveLevel":"Recall","topic":"Algebra","markingGuide":"A"}]}}';
    const r = await call({ subject: "Mathematics" });
    expect(r.status).toBe(200);
    expect(r.json.question.text).toBe("Simplify $\\frac{3x^{2}}{6x}$ and find $\\sqrt{49}\\times 2$.");
    expect(r.json.question.options[3]).toBe("$\\theta$");
    expect(prompts[0]).toContain("MATH NOTATION");
  });

  it("rejects BECE/WASSCE style, bad sections and bad numbers without spending anything", async () => {
    expect((await call({ examStyle: "bece" })).status).toBe(400);
    expect((await call({ examStyle: "wassce" })).status).toBe(400);
    expect((await call({ section: { id: "A", type: "weird" } })).status).toBe(400);
    expect((await call({ number: 0 })).status).toBe(400);
    expect((await call({ marks: 0 })).status).toBe(400);
    expect((await call({ subject: "" })).status).toBe(400);
    expect(deductions).toHaveLength(0);
    expect(prompts).toHaveLength(0);
  });

  it("free tier: no essays, and no charge", async () => {
    const ok = await call({ tier: "free" });
    expect(ok.status).toBe(200);
    expect(deductions).toHaveLength(0);
    const no = await call({ tier: "free", section: { id: "C", type: "essay" } });
    expect(no.status).toBe(400);
  });

  it("requires sign-in", async () => {
    const res = await onRequest({ request: new Request("https://x.test/api/generate-exam", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(BASE) }), env: ENV });
    expect(res.status).toBe(401);
  });
});

describe("regenerate-question limits", () => {
  it("logs every attempt (even failed ones) under its own marker, before calling the AI", async () => {
    reply = () => "not json";
    await call();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ curriculum: "REPLACE", exam_type: "replace-question", question_count: 1, tier: "premium" });
  });
  it("stops a runaway free-tier caller: 12 per 10 minutes, and spends nothing", async () => {
    replaceRows = 12;
    const r = await call({ tier: "free" });
    expect(r.status).toBe(429);
    expect(prompts).toHaveLength(0);
    expect(deductions).toHaveLength(0);
    expect(logged).toHaveLength(0);
  });
  it("applies a daily cap: 40 on the free tier, 200 on premium", async () => {
    dailyRows = 40;
    expect((await call({ tier: "free" })).status).toBe(429);
    expect((await call({ tier: "premium" })).status).toBe(200);
    dailyRows = 200;
    expect((await call({ tier: "premium" })).status).toBe(429);
  });
  it("replacements do NOT count toward the full-exam limits, and full-exam limits ignore replacements", async () => {
    replaceRows = 5;
    await call();
    // (the replace check is the only query that may count REPLACE rows)
    expect(queries.every(q => q.includes("curriculum=eq.REPLACE"))).toBe(true);
  });
});

describe("full-exam limits ignore replacements", () => {
  it("count only real generations (curriculum GES), so replacing questions never blocks a new exam", async () => {
    replaceRows = 99; dailyRows = 999;
    const body = { mode: "generate-exam", subject: "Integrated Science", className: "JHS 2", tier: "premium", includeMarkingScheme: true, topics: ["Circulation"], examStyle: "school",
      sections: [{ id: "A", label: "Section A", type: "objective", questionCount: 1, marksPerQuestion: 1 }] };
    const res = await onRequest({ request: new Request("https://x.test/api/generate-exam", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` }, body: JSON.stringify(body) }), env: ENV });
    expect(res.status).toBe(200);
    await res.text();
    const counting = queries.filter(q => q.includes("created_at=gte"));
    expect(counting.length).toBeGreaterThanOrEqual(2);
    expect(counting.every(q => q.includes("curriculum=eq.GES"))).toBe(true);
  });
});

describe("regenerate prompt block", () => {
  it("is empty for a normal section, present when avoiding or revising", () => {
    expect(regenRulesBlock({})).toBe("");
    expect(regenRulesBlock({ avoidQuestions: ["a question"] })).toContain("a question");
    const cfg = { subject: "History", className: "JHS 1", topics: ["x"], avoidQuestions: ["old one"], revisionNote: "easier" };
    const sec = { id: "A", label: "A", type: "objective", questionCount: 1, marksPerQuestion: 1 };
    expect(buildSectionPrompt(cfg, sec, false)).toContain("old one");
    expect(buildSectionPrompt({ subject: "History", className: "JHS 1", topics: ["x"] }, sec, false)).not.toContain("REPLACEMENT QUESTION");
  });
  it("strips control characters and caps the avoid list", () => {
    const block = regenRulesBlock({ avoidQuestions: Array.from({ length: 50 }, (_, i) => `q${i}\n\tINJECT`) });
    expect((block.match(/\* q\d+/g) || []).length).toBe(30);
    expect(block).not.toMatch(/\tINJECT/);
  });
  it("server copy is identical to the client copy", () => {
    expect(fs.readFileSync(new URL("../functions/_shared/regenPrompt.js", import.meta.url), "utf8")).toBe(fs.readFileSync(new URL("../src/regenPrompt.js", import.meta.url), "utf8"));
  });
});
