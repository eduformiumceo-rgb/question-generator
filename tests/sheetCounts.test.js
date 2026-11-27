import { describe, it, expect } from "vitest";
import { renderShadingSheetHTML } from "../src/shadingSheet.js";
import { wassceLayout, WASSCE_GEOM } from "../src/wassceSheet.js";

const meta = { schoolName: "Test SHS", term: "Term 1", examType: "Mock Exam", idMode: "boxes", idDigits: 10 };
const oneCopy = (h) => h.replace(/<div class="slot r">[\s\S]*?(<i class="cut"><\/i>)/, "$1");   // WASSCE prints two identical copies per A4: count the first
const render = (style, questions, optionCount) => { const r = renderShadingSheetHTML({ style, questions, optionCount, colourMode: "school", colours: { main: "#12285C" }, meta }); return style === "wassce" ? oneCopy(r) : r; };

/** Every answer row of the rendered page: its question number and how many bubbles it has. */
function rows(html) {
  const out = [];
  for (const m of html.matchAll(/<div class="ar"><span class="qn">(\d+)<\/span><span class="ob">([\s\S]*?)<\/span><\/div>/g)) {
    const letters = m[2].replace(/<[^>]+>/g, "");                 // the printed letters of the row, whatever tag the sheet style uses for a bubble
    out.push({ q: Number(m[1]), bubbles: letters.length, letters });
  }
  return out;
}

describe("WASSCE sheet: every question and option is printed exactly once", () => {
  for (const optionCount of [4, 5]) {
    it(`${optionCount} options: questions 1..n in order, each with ${optionCount} bubbles, for n = 1..100`, () => {
      for (const n of [1, 2, 5, 9, 10, 11, 20, 25, 30, 40, 49, 50, 51, 60, 75, 99, 100]) {
        const r = rows(render("wassce", n, optionCount));
        expect(r.map(x => x.q), `n=${n}`).toEqual(Array.from({ length: n }, (_, i) => i + 1));
        expect(r.every(x => x.letters === "ABCDE".slice(0, optionCount)), `n=${n} letters`).toBe(true);
      }
    });
  }
  it("only 4 (A-D) or 5 (A-E) options exist; anything else prints A-D", () => {
    for (const asked of [2, 3, 6, undefined]) expect(rows(render("wassce", 10, asked)).every(x => x.bubbles === 4), `asked ${asked}`).toBe(true);
  });
  it("the answer block always ends above the footer and the rows fill the page for short papers", () => {
    for (const n of [10, 20, 30, 40, 50, 75, 100]) {
      const L = wassceLayout(n, 4, 10);
      expect(L.colsTop + L.colH, `n=${n}`).toBeLessThanOrEqual(WASSCE_GEOM.ans.bottom + 0.5);
      if (n <= 50) expect(L.colsTop + L.colH, `n=${n} fills`).toBeGreaterThan(WASSCE_GEOM.ans.bottom - 14);
    }
  });
});

describe("BECE sheet: whole sheets of 60 rows, printed twice per page, each row with the printed A to E (capped at 120 questions)", () => {
  it("prints ceil(n / 60) sheets, each as two identical copies on a page, numbered 1..60, five bubbles a row", () => {
    for (const [n, sheets] of [[1, 1], [40, 1], [60, 1], [61, 2], [120, 2], [121, 2]]) {
      const html = render("bece", n, 4);
      const r = rows(html);
      expect(r.length, `n=${n}`).toBe(sheets * 60 * 2);
      expect(r.slice(0, 60).map(x => x.q)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
      expect(r.slice(60, 120).map(x => x.q)).toEqual(r.slice(0, 60).map(x => x.q));
      expect(r.every(x => x.letters === "ABCDE"), `n=${n}`).toBe(true);
    }
  });
});
