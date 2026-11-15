import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { WASSCE_PROFILES, getWassceProfile, wassceSections, wassceTotalMinutes, wassceStyleBlock, wassceSchemeBlock, decorateWassceExam, isWassceClass, wassceCoverCode, stripMarkup } from "../src/wassceStyle.js";
import { answerableMarks } from "../src/beceStyle.js";
import { renderExamHTML, buildSectionPrompt, createExamVariant } from "../src/examTemplate.js";
import { generateExamDocx } from "../src/examDocx.js";

const mkExam = (subject) => {
  const profile = getWassceProfile(subject);
  const secs = wassceSections(profile);
  const sections = secs.map(s => ({
    id: s.id, label: s.label, type: s.type,
    questions: Array.from({ length: s.questionCount }, (_, i) => s.type === "objective"
      ? { number: (s.numberFrom || 1) + i, text: `Q${i + 1}? Which is **not** H₂O`, marks: 1, options: ["a", "b", "c", "d"], correctOption: "B" }
      : { number: (s.numberFrom || 1) + i, text: "Two {{Spirogyra}} filaments were used.", marks: s.marksPerQuestion, markingGuide: `1(a) :: Any answer :: 1\nTOTAL :: :: [${s.marksPerQuestion} marks]`,
          parts: [{ label: "a", text: "Complete the table below.\n| Element | Importance |\n| Nitrogen | |", marks: 2 }, { label: "b", text: "State **three** uses.", marks: s.marksPerQuestion - 2 }] }),
  }));
  return { profile, secs, examData: decorateWassceExam({ title: "x", sections, answerKey: [{ number: 1, answer: "B" }] }, secs, profile, "Mock Exam") };
};

const paperMarks = (secs, n) => secs.filter(s => s.paper === n).reduce((a, s) => a + answerableMarks(s), 0);

describe("WASSCE profiles (read from the supplied WASSCE papers)", () => {
  const expected = {
    "Biology": { p1: 50, p2: 70, order: "12" },
    "Chemistry": { p1: 50, p2: 100, order: "21" },
    "Physics": { p1: 50, p2: 60, order: "12" },
    "Mathematics": { p1: 50, p2: 100, order: "12" },
    "Additional Mathematics": { p1: 40, p2: 100, order: "12" },
    "English Language": { p1: 80, p2: 100, order: "12" },
    "General Science": { p1: 50, p2: 80, order: "12" },
    "Social Studies": { p1: 50, p2: 100, order: "12" },
    "Information Communication Technology": { p1: 50, p2: 30, order: "12" },
    "Graphic Design": { p1: 40, p2: 60, order: "21" },
  };
  for (const [subject, e] of Object.entries(expected)) {
    it(`${subject}: Paper 1 = ${e.p1}, Paper 2 = ${e.p2}, ${e.order === "21" ? "Paper 2 first" : "Paper 1 first"}`, () => {
      const p = getWassceProfile(subject);
      const s = wassceSections(p);
      expect(paperMarks(s, 1)).toBe(e.p1);
      expect(paperMarks(s, 2)).toBe(e.p2);
      expect(p.paper1.marks).toBe(e.p1);
      expect(p.paper2.marks).toBe(e.p2);
      expect(p.order).toBe(e.order);
      expect(s[0].paper).toBe(e.order === "21" ? 2 : 1);
      expect(p.verified).toBe(true);
    });
  }
  it("every profile has unique section ids and positive durations", () => {
    for (const [k, p] of Object.entries(WASSCE_PROFILES)) {
      const ids = wassceSections(p).map(s => s.id);
      expect(new Set(ids).size, k).toBe(ids.length);
      expect(p.paper1.minutes, k).toBeGreaterThan(0);
      expect(p.paper2.minutes, k).toBeGreaterThan(0);
      expect(wassceTotalMinutes(p), k).toBeLessThanOrEqual(300);
    }
  });
  it("question numbers run on without gaps or overlaps inside each paper", () => {
    for (const [k, p] of Object.entries(WASSCE_PROFILES)) {
      for (const n of [1, 2]) {
        let next = 1;
        wassceSections(p).filter(s => s.paper === n).sort((a, b) => a.numberFrom - b.numberFrom).forEach(s => {
          expect(s.numberFrom, `${k} paper ${n} ${s.id}`).toBe(next);
          next += s.questionCount;
        });
      }
    }
  });
  it("Biology: Section A answer 2 of 4 x 20, Section B one compulsory 30", () => {
    const [a, b] = wassceSections(getWassceProfile("Biology")).filter(s => s.paper === 2);
    expect([a.questionCount, a.marksPerQuestion, a.answerAny]).toEqual([4, 20, 2]);
    expect([b.questionCount, b.marksPerQuestion, b.answerAny]).toEqual([1, 30, undefined]);
  });
  it("Social Studies: five of ten, counted per section (40 + 30 + 30)", () => {
    const s = wassceSections(getWassceProfile("Social Studies")).filter(x => x.paper === 2);
    expect(s.map(x => x.questionCount)).toEqual([4, 3, 3]);
    expect(s.map(x => answerableMarks(x))).toEqual([40, 30, 30]);
  });
  it("Core Maths: no part marks printed; Elective Maths Paper 1 is two columns", () => {
    expect(getWassceProfile("Mathematics").showPartMarks).toBe(false);
    expect(wassceSections(getWassceProfile("Mathematics")).filter(s => s.paper === 2).every(s => s.showPartMarks === false)).toBe(true);
    expect(getWassceProfile("Additional Mathematics").twoColumnP1).toBe(true);
    expect(getWassceProfile("Biology").twoColumnP1).toBe(true);
    expect(getWassceProfile("Chemistry").twoColumnP1).toBeFalsy();
  });
  it("English Paper 1 has eight sections (five lexis, three literature) numbered 1 to 80", () => {
    const s = wassceSections(getWassceProfile("English Language")).filter(x => x.paper === 1);
    expect(s).toHaveLength(8);
    expect(s[0].part).toBe("PART A");
    expect(s[5].part).toBe("PART B");
    expect(s.at(-1).numberFrom + s.at(-1).questionCount - 1).toBe(80);
  });
  const fromPapers2021 = {
    "Government": { p1: 50, p2: 60, order: "12" },
    "Accounting": { p1: 50, p2: 75, order: "12" },
    "Economics": { p1: 50, p2: 60, order: "12" },
    "Business Management": { p1: 50, p2: 70, order: "12" },
    "Christian Religious Studies": { p1: 40, p2: 60, order: "21" },
    "Geography": { p1: 50, p2: 80, order: "21" },
    "Literature in English": { p1: 50, p2: 50, order: "21" },
  };
  for (const [subject, e] of Object.entries(fromPapers2021)) {
    it(`${subject} (2021 papers): Paper 1 = ${e.p1}, Paper 2 = ${e.p2}`, () => {
      const p = getWassceProfile(subject);
      const s = wassceSections(p);
      expect(paperMarks(s, 1)).toBe(e.p1);
      expect(paperMarks(s, 2)).toBe(e.p2);
      expect(p.order).toBe(e.order);
      expect(p.generic).toBeFalsy();
      expect(Array.isArray(p.unverified)).toBe(true);
    });
  }
  it("Government: four questions, any two from each of two sections of five, 15 marks each", () => {
    const s = wassceSections(getWassceProfile("Government")).filter(x => x.paper === 2);
    expect(s.map(x => [x.questionCount, x.marksPerQuestion, x.answerAny])).toEqual([[5, 15, 2], [5, 15, 2]]);
  });
  it("Financial Accounting: two from A and three from B, calculators allowed", () => {
    const p = getWassceProfile("Accounting");
    const s = wassceSections(p).filter(x => x.paper === 2);
    expect(s.map(x => x.answerAny)).toEqual([2, 3]);
    expect(p.calculators).toBe(true);
  });
  it("programme suffixes such as (GS) resolve to the base subject", () => {
    expect(getWassceProfile("Biology (GS)").key).toBe("Biology");
    expect(getWassceProfile("Chemistry (Agric)").key).toBe("Chemistry");
    expect(getWassceProfile("ICT (STEM)").key).toBe("Information Communication Technology");
    expect(getWassceProfile("Additional Mathematics (BUS)").key).toBe("Additional Mathematics");
  });
  it("aliases and unknown subjects", () => {
    expect(getWassceProfile("Integrated Science").key).toBe("General Science");
    expect(getWassceProfile("Elective Mathematics").key).toBe("Additional Mathematics");
    expect(getWassceProfile("ICT").key).toBe("Information Communication Technology");
    const g = getWassceProfile("Some New Subject");
    expect(g.generic).toBe(true);
    expect(g.verified).toBe(false);
    expect(g.label).toBe("Some New Subject");
    expect(paperMarks(wassceSections(g), 2)).toBe(100);
  });
  it("isWassceClass covers SHS 1 to 3 only", () => {
    ["SHS 1", "SHS 2", "SHS 3", "shs3"].forEach(c => expect(isWassceClass(c)).toBe(true));
    ["Basic 9", "JHS 3", "", undefined].forEach(c => expect(isWassceClass(c)).toBe(false));
  });
  it("cover code: 2&1 for combined booklets, 1 otherwise", () => {
    expect(wassceCoverCode(getWassceProfile("Chemistry")).code).toBe("2&1");
    expect(wassceCoverCode(getWassceProfile("Biology")).code).toBe("1");
  });
  it("stripMarkup removes bold and italic markers", () => {
    expect(stripMarkup("State **three** {{Spirogyra}} uses")).toBe("State three Spirogyra uses");
  });
});

describe("WASSCE prompts", () => {
  const cfg = (subject, extra = {}) => ({ examStyle: "wassce", subject, className: "SHS 3", topics: ["x"], difficulty: "Medium", ...extra });
  it("style block only appears for examStyle wassce", () => {
    const sec = wassceSections(getWassceProfile("Biology"))[1];
    expect(wassceStyleBlock({ examStyle: "school" }, sec)).toBe("");
    expect(wassceStyleBlock(cfg("Biology"), sec)).toContain("WASSCE-STYLE PAPER");
    expect(wassceSchemeBlock({ examStyle: "school" }, sec)).toBe("");
  });
  it("answer-any sections tell the model to write every question at the same standard", () => {
    const sec = wassceSections(getWassceProfile("Biology")).find(s => s.id === "A" && s.paper === 2);
    expect(wassceStyleBlock(cfg("Biology"), sec)).toMatch(/answer only 2 of the 4/);
  });
  it("objective block asks for no letters in options and explains table markup", () => {
    const sec = wassceSections(getWassceProfile("Biology")).find(s => s.type === "objective");
    const t = wassceStyleBlock(cfg("Biology"), sec);
    expect(t).toMatch(/WITHOUT the letters/);
    expect(t).toMatch(/pipe form/);
  });
  it("scheme block: maths uses mark codes, biology uses points", () => {
    const sec = wassceSections(getWassceProfile("Mathematics")).find(s => s.paper === 2);
    expect(wassceSchemeBlock(cfg("Mathematics"), sec)).toMatch(/M1/);
    const bsec = wassceSections(getWassceProfile("Biology")).find(s => s.paper === 2);
    expect(wassceSchemeBlock(cfg("Biology"), bsec)).toMatch(/acceptable points/);
    expect(wassceSchemeBlock(cfg("Biology"), wassceSections(getWassceProfile("Biology"))[0])).toMatch(/correctOption/);
  });
  it("buildSectionPrompt includes the WASSCE rules and numbering for a wassce config", () => {
    const sec = wassceSections(getWassceProfile("Physics")).find(s => s.id === "B" && s.paper === 2);
    const prompt = buildSectionPrompt({ ...cfg("Physics"), includeMarkingScheme: true }, { ...sec }, false);
    expect(prompt).toContain("WASSCE-STYLE PAPER");
    expect(prompt).toContain("start at 8");
    expect(prompt).toContain("MARKING SCHEME RULES (WASSCE format");
    expect(prompt).not.toContain("BECE-STYLE");
  });
  it("a school-style config is untouched by WASSCE rules", () => {
    const sec = { id: "A", type: "structured", questionCount: 3, marksPerQuestion: 10, label: "A" };
    expect(buildSectionPrompt({ examStyle: "school", subject: "Biology", className: "SHS 3", topics: ["x"], difficulty: "Medium" }, sec, true)).not.toContain("WASSCE-STYLE");
  });
  it("server copy of the style module and prompt builder match the client", () => {
    expect(readFileSync("functions/_shared/wassceStyle.js", "utf8")).toBe(readFileSync("src/wassceStyle.js", "utf8"));
    expect(readFileSync("functions/_shared/beceStyle.js", "utf8")).toBe(readFileSync("src/beceStyle.js", "utf8"));
  });
});

describe("decorateWassceExam", () => {
  it("stamps the style, a clean title, booklet instructions and section metadata", () => {
    const { examData, secs } = mkExam("Biology");
    expect(examData.style).toBe("wassce");
    expect(examData.title).toBe("MOCK EXAMINATION");
    expect(examData.instructions.join(" ")).toMatch(/Do not open this booklet/);
    const a = examData.sections.find(s => s.id === "A");
    expect(a.paper).toBe(2);
    expect(a.answerAny).toBe(2);
    expect(a.heading).toBe("SECTION A");
    expect(examData.sections.length).toBe(secs.length);
  });
  it("Chemistry (2&1) booklet says Paper 2 comes first", () => {
    expect(mkExam("Chemistry").examData.instructions.join(" ")).toMatch(/Paper 2, which comes first/);
    expect(mkExam("Physics").examData.instructions.join(" ")).toMatch(/Answer Paper 1/);
  });
});

describe("WASSCE rendering", () => {
  const meta = (subject) => ({ schoolName: "Test SHS", className: "SHS 3", subject, term: "Term 1", examType: "Mock Exam", durationMinutes: 140, idMode: "boxes", idDigits: 10 });
  it("renders markup, tables and the WASSCE flag; no raw markers leak", () => {
    const { examData } = mkExam("Biology");
    const html = renderExamHTML(examData, meta("Biology"), "paper");
    expect(html).toMatch(/<html[^>]*data-wassce="1"/);
    expect(html).toContain("<b>not</b>");
    expect(html).toContain("<i>Spirogyra</i>");
    expect(html).toContain('<table class="w-table">');
    expect(html).not.toMatch(/\*\*not\*\*|\{\{Spirogyra\}\}/);
    expect(html).toContain("Do not write in this margin");
    expect(html).toContain("PAPER 1");
    expect(html).toContain("PAPER 2");
  });
  it("Paper 1 first for Biology, Paper 2 first for Chemistry", () => {
    const bio = renderExamHTML(mkExam("Biology").examData, meta("Biology"), "paper");
    expect(bio.indexOf("PAPER 1")).toBeLessThan(bio.indexOf("PAPER 2"));
    const chem = renderExamHTML(mkExam("Chemistry").examData, meta("Chemistry"), "paper");
    expect(chem.indexOf("PAPER 2")).toBeLessThan(chem.indexOf("PAPER 1"));
    expect(chem).toContain("2&amp;1");
  });
  it("separate booklets get a Paper 2 cover with the examiner's table; combined booklets do not repeat it", () => {
    expect(renderExamHTML(mkExam("Biology").examData, meta("Biology"), "paper")).toContain("p2-cover");
    expect(renderExamHTML(mkExam("Chemistry").examData, meta("Chemistry"), "paper")).not.toContain('class="p2-cover"');
  });
  it("no answer lines under a part that is itself a table, but lines under a normal part", () => {
    const { examData } = mkExam("Biology");   // Biology prints answer lines in the paper
    const html = renderExamHTML(examData, meta("Biology"), "paper");
    const t = html.indexOf("</table>", html.indexOf("Paper 2") > 0 ? html.indexOf("w-table", html.indexOf("PAPER 2")) : 0);
    const next = html.indexOf("uses", t);
    expect(t).toBeGreaterThan(0);
    expect(html.slice(t, next)).not.toContain("ans-lines");
    expect(html.slice(next, next + 400)).toContain("ans-lines");
  });
  it("marking scheme renders for WASSCE with the notes and answer key", () => {
    const { examData } = mkExam("Mathematics");
    const html = renderExamHTML(examData, meta("Mathematics"), "answerKey");
    expect(html).toContain("ANSWER KEY");
    expect(html).toMatch(/M = method mark/);
  });
  it("BECE papers are unaffected", () => {
    const html = renderExamHTML({ title: "x", style: "bece", sections: [], answerKey: [] }, { ...meta("Mathematics"), className: "Basic 9" }, "paper");
    expect(html).toMatch(/<html[^>]*data-bece="1"/);
    expect(html).not.toMatch(/<html[^>]*data-wassce/);
  });
  it("createExamVariant keeps essay question order for WASSCE", () => {
    const { examData } = mkExam("Physics");
    const v = createExamVariant(examData, 7);
    const orig = examData.sections.find(s => s.type !== "objective").questions.map(q => q.number);
    const next = v.sections.find(s => s.type !== "objective").questions.map(q => q.number);
    expect(next).toEqual(orig);
  });
});

describe("WASSCE Word export", () => {
  const meta = (subject) => ({ schoolName: "Test SHS", className: "SHS 3", subject, term: "Term 1", examType: "Mock Exam", durationMinutes: 140 });
  for (const subject of ["Biology", "Chemistry", "English Language", "Mathematics", "Social Studies"]) {
    it(`${subject}: paper and marking scheme both build a valid .docx`, async () => {
      const { examData } = mkExam(subject);
      for (const mode of ["paper", "answerKey"]) {
        const blob = await generateExamDocx(examData, meta(subject), mode);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        expect(bytes.length).toBeGreaterThan(5000);
        expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
      }
    });
  }
});
