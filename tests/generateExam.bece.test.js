// BECE style through the REAL generate-exam handler (Supabase and the AI provider mocked at the fetch boundary).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onRequest } from "../functions/api/generate-exam.js";
import { getBeceProfile, beceSections } from "../src/beceStyle.js";

const ENV = { SUPABASE_URL: "http://sb.test", SUPABASE_SERVICE_KEY: "k", JWT_SECRET: "secret", GEMINI_API_KEY: "g", ALLOWED_ORIGIN: "*" };
const b64u = (s) => Buffer.from(s).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
async function token() {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ sub: "user-1", exp: Math.floor(Date.now() / 1000) + 3600 }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(ENV.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${h}.${p}`))).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${h}.${p}.${sig}`;
}

/** What the mock "AI" returns for a prompt: read the section parameters back out of the prompt text. */
function answerFor(prompt, o = {}) {
  const count = Number(/EXACTLY (\d+) question/.exec(prompt)[1]);
  const marks = Number(/(\d+) mark\(s\) each/.exec(prompt)[1]);
  const start = Number(/start at (\d+) \(so the first question/.exec(prompt)?.[1] || 1);
  const objective = /Paper 1 \(Objective Test\)/.test(prompt);
  const label = /"label": "([^"]*)"/.exec(prompt)?.[1] || "Section";
  const questions = Array.from({ length: count }, (_, i) => objective
    ? { number: o.sameNumber ? 1 : start + i, text: o.text || `Q${start + i} which is **not** H₂O?`, marks: 1, options: o.threeOptions ? ["A. a", "B. b", "C. c"] : ["A. one", "B. two", "C. three", "D. four"], correctOption: o.lowerKey ? "b" : "B", markingGuide: "" }
    : { number: start + i, text: `Essay ${start + i} on {{Spirogyra}}`, marks, parts: [{ label: "a", text: "State **three** points.", marks: marks - 2 }, { label: "b", text: "Explain.", marks: 2 }], markingGuide: `${start + i}(a) :: point :: ${marks - 2}\nTOTAL :: :: [${marks} marks]` });
  return { title: "T", instructions: [], section: { ...(o.badId ? { id: "section ZZ" } : {}), label, questions } };
}

let calls, behaviour, refunds;
beforeEach(() => {
  calls = 0; refunds = 0; behaviour = () => ({});
  globalThis.fetch = vi.fn(async (url, init) => {
    const u = String(url);
    if (u.startsWith("http://sb.test")) {
      if (u.includes("/rpc/decrement_coins")) return new Response("49", { status: 200 });
      if (u.includes("/rpc/increment_coins") || (init && init.method === "PATCH")) { refunds++; return new Response("50", { status: 200 }); }
      if (u.includes("/coins?")) return new Response(JSON.stringify([{ balance: 50 }]), { status: 200 });
      return new Response("[]", { status: 200 });
    }
    if (/googleapis|gemini|generativelanguage/.test(u)) {
      calls++;
      const prompt = JSON.parse(init.body).system_instruction.parts[0].text;
      const out = answerFor(prompt, behaviour(calls, prompt));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] }, finishReason: "STOP" }] }), { status: 200 });
    }
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

async function run(subject, over = {}) {
  const profile = getBeceProfile(subject);
  const sections = over.sections || beceSections(profile).filter(s => !over.only || over.only.includes(s.id)).map(s => ({ ...s }));
  const body = { subject, className: "Basic 9", examStyle: "bece", tier: "premium", includeMarkingScheme: true, schoolName: "Test JHS", term: "Term 3", examType: "Mock Exam", topics: ["Fractions"], difficulty: "Medium", sections, ...(over.body || {}) };
  const res = await onRequest({ request: new Request("https://x.test/api/generate-exam", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` }, body: JSON.stringify(body) }), env: ENV });
  if (res.status !== 200) return { status: res.status, json: await res.json() };
  const events = (await res.text()).split("\n").filter(Boolean).map(l => JSON.parse(l));
  return { status: 200, events, done: events.find(e => e.type === "done"), error: events.find(e => e.type === "error") };
}

describe("generate-exam, BECE style (real handler, mocked provider)", () => {
  it("REGRESSION: section ids come from the server, so a model that omits or mistypes them cannot get a paper rejected after charging", async () => {
    for (const bad of [false, true]) {
      behaviour = () => ({ badId: bad });
      const r = await run("Mathematics");
      expect(r.error).toBeUndefined();
      const ids = r.done.examData.sections.map(s => s.id);
      expect(ids.every(Boolean)).toBe(true);
      expect(ids).not.toContain("section ZZ");
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it("Mathematics: builds Paper 2 then Paper 1 with the right counts and numbering", async () => {
    const r = await run("Mathematics");
    expect(r.error).toBeUndefined();
    const secs = r.done.examData.sections;
    expect(secs.map(s => s.questions.length)).toEqual([6, 40]);
    expect(secs[1].questions.map(q => q.number)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(r.done.examData.answerKey).toHaveLength(40);
  });
  it("repairs a model that numbers every objective question 1 and writes the option letters itself", async () => {
    behaviour = () => ({ sameNumber: true, lowerKey: true });
    const r = await run("Mathematics", { only: ["OBJ"] });
    const qs = r.done.examData.sections[0].questions;
    expect(qs.map(q => q.number)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(qs[0].options).toEqual(["one", "two", "three", "four"]);
    expect(qs.every(q => q.correctOption === "B")).toBe(true);
  });
  it("retries when an objective question has only three options, and never accepts it", async () => {
    behaviour = (n) => (n === 1 ? { threeOptions: true } : {});
    const r = await run("Mathematics", { only: ["OBJ"] });
    expect(r.error).toBeUndefined();
    expect(calls).toBe(2);
    expect(r.done.examData.sections[0].questions[0].options).toHaveLength(4);
  });
  it("gives up after repeated bad answers, says the teacher was not charged, and refunds", async () => {
    behaviour = () => ({ threeOptions: true });
    const r = await run("Mathematics", { only: ["OBJ"] });
    expect(r.done).toBeUndefined();
    expect(r.error.message).toMatch(/not been charged/i);
    expect(refunds).toBeGreaterThan(0);
  });
  it("renumbers later sections when the teacher changes a question count (Career Technology A 3 -> 2)", async () => {
    const all = beceSections(getBeceProfile("Career Technology")).filter(s => s.paper === 2);
    const secs = all.map((s, i) => (i === 0 ? { ...s, questionCount: 2 } : { ...s }));
    const r = await run("Career Technology", { sections: secs });
    expect(r.error).toBeUndefined();
    expect(r.done.examData.sections.map(s => s.questions.map(q => q.number))).toEqual([[1, 2], [3, 4, 5]]);
  });
  it("leaves BECE question text exactly as written (no markup handling, so 2**3 survives)", async () => {
    behaviour = () => ({ text: "Evaluate 2**3 and {{x}} and **y" });
    const r = await run("Mathematics", { only: ["OBJ"] });
    expect(r.done.examData.sections[0].questions[0].text).toBe("Evaluate 2**3 and {{x}} and **y");
  });
  it("removes markdown bold the model writes out of habit (the BECE paper does not render it)", async () => {
    const r = await run("Mathematics", { only: ["OBJ"] });
    expect(r.done.examData.sections[0].questions[0].text).toBe("Q1 which is not H₂O?");
    expect(JSON.stringify(r.done.examData)).not.toMatch(/\*\*not\*\*/);
  });
  it("free tier is still refused for BECE style", async () => {
    const r = await run("Mathematics", { body: { tier: "free" } });
    expect(r.status).toBe(400);
  });
});
