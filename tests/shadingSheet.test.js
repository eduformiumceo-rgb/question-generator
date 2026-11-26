import { describe, it, expect } from "vitest";
import {
  SHEET_SPECS, PRINT_PAGE, renderShadingSheetHTML, layoutFor, objectiveCount, clampQuestions,
  ALIGN_MARK, sheetPalette, textOn, inkOf, luminance, normHex, defaultSheetStyle, sheetSizeSummary, SCHOOL_COLOUR_PRESETS,
} from "../src/shadingSheet.js";
import { BECE_GEOM, BECE_PER_SHEET, fitSchoolName, timingMarkRows } from "../src/beceSheet.js";

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
    if (style === "wassce") it("wassce: bubble, row and column sizes do not change with the number of questions", () => {
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
      if (style === "bece") {
        // BECE balances the name over lines in the header of each copy ("St. Mary's Senior" / "High School"), so read the printed header blocks
        const printed = [...h.matchAll(/<div class="school"[^>]*>((?:<div>[^<]*<\/div>)+)<\/div>/g)]
          .map(m => [...m[1].matchAll(/<div>([^<]*)<\/div>/g)].map(x => x[1]).join(" ").replace(/&#39;|&#x27;/g, "'"));
        expect(printed.length).toBeGreaterThanOrEqual(2);
        expect(printed.slice(0, 2)).toEqual([...Array(2)].map(() => "St. Mary's Senior High School"));
      } else {
        expect(count(h, /St\.\s+Mary(?:'|&#39;|&#x27;)s Senior High School/g)).toBeGreaterThanOrEqual(2);
      }
      expect(count(h, /class="logo" src="data:image\/png/g)).toBe(2);
    });

    if (style === "wassce") it("wassce: every question number appears once per copy, never more", () => {
      const h = html({ style, questions: 37 });
      for (let q = 1; q <= 37; q++) expect(count(h, new RegExp(`<span class="qn">${q}</span>`, "g"))).toBe(2);
      expect(h).not.toContain('<span class="qn">38</span>');
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
    const four = html({ style: "wassce", questions: 10 });
    const five = html({ style: "wassce", questions: 10, optionCount: 5 });
    expect(four).not.toMatch(/<i class="b ">E<\/i>/);
    expect(five).toMatch(/<i class="b ">E<\/i>/);
  });

  it("the index-number grid has one column of 0-9 per digit", () => {
    const h = html({ style: "wassce", questions: 10, meta: { ...meta, idDigits: 8 } });
    expect(count(h, /<div class="ix-col">/g)).toBe(16); // 8 digits x 2 copies
    expect(count(h, /<div class="ix-c">/g)).toBe(160);
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

describe("print safety and professional details", () => {
  it("corner alignment marks sit inside the area ordinary office printers can print (at least 4 mm from the edge)", () => {
    expect(ALIGN_MARK.inset).toBeGreaterThanOrEqual(4);
    const h = html({ style: "wassce", questions: 40 });
    expect(h).toContain(`.reg{position:absolute;width:${ALIGN_MARK.size}mm`);
    expect(ALIGN_MARK.inset + ALIGN_MARK.size).toBeLessThan(SHEET_SPECS.wassce.margin - 1.8); // clear of the WASSCE frame
    expect(ALIGN_MARK.inset + ALIGN_MARK.size).toBeLessThan(SHEET_SPECS.bece.margin);        // clear of the BECE content
  });

  it("the official-use score and its total are laid out inside their own box", () => {
    const h = html({ style: "wassce", questions: 50 });
    expect(h).toContain('<span class="score"><span>Score</span><i></i><span>/ 50</span></span>');
  });

  it("a continuation sheet has name and index-number lines so loose pages can be matched to a candidate", () => {
    const h = html({ style: "wassce", questions: 100 });
    expect(count(h, /class="mini2"/g)).toBe(2 * (Number(h.match(/data-sheets="(\d+)"/)[1]) - 1));
    expect(h).toContain("INDEX No.");
  });

  it("WASSCE style has a sex (M/F) pair beside paper version; BECE style has neither", () => {
    expect(html({ style: "wassce", questions: 50 })).toMatch(/<i class="b">M<\/i><i class="b">F<\/i>/);
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
  });
});
