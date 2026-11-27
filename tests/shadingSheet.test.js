import { describe, it, expect } from "vitest";
import {
  SHEET_SPECS, PRINT_PAGE, renderShadingSheetHTML, renderAnswerBookletHTML, objectiveCount, clampQuestions,
  ALIGN_MARK, sheetPalette, textOn, inkOf, luminance, normHex, defaultSheetStyle, sheetSizeSummary, SCHOOL_COLOUR_PRESETS,
} from "../src/shadingSheet.js";
import { BECE_GEOM, BECE_PER_SHEET, fitSchoolName, timingMarkRows } from "../src/beceSheet.js";
import { WASSCE_GEOM, WASSCE_PAGE, wassceLayout, wassceRowsPerColumn, wassceTimingMarks } from "../src/wassceSheet.js";
import { theoryCount, bookletLineCount, BOOKLET_GEOM } from "../src/bookletSheet.js";

const meta = { schoolName: "St. Mary's Senior High School", schoolMotto: "Knowledge, Discipline, Service", subject: "Core Mathematics", className: "SHS 3", term: "Semester 1", examType: "End of Semester Exam", examVersion: "B", idDigits: 10 };
const oneCopy = (h) => h.replace(/<div class="slot r">[\s\S]*?(<i class="cut"><\/i>)/, "$1");   // WASSCE prints two identical copies per A4: count the first
const html = (o) => { const r = renderShadingSheetHTML({ meta, ...o }); return o && o.style === "wassce" && !o.both ? oneCopy(r) : r; };
const count = (s, re) => (s.match(re) || []).length;

describe("physical sizes", () => {
  it("BECE: each sheet is half of A4 and two make exactly one A4 landscape page", () => {
    const st = SHEET_SPECS.bece;
    expect(st.card).toEqual({ w: 148.5, h: 210 });
    expect(st.card.w * 2).toBe(PRINT_PAGE.w);
    expect(st.card.h).toBe(PRINT_PAGE.h);
    expect(PRINT_PAGE).toEqual({ w: 297, h: 210 });
  });

  it("WASSCE: the A4 design prints at A5, two sheets per A4 landscape page, like the BECE", () => {
    expect(SHEET_SPECS.wassce.card).toEqual({ w: 148.5, h: 210 });
    expect(WASSCE_PAGE).toEqual({ w: 297, h: 210 });
    const h = html({ style: "wassce", questions: 50, both: true });
    expect(h).toContain("@page{size:297mm 210mm;margin:0}");
    expect(count(h, /<section class="sheet">/g)).toBe(1);
    expect(count(h, /<div class="card st-wassce">/g)).toBe(2);
    expect(h).toContain('class="cut"');
    expect(h).toContain("transform:scale(0.7071");
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
    if (style === "wassce") it("wassce: bubble size and column width are the same whatever the number of questions", () => {
      const css = (n) => html({ style, questions: n }).match(/<style>([\s\S]*?)<\/style>/)[1];
      for (const n of [12, 40, 100]) {
        const c = css(n);
        expect(c).toContain(`.o{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none;width:${WASSCE_GEOM.ans.bub.w}mm;height:${WASSCE_GEOM.ans.bub.h}mm`);
        expect(c).toContain(`.card{position:relative;width:210mm;height:297mm`);
      }
      expect(wassceLayout(12).colW).toBe(wassceLayout(100).colW);
    });

    it(`${style}: the school's name and logo are printed on both copies`, () => {
      const h = html({ style, questions: 40, meta: { ...meta, schoolLogo: "data:image/png;base64,AAAA" } });
      if (style === "bece") {
        // BECE balances the name over lines in the header of each copy ("St. Mary's Senior" / "High School"), so read the printed header blocks
        const printed = [...h.matchAll(/<div class="school"[^>]*>((?:<div>[^<]*<\/div>)+)<\/div>/g)]
          .map(m => [...m[1].matchAll(/<div>([^<]*)<\/div>/g)].map(x => x[1]).join(" ").replace(/&#39;|&#x27;/g, "'"));
        expect(printed.length).toBeGreaterThanOrEqual(2);
        expect(printed.slice(0, 2)).toEqual([...Array(2)].map(() => "St. Mary's Senior High School"));
        expect(count(h, /class="logo" src="data:image\/png/g)).toBe(2);
      } else {
        // one full sheet: the name is printed in the letterhead (and again in the footer), the logo once
        expect(count(h, /St\.\s+Mary(?:'|&#39;|&#x27;)s Senior High School/g)).toBeGreaterThanOrEqual(1);
        expect(count(h, /class="logo" src="data:image\/png/g)).toBe(1);
      }
    });

    if (style === "wassce") it("wassce: prints EXACTLY the number of questions on the paper, each question number once", () => {
      for (const n of [1, 12, 37, 40, 50, 60, 75, 100]) {
        const h = html({ style, questions: n });
        for (let q = 1; q <= n; q++) expect(count(h, new RegExp(`<span class="qn">${q}</span>`, "g"))).toBe(1);
        expect(h).not.toContain(`<span class="qn">${n + 1}</span>`);
        expect(count(h, /class="ar"/g)).toBe(n);
        expect(h).toContain(`Questions 1 &ndash; ${n}`);
      }
    });
  }

  it("bece: sizes are fixed and identical whatever the number of questions", () => {
    const css = (n) => html({ style: "bece", questions: n }).match(/<style>([\s\S]*?)<\/style>/)[1];
    const a = css(12), b = css(55);
    expect(a).toBe(b);
    expect(a).toContain(`.ar{height:${BECE_GEOM.ans.rowP}mm`);
    expect(a).toContain(`.card{position:relative;width:148.5mm;height:210mm`);
  });

  it("bece: all 60 questions are printed identically on every copy (none faded, as on the real sheet); the marker's score box shows the paper's count", () => {
    const h = html({ style: "bece", questions: 37 });
    for (let q = 1; q <= BECE_PER_SHEET; q++) expect(count(h, new RegExp(`<span class="qn">${q}</span>`, "g"))).toBe(2);
    expect(count(h, /class="ar"/g)).toBe(2 * BECE_PER_SHEET);     // every row is the same plain row
    expect(h).not.toMatch(/class="ar [^"]*\boff\b/);              // nothing is dimmed
    expect(count(h, /Score <i class="sc"><\/i> \/ 37/g)).toBe(2);   // "Score / 37" on both copies
  });
});

describe("layout", () => {
  it("WASSCE: columns of 10, 15 or 20 rows, never more than five columns, and the whole answer block fits above the footer", () => {
    expect(wassceRowsPerColumn(40)).toBe(10);
    expect(wassceRowsPerColumn(50)).toBe(10);
    expect(wassceRowsPerColumn(60)).toBe(15);
    expect(wassceRowsPerColumn(75)).toBe(15);
    expect(wassceRowsPerColumn(100)).toBe(20);
    for (const n of [1, 10, 25, 40, 50, 51, 60, 75, 76, 100]) {
      for (const opts of [4, 5]) {
        const L = wassceLayout(n, opts);
        expect(L.cols).toBeLessThanOrEqual(5);
        expect(L.cols * L.per).toBeGreaterThanOrEqual(n);
        expect(L.pitch).toBeGreaterThanOrEqual(WASSCE_GEOM.ans.minPitch - 1e-9);
        expect(L.colsTop + L.colH).toBeLessThanOrEqual(WASSCE_GEOM.ans.bottom + 0.5);
        // bubbles never touch: option pitch leaves a gap
        expect(L.optPitch).toBeGreaterThanOrEqual(WASSCE_GEOM.ans.bub.w + 0.5);
      }
    }
  });

  it("WASSCE: everything stays inside the printable area, in order, with nothing overlapping", () => {
    const g = WASSCE_GEOM, L = wassceLayout(100, 5);
    expect(g.L).toBeGreaterThanOrEqual(5);
    expect(g.L + g.CW).toBeLessThan(g.strip.x);
    expect(g.W - (g.strip.x + g.strip.w)).toBeGreaterThanOrEqual(4.5);
    const order = [g.head.top + g.head.h, g.ruleTop, L.infoTop, L.infoTop + L.idH, L.insTop, L.titleTop, L.colsTop, L.colsTop + L.colH, L.footTop, L.footTop + g.foot.h];
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThanOrEqual(order[i - 1]);
    expect(g.H - (g.foot.top + g.foot.h)).toBeGreaterThanOrEqual(4.5);
  });

  it("WASSCE: one timing mark per index row and per answer row, in order", () => {
    const m = wassceTimingMarks(50);
    expect(m.length).toBe(10 + 10);
    for (let i = 1; i < m.length; i++) expect(m[i]).toBeGreaterThan(m[i - 1]);
    expect(count(html({ style: "wassce", questions: 100 }), /<i class="tm"/g)).toBe(10 + 20);
  });

  it("every question fits on one WASSCE sheet up to the maximum of 100; BECE continues on a second sheet after 60", () => {
    for (const n of [50, 60, 100]) expect(html({ style: "wassce", questions: n })).toContain('data-sheets="1"');
    expect(html({ style: "bece", questions: 40 })).toContain('data-sheets="1"');
    const long = html({ style: "bece", questions: 100 });
    expect(Number(long.match(/data-sheets="(\d+)"/)[1])).toBeGreaterThan(1);
    expect(count(long, /<section class="sheet">/g)).toBe(Number(long.match(/data-sheets="(\d+)"/)[1]));
    for (let q = 1; q <= 100; q++) expect(count(long, new RegExp(`<span class="qn">${q}</span>`, "g"))).toBe(2);
  });

  it("option letters: A-D by default, A-E on request (WASSCE)", () => {
    const four = html({ style: "wassce", questions: 10 });
    const five = html({ style: "wassce", questions: 10, optionCount: 5 });
    expect(four).not.toMatch(/<i class="o ">E<\/i>/);
    expect(five).toMatch(/<i class="o ">E<\/i>/);
    expect(count(four, /<i class="o ">D<\/i>/g)).toBeGreaterThanOrEqual(10);
  });

  it("the index-number grid has one column of 0-9 per digit", () => {
    const h = html({ style: "wassce", questions: 10, meta: { ...meta, idDigits: 8 } });
    expect(count(h, /<div class="gc"/g)).toBe(8);        // 8 digit columns (one sheet)
    expect(count(h, /<div class="dg">/g)).toBe(80);
    expect(count(h, /<div class="gbc"/g)).toBe(8);       // and a write-in box above each
    const b = html({ style: "bece", questions: 10, meta: { ...meta, idDigits: 8 } });
    expect(count(b, /<div class="gc"/g)).toBe(16);      // 8 digit columns x 2 copies
    expect(count(b, /<div class="dg">/g)).toBe(160);
  });
});

describe("styles", () => {
  it("BECE style is printed in the school's colours by default, with the school name and logo only (no motto)", () => {
    const h = html({ style: "bece", questions: 40, colours: { main: "#0F5C32", accent: "#C99A2E" } });
    expect(h).toContain("#0F5C32");
    expect(h).not.toContain("Knowledge, Discipline, Service");
  });
  it("BECE style has no examining-body fields: no CENTRE NUMBER, no PAPER CODE; it has a PAPER VERSION selector", () => {
    const h = html({ style: "bece", questions: 40 });
    expect(h).not.toContain("CENTRE NUMBER");
    expect(h).not.toContain("PAPER CODE");
    expect(h).toContain("CANDIDATE NUMBER");
    expect(h).toContain("PAPER VERSION");
    expect(h).toContain("For Supervisors Only");
    expect(h).toContain("OBJECTIVE ANSWER SHEET");
  });
  it("BECE style pre-shades the paper version when it is known, and only that one", () => {
    const h = html({ style: "bece", questions: 40, meta: { ...meta, examVersion: "B" } });
    expect(count(h, /<i class="k vk fill">B<b class="pc pf"><\/b><\/i>/g)).toBe(2);   // a shaded key carries its pencil-mark layer
    expect(count(h, /<i class="k vk fill">/g)).toBe(2);
    expect(count(html({ style: "bece", questions: 40, meta: { ...meta, examVersion: "" } }), /<i class="k vk fill">/g)).toBe(0);
  });
  it("BECE style keeps the GES instructions and always prints A-E", () => {
    const h = html({ style: "bece", questions: 40 });
    expect(h).toContain("Press firmly.");
    expect(h).toContain("ignore the letter E.");
    expect(h).toContain("may have fewer than 60 questions.");
    expect(count(h, /<i class="k ">E<\/i>/g)).toBeGreaterThanOrEqual(2 * 60);
    expect(html({ style: "bece", questions: 40, optionCount: 4 })).toContain('<i class="k ">E</i>');
  });
  it("BECE style: 60 questions per sheet, longer papers continue on further sheets", () => {
    expect(html({ style: "bece", questions: 60 })).toContain('data-sheets="1"');
    const long = html({ style: "bece", questions: 100 });
    expect(long).toContain('data-sheets="2"');
    expect(count(long, /<span class="qn">61<\/span>/g)).toBe(2);
    expect(count(long, /<span class="qn">100<\/span>/g)).toBe(2);
  });
  it("BECE style: timing marks for the ten ID rows and twenty answer rows, well inside the printable area", () => {
    const rows = timingMarkRows();
    expect(rows.length).toBe(30);
    expect(count(html({ style: "bece", questions: 40 }), /<i class="tm"/g)).toBe(60);
    expect(BECE_GEOM.W - (BECE_GEOM.strip.x + BECE_GEOM.strip.w)).toBeGreaterThanOrEqual(4.5);
    // every mark sits on a row centre, inside the sheet, and the rows run in order
    for (let i = 1; i < rows.length; i++) expect(rows[i]).toBeGreaterThan(rows[i - 1]);
    expect(rows[rows.length - 1]).toBeLessThan(BECE_GEOM.foot.top);
  });
  it("BECE style: nothing overlaps vertically and everything stays 5 mm inside the sheet", () => {
    const g = BECE_GEOM;
    const order = [g.head.top + g.head.h, g.rule.top, g.name.top, g.name.top + g.name.h, g.dashY, g.ins.top, g.ins.top + g.ins.h, g.id.top, g.ans.top, g.foot.top, g.foot.top + g.foot.h];
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThanOrEqual(order[i - 1]);
    expect(g.L).toBeGreaterThanOrEqual(5);
    expect(g.H - (g.foot.top + g.foot.h)).toBeGreaterThanOrEqual(4.5);
    expect(g.L + g.CW).toBeLessThan(g.strip.x);
  });
  it("a long school name is balanced over two or three lines instead of shrinking to nothing", () => {
    const short = fitSchoolName("Accra Academy", 106);
    expect(short.lines.length).toBe(1);
    const long = fitSchoolName("Our Lady of Perpetual Help Roman Catholic Junior High School, Tema Community 25", 106);
    expect(long.lines.length).toBeGreaterThanOrEqual(2);
    expect(long.lines.length).toBeLessThanOrEqual(3);
    expect(long.size).toBeGreaterThanOrEqual(2.8);
    expect(long.lines.join(" ")).toBe("Our Lady of Perpetual Help Roman Catholic Junior High School, Tema Community 25");   // no word lost or split
    expect(long.lines.every(l => l.split(" ").length > 1)).toBe(true);                                                  // never a lone orphan word
  });
  it("WASSCE style carries the school colours, motto and paper-version row", () => {
    const h = html({ style: "wassce", questions: 50, colours: { main: "#7A1020", accent: "#C99A2E" } });
    expect(h).toContain("#7A1020");
    expect(h).not.toContain("#C99A2E");                 // one school colour only: an old second colour is ignored
    expect(h).toContain("Knowledge, Discipline, Service");
    expect(h).toContain("PAPER VERSION");
    expect(h).toContain("INDEX NUMBER");
    expect(h).toContain("INSTRUCTIONS TO CANDIDATES");
    expect(h).toContain("OBJECTIVE TEST ANSWER SHEET");
  });
  it("WASSCE style pre-shades the paper version when known, with candidate and supervisor fields", () => {
    const h = html({ style: "wassce", questions: 50, meta: { ...meta, examVersion: "B" } });
    expect(count(h, /<i class="o vo fill">B<b class="pc pf"><\/b><\/i>/g)).toBe(1);
    expect(count(html({ style: "wassce", questions: 50, meta: { ...meta, examVersion: "" } }), /class="o vo fill"/g)).toBe(0);
    for (const t of ["SURNAME", "OTHER NAMES", "SUBJECT", "DATE", "CANDIDATE'S SIGNATURE", "FOR SUPERVISOR ONLY", "FOR OFFICIAL USE ONLY"]) expect(h).toContain(t);
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
    expect(t).toContain("exactly 50 questions");
    expect(t).toContain("5 columns of 10");
    expect(sheetSizeSummary("bece", 40)).toContain("148.5 × 210 mm");
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

describe("print safety and professional details", () => {
  it("corner alignment marks sit inside the area ordinary office printers can print (at least 4 mm from the edge)", () => {
    expect(ALIGN_MARK.inset).toBeGreaterThanOrEqual(4);
    const h = html({ style: "wassce", questions: 40 });
    expect(h).toContain(`.reg{position:absolute;width:${WASSCE_GEOM.mark.size}mm`);
    expect(WASSCE_GEOM.mark.inset).toBeGreaterThanOrEqual(4);
    expect(WASSCE_GEOM.mark.inset + WASSCE_GEOM.mark.size).toBeLessThan(WASSCE_GEOM.L);       // clear of the WASSCE content
    expect(ALIGN_MARK.inset + ALIGN_MARK.size).toBeLessThan(SHEET_SPECS.bece.margin);        // clear of the BECE content
  });

  it("the official-use score and its total are laid out inside their own box", () => {
    const h = html({ style: "wassce", questions: 50 });
    expect(h).toMatch(/Score <i class="sc"><\/i> \/ 50/);
  });

  it("WASSCE style has a sex (M/F) pair beside paper version; BECE style has neither", () => {
    expect(html({ style: "wassce", questions: 50 })).toMatch(/<i class="o vo">M<\/i><i class="o vo">F<\/i>/);
    expect(html({ style: "bece", questions: 40 })).not.toContain(">SEX<");
  });

  it("the on-screen preview omits the print-instruction bar but keeps the sheets identical", () => {
    const printed = html({ style: "bece", questions: 40 });
    const preview = html({ style: "bece", questions: 40, preview: true });
    expect(printed).toContain('class="bar"');
    expect(preview).not.toContain('class="bar"');
    expect(count(preview, /<div class="card st-bece">/g)).toBe(2);
  });

  it("the index-number instruction is on the WASSCE sheet", () => {
    expect(html({ style: "wassce", questions: 40 })).toContain("Write your index number in the boxes");
    expect(html({ style: "wassce", questions: 40, preview: true })).not.toContain('class="bar"');
  });
});

describe("answer booklet", () => {
  const bk = (o) => renderAnswerBookletHTML({ meta, ...o });
  it("is a cover plus ruled A4 portrait pages, one page per sheet", () => {
    const h = bk({ pages: 12, questions: 8 });
    expect(h).toContain("@page{size:210mm 297mm;margin:0}");
    expect(count(h, /<section class="page /g)).toBe(12);
    expect(count(h, /<section class="page rt cover">/g)).toBe(1);
    expect(h).toContain('data-pages="12"');
    expect(h).toContain("ANSWER BOOKLET");
    expect(h).not.toContain("Page 1 of");
    expect(h).toContain("Turn over");
    expect(h).toContain("END OF BOOKLET");
    expect(count(h, /END OF BOOKLET/g)).toBe(1);
  });
  it("cover has the candidate fields, the instructions and the examiner's table with one row per question", () => {
    const h = bk({ pages: 8, questions: 12 });
    for (const t of ["Candidate's Name", "Index Number", "Instructions to Candidates", "FOR EXAMINER'S USE ONLY", "TOTAL"]) expect(h).toContain(t);
    for (let q = 1; q <= 12; q++) expect(count(h, new RegExp(`<td class="qq">${q}</td>`, "g"))).toBe(1);
    expect(h).not.toContain('<td class="qq">13</td>');
    expect(count(h, /<table class="et">/g)).toBe(2);                       // 12 questions: two tables of ten rows
    expect(count(bk({ pages: 8, questions: 6 }), /<table class="et">/g)).toBe(1);
  });
  it("every answer page carries the index-number boxes, a do-not-write margin and the page number", () => {
    const h = bk({ pages: 8, questions: 5 });
    expect(count(h, /class="mg-label"/g)).toBe(7);
    expect(count(h, /<span class="ih-r">/g)).toBe(7);
    expect(count(h, /class="pgno"/g)).toBe(7); expect(h).not.toContain('class="ipn"');
    expect(count(h, /<svg class="ruled"/g)).toBe(7);
    expect(count(h, /<line /g)).toBe(7 * bookletLineCount());
  });
  it("plain ruling prints the margin but no lines", () => {
    const h = bk({ pages: 8, questions: 5, ruling: "plain" });
    expect(count(h, /<line /g)).toBe(0);
    expect(count(h, /class="mg-label"/g)).toBe(7);
  });
  it("lines fit between the header and the footer, inside the printable area", () => {
    const i = BOOKLET_GEOM.inner;
    expect(i.linesTop + (bookletLineCount() - 1) * i.pitch).toBeLessThanOrEqual(i.linesBottom);
    expect(i.footTop).toBeLessThan(BOOKLET_GEOM.H - 4.5);
  });
  it("uses the school's own name, logo and colours, never an examining body's", () => {
    const h = bk({ pages: 8, questions: 5, colours: { main: "#0F5C32", accent: "#C99A2E" }, meta: { ...meta, schoolLogo: "data:image/png;base64,AAAA" } });
    expect(h).toContain("#0F5C32");
    expect(count(h, /class="logo" src="data:image\/png/g)).toBe(1 + 7);   // cover + the header of each of the 7 inner pages
    expect(h).not.toMatch(/WAEC|West African Examinations/i);
    expect(bk({ pages: 8, questions: 5, colourMode: "mono", colours: { main: "#0F5C32", accent: "#C99A2E" } })).not.toContain("#0F5C32");
  });
  it("clamps the page and question counts and escapes the school name", () => {
    expect(bk({ pages: 1, questions: 5 })).toContain('data-pages="2"');
    expect(bk({ pages: 999, questions: 5 })).toContain('data-pages="40"');
    expect(bk({ pages: 8, questions: 99 })).toContain('data-questions="40"');
    expect(bk({ pages: 8, questions: 5, meta: { ...meta, schoolName: "<script>alert(1)</script> SHS" } })).not.toContain("<script>alert(1)");
  });
  it("counts only hand-written questions for the examiner's table", () => {
    const secs = [{ type: "objective", enabled: true, questionCount: 50 }, { type: "essay", enabled: true, questionCount: 6 }, { type: "structured", enabled: false, questionCount: 9 }];
    expect(theoryCount(secs)).toBe(6);
    expect(theoryCount([{ type: "objective", questions: new Array(40).fill({}) }, { type: "essay", questions: new Array(5).fill({}) }], { generated: true })).toBe(5);
    expect(theoryCount([])).toBe(0);
  });
});
