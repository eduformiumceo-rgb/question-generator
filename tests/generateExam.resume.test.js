// Continuing an interrupted run, and handing credits back when the browser goes away.
// Real generate-exam handler; Supabase and the AI provider are mocked at the fetch boundary.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onRequest } from "../functions/api/generate-exam.js";
import { getWassceProfile, wassceSections } from "../src/wassceStyle.js";

const ENV = { SUPABASE_URL: "http://sb.test", SUPABASE_SERVICE_KEY: "k", JWT_SECRET: "secret", GEMINI_API_KEY: "g", ALLOWED_ORIGIN: "*" };
const b64u = (s) => Buffer.from(s).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
async function token() {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ sub: "user-1", exp: Math.floor(Date.now() / 1000) + 3600 }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(ENV.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${h}.${p}`))).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${h}.${p}.${sig}`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function answerFor(prompt) {
  const count = Number(/EXACTLY (\d+) question/.exec(prompt)[1]);
  const marks = Number(/(\d+) mark\(s\) each/.exec(prompt)[1]);
  const start = Number(/start at (\d+) \(so the first question/.exec(prompt)?.[1] || 1);
  const objective = /Paper 1 \(Objective Test\)/.test(prompt);
  const label = /"label": "([^"]*)"/.exec(prompt)?.[1] || "Section";
  const questions = Array.from({ length: count }, (_, i) => objective
    ? { number: start + i, text: `Q${start + i} which is **not** H₂O?`, marks: 1, options: ["A. one", "B. two", "C. three", "D. four"], correctOption: "B", markingGuide: "" }
    : { number: start + i, text: `Essay ${start + i} on {{Spirogyra}}`, marks, parts: [{ label: "a", text: "State **three** points.", marks: marks - 2 }, { label: "b", text: "Explain.", marks: 2 }], markingGuide: `${start + i}(a) :: point :: ${marks - 2}\nTOTAL :: :: [${marks} marks]` });
  return { title: "T", instructions: ["Answer all."], section: { label, questions } };
}

let aiCalls, decrements, refunds, ai;
beforeEach(() => {
  aiCalls = 0; decrements = []; refunds = 0; ai = { delay: 0, fail: false };
  globalThis.fetch = vi.fn(async (url, init) => {
    const u = String(url);
    if (u.startsWith("http://sb.test")) {
      if (u.includes("/rpc/decrement_coins")) { decrements.push(JSON.parse(init.body).p_amount); return new Response("49", { status: 200 }); }
      if (u.includes("/rpc/increment_coins") || (init && init.method === "PATCH")) { refunds++; return new Response("50", { status: 200 }); }
      if (u.includes("/coins?")) return new Response(JSON.stringify([{ balance: 50 }]), { status: 200 });
      return new Response("[]", { status: 200 });
    }
    if (/googleapis|gemini|generativelanguage/.test(u)) {
      aiCalls++;
      if (ai.delay) await sleep(ai.delay);
      if (ai.fail) return new Response("boom", { status: 500 });
      const prompt = JSON.parse(init.body).system_instruction.parts[0].text;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answerFor(prompt)) }] }, finishReason: "STOP" }] }), { status: 200 });
    }
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

const physics = () => wassceSections(getWassceProfile("Physics")).map((s) => ({ ...s, enabled: true }));   // OBJ (50, from 1), A (7, from 1), B (5, from 8)
async function request(over = {}, tier = "premium") {
  const body = { subject: "Physics", className: "SHS 3", examStyle: "wassce", tier, includeMarkingScheme: true, schoolName: "Test SHS", term: "Term 3", examType: "Mock Exam", topics: ["Motion"], difficulty: "Medium", sections: physics(), ...over };
  return onRequest({ request: new Request("https://x.test/api/generate-exam", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` }, body: JSON.stringify(body) }), env: ENV });
}
async function run(over, tier) {
  const res = await request(over, tier);
  if (res.status !== 200) return { status: res.status, json: await res.json() };
  const events = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { status: 200, events, done: events.find((e) => e.type === "done"), error: events.find((e) => e.type === "error") };
}

describe("continuing an interrupted run (skipSectionIds)", () => {
  it("writes only the missing sections and keeps their question numbers (Section B still starts at 8)", async () => {
    const full = await run();
    const fullB = full.done.examData.sections.find((s) => s.id === "B");
    expect(fullB.questions.map((q) => q.number)).toEqual([8, 9, 10, 11, 12]);

    aiCalls = 0;
    const r = await run({ skipSectionIds: ["OBJ", "A"] });
    expect(r.error).toBeUndefined();
    expect(r.done.examData.sections.map((s) => s.id)).toEqual(["B"]);
    expect(r.done.examData.sections[0].questions.map((q) => q.number)).toEqual([8, 9, 10, 11, 12]);
    expect(aiCalls).toBe(1);
    expect(r.done.continued).toBe(true);
  });

  it("charges only for the sections it writes", async () => {
    await run();
    expect(decrements.at(-1)).toBe(1.5);             // 3 sections x 0.5
    await run({ skipSectionIds: ["OBJ", "A"] });
    expect(decrements.at(-1)).toBe(0.5);             // 1 section x 0.5
    await run({ skipSectionIds: ["OBJ"], includeMarkingScheme: false });
    expect(decrements.at(-1)).toBe(0.7);             // 2 sections x 0.35
  });

  it("reports progress against the whole paper, not just the part being written", async () => {
    const r = await run({ skipSectionIds: ["OBJ"] });
    const progress = r.events.filter((e) => e.type === "progress");
    expect(progress.map((e) => [e.sectionId, e.index, e.total])).toEqual([["A", 2, 3], ["B", 3, 3]]);
  });

  it("only asks for the paper title and instructions when the first section is among those written", async () => {
    const skipFirst = await run({ skipSectionIds: ["OBJ"] });
    expect(skipFirst.events.find((e) => e.type === "section-done" && e.title !== undefined)).toBeUndefined();
    const withFirst = await run({ skipSectionIds: ["B"] });
    expect(withFirst.events.find((e) => e.type === "section-done" && e.title !== undefined)).toBeTruthy();
  });

  it("ignores ids that are not in the paper, and refuses when nothing would be left to write", async () => {
    const odd = await run({ skipSectionIds: ["NOPE", "OBJ", "OBJ", 42] });
    expect(odd.error).toBeUndefined();
    expect(odd.done.examData.sections.map((s) => s.id)).toEqual(["A", "B"]);
    const all = await run({ skipSectionIds: ["OBJ", "A", "B"] });
    expect(all.status).toBe(400);
    expect(all.json.error).toMatch(/nothing left to generate/i);
    expect(decrements.length).toBe(1);               // the refused request reserved nothing
  });

  it("works for Free AI too (costs nothing either way)", async () => {
    const r = await run({ skipSectionIds: ["A"], sections: physics().filter((s) => s.type === "objective" || s.id === "A").slice(0, 2), examStyle: "school", className: "Basic 7", subject: "Mathematics" }, "free");
    expect([200, 400]).toContain(r.status);          // free tier has its own caps; the point is that skipping never charges
    expect(decrements.length).toBe(0);
  });
});

describe("credits and a browser that goes away", () => {
  it("a normal run is charged once and never refunded", async () => {
    const r = await run();
    expect(r.done).toBeTruthy();
    expect(decrements).toEqual([1.5]);
    expect(refunds).toBe(0);
  });

  it("a failed run is refunded exactly once, and says so", async () => {
    ai.fail = true;
    const r = await run();
    expect(r.error.message).toMatch(/not been charged/i);
    expect(refunds).toBe(1);
  });

  it("closing the connection mid-run refunds AT ONCE, even while the AI is still busy (nothing else would ever notice)", async () => {
    ai.delay = 1500;                      // the AI call is still running when the page goes away
    const res = await request();
    const reader = res.body.getReader();
    await reader.read();                  // the first event arrives: the run is under way
    await reader.cancel();                // the page was refreshed / the tab was killed
    await sleep(150);
    expect(refunds).toBe(1);              // handed back straight away, not after the AI call eventually returns
    await sleep(1700);                    // the AI finally answers; nothing more may happen
    expect(refunds).toBe(1);              // still exactly once
    expect(aiCalls).toBe(1);              // and it did not go on to write the other sections for nobody
  });

  it("a Free AI run that is cancelled refunds nothing (it was never charged)", async () => {
    ai.delay = 40;
    const res = await request({ sections: [{ id: "A", label: "Section A: Objective", type: "objective", questionCount: 5, marksPerQuestion: 1, enabled: true }], examStyle: "school", className: "Basic 7", subject: "Mathematics" }, "free");
    if (res.status === 200) { const reader = res.body.getReader(); await reader.read(); await reader.cancel(); await sleep(300); }
    expect(refunds).toBe(0);
  });
});
