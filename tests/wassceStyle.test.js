import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { WASSCE_PROFILES, getWassceProfile, wassceSections, wassceTotalMinutes, wassceStyleBlock, wassceSchemeBlock, decorateWassceExam, isWassceClass, wassceCoverCode, stripMarkup, repairWassceSection, checkWassceSection, renumberWassceSections, stripBoldMarkers } from "../src/wassceStyle.js";
import { answerableMarks } from "../src/beceStyle.js";
import { renderExamHTML, buildSectionPrompt, createExamVariant, hasFixedOptionOrder } from "../src/examTemplate.js";
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
    "Economics": { p1: 50, p2: 80, order: "12" },
    "Business Management": { p1: 50, p2: 70, order: "12" },
    "Christian Religious Studies": { p1: 40, p2: 60, order: "21" },
    "Geography": { p1: 50, p2: 80, order: "21" },
    "Literature in English": { p1: 50, p2: 50, order: "21" },
    "Management in Living": { p1: 60, p2: 100, order: "21" },
    "Textiles": { p1: 40, p2: 60, order: "21" },
    "Basketry": { p1: 40, p2: 60, order: "21" },
    "Leatherwork": { p1: 40, p2: 60, order: "21" },
    "General Knowledge in Art": { p1: 40, p2: 60, order: "21" },
    "Principles of Cost Accounting": { p1: 50, p2: 75, order: "21" },
    "Food and Nutrition": { p1: 60, p2: 40, order: "12" },
    "Agriculture": { p1: 50, p2: 80, order: "12" },
    "Agricultural Science": { p1: 50, p2: 90, order: "12" },
    "History": { p1: 50, p2: 60, order: "12" },
    "French": { p1: 40, p2: 40, order: "12" },
    "Islamic Religious Studies": { p1: 50, p2: 100, order: "12" },
    "Music": { p1: 40, p2: 60, order: "12" },
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
  it("Elective Maths Section B has three printed parts (Pure Maths 9-11, Statistics 12-13, Vectors 14-15)", () => {
    const b = wassceSections(getWassceProfile("Additional Mathematics")).find(x => x.paper === 2 && x.id === "B");
    expect([b.questionCount, b.marksPerQuestion, b.answerAny, b.numberFrom]).toEqual([7, 13, 4, 9]);
    expect(b.hint).toMatch(/## PART I: PURE MATHEMATICS/);
    expect(b.hint).toMatch(/## PART II: STATISTICS AND PROBABILITY/);
    expect(b.hint).toMatch(/## PART III: VECTORS AND MECHANICS/);
  });
  it("Economics: Section A two data-response (any 1), Section B six (any 3), 20 marks each", () => {
    const s = wassceSections(getWassceProfile("Economics")).filter(x => x.paper === 2);
    expect(s.map(x => [x.questionCount, x.marksPerQuestion, x.answerAny])).toEqual([[2, 20, 1], [6, 20, 3]]);
  });
  it("Business Management: Question 1 compulsory (25) plus seven questions, any three (15)", () => {
    const s = wassceSections(getWassceProfile("Business Management")).filter(x => x.paper === 2);
    expect(s.map(x => [x.questionCount, x.marksPerQuestion, x.answerAny])).toEqual([[1, 25, undefined], [7, 15, 3]]);
  });
  it("Agriculture: five sections of two, one from each, 16 marks", () => {
    const s = wassceSections(getWassceProfile("Agriculture")).filter(x => x.paper === 2);
    expect(s).toHaveLength(5);
    expect(s.every(x => x.questionCount === 2 && x.answerAny === 1 && x.marksPerQuestion === 16)).toBe(true);
  });
  it("every profile records where its structure came from or what is assumed", () => {
    for (const [k, p] of Object.entries(WASSCE_PROFILES)) {
      expect(Array.isArray(p.unverified), k).toBe(true);
      if (!p.verified) expect(p.unverified.length, k).toBeGreaterThan(0);
      if (["Management in Living", "Textiles", "Basketry", "Leatherwork", "General Knowledge in Art", "Principles of Cost Accounting", "Economics", "Business Management"].includes(k)) expect((p.sources || []).length, k).toBeGreaterThan(0);
    }
  });
  it("French is written in French; other subjects have no language rule", () => {
    const f = wassceSections(getWassceProfile("French"))[0];
    expect(wassceStyleBlock({ examStyle: "wassce", subject: "French" }, f)).toMatch(/Language of the paper: write ALL question text.*French/);
    const b = wassceSections(getWassceProfile("Biology"))[0];
    expect(wassceStyleBlock({ examStyle: "wassce", subject: "Biology" }, b)).not.toMatch(/Language of the paper/);
  });
  it("new aliases: Clothing and Textiles, General Agriculture, Art and Design Foundation", () => {
    expect(getWassceProfile("Clothing and Textiles").key).toBe("Textiles");
    expect(getWassceProfile("General Agriculture").key).toBe("Agriculture");
    expect(getWassceProfile("Art and Design Foundation").key).toBe("General Knowledge in Art");
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

describe("repairing and checking generated sections", () => {
  const objSec = { id: "OBJ", type: "objective", numberFrom: 11 };
  it("renumbers from the section start, strips option letters and fixes the answer letter", () => {
    const parsed = { section: { questions: [
      { number: 1, text: "Q **not", options: ["A. one", "B) two", "(C) three", "D: four"], correctOption: " b " },
      { number: 2, text: "Q {{x", options: ["a", "b", "c", "d"], correctOption: "c." },
    ] } };
    repairWassceSection(objSec, parsed);
    const [q1, q2] = parsed.section.questions;
    expect([q1.number, q2.number]).toEqual([11, 12]);
    expect(q1.options).toEqual(["one", "two", "three", "four"]);
    expect(q1.correctOption).toBe("B");
    expect(q1.text).toBe("Q not");
    expect(q2.text).toBe("Q x");
    expect(q2.correctOption).toBe("C");
  });
  it("keeps balanced markup untouched", () => {
    const parsed = { section: { questions: [{ number: 1, text: "State **three** {{Spirogyra}}", options: ["a", "b", "c", "d"], correctOption: "A" }] } };
    repairWassceSection({ id: "OBJ", type: "objective", numberFrom: 1 }, parsed);
    expect(parsed.section.questions[0].text).toBe("State **three** {{Spirogyra}}");
  });
  it("rejects objective questions with the wrong number of options, no valid answer, or duplicate options", () => {
    const ok = { number: 1, options: ["a", "b", "c", "d"], correctOption: "A" };
    expect(checkWassceSection(objSec, [ok])).toBe("");
    expect(checkWassceSection(objSec, [{ ...ok, options: ["a", "b", "c"] }])).toMatch(/exactly four/);
    expect(checkWassceSection(objSec, [{ ...ok, correctOption: "E" }])).toMatch(/correctOption/);
    expect(checkWassceSection(objSec, [{ ...ok, options: ["a", "A", "c", "d"] }])).toMatch(/different/);
  });
  it("rejects essay questions whose sub-parts do not add up to the part", () => {
    const sec = { id: "A", type: "structured" };
    const good = { number: 1, text: "x", parts: [{ label: "a", marks: 4, text: "y", subparts: [{ label: "i", marks: 2 }, { label: "ii", marks: 2 }] }] };
    expect(checkWassceSection(sec, [good])).toBe("");
    const bad = { number: 1, text: "x", parts: [{ label: "a", marks: 5, text: "y", subparts: [{ label: "i", marks: 2 }, { label: "ii", marks: 2 }] }] };
    expect(checkWassceSection(sec, [bad])).toMatch(/sub-part marks/);
    expect(checkWassceSection(sec, [{ number: 2, text: "", parts: [] }])).toMatch(/no text/);
  });
  it("validateExamData applies the WASSCE checks only for wassce", async () => {
    const { validateExamData } = await import("../src/examTemplate.js");
    const exp = [{ id: "OBJ", type: "objective", questionCount: 1, marksPerQuestion: 1 }];
    const data = { sections: [{ id: "OBJ", questions: [{ number: 1, marks: 1, text: "q", options: ["a", "b"], correctOption: "A" }] }] };
    expect(validateExamData(data, exp, { style: "wassce" }).errors.join(" ")).toMatch(/exactly four/);
    expect(validateExamData(data, exp).errors.join(" ")).not.toMatch(/exactly four/);
  });
});

describe("printed part headings and answer lines", () => {
  const meta = { schoolName: "Test SHS", className: "SHS 3", subject: "Additional Mathematics", term: "Term 1", examType: "Mock Exam", durationMinutes: 240, idMode: "boxes", idDigits: 10 };
  const exam = () => {
    const profile = getWassceProfile("Additional Mathematics");
    const secs = wassceSections(profile);
    const sections = secs.map(s => ({ id: s.id, label: s.label, type: s.type, questions: Array.from({ length: s.questionCount }, (_, i) => {
      const n = (s.numberFrom || 1) + i;
      const text = s.id === "B" && s.paper === 2 && n === 12 ? "## PART II: STATISTICS AND PROBABILITY\nFind the variance." : s.type === "objective" ? `Q${n}` : `Evaluate item ${n}.`;
      return s.type === "objective" ? { number: n, text, marks: 1, options: ["a", "b", "c", "d"], correctOption: "A" } : { number: n, text, marks: s.marksPerQuestion, parts: [] };
    }) }));
    return decorateWassceExam({ title: "x", sections, answerKey: [] }, secs, profile, "Mock Exam");
  };
  it("a leading ## line prints as a centred heading and never as raw text", () => {
    const html = renderExamHTML(exam(), meta, "paper");
    expect(html).toMatch(/<div class="q-subhead">PART II: STATISTICS AND PROBABILITY<\/div>/);
    expect(html).not.toContain("## PART II");
  });
  it("a part-less essay question gets answer lines in a booklet that prints them", () => {
    const profile = getWassceProfile("Biology");
    const secs = wassceSections(profile).filter(s => s.paper === 2 && s.id === "B");
    const data = decorateWassceExam({ title: "x", answerKey: [], sections: [{ id: "B", label: "B", type: "structured", questions: [{ number: 5, text: "Discuss **five** points.", marks: 30, parts: [] }] }] }, secs, profile, "Mock Exam");
    const html = renderExamHTML(data, { ...meta, subject: "Biology" }, "paper");
    expect(html.slice(html.indexOf("Discuss"))).toContain("ans-lines");
  });
  it("Word export handles ## headings and builds multi-section files for two-column papers", async () => {
    for (const mode of ["paper", "answerKey"]) {
      const blob = await generateExamDocx(exam(), meta, mode);
      expect(new Uint8Array(await blob.arrayBuffer()).length).toBeGreaterThan(5000);
    }
  });
});

describe("regressions found while auditing", () => {
  const meta = { schoolName: "Test SHS", className: "SHS 3", subject: "English Language", term: "Term 1", examType: "Mock Exam", durationMinutes: 120, idMode: "boxes", idDigits: 10 };

  it("Version A/B keeps WASSCE question order and numbers (shared tables and passages stay valid)", () => {
    const { examData } = mkExam("English Language");
    const v = createExamVariant(examData, 11);
    for (const sec of examData.sections.filter(x => x.type === "objective")) {
      const vs = v.sections.find(x => x.id === sec.id);
      expect(vs.questions.map(q => q.number)).toEqual(sec.questions.map(q => q.number));
    }
    const s2 = v.sections.find(x => x.id === "OBJ2");
    expect(s2.questions[0].number).toBe(11);                      // not reset to 1
  });
  it("Version A/B never shuffles Roman-numeral or numeric options, and keeps the answer key correct when it does shuffle", () => {
    expect(hasFixedOptionOrder(["I only", "I and II only", "II and III only", "I, II and III"])).toBe(true);
    expect(hasFixedOptionOrder(["12 years", "13½ years", "13 years", "12½ years"])).toBe(true);
    expect(hasFixedOptionOrder(["$32,018.32", "$67,657.00", "$20,848.19", "$16,765.79"])).toBe(true);
    expect(hasFixedOptionOrder(["osmosis", "diffusion", "capillarity", "transpiration"])).toBe(false);
    expect(hasFixedOptionOrder(["A - B", "B - A", "A ∩ B", "A ∪ B"])).toBe(false);
    const data = { style: "wassce", title: "x", sections: [{ id: "OBJ", type: "objective", questions: [
      { number: 1, text: "r", marks: 1, options: ["I only", "I and II only", "II and III only", "I, II and III"], correctOption: "B" },
      { number: 2, text: "w", marks: 1, options: ["osmosis", "diffusion", "capillarity", "transpiration"], correctOption: "C" }] }], answerKey: [{ number: 1, answer: "B" }, { number: 2, answer: "C" }] };
    for (let seed = 1; seed <= 20; seed++) {
      const v = createExamVariant(data, seed);
      const [q1, q2] = v.sections[0].questions;
      expect(q1.options).toEqual(["I only", "I and II only", "II and III only", "I, II and III"]);
      expect(q1.correctOption).toBe("B");
      expect(q2.options[["A", "B", "C", "D"].indexOf(q2.correctOption)]).toBe("capillarity");
      expect(v.answerKey.find(a => a.number === 2).answer).toBe(q2.correctOption);
    }
  });
  it("answer options render bold / italic markup, and never raw markers", () => {
    const profile = getWassceProfile("Biology");
    const secs = wassceSections(profile).slice(0, 1);
    const data = decorateWassceExam({ title: "x", answerKey: [], sections: [{ id: "OBJ", label: "x", type: "objective", questions: [{ number: 1, text: "Which?", marks: 1, options: ["{{Spirogyra}}", "**not** this", "plain", "H₂O"], correctOption: "A" }] }] }, secs, profile, "Mock Exam");
    const html = renderExamHTML(data, { ...meta, subject: "Biology" }, "paper");
    expect(html).toContain('<span class="opt-text"><i>Spirogyra</i></span>');
    expect(html).toContain('<span class="opt-text"><b>not</b> this</span>');
  });
  it("HTML in generated text is escaped, never injected, including inside markup and tables", () => {
    const profile = getWassceProfile("Biology");
    const secs = wassceSections(profile).filter(x => x.paper === 2 && x.id === "A");
    const data = decorateWassceExam({ title: "x", answerKey: [], sections: [{ id: "A", label: "A", type: "structured", questions: [{ number: 1, text: "**<b onmouseover=x>**\n{{<i onclick=y>}}\n| <script>z</script> | b |\n| 1 | 2 |\n## <img src=q onerror=1>", marks: 20, parts: [] }] }] }, secs, profile, "Mock Exam");
    const html = renderExamHTML(data, { ...meta, subject: "Biology" }, "paper").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
    expect(html).not.toMatch(/<script>z|<b onmouseover|<i onclick|<img src=q/);
    expect(html).toContain("&lt;script&gt;z&lt;/script&gt;");
  });
  it("repair keeps set-notation options like 'A - B' and only strips letters when all four options carry them", () => {
    const parsed = { section: { questions: [
      { options: ["A - B", "B - A", "A ∩ B", "A ∪ B"], correctOption: "A" },
      { options: ["A. one", "B. two", "C. three", "D. four"], correctOption: "B" },
      { options: ["A. keeps", "two", "C. mixed", "D. up"], correctOption: "D" }] } };
    repairWassceSection({ numberFrom: 1 }, parsed);
    expect(parsed.section.questions[0].options).toEqual(["A - B", "B - A", "A ∩ B", "A ∪ B"]);
    expect(parsed.section.questions[1].options).toEqual(["one", "two", "three", "four"]);
    expect(parsed.section.questions[2].options).toEqual(["A. keeps", "two", "C. mixed", "D. up"]);
  });
  it("repair strips markup from the marking guide (the scheme is plain text)", () => {
    const parsed = { section: { questions: [{ text: "q", markingGuide: "1(a) :: **State** {{x}} :: 1" }] } };
    repairWassceSection({ numberFrom: 1 }, parsed);
    expect(parsed.section.questions[0].markingGuide).toBe("1(a) :: State x :: 1");
  });
  it("profile lookup is safe for hostile or odd subject names", () => {
    for (const k of ["constructor", "__proto__", "toString", "hasOwnProperty", "", undefined, null]) {
      const p = getWassceProfile(k);
      expect(p.generic, String(k)).toBe(true);
      expect(Array.isArray(p.paper2.sections)).toBe(true);
    }
  });
  it("renumberWassceSections continues numbering within each paper after a changed count", () => {
    const secs = wassceSections(getWassceProfile("Physics")).map(s => (s.paper === 2 && s.id === "A" ? { ...s, questionCount: 6 } : s));
    const out = renumberWassceSections(secs);
    expect(out.filter(s => s.paper === 2).map(s => s.numberFrom)).toEqual([1, 7]);
    expect(out.find(s => s.paper === 1).numberFrom).toBe(1);
  });
  it("the Word module uses no regex lookbehind (older Safari cannot parse it, which would break the whole app)", () => {
    for (const f of ["src/examDocx.js", "src/examTemplate.js", "src/wassceStyle.js"]) expect(readFileSync(f, "utf8"), f).not.toMatch(/\(\?<[=!]/);
  });
  it("Word export of BECE-style layout parts is untouched: part labels stay bold, never italic", async () => {
    const { examData } = mkExam("Biology");
    examData.style = "school";
    const blob = await generateExamDocx(examData, { ...meta, subject: "Biology", className: "SHS 3" }, "paper");
    expect(new Uint8Array(await blob.arrayBuffer()).length).toBeGreaterThan(5000);
  });
});

describe("section labels (the structure builder already prefixes 'Paper N:')", () => {
  it("no WASSCE section label repeats 'Paper 1' or 'Paper 2'", () => {
    for (const [k, p] of Object.entries(WASSCE_PROFILES)) for (const sec of wassceSections(p)) expect(sec.label, `${k} ${sec.id}`).not.toMatch(/^Paper \d/);
  });
});

describe("stray markdown bold in a style that does not render it (BECE)", () => {
  it("keeps the words and drops the asterisks, but never touches exponents or unmatched markers", () => {
    expect(stripBoldMarkers("Which is **not** a mineral?")).toBe("Which is not a mineral?");
    expect(stripBoldMarkers("**State** the **three** reasons.")).toBe("State the three reasons.");
    expect(stripBoldMarkers("(**yes**)")).toBe("(yes)");
    expect(stripBoldMarkers("2**3 and 4**5 are powers")).toBe("2**3 and 4**5 are powers");
    expect(stripBoldMarkers("x**2 + **bold** here")).toBe("x**2 + bold here");
    expect(stripBoldMarkers("**unclosed")).toBe("**unclosed");
    expect(stripBoldMarkers("a **b ** c")).toBe("a **b ** c");
  });
  it("applies to BECE text, options, parts and the marking guide, and leaves WASSCE bold alone", () => {
    const mk = () => ({ section: { questions: [{ text: "Is it **not** so?", options: ["**one**", "two", "three", "four"], correctOption: "A", markingGuide: "1 :: **ans** :: 1", parts: [{ label: "a", text: "State **two**", subparts: [{ label: "i", text: "**x** done" }] }] }] } });
    const bece = mk(); repairWassceSection({ numberFrom: 1 }, bece, { markup: false });
    const q = bece.section.questions[0];
    expect([q.text, q.options[0], q.markingGuide, q.parts[0].text, q.parts[0].subparts[0].text]).toEqual(["Is it not so?", "one", "1 :: ans :: 1", "State two", "x done"]);
    const wassce = mk(); repairWassceSection({ numberFrom: 1 }, wassce);
    expect(wassce.section.questions[0].text).toBe("Is it **not** so?");          // WASSCE renders it as bold
    expect(wassce.section.questions[0].markingGuide).toBe("1 :: ans :: 1");      // but the scheme is plain text
  });
});

