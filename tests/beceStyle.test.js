import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { getBeceProfile, beceSections, answerableMarks, beceStyleBlock, beceSchemeBlock, decorateBeceExam, isBeceClass, beceTotalMinutes } from "../src/beceStyle.js";
import { renderExamHTML, buildSectionPrompt, createExamVariant } from "../src/examTemplate.js";
import { generateExamDocx } from "../src/examDocx.js";

const mkExam = (subject, scheme = true) => {
  const profile = getBeceProfile(subject);
  const secs = beceSections(profile);
  const sections = secs.map(s => ({
    id: s.id, label: s.label, type: s.type,
    questions: Array.from({ length: s.questionCount }, (_, i) => s.type === "objective"
      ? { number: i + 1, text: `Q${i + 1}?`, marks: 1, options: ["a", "b", "c", "d"], correctOption: "B" }
      : { number: (s.numberFrom || 1) + i, text: "Stem", marks: s.marksPerQuestion, markingGuide: scheme ? `1(a)(i) :: Carbon dioxide / CO2 :: 1\nNOTE :: Any 4 points x 3 = 12 marks :: 12\nTOTAL :: :: [${s.marksPerQuestion} marks]` : "",
          parts: [{ label: "a", text: "[FIGURE 1(a): a cycle]\nName it.", marks: s.marksPerQuestion }] }),
  }));
  return { profile, secs, examData: decorateBeceExam({ title: "x", sections, answerKey: [{ number: 1, answer: "B" }] }, secs, profile, "Mock Exam") };
};

describe("BECE profiles (from the real 2025 papers)", () => {
  it("Integrated Science: Paper 2 = 100 marks (A 40 + B any 3 of 4 x 20), Paper 1 = 40 MCQ", () => {
    const p = getBeceProfile("Science"); const s = beceSections(p);
    expect(s.map(x => x.id)).toEqual(["A", "B", "OBJ"]);
    expect(answerableMarks(s[0])).toBe(40);
    expect(answerableMarks(s[1])).toBe(60);
    expect(s[1].answerAny).toBe(3);
    expect(answerableMarks(s[2])).toBe(40);
  });
  it("Mathematics: answer 4 of 6 questions, 15 marks each, part marks hidden", () => {
    const s = beceSections(getBeceProfile("Mathematics"));
    expect(answerableMarks(s[0])).toBe(60); expect(s[0].showPartMarks).toBe(false);
  });
  it("Computing, Social Studies, RME all total 60 marks in Paper 2", () => {
    for (const sub of ["Computing", "Social Studies", "Religious and Moral Education", "English Language", "Creative Arts", "French", "Ghanaian Language"]) {
      const total = beceSections(getBeceProfile(sub)).filter(x => x.paper === 2).reduce((a, x) => a + answerableMarks(x), 0);
      expect(total, sub).toBe(60);
    }
  });
  it("applies to every JHS class, not primary or SHS", () => {
    expect(isBeceClass("JHS 1")).toBe(true); expect(isBeceClass("JHS 3")).toBe(true);
    expect(isBeceClass("Basic 6")).toBe(false); expect(isBeceClass("SHS 2")).toBe(false);
  });
  it("unknown subjects fall back to a flagged generic BECE shape", () => {
    const p = getBeceProfile("Arabic"); expect(p.generic).toBe(true); expect(beceTotalMinutes(p)).toBeGreaterThan(0);
  });
});

describe("BECE rendering", () => {
  it("prints Paper 2 before Paper 1 with BECE headings, [n marks] and end marks", () => {
    const { examData } = mkExam("Science");
    const html = renderExamHTML(examData, { subject: "Science", className: "JHS 3", examType: "Mock Exam", durationMinutes: 135 }, "paper");
    expect(html.indexOf("PAPER 2")).toBeLessThan(html.indexOf("PAPER 1"));
    expect(html).toContain("SECTION B"); expect(html).toContain("Answer three questions only from this section");
    expect(html).toContain("[20 marks]"); expect(html).toContain("END OF ESSAY TEST"); expect(html).toContain("END OF PAPER");
    expect(html).toContain("MOCK BASIC EDUCATION CERTIFICATE EXAMINATION");
    expect(html).toContain("[FIGURE 1(a): a cycle]");
    expect(html).not.toMatch(/West African Examinations/i);
  });
  it("total marks count only the questions a candidate answers (100 + 40 for Science)", () => {
    const { examData } = mkExam("Science");
    const html = renderExamHTML(examData, { subject: "Science", className: "JHS 3" }, "paper");
    expect(html).toContain("140");
  });
  it("marking scheme renders as a QUESTION NO. / EXPECTED ANSWERS / MARKS table", () => {
    const { examData } = mkExam("Science");
    const html = renderExamHTML(examData, { subject: "Science", className: "JHS 3" }, "answerKey");
    expect(html).toContain("QUESTION NO."); expect(html).toContain("EXPECTED ANSWERS"); expect(html).toContain("PAPER 1: OBJECTIVE TEST");
    expect(html).toContain("Any 4 points x 3 = 12 marks");
  });
  it("Mathematics prints no part marks and uses a SOLUTION column", () => {
    const { examData } = mkExam("Mathematics");
    const q = renderExamHTML(examData, { subject: "Mathematics", className: "JHS 3" }, "paper");
    expect(q).not.toContain("[15 marks]");
    const k = renderExamHTML(examData, { subject: "Mathematics", className: "JHS 3" }, "answerKey");
    expect(k).toContain("SOLUTION");
  });
  it("Computing papers get answer lines in the paper", () => {
    const { examData } = mkExam("Computing");
    expect(renderExamHTML(examData, { subject: "Computing", className: "JHS 3" }, "paper")).toContain("ans-lines");
  });
  it("variants never reshuffle BECE essay questions", () => {
    const { examData } = mkExam("Science");
    const v = createExamVariant(examData, "B");
    expect(v.sections[1].questions.map(q => q.number)).toEqual([2, 3, 4, 5]);
  });
});

describe("BECE prompt", () => {
  const cfg = { examStyle: "bece", beceScheme: "points", subject: "Science", className: "JHS 3", topics: ["x"], sections: [], includeMarkingScheme: true };
  it("carries numbering, answer-any and BECE scheme rules", () => {
    const sec = beceSections(getBeceProfile("Science"))[1];
    const p = buildSectionPrompt(cfg, sec, false);
    expect(p).toContain("BECE-STYLE PAPER"); expect(p).toContain("start at 2"); expect(p).toContain("answer only 3 of the 4");
    expect(p).toContain("reference :: "); expect(p).toContain("Number questions 2..5");
  });
  it("is silent for school exams", () => {
    expect(beceStyleBlock({ examStyle: "school" }, {})).toBe("");
    expect(beceSchemeBlock({ examStyle: "school" }, {})).toBe("");
  });
});

describe("Word export", () => {
  it("builds a BECE paper and scheme without throwing", async () => {
    const { examData } = mkExam("Science");
    const a = await generateExamDocx(examData, { subject: "Science", className: "JHS 3" }, "paper");
    const b = await generateExamDocx(examData, { subject: "Science", className: "JHS 3" }, "answerKey");
    expect(a.size).toBeGreaterThan(2000); expect(b.size).toBeGreaterThan(2000);
  });
});

describe("shared copy", () => {
  it("src/beceStyle.js and functions/_shared/beceStyle.js are identical", () => {
    expect(readFileSync("functions/_shared/beceStyle.js", "utf8")).toBe(readFileSync("src/beceStyle.js", "utf8"));
  });
});
