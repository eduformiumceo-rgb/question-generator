import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { extractFigureSlots, slotState, figureLines, figureInfo, removeFirstFigureLine, setSlotDiagram, setSlotImage, aiDiagram } from "../src/partFigures.js";
import { renderExamHTML } from "../src/examTemplate.js";
import { generateExamDocx } from "../src/examDocx.js";
import { getBeceProfile, beceSections, decorateBeceExam } from "../src/beceStyle.js";
import { autoDrawFigures, requestFigureSVG } from "../src/aiFigures.js";

const SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 260'><circle cx='200' cy='130' r='60' fill='none' stroke='#111'/><text x='196' y='135'>A</text></svg>";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const bece = () => {
  const profile = getBeceProfile("Science"), secs = beceSections(profile);
  const sections = secs.map(s => ({ id: s.id, label: s.label, type: s.type, questions: Array.from({ length: s.questionCount }, (_, i) => s.type === "objective"
    ? { number: i + 1, text: "Q?", marks: 1, options: ["a", "b", "c", "d"], correctOption: "B" }
    : { number: (s.numberFrom || 1) + i, text: "", marks: 20, diagram: { needed: true, description: "whole question" },
        parts: [
          { label: "a", text: "[FIGURE 1(a): a plant cell]\nName A and B.", marks: 10 },
          { label: "b", text: "[FIGURE 1(b): a food chain]\nState two.", marks: 10 },
        ] }) }));
  return decorateBeceExam({ title: "x", sections, answerKey: [] }, secs, profile, "Mock Exam");
};

describe("figure slots", () => {
  it("each BECE part with a [FIGURE] line is its own slot, and the question-level box is not listed again", () => {
    const slots = extractFigureSlots(bece());
    const first = slots.filter(s => s.sectionLabel !== undefined && /^Q1\(/.test(s.label));
    expect(first.map(s => s.label)).toEqual(["Q1(a)", "Q1(b)"]);
    expect(first[0].description).toBe("a plant cell");
    expect(slots.some(s => s.kind === "question" && s.label === "Q1")).toBe(false);
  });
  it("a school-exam question with diagram.needed is one question-level slot", () => {
    const ex = { sections: [{ id: "B", label: "Section B", questions: [{ number: 3, text: "Find x", marks: 5, diagram: { needed: true, description: "a triangle" } }, { number: 4, text: "plain", marks: 2 }] }] };
    const slots = extractFigureSlots(ex);
    expect(slots).toHaveLength(1); expect(slots[0]).toMatchObject({ kind: "question", label: "Q3", description: "a triangle" });
    expect(slotState(slots[0])).toBe("empty");
  });
  it("state follows picture > drawing > empty", () => {
    const ex = bece(); const slot = extractFigureSlots(ex)[0];
    expect(slotState(slot)).toBe("empty");
    expect(slotState({ ...slot, owner: { ...slot.owner, diagram: aiDiagram("x", SVG) } })).toBe("drawn");
    expect(slotState({ ...slot, owner: { ...slot.owner, diagram: { ...aiDiagram("x", SVG), useDrawing: false } } })).toBe("textbox");
    expect(slotState({ ...slot, owner: { ...slot.owner, image: { src: PNG }, diagram: aiDiagram("x", SVG) } })).toBe("picture");
  });
  it("text helpers", () => {
    expect(figureLines("hi\n[FIGURE 2(b): a map]\nbye")).toEqual(["[FIGURE 2(b): a map]"]);
    expect(figureInfo("[FIGURE 2(b): a map]")).toEqual({ ref: "2(b)", desc: "a map" });
    expect(removeFirstFigureLine("hi\n[FIGURE 2(b): a map]\nbye")).toBe("hi\nbye");
  });
  it("setSlotDiagram / setSlotImage change only that part", () => {
    let ex = bece();
    const set = (fn) => { ex = typeof fn === "function" ? fn(ex) : fn; };
    const slots = extractFigureSlots(ex);
    setSlotDiagram(set, slots[1], aiDiagram("a food chain", SVG));
    const q = ex.sections[0].questions[0];
    expect(q.parts[0].diagram).toBeUndefined(); expect(q.parts[1].diagram.svg).toBe(SVG);
    setSlotImage(set, slots[1], { src: PNG, size: "medium" });
    expect(ex.sections[0].questions[0].parts[1].image.src).toBe(PNG);
    setSlotImage(set, slots[1], null);
    expect(ex.sections[0].questions[0].parts[1].image).toBeUndefined();
  });
});

describe("rendering a part figure", () => {
  const html = (ex) => renderExamHTML(ex, { subject: "Science", className: "JHS 3", examType: "Mock Exam" }, "paper");
  it("without drawings: one dashed box per part, and no extra question-level box", () => {
    const h = html(bece());
    expect(h).toContain("[FIGURE 1(a): a plant cell]"); expect(h).toContain("[FIGURE 1(b): a food chain]");
    expect(h).not.toContain("[ DIAGRAM: whole question ]");
  });
  it("a drawing replaces that part's placeholder only", () => {
    const ex = bece(); const set = (fn) => { Object.assign(ex, fn(ex)); };
    setSlotDiagram(set, extractFigureSlots(ex)[0], aiDiagram("a plant cell", SVG));
    const count = (h, t) => h.split(t).length - 1;
    const before = count(html(bece()), "[FIGURE 1(a): a plant cell]");
    const h = html(ex);
    expect(count(h, "[FIGURE 1(a): a plant cell]")).toBe(before - 1);   // only Q1(a) lost its box (other questions reuse the text)
    expect(count(h, "diagram-svg-wrap")).toBeGreaterThan(count(html(bece()), "diagram-svg-wrap"));
    expect(count(h, "[FIGURE 1(b): a food chain]")).toBe(count(html(bece()), "[FIGURE 1(b): a food chain]"));
  });
  it("a teacher's picture beats the drawing", () => {
    const ex = bece(); const set = (fn) => { Object.assign(ex, fn(ex)); };
    const slot = extractFigureSlots(ex)[0];
    setSlotDiagram(set, slot, aiDiagram("a plant cell", SVG));
    setSlotImage(set, extractFigureSlots(ex)[0], { src: PNG, size: "medium" });
    const count = (h, t) => h.split(t).length - 1;
    const h = html(ex);
    expect(h).toContain('class="q-fig-img"');
    expect(count(h, "[FIGURE 1(a): a plant cell]")).toBe(count(html(bece()), "[FIGURE 1(a): a plant cell]") - 1);
    expect(count(h, "diagram-svg-wrap")).toBe(count(html(bece()), "diagram-svg-wrap") + 1 - 1 + 0);
  });
  it("unsafe stored SVG never reaches the page", () => {
    const ex = bece(); const set = (fn) => { Object.assign(ex, fn(ex)); };
    setSlotDiagram(set, extractFigureSlots(ex)[0], aiDiagram("x", "<svg><script>alert(1)</script></svg>"));
    expect(html(ex)).not.toContain("<script>alert(1)");
  });
  it("Word export keeps working with part figures", async () => {
    const ex = bece(); const set = (fn) => { Object.assign(ex, fn(ex)); };
    setSlotImage(set, extractFigureSlots(ex)[0], { src: PNG, size: "small" });
    const blob = await generateExamDocx(ex, { subject: "Science", className: "JHS 3", examType: "Mock Exam", svgPngs: {} }, "paper");
    expect(blob.size).toBeGreaterThan(2000);
  });
});

describe("AI drawing (client)", () => {
  afterEach(() => vi.restoreAllMocks());
  const okFetch = (svg) => vi.fn(async () => ({ ok: true, json: async () => ({ svg }) }));
  it("keeps a safe drawing, rejects an unsafe one", async () => {
    vi.stubGlobal("fetch", okFetch(SVG));
    await expect(requestFigureSVG({ api: "/x", description: "d" })).resolves.toBe(SVG);
    vi.stubGlobal("fetch", okFetch("<svg><script>1</script></svg>"));
    await expect(requestFigureSVG({ api: "/x", description: "d" })).rejects.toThrow(/wasn't usable/);
  });
  it("draws every empty figure once, reports failures and leaves a failed one empty", async () => {
    let ex = bece();
    const set = (fn) => { ex = typeof fn === "function" ? fn(ex) : fn; };
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async (_u, o) => {
      const d = JSON.parse(o.body).description; n++;
      return /food chain/.test(d) ? { ok: false, json: async () => ({ error: "nope" }) } : { ok: true, json: async () => ({ svg: SVG }) };
    }));
    const seen = {};
    const drawn = await autoDrawFigures({ examData: ex, setExamData: set, api: "/x", subject: "Science", onSlot: (k, s) => { seen[k] = s; } });
    const slots = extractFigureSlots(ex);
    const a = slots.find(s => s.label === "Q1(a)"), b = slots.find(s => s.label === "Q1(b)");
    expect(slotState(a)).toBe("drawn"); expect(slotState(b)).toBe("empty");
    expect(seen[b.key]).toBe("failed"); expect(drawn).toBeGreaterThan(0);
    expect(n).toBe(slots.length);
  });
});

describe("server mode draw-figure", () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const token = (secret) => { const h = b64({ alg: "HS256", typ: "JWT" }), p = b64({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 600 }); return `${h}.${p}.${createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`; };
  const call = async (body, geminiText) => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: geminiText }] } }] }) })));
    const { onRequest } = await import("../functions/api/generate-exam.js");
    const env = { JWT_SECRET: "s", GEMINI_API_KEY: "k", ALLOWED_ORIGIN: "*" };
    const res = await onRequest({ env, request: new Request("https://x.test/api/generate-exam", { method: "POST", headers: { Authorization: `Bearer ${token("s")}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    return { status: res.status, data: await res.json() };
  };
  afterEach(() => vi.restoreAllMocks());
  it("returns the svg the model drew", async () => {
    const r = await call({ mode: "draw-figure", description: "a plant cell with parts A and B", subject: "Science" }, JSON.stringify({ svg: SVG }));
    expect(r.status).toBe(200); expect(r.data.svg).toBe(SVG);
  });
  it("rejects a reply that is not an svg, and a missing description", async () => {
    expect((await call({ mode: "draw-figure", description: "a plant cell" }, JSON.stringify({ svg: "hello" }))).status).toBe(502);
    expect((await call({ mode: "draw-figure", description: "" }, "{}")).status).toBe(400);
  });
});
