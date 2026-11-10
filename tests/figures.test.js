import { describe, it, expect } from "vitest";
import { figureLabels, captionText, imagePlacement, imageAlign, diagramDrawing } from "../src/examFigures.js";
import { renderExamHTML, createExamVariant } from "../src/examTemplate.js";
import { generateExamDocx } from "../src/examDocx.js";
import { SAMPLE_EXAM } from "./helpers/sampleExam.js";

const IMG = (n) => `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg${n}`;
const clone = (o) => JSON.parse(JSON.stringify(o));

describe("figure numbering", () => {
  it("numbers only auto-numbered images, in paper order", () => {
    const e = clone(SAMPLE_EXAM);
    e.sections[1].questions[0].image = { src: IMG("A"), autoNumber: true };
    e.sections[0].questions[1].image = { src: IMG("B"), autoNumber: true };
    e.sections[0].questions[2].image = { src: IMG("C") }; // not numbered
    const labels = figureLabels(e);
    expect(labels.get(e.sections[0].questions[1])).toBe("Figure 1");
    expect(labels.get(e.sections[1].questions[0])).toBe("Figure 2");
    expect(labels.has(e.sections[0].questions[2])).toBe(false);
  });
  it("renumbers correctly after a shuffle (Version B)", () => {
    const e = clone(SAMPLE_EXAM);
    e.sections[0].questions.forEach((q, i) => { q.image = { src: IMG(i), autoNumber: true, caption: `cap${i}` }; });
    const v = createExamVariant(e, "B");
    const labels = figureLabels(v);
    const nums = v.sections[0].questions.map(q => labels.get(q));
    expect(nums).toEqual(v.sections[0].questions.map((_, i) => `Figure ${i + 1}`));
    const html = renderExamHTML(v, {}, "paper");
    v.sections[0].questions.forEach((q, i) => expect(html).toContain(`Figure ${i + 1}: ${q.image.caption}`));
  });
  it("builds the caption line", () => {
    expect(captionText({ caption: "A cell" }, "Figure 2")).toBe("Figure 2: A cell");
    expect(captionText({ caption: "" }, "Figure 2")).toBe("Figure 2");
    expect(captionText({ caption: " A cell " }, "")).toBe("A cell");
    expect(captionText({}, "")).toBe("");
  });
});

describe("placement and alignment", () => {
  const withParts = () => { const e = clone(SAMPLE_EXAM); return { e, q: e.sections[1].questions[0] }; }; // parts: (a) 2x = 4, (b) 3x = 9
  it("only honours afterPart when that part exists", () => {
    expect(imagePlacement({ parts: [{}, {}], image: { afterPart: 1 } })).toBe(1);
    expect(imagePlacement({ parts: [{}, {}], image: { afterPart: 5 } })).toBe(-1);
    expect(imagePlacement({ parts: [], image: { afterPart: 0 } })).toBe(-1);
    expect(imagePlacement({ parts: [{}], image: {} })).toBe(-1);
  });
  it("prints the picture under the chosen part, not under the question text", () => {
    const { e, q } = withParts();
    q.image = { src: IMG("P"), size: "medium", afterPart: 1 };
    const html = renderExamHTML(e, {}, "paper");
    const at = html.indexOf(IMG("P"));
    expect(html.split(IMG("P")).length - 1).toBe(1);
    expect(at).toBeGreaterThan(html.indexOf("3x = 9")); // after part (b)...
    expect(at).toBeLessThan(html.indexOf("END OF PAPER")); // ...and still on the paper
    q.image.afterPart = 0;
    const html2 = renderExamHTML(e, {}, "paper");
    expect(html2.indexOf(IMG("P"))).toBeGreaterThan(html2.indexOf("2x = 4"));
    expect(html2.indexOf(IMG("P"))).toBeLessThan(html2.indexOf("3x = 9")); // between (a) and (b)
  });
  it("applies left/center/right classes", () => {
    for (const a of ["left", "center", "right"]) {
      const e = clone(SAMPLE_EXAM); e.sections[0].questions[0].image = { src: IMG("L"), align: a };
      expect(renderExamHTML(e, {}, "paper")).toContain(`q-figure al-${a}`);
    }
    expect(imageAlign({ align: "diagonal" })).toBe("center");
  });
  it("Word export embeds exactly one drawing wherever it is placed", async () => {
    const JSZip = (await import("jszip")).default;
    const { e, q } = withParts();
    for (const afterPart of [undefined, 0, 1]) {
      q.image = { src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", size: "small", align: "right", autoNumber: true, caption: "Cap", ...(afterPart !== undefined ? { afterPart } : {}) };
      const blob = await generateExamDocx(e, { schoolName: "S" }, "paper");
      const xml = await (await JSZip.loadAsync(await blob.arrayBuffer())).file("word/document.xml").async("string");
      expect((xml.match(/<w:drawing>/g) || []).length).toBe(1);
      expect(xml).toContain("Figure 1: Cap");
    }
  });
});

describe("rejecting an AI drawing", () => {
  const q = (useDrawing) => ({ diagram: { needed: true, generatable: true, svg: "<svg/>", description: "d", useDrawing } });
  it("diagramDrawing respects the teacher's choice", () => {
    expect(diagramDrawing(q(undefined))).toBe("<svg/>");
    expect(diagramDrawing(q(true))).toBe("<svg/>");
    expect(diagramDrawing(q(false))).toBeNull();
    expect(diagramDrawing({ diagram: { needed: false, generatable: true, svg: "<svg/>" } })).toBeNull();
  });
  it("print shows the text box when the drawing is switched off", () => {
    const e = clone(SAMPLE_EXAM);
    const svg = `<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3"/></svg>`;
    e.sections[0].questions[0].diagram = { needed: true, generatable: true, svg, description: "A circle", useDrawing: true };
    expect(renderExamHTML(e, {}, "paper")).toContain("<circle");
    e.sections[0].questions[0].diagram.useDrawing = false;
    const html = renderExamHTML(e, {}, "paper");
    expect(html).not.toContain("<circle"); expect(html).toContain("DIAGRAM: A circle");
  });
});

describe("stored diagrams are re-checked at print time", () => {
  it("never inlines unsafe SVG that came back from the database", () => {
    const e = clone(SAMPLE_EXAM);
    e.sections[0].questions[0].diagram = { needed: true, generatable: true, description: "Bad", svg: `<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>` };
    const html = renderExamHTML(e, {}, "paper");
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("DIAGRAM: Bad");
  });
});
