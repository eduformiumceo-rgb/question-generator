import { describe, it, expect } from "vitest";
import {
  SHEET_SPECS, PRINT_PAGE, renderShadingSheetHTML, layoutFor, objectiveCount, clampQuestions,
  sheetPalette, textOn, inkOf, luminance, normHex, defaultSheetStyle, sheetSizeSummary, SCHOOL_COLOUR_PRESETS,
} from "../src/shadingSheet.js";

const meta = { schoolName: "St. Mary's Senior High School", schoolMotto: "Knowledge, Discipline, Service", subject: "Core Mathematics", className: "SHS 3", term: "Semester 1", examType: "End of Semester Exam", examVersion: "B", idDigits: 10 };
const html = (o) => renderShadingSheetHTML({ meta, ...o });
const count = (s, re) => (s.match(re) || []).length;

describe("physical sizes", () => {
  it("each sheet is half of A4 and two make exactly one A4 landscape page", () => {
    for (const st of Object.values(SHEET_SPECS)) {
      expect(st.card).toEqual({ w: 148.5, h: 210 });
      expect(st.card.w * 2).toBe(PRINT_PAGE.w);
      expect(st.card.h).toBe(PRINT_PAGE.h);
    }
    expect(PRINT_PAGE).toEqual({ w: 297, h: 210 });
  });

  it("the page is declared A4 landscape with no margin, and carries two sheets per page", () => {
    const h = html({ style: "bece", questions: 40 });
    expect(h).toContain("@page{size:297mm 210mm;margin:0}");
    expect(count(h, /<section class="sheet">/g)).toBe(1);
    expect(count(h, /<div class="card st-bece">/g)).toBe(2);
    expect(h).toContain('class="cut"');
    expect(h).toContain("148.5mm");
  });

  for (const style of ["bece", "wassce"]) {
    it(`${style}: bubble, row and column sizes do not change with the number of questions`, () => {
      const spec = SHEET_SPECS[style];
      const css = (n) => html({ style, questions: n }).match(/<style>([\s\S]*?)<\/style>/)[1];
      const a = css(12), b = css(40);
      for (const needle of [`width:${spec.bubble}mm;height:${spec.bubble}mm`, `.row{height:${spec.rowPitch}mm`, `.card{position:relative;width:148.5mm;height:210mm`]) {
        expect(a).toContain(needle);
        expect(b).toContain(needle);
      }
      expect(a).toBe(b);
    });

    it(`${style}: the school's name and logo are printed on both copies`, () => {
      const h = html({ style, questions: 40, meta: { ...meta, schoolLogo: "data:image/png;base64,AAAA" } });
      expect(count(h, /St\. Mary's Senior High School/g)).toBeGreaterThanOrEqual(2);
      expect(count(h, /class="logo" src="data:image\/png/g)).toBe(2);
    });

    it(`${style}: every question number appears once per copy, never more`, () => {
      const h = html({ style, questions: 37 });
      for (let q = 1; q <= 37; q++) expect(count(h, new RegExp(`<span class="qn">${q}</span>`, "g"))).toBe(2);
      expect(h).not.toContain('<span class="qn">38</span>');
    });
  }
});

describe("layout", () => {
  it("never shrinks a bubble: five options use fewer columns instead of overlapping", () => {
    for (const spec of Object.values(SHEET_SPECS)) {
      for (const opts of [4, 5]) {
        const l = layoutFor(spec, 50, opts);
        expect(l.cols).toBeGreaterThanOrEqual(3);
        expect(l.pitch).toBeGreaterThanOrEqual(spec.bubble + 0.7 - 1e-9);
        expect(l.pitch).toBeLessThanOrEqual(spec.optionPitch);
        // all columns plus gaps fit inside the sheet
        expect(l.cols * l.colW + (l.cols - 1) * spec.colGap).toBeLessThanOrEqual(spec.card.w - 2 * spec.margin + 1e-9);
      }
    }
  });

  it("one sheet holds the standard paper, and a long paper continues on a second A4", () => {
    expect(html({ style: "bece", questions: 40 })).toContain('data-sheets="1"');      // BECE: 40 questions
    expect(html({ style: "wassce", questions: 50 })).toContain('data-sheets="1"');    // WASSCE: 50 questions
    expect(html({ style: "wassce", questions: 60 })).toContain('data-sheets="1"');    // WASSCE: 60 questions
    const long = html({ style: "bece", questions: 100 });
    expect(Number(long.match(/data-sheets="(\d+)"/)[1])).toBeGreaterThan(1);
    expect(count(long, /<section class="sheet">/g)).toBe(Number(long.match(/data-sheets="(\d+)"/)[1]));
    for (let q = 1; q <= 100; q++) expect(count(long, new RegExp(`<span class="qn">${q}</span>`, "g"))).toBe(2);
  });

  it("option letters: A-D by default, A-E on request", () => {
    const four = html({ style: "bece", questions: 10 });
    const five = html({ style: "bece", questions: 10, optionCount: 5 });
    expect(four).not.toMatch(/<i class="b ">E<\/i>/);
    expect(five).toMatch(/<i class="b ">E<\/i>/);
  });

  it("the index-number grid has one column of 0-9 per digit", () => {
    const h = html({ style: "bece", questions: 10, meta: { ...meta, idDigits: 8 } });
    expect(count(h, /<div class="ix-col">/g)).toBe(16); // 8 digits x 2 copies
    expect(count(h, /<div class="ix-c">/g)).toBe(160);
  });
});

describe("styles", () => {
  it("BECE style is black-and-white with the school name and logo only", () => {
    const h = html({ style: "bece", questions: 40, colours: { main: "#0F5C32", accent: "#C99A2E" } });
    expect(h).not.toContain("#0F5C32");
    expect(h).not.toContain("Knowledge, Discipline, Service");
    expect(h).not.toContain("PAPER VERSION");
  });
  it("WASSCE style carries the school colours, motto and paper-version row", () => {
    const h = html({ style: "wassce", questions: 50, colours: { main: "#7A1020", accent: "#C99A2E" } });
    expect(h).toContain("#7A1020");
    expect(h).toContain("#C99A2E");
    expect(h).toContain("Knowledge, Discipline, Service");
    expect(h).toContain("PAPER VERSION");
    expect(h).toContain('class="frame"');
  });
  it("school colours can be switched on for BECE style, and off for WASSCE style", () => {
    expect(html({ style: "bece", questions: 40, colourMode: "school", colours: { main: "#0F5C32", accent: "#C99A2E" } })).toContain("#0F5C32");
    expect(html({ style: "wassce", questions: 50, colourMode: "mono", colours: { main: "#7A1020", accent: "#C99A2E" } })).not.toContain("#7A1020");
  });
  it("uses the app's generic crest when there is no logo, and never a real examining-body mark", () => {
    const h = html({ style: "wassce", questions: 20, crestSVG: '<svg viewBox="0 0 10 10"></svg>' });
    expect(h).toContain('class="logo crest"');
    expect(h).not.toMatch(/WAEC|West African Examinations/i);
  });
  it("escapes the school name", () => {
    const h = html({ style: "bece", questions: 10, meta: { ...meta, schoolName: "<script>alert(1)</script> JHS" } });
    expect(h).not.toContain("<script>alert(1)");
  });
  it("defaults: BECE for Primary/JHS, WASSCE for SHS", () => {
    expect(defaultSheetStyle(false)).toBe("bece");
    expect(defaultSheetStyle(true)).toBe("wassce");
  });
  it("the size summary reads from the spec", () => {
    const t = sheetSizeSummary("wassce", 50, 4);
    expect(t).toContain("148.5 × 210 mm");
    expect(t).toContain(`bubbles ${SHEET_SPECS.wassce.bubble} mm`);
  });
});

describe("question count and colours", () => {
  it("counts only enabled objective questions before generation, real questions after", () => {
    const secs = [
      { type: "objective", enabled: true, questionCount: 30 },
      { type: "objective", enabled: false, questionCount: 99 },
      { type: "structured", enabled: true, questionCount: 5 },
    ];
    expect(objectiveCount(secs)).toBe(30);
    expect(objectiveCount([{ type: "objective", questions: new Array(24).fill({}) }, { type: "essay", questions: [{}] }], { generated: true })).toBe(24);
    expect(objectiveCount([])).toBe(0);
  });
  it("clamps the question count to 1-100", () => {
    expect(clampQuestions(0)).toBe(1);
    expect(clampQuestions(500)).toBe(100);
    expect(clampQuestions("45")).toBe(45);
  });
  it("text on the colour band is always readable, whatever colour a school picks", () => {
    expect(textOn("#FFE600")).toBe("#111111");
    expect(textOn("#12285C")).toBe("#FFFFFF");
    for (const c of [...SCHOOL_COLOUR_PRESETS.map(p => p.main), "#FFFF00", "#FFFFFF", "#00FFFF", "#222222"]) {
      const p = sheetPalette({ colourMode: "school", main: c, accent: c });
      expect(luminance(p.ink)).toBeLessThanOrEqual(0.2);
    }
  });
  it("normalises odd colour input", () => {
    expect(normHex("#abc")).toBe("#AABBCC");
    expect(normHex("nonsense", "#123456")).toBe("#123456");
    expect(inkOf("#FFFF00")).not.toBe("#FFFF00");
  });
});
