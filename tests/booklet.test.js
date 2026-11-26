import { describe, it, expect } from "vitest";
import { renderAnswerBookletHTML, renderShadingSheetHTML } from "../src/shadingSheet.js";
import { a3Imposition, a3Pages, bookletPageCount, bookletSheetCount, clampBookletPaper, examinerGrid, bookletLineCount, BOOKLET_SHEET, BOOKLET_PAPERS } from "../src/bookletSheet.js";
import { parseSheetPayload } from "../src/sheetCode.js";
import { wassceSheetCode, wassceTopMarks, wassceSheetModel } from "../src/wassceSheet.js";

const meta = { schoolName: "Achimota Senior High School", schoolMotto: "Ut Omnes Unum Sint", subject: "Elective Mathematics", className: "SHS 3", programme: "Science", term: "Term 2", examType: "Mock Exam", durationMinutes: 150, totalMarks: 100, idMode: "boxes", idDigits: 10, notice: true, examVersion: "B", paperNames: "Paper 1 and Paper 2", coverCode: { code: "2", subject: "ELECTIVE MATHEMATICS", kind: "Essay", duration: "2 hours 30 minutes" } };
const bk = (o = {}) => renderAnswerBookletHTML({ pages: 12, paper: "a4", questions: 13, ruling: "lined", colourMode: "school", colours: { main: "#12285C" }, meta, ...o });
const count = (h, re) => (h.match(re) || []).length;

describe("A3 booklet imposition (every half becomes one A4 page)", () => {
  it("rounds to a multiple of 4 pages and counts the physical sheets", () => {
    expect([a3Pages(5), a3Pages(8), a3Pages(10), a3Pages(12)]).toEqual([8, 8, 12, 12]);
    expect(bookletPageCount(10, "a3")).toBe(12); expect(bookletPageCount(10, "a4")).toBe(10);
    expect(bookletSheetCount(12, "a3")).toBe(3); expect(bookletSheetCount(12, "a4")).toBe(12);
  });
  it("puts the right pages together: 8 pages = 8-1 / 2-7 / 6-3 / 4-5", () => {
    expect(a3Imposition(8).map(f => f.pages)).toEqual([[8, 1], [2, 7], [6, 3], [4, 5]]);
    expect(a3Imposition(12).map(f => f.pages)).toEqual([[12, 1], [2, 11], [10, 3], [4, 9], [8, 5], [6, 7]]);
  });
  it("every page appears exactly once; left-hand pages are even and right-hand pages are odd; each sheet's faces add up", () => {
    for (const P of [8, 12, 16, 24, 32]) {
      const faces = a3Imposition(P), all = faces.flatMap(f => f.pages);
      expect([...all].sort((a, b) => a - b)).toEqual(Array.from({ length: P }, (_, i) => i + 1));
      for (const f of faces) { expect(f.pages[0] % 2).toBe(0); expect(f.pages[1] % 2).toBe(1); }
      for (let k = 0; k < faces.length; k += 2) expect(faces[k].pages[0] + faces[k].pages[1]).toBe(P + 1);       // nested sheets: outer pair always sums to P+1
    }
  });
  it("front/back of a sheet: the page behind page 1 is page 2", () => {
    const [front, back] = a3Imposition(16);
    expect(front.pages[1]).toBe(1); expect(back.pages[0]).toBe(2);
  });
});

describe("A4 booklet", () => {
  it("is one A4 portrait page per printed page, cover first, with the page count in the body", () => {
    const h = bk({ pages: 8 });
    expect(h).toContain("@page{size:210mm 297mm;margin:0}");
    expect(h).toContain('data-paper="a4"'); expect(h).toContain('data-pages="8"');
    expect(count(h, /<section class="page /g)).toBe(8);
    expect(count(h, /<section class="page rt cover">/g)).toBe(1);
    expect(h).toContain("Page 1 of 8");
    expect(h).toContain("END OF BOOKLET"); expect(count(h, /Turn over/g)).toBe(6);
  });
  it("mirrors the binding gutter: odd pages are right-hand, even pages left-hand", () => {
    const h = bk({ pages: 8 });
    expect(count(h, /class="page rt /g)).toBe(4); expect(count(h, /class="page vs /g)).toBe(4);
    expect(h).toMatch(/\.page\.rt\{--L:16mm/); expect(h).toMatch(/\.page\.vs\{--L:12mm/);
  });
  it("clamps the page count and an unknown paper falls back to A4", () => {
    expect(bk({ pages: 2 })).toContain('data-pages="4"');
    expect(bk({ pages: 400 })).toContain('data-pages="40"');
    expect(clampBookletPaper("a5")).toBe("a4"); expect(clampBookletPaper("a3")).toBe("a3");
    expect(BOOKLET_PAPERS.map(p => p.id)).toEqual(["a4", "a3"]);
  });
});

describe("A3 landscape booklet", () => {
  it("prints A3 landscape sheets, each carrying two A4 pages side by side, front then back", () => {
    const h = bk({ pages: 12, paper: "a3" });
    expect(h).toContain("@page{size:420mm 297mm;margin:0}");
    expect(BOOKLET_SHEET.a3).toMatchObject({ w: 420, h: 297, orientation: "landscape" });
    expect(h).toContain('data-paper="a3"'); expect(h).toContain('data-sheets="3"');
    expect(count(h, /<section class="sheet"/g)).toBe(6);
    expect(count(h, /<div class="slot l"/g)).toBe(6); expect(count(h, /<div class="slot r"/g)).toBe(6);
    expect(count(h, /data-side="front"/g)).toBe(3); expect(count(h, /data-side="back"/g)).toBe(3);
    expect(count(h, /<section class="page /g)).toBe(12);
  });
  it("places the cover on the right of the first face, and the last page on its left", () => {
    const h = bk({ pages: 8, paper: "a3" });
    const first = h.slice(h.indexOf('data-sheet="1" data-side="front"'), h.indexOf('data-sheet="1" data-side="back"'));
    expect(first).toMatch(/<div class="slot l" data-page="8"/);
    expect(first).toMatch(/<div class="slot r" data-page="1"/);
    expect(first).toContain("class=\"page rt cover\"");
    expect(first).toContain("END OF BOOKLET");
  });
  it("has fold marks, staple marks and a sheet label, and a folded count is a multiple of 4", () => {
    const h = bk({ pages: 10, paper: "a3" });
    expect(h).toContain('data-pages="12"');
    expect(count(h, /<i class="fold t">/g)).toBe(6); expect(count(h, /<i class="stp s1">/g)).toBe(6);
    expect(h).toContain("Sheet 1 of 3");
    expect(h).toContain("flip on the SHORT edge");
  });
  it("preview mode drops the on-screen print bar", () => {
    expect(bk({ paper: "a3", preview: true })).not.toContain('class="bar"');
    expect(bk({ paper: "a3" })).toContain('class="bar"');
  });
});

describe("booklet cover", () => {
  const h = bk();
  it("carries everything the question paper's cover carries", () => {
    for (const t of ["Achimota Senior High School", "Ut Omnes Unum Sint", "DO NOT OPEN THIS BOOKLET", "ELECTIVE MATHEMATICS 2", "ESSAY", "2 HOURS 30 MINUTES", "Paper 1 and Paper 2", "SHS 3 - Science", "Term 2", "150 mins", "FOR EXAMINER'S USE ONLY", "Instructions to Candidates", "Candidate's Name:", "Index Number", "VERSION B"]) expect(h.toLowerCase()).toContain(t.toLowerCase());
    expect(h).toContain('<div class="cb">2</div>');
    expect(h).toContain(">100<");                                  // total marks
  });
  it("has its own identity: a school-colour masthead with the logo on a white disc and a ruled title plate", () => {
    expect(h).toContain('<div class="mast">'); expect(h).toContain('class="mast-logo"');
    expect(h).toMatch(/\.mast\{[^}]*background:#12285C/);
    expect(h).toMatch(/\.mast-logo\{[^}]*background:#fff/);
    expect(h).toContain('<span class="ttl">ANSWER BOOKLET</span>');
  });
  it("boxes mode prints the index boxes; line mode prints a line; none prints neither", () => {
    expect(count(bk({ meta: { ...meta, idMode: "boxes", idDigits: 8 } }), /<span class="idc">(<i><\/i>){8}<\/span>/g)).toBe(1);
    const line = bk({ meta: { ...meta, idMode: "line" } });
    expect(line).not.toContain('class="idc"'); expect(line).toContain("Index No.:");
    expect(bk({ meta: { ...meta, idMode: "none" } })).not.toContain("Index No.:");
  });
  it("leaves out the notice and code boxes when the paper has none", () => {
    const x = bk({ meta: { ...meta, notice: false, coverCode: null } });
    expect(x).not.toContain('<div class="notice">'); expect(x).not.toContain('<div class="codebox">');
  });
  it("examiner's table: columns of at most 10 rows, one row per question", () => {
    expect(examinerGrid(8)).toEqual({ cols: 1, rows: 8 }); expect(examinerGrid(13)).toEqual({ cols: 2, rows: 7 }); expect(examinerGrid(30)).toEqual({ cols: 3, rows: 10 });
    const x = bk({ questions: 13 });
    expect(count(x, /<table class="et">/g)).toBe(2); expect(count(x, /<td class="qq">/g)).toBe(13);
  });
});

describe("colour: one school colour", () => {
  it("everything is printed in the one colour; an old accent value is ignored", () => {
    const h = bk({ colours: { main: "#0F5C32", accent: "#C99A2E" } });
    expect(h).toContain("#0F5C32"); expect(h).not.toContain("#C99A2E");
  });
  it("black & white prints with no school colour at all", () => {
    const h = bk({ colourMode: "mono", colours: { main: "#0F5C32" } });
    expect(h).not.toContain("#0F5C32");
  });
  it("the same colour reaches the cover, the ruled pages and the margin", () => {
    const h = bk({ colours: { main: "#7A1020" } });
    expect(count(h, /#7A1020/gi)).toBeGreaterThan(20);
  });
});

describe("ruled pages", () => {
  it("lined pages carry the ruled SVG, plain pages do not, and all have the question-number margin", () => {
    expect(count(bk({ pages: 6 }), /<svg class="ruled"/g)).toBe(5);
    expect(count(bk({ pages: 6, ruling: "plain" }), /<svg class="ruled"/g)).toBe(0);
    expect(count(bk({ pages: 6 }), /class="mg-label"/g)).toBe(5);
    expect(bookletLineCount()).toBeGreaterThan(25);
  });
  it("every inner page repeats the school name and an index-number strip at the top", () => {
    const h = bk({ pages: 6 });
    expect(count(h, /<span class="ibs mini">/g)).toBe(5);
    expect(count(h, /<span class="ih-l">Achimota Senior High School<\/span>/g)).toBe(5);
  });
});

describe("WASSCE sheet: scanning features", () => {
  const html = (o = {}) => renderShadingSheetHTML({ style: "wassce", questions: 50, optionCount: 4, colourMode: "school", colours: { main: "#12285C" }, meta, ...o });
  it("prints a QR sheet ID that says how many questions, options, digits, version and which paper", () => {
    const h = html(), code = wassceSheetCode(meta, 50, 4, 10);
    expect(parseSheetPayload(code)).toMatchObject({ n: 50, optionCount: 4, digits: 10, version: "B" });
    expect(h).toContain('class="qrbox"'); expect(h).toContain('<svg class="qr"');
  });
  it("the same paper always gets the same reference; a different paper gets a different one", () => {
    const a = parseSheetPayload(wassceSheetCode(meta, 50, 4, 10)).ref, b = parseSheetPayload(wassceSheetCode({ ...meta, subject: "Physics" }, 50, 4, 10)).ref;
    expect(a).toBe(parseSheetPayload(wassceSheetCode(meta, 50, 4, 10)).ref); expect(a).not.toBe(b);
  });
  it("has timing marks on TWO edges: a row mark down the right and an option-column mark along the top", () => {
    const h = html(), M = wassceSheetModel(50, 4, 10);
    expect(count(h, /<i class="tm"/g)).toBe(M.strip.length);
    expect(count(h, /<i class="tt"/g)).toBe(M.top.length);
    expect(wassceTopMarks(50, 4, 10)).toHaveLength(5 * 4);
    expect(wassceTopMarks(30, 5, 10)).toHaveLength(3 * 5);
  });
  it("letters inside the bubbles are printed in a light tint so pencil is the darkest mark", () => {
    const h = html();
    expect(h).toMatch(/\.o\{[^}]*color:#[0-9A-F]{6}/i);
    expect(h).not.toMatch(/\.o\{[^}]*color:#12285C/i);
  });
  it("version, sex and absent bubbles have fixed positions inside their boxes", () => {
    const h = html();
    expect(h).toMatch(/\.vb\{position:absolute;right:/);
    expect(count(h, /class="o vo/g)).toBeGreaterThanOrEqual(6);
  });
  it("black and white keeps the QR and marks in black", () => {
    const h = html({ colourMode: "mono" });
    expect(h).toContain('<svg class="qr"'); expect(h).not.toContain("#12285C");
  });
});
