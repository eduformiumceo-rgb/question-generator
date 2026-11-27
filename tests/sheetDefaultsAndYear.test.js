import { describe, it, expect } from "vitest";
import { standardQuestions, renderShadingSheetHTML, renderAnswerBookletHTML } from "../src/shadingSheet.js";
import { wassceLayout, WASSCE_GEOM } from "../src/wassceSheet.js";
import { currentAcademicYear, cleanAcademicYear, yearCell, termCell } from "../src/shsLevel.js";

describe("shading sheet standard sizes", () => {
  it("BECE defaults to 60 and WASSCE to 100", () => {
    expect(standardQuestions("bece")).toBe(60);
    expect(standardQuestions("wassce")).toBe(100);
  });
  it("the WASSCE sheet keeps a comfortable row pitch at 100 questions", () => {
    for (const opts of [4, 5]) {
      const L = wassceLayout(100, opts);
      expect(L.cols).toBeLessThanOrEqual(5);
      expect(L.pitch).toBeGreaterThanOrEqual(WASSCE_GEOM.ans.minPitch);
    }
  });
  it("renders both standard sheets without throwing", () => {
    expect(renderShadingSheetHTML({ style: "bece", questions: 60, optionCount: 5, meta: { schoolName: "Test School" } })).toContain("Sheet 1 of 1");
    expect(renderShadingSheetHTML({ style: "wassce", questions: 100, optionCount: 5, meta: { schoolName: "Test School" } })).toContain("Questions 1");
  });
});

describe("academic year and term on paper and booklet", () => {
  it("works out the Ghana academic year (starts in September)", () => {
    expect(currentAcademicYear(new Date(2026, 10, 27))).toBe("2026/2027");
    expect(currentAcademicYear(new Date(2027, 2, 5))).toBe("2026/2027");
    expect(currentAcademicYear(new Date(2026, 8, 1))).toBe("2026/2027");
  });
  it("keeps typed years to digits and a slash", () => {
    expect(cleanAcademicYear("20x26/2027abc")).toBe("2026/2027");
    expect(cleanAcademicYear("2026/20277777")).toHaveLength(9);
  });
  it("prints a Year cell only when a year is given", () => {
    expect(yearCell("")).toBeNull();
    expect(yearCell("2026/2027")).toEqual(["Year", "2026/2027"]);
    expect(termCell("Semester 2")).toEqual(["Semester", "2"]);
  });
  it("the booklet cover has blank Term/Semester and Academic Year cells that follow the level", () => {
    const basic = renderAnswerBookletHTML({ pages: 4, paper: "a4", questions: 6, meta: { schoolName: "S", className: "JHS 2" } });
    const shs = renderAnswerBookletHTML({ pages: 4, paper: "a4", questions: 6, meta: { schoolName: "S", className: "SHS 2" } });
    expect(basic).toContain(">Term</span>");
    expect(basic).toContain(">Academic Year</span>");
    expect(shs).toContain(">Semester</span>");
    expect(shs).not.toContain(">Term</span>");
  });
});

describe("WASSCE sheet boxes look like the BECE boxes", () => {
  it("draws square-bracket boxes, not ovals", () => {
    const html = renderShadingSheetHTML({ style: "wassce", questions: 60, optionCount: 5, meta: { schoolName: "Test School" } });
    expect(html).toContain(".o::before");
    expect(html).not.toMatch(/\.o\{[^}]*border-radius:50%/);
    expect(html).toContain("shade this box");
  });
});
