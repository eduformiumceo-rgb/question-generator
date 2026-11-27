// Pins the mobile / desktop finish rules so a later edit cannot quietly undo them.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const css = read("src/theme.css");
const code = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("finish layer", () => {
  it("phone header subtitle is readable (11px or more)", () => {
    expect(read("src/components/AppHeader.jsx")).toMatch(/\.qh-brand-sub \{ font-size:1[1-9]px !important; \}/);
  });
  it("bottom nav takes over before the 4-tab pill can be clipped (up to 760px), labels 11px", () => {
    expect(code).toMatch(/@media \(max-width: 760px\) \{\s*\.qa-top-nav \{ display: none/);
    expect(code).toMatch(/\.qa-bnav-label \{ font-size: 11px/);
  });
  it("touch screens get 44px targets, and small controls get a bigger tap area", () => {
    expect(code).toMatch(/@media \(pointer: coarse\), \(max-width: 760px\)[\s\S]*min-height: 44px/);
    for (const c of [".qa-info::before", ".qa-switch::after", ".qa-dot-btn::after"]) expect(code).toContain(c);
  });
  it("paper action bar has a phone 'More' sheet and keeps Print / PDF in view", () => {
    const src = read("src/QuestionsGenerator.jsx");
    for (const c of ["qa-bar-morebtn", "qa-bar-sec", "qa-bar-print", "qa-bar-scrim"]) expect(src).toContain(c);
    expect(code).toMatch(/\.qa-bar-sec \{ display: contents; \}/);
  });
  it("one teal family: no hard-coded accent hex in the main components", () => {
    for (const f of ["ExamEditor", "FormControls", "PaperAudit", "MathField", "TopicSelector"]) expect(read(`src/components/${f}.jsx`)).not.toContain("#0D9488");
  });
  it("wide screens put the paper beside the form", () => {
    expect(code).toMatch(/@media \(min-width: 1180px\)[\s\S]*\.qa-page\.has-paper \.qa-flow \{ display: grid/);
  });
});

import { renderAnswerBookletHTML, renderShadingSheetHTML } from "../src/shadingSheet.js";
describe("exam type and term are not printed on the booklet or shading sheets", () => {
  const meta = { schoolName: "Test SHS", subject: "Core Mathematics", className: "SHS 3", term: "Term 2", examType: "Mock Exam", idMode: "boxes", idDigits: 10 };
  const bad = /MOCK EXAMINATION|Term 2|TERM 2/;
  it("answer booklet cover", () => {
    expect(renderAnswerBookletHTML({ pages: 8, paper: "a4", questions: 8, ruling: "lined", colourMode: "mono", colours: {}, meta })).not.toMatch(bad);
  });
  for (const style of ["bece", "wassce"]) {
    it(`${style} shading sheet`, () => {
      expect(renderShadingSheetHTML({ style, questions: 40, optionCount: 4, colourMode: "mono", colours: {}, meta })).not.toMatch(bad);
    });
  }
  it("the WASSCE scan code still tells Term 1 and Term 2 apart", () => {
    const a = renderShadingSheetHTML({ style: "wassce", questions: 40, optionCount: 4, colourMode: "mono", colours: {}, meta });
    const b = renderShadingSheetHTML({ style: "wassce", questions: 40, optionCount: 4, colourMode: "mono", colours: {}, meta: { ...meta, term: "Term 1" } });
    expect(a).not.toEqual(b);
  });
});
