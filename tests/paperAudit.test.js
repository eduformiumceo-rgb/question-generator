import { describe, it, expect } from "vitest";
import { auditExam, applyAuditFix } from "../src/paperAudit.js";
import { buildSpec, normLevel } from "../src/tableOfSpec.js";
import { SAMPLE_EXAM } from "./helpers/sampleExam.js";

const STEMS = ["Which gas do green plants absorb during photosynthesis?", "What is the capital city of the Ashanti Region?", "Solve the equation when the unknown number is doubled.",
  "Name the instrument used to measure atmospheric pressure.", "Who was the first president of independent Ghana?", "Which part of the cell controls its activities?",
  "State the main language family spoken in northern villages.", "Identify the correct spelling of the borrowed foreign word.", "How many degrees are there in a right angle?",
  "Which river forms the largest artificial lake in Ghana?", "What is produced when an acid reacts with a metal?", "Define the term supply in basic economics."];
const mcq = (n, correct = "A", over = {}) => ({ number: n, text: STEMS[(n - 1) % STEMS.length], options: [`alpha ${n}`, `beta ${n}`, `gamma ${n}`, `delta ${n}`], correctOption: correct, parts: [], marks: 1, diagram: null, cognitiveLevel: "Recall", markingGuide: "", ...over });
const paper = (qs, key) => ({
  title: "T", instructions: [], totalMarks: qs.length,
  sections: [{ id: "A", label: "Section A", type: "objective", instructions: "", questions: qs }],
  answerKey: key ?? qs.map(q => ({ number: q.number, answer: q.correctOption })),
});
const codes = (r) => r.findings.map(f => f.code);

describe("paper audit", () => {
  it("a clean paper scores 100 with nothing to report", () => {
    const qs = Array.from({ length: 8 }, (_, i) => mcq(i + 1, "ABCD"[i % 4]));
    const r = auditExam(paper(qs));
    expect(r.findings).toEqual([]);
    expect(r.score).toBe(100);
    expect(r.ok).toBe(true);
  });

  it("catches a wrong answer key and fixes it in one click", () => {
    const e = paper([mcq(1, "A"), mcq(2, "B")], [{ number: 1, answer: "C" }]);
    const r = auditExam(e);
    expect(codes(r)).toContain("key-mismatch");
    expect(codes(r)).toContain("key-missing");
    expect(r.ok).toBe(false);
    const fixed = auditExam(applyAuditFix(e, "sync-answer-key"));
    expect(fixed.errors).toBe(0);
    expect(e.answerKey).toEqual([{ number: 1, answer: "C" }]);   // the input is not mutated
  });

  it("catches missing/duplicate/wrong-count options and a missing correct answer", () => {
    const r = auditExam(paper([
      mcq(1, "A", { options: ["same", "same", "x", "y"] }),
      mcq(2, "A", { options: ["a", "b", "c"] }),
      mcq(3, null),
      mcq(4, "A", { options: ["a", "", "c", "d"] }),
    ]));
    expect(codes(r)).toEqual(expect.arrayContaining(["duplicate-option", "option-count", "no-correct", "empty-option"]));
  });

  it("checks that part and sub-part marks add up, and offers a repair", () => {
    const e = {
      title: "T", totalMarks: 10,
      sections: [{ id: "B", label: "B", type: "structured", questions: [
        { number: 1, text: "Answer the following questions.", parts: [{ label: "a", text: "Part A text here", marks: 3, subparts: [] }, { label: "b", text: "Part B text here", marks: 4, subparts: [{ label: "i", text: "x sub", marks: 1 }] }], marks: 10, markingGuide: "g" },
      ] }], answerKey: [],
    };
    const r = auditExam(e);
    expect(codes(r)).toEqual(expect.arrayContaining(["marks-parts", "marks-subparts"]));
    const fixed = applyAuditFix(e, "marks-from-parts");
    expect(fixed.sections[0].questions[0].marks).toBe(7);
    expect(codes(auditExam(applyAuditFix(fixed, "total-marks")))).not.toContain("marks-parts");
  });

  it("warns about near-duplicate questions, but not different ones", () => {
    const dup = auditExam(paper([
      mcq(1, "A", { text: "Which of the following is a renewable source of energy used in Ghana?" }),
      mcq(2, "B", { text: "Which of the following is a renewable source of energy used in Ghana today?" }),
    ]));
    expect(codes(dup)).toContain("near-duplicate");
    expect(codes(auditExam(paper([mcq(1), mcq(2, "B")])))).not.toContain("near-duplicate");
  });

  it("flags answer-letter bias on long objective papers", () => {
    const qs = Array.from({ length: 10 }, (_, i) => mcq(i + 1, i < 7 ? "B" : "C"));
    expect(codes(auditExam(paper(qs)))).toContain("letter-bias");
  });

  it("flags 'all of the above' and an over-long correct option as tips", () => {
    const r = auditExam(paper([mcq(1, "A", { options: ["This is a considerably longer and more detailed answer", "b", "c", "All of the above"] })]));
    expect(codes(r)).toEqual(expect.arrayContaining(["all-of-above", "longest-correct"]));
    expect(r.errors).toBe(0);
  });

  it("catches broken and stray formulas", () => {
    const r = auditExam(paper([
      mcq(1, "A", { text: "Simplify $\\frac{1}{$ in full please." }),
      mcq(2, "A", { text: "Compute \\frac{1}{2} plus one half here." }),
      mcq(3, "A", { text: "Find $x^{2}$ when x equals three exactly." }),
    ]));
    expect(codes(r)).toEqual(expect.arrayContaining(["bad-formula", "latex-outside"]));
    expect(r.findings.filter(f => f.number === 3)).toEqual([]);
  });

  it("does not mistake money for maths", () => {
    const r = auditExam(paper([mcq(1, "A", { text: "A book costs $5 and a pen costs $10 in total." })]));
    expect(r.findings).toEqual([]);
  });

  it("warns when only some written questions have a marking guide", () => {
    const e = { title: "T", totalMarks: 4, answerKey: [], sections: [{ id: "B", label: "B", type: "structured", questions: [
      { number: 1, text: "Explain photosynthesis fully.", parts: [], marks: 2, markingGuide: "chlorophyll; light" },
      { number: 2, text: "Explain respiration fully.", parts: [], marks: 2, markingGuide: "" },
    ] }] };
    expect(codes(auditExam(e))).toContain("no-guide");
  });

  it("finds the real fault in the shared sample exam: its answer key lists 1 of 5 questions", () => {
    const r = auditExam(SAMPLE_EXAM);
    expect([...new Set(r.findings.filter(f => f.level === "error").map(f => f.code))]).toEqual(["key-missing"]);
    expect(auditExam(applyAuditFix(SAMPLE_EXAM, "sync-answer-key")).errors).toBe(0);
  });

  it("never throws on junk", () => {
    for (const junk of [null, undefined, {}, { sections: null }, { sections: [null] }, { sections: [{ questions: [null] }] }, { sections: [{ questions: [{}] }] },
      { sections: [{ type: "objective", questions: [{ number: 1, options: "abc", parts: [null, 3] }] }], answerKey: [null, 7] }]) {
      expect(() => auditExam(junk)).not.toThrow();
    }
  });
});

describe("table of specification", () => {
  const q = (n, topic, level, marks) => ({ number: n, text: "x", topic, cognitiveLevel: level, marks });
  const exam = { sections: [{ id: "A", questions: [q(1, "Fractions", "Recall", 2), q(2, "Fractions", "Application", 3), q(3, "Algebra", "Critical Thinking", 5)] }] };

  it("builds the topic by level grid with totals and percentages", () => {
    const s = buildSpec(exam);
    expect(s.totalMarks).toBe(10);
    expect(s.rows.map(r => [r.topic, r.marks, r.pct])).toEqual([["Algebra", 5, 50], ["Fractions", 5, 50]]);
    expect(s.totals.Recall).toEqual({ n: 1, marks: 2 });
    expect(s.levelPct["Critical Thinking"]).toBe(50);
    expect(s.rows.find(r => r.topic === "Fractions").cells.Application).toEqual({ n: 1, marks: 3 });
  });
  it("understands different wordings of the levels", () => {
    expect(normLevel("Knowledge")).toBe("Recall");
    expect(normLevel("analysis")).toBe("Critical Thinking");
    expect(normLevel("Understanding")).toBe("Application");
    expect(normLevel("")).toBe("Unclassified");
    expect(normLevel("Application of knowledge")).toBe("Application");
    expect(normLevel("  RECALL ")).toBe("Recall");
    expect(normLevel("Critical Thinking")).toBe("Critical Thinking");
    expect(normLevel("Knowledge")).toBe("Recall");
    expect(normLevel("banana")).toBe("Unclassified");
  });
  it("groups untagged questions under General and says so", () => {
    const s = buildSpec({ sections: [{ questions: [{ number: 1, marks: 2, cognitiveLevel: "Recall" }] }] });
    expect(s.rows[0].topic).toBe("General");
    expect(s.advice.join(" ")).toMatch(/not tagged/);
  });
  it("warns about missing levels, topic dominance and recall-heavy papers", () => {
    const heavy = { sections: [{ questions: [q(1, "A", "Recall", 9), q(2, "B", "Recall", 1)] }] };
    const s = buildSpec(heavy, { targetLevels: ["Recall", "Critical Thinking"] });
    const text = s.advice.join(" | ");
    expect(text).toMatch(/leans heavily on "A"/);
    expect(text).toMatch(/No marks test Critical Thinking/);
    expect(text).toMatch(/only test recall/);
  });
  it("copes with an empty paper", () => {
    expect(buildSpec(null).totalMarks).toBe(0);
    expect(buildSpec({ sections: [] }).rows).toEqual([]);
  });
});
