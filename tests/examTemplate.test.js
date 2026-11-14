import { describe, it, expect } from "vitest";
import {
  buildExamSystemPrompt, buildSectionPrompt, renderExamHTML,
  validateExamData, isSafeGeneratedSVG, createExamVariant,
} from "../src/examTemplate.js";

const BASE_CFG = {
  schoolName: "St. Mary's JHS", className: "JHS 2", subject: "Mathematics", term: "Term 1",
  examType: "Class Test", durationMinutes: 60,
  topics: ["Algebraic Expressions", "Linear Equations"], pastedSyllabus: "",
  difficulty: "Moderate", languageStyle: "Balanced", cognitiveLevels: ["Recall", "Application"],
  allowDiagrams: true,
};

const SECTIONS = [
  { id: "A", label: "Section A: Objective", type: "objective", questionCount: 5, marksPerQuestion: 1 },
  { id: "B", label: "Section B: Structured", type: "structured", questionCount: 2, marksPerQuestion: 10 },
];

const SAMPLE_EXAM = {
  title: "CLASS TEST",
  instructions: ["Answer all questions."],
  sections: [
    {
      id: "A", label: "Section A: Objective", type: "objective", instructions: "Choose the correct option.",
      questions: Array.from({ length: 5 }, (_, i) => ({
        number: i + 1, text: `Question ${i + 1}?`, options: ["a", "b", "c", "d"],
        correctOption: "A", parts: [], marks: 1, diagram: null, cognitiveLevel: "Recall", markingGuide: "A is correct.",
      })),
    },
    {
      id: "B", label: "Section B: Structured", type: "structured", instructions: "Answer both questions.",
      questions: [
        { number: 1, text: "Solve for x.", options: null, correctOption: null, parts: [{ label: "a", text: "2x = 4", marks: 5, subparts: [] }, { label: "b", text: "3x = 9", marks: 5, subparts: [] }], marks: 10, diagram: null, cognitiveLevel: "Application", markingGuide: "x=2; x=3." },
        { number: 2, text: "Solve for y.", options: null, correctOption: null, parts: [], marks: 10, diagram: null, cognitiveLevel: "Application", markingGuide: "y=5." },
      ],
    },
  ],
  answerKey: [{ number: 1, answer: "A" }],
};

describe("buildExamSystemPrompt", () => {
  it("includes all key exam parameters", () => {
    const prompt = buildExamSystemPrompt({ ...BASE_CFG, sections: SECTIONS });
    expect(prompt).toContain("St. Mary's JHS");
    expect(prompt).toContain("JHS 2");
    expect(prompt).toContain("Algebraic Expressions; Linear Equations");
    expect(prompt).toContain("Section A");
    expect(prompt).toContain("Section B");
  });

  it("computes total marks correctly", () => {
    const prompt = buildExamSystemPrompt({ ...BASE_CFG, sections: SECTIONS });
    // 5*1 + 2*10 = 25
    expect(prompt).toContain("25");
  });

  it("includes the pasted syllabus verbatim as authoritative scope when provided", () => {
    const prompt = buildExamSystemPrompt({ ...BASE_CFG, topics: [], pastedSyllabus: "Chapter 4: Fractions and Decimals", sections: SECTIONS });
    expect(prompt).toContain("Chapter 4: Fractions and Decimals");
    expect(prompt).toContain("authoritative");
  });
});

describe("buildSectionPrompt", () => {
  it("requests exactly one section's worth of questions", () => {
    const prompt = buildSectionPrompt(BASE_CFG, SECTIONS[0], true);
    expect(prompt).toContain('"id": "A"');
    expect(prompt).toContain("EXACTLY 5 question(s)");
  });

  it("only requests paper-level title/instructions on the first section", () => {
    const first = buildSectionPrompt(BASE_CFG, SECTIONS[0], true);
    const second = buildSectionPrompt(BASE_CFG, SECTIONS[1], false);
    expect(first).toContain('"title": string');
    expect(second).not.toContain('"title": string');
  });

  it("includes the SVG diagram schema when diagrams are allowed", () => {
    const prompt = buildSectionPrompt({ ...BASE_CFG, allowDiagrams: true }, SECTIONS[0], true);
    expect(prompt).toContain("generatable");
    expect(prompt).toContain("<svg");
  });

  it("tells the model not to request diagrams when disabled", () => {
    const prompt = buildSectionPrompt({ ...BASE_CFG, allowDiagrams: false }, SECTIONS[0], true);
    expect(prompt).toMatch(/do not request diagrams/i);
  });

  it("uses a banded rubric for essay marking guidance, and point-by-point for structured", () => {
    const essaySection = { id: "C", label: "Section C: Essay", type: "essay", questionCount: 1, marksPerQuestion: 20 };
    const essayPrompt = buildSectionPrompt(BASE_CFG, essaySection, false);
    expect(essayPrompt).toMatch(/Level 1/);
    expect(essayPrompt).toMatch(/Level 2/);
    expect(essayPrompt).toMatch(/Level 3/);

    const structuredPrompt = buildSectionPrompt(BASE_CFG, SECTIONS[1], false);
    expect(structuredPrompt).toMatch(/POINT-BY-POINT/);
  });

  it("skips marking-guide generation entirely when includeMarkingScheme is false", () => {
    const prompt = buildSectionPrompt({ ...BASE_CFG, includeMarkingScheme: false }, SECTIONS[1], false);
    expect(prompt).toMatch(/QUESTIONS ONLY/);
    expect(prompt).toContain('"markingGuide": ""');
    expect(prompt).not.toMatch(/Level 1/);
    expect(prompt).not.toMatch(/POINT-BY-POINT/);
  });
});

describe("validateExamData", () => {
  it("passes for a well-formed exam matching the requested structure", () => {
    const { ok, errors } = validateExamData(SAMPLE_EXAM, SECTIONS);
    expect(ok).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it("flags a missing section", () => {
    const broken = { ...SAMPLE_EXAM, sections: [SAMPLE_EXAM.sections[0]] };
    const { ok, errors } = validateExamData(broken, SECTIONS);
    expect(ok).toBe(false);
    expect(errors.some(e => e.includes("Section B"))).toBe(true);
  });

  it("flags a question-count mismatch (e.g. truncated AI output)", () => {
    const broken = JSON.parse(JSON.stringify(SAMPLE_EXAM));
    broken.sections[0].questions = broken.sections[0].questions.slice(0, 3); // 3 instead of 5
    const { ok, errors } = validateExamData(broken, SECTIONS);
    expect(ok).toBe(false);
    expect(errors[0]).toMatch(/expected 5.*got 3/);
  });

  it("flags a section whose question marks don't sum to the declared total", () => {
    const broken = JSON.parse(JSON.stringify(SAMPLE_EXAM));
    broken.sections[0].questions[0].marks = 3; // was 1 — section A total is now 7, not 5
    const { ok, errors } = validateExamData(broken, SECTIONS);
    expect(ok).toBe(false);
    expect(errors.some(e => e.includes("marks don't add up"))).toBe(true);
  });

  it("flags a question whose parts don't sum to its own mark total", () => {
    const broken = JSON.parse(JSON.stringify(SAMPLE_EXAM));
    broken.sections[1].questions[0].parts[0].marks = 3; // parts now sum to 8, question still says 10
    const { ok, errors } = validateExamData(broken, SECTIONS);
    expect(ok).toBe(false);
    expect(errors.some(e => e.includes("parts don't sum to the question's mark total"))).toBe(true);
  });

  it("rejects an empty/unparsable response gracefully", () => {
    const { ok, errors } = validateExamData(null, SECTIONS);
    expect(ok).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("strips an unsafe SVG diagram in place rather than letting it reach the renderer", () => {
    const withBadSvg = JSON.parse(JSON.stringify(SAMPLE_EXAM));
    withBadSvg.sections[0].questions[0].diagram = {
      needed: true, description: "A triangle", generatable: true,
      svg: `<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>`,
    };
    validateExamData(withBadSvg, SECTIONS);
    expect(withBadSvg.sections[0].questions[0].diagram.svg).toBeNull();
    expect(withBadSvg.sections[0].questions[0].diagram.generatable).toBe(false);
  });
});

describe("isSafeGeneratedSVG", () => {
  it("accepts a clean, well-formed SVG", () => {
    expect(isSafeGeneratedSVG(`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40"/></svg>`)).toBe(true);
  });
  it("rejects a <script> tag", () => {
    expect(isSafeGeneratedSVG(`<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>`)).toBe(false);
  });
  it("rejects an inline event handler", () => {
    expect(isSafeGeneratedSVG(`<svg viewBox="0 0 10 10" onload="alert(1)"></svg>`)).toBe(false);
  });
  it("rejects an external http(s) image reference", () => {
    expect(isSafeGeneratedSVG(`<svg viewBox="0 0 10 10"><image href="https://evil.example/x.png"/></svg>`)).toBe(false);
  });
  it("rejects a non-svg string", () => {
    expect(isSafeGeneratedSVG(`<div>not svg</div>`)).toBe(false);
  });
  it("rejects an oversized payload", () => {
    expect(isSafeGeneratedSVG(`<svg>${"x".repeat(25000)}</svg>`)).toBe(false);
  });
});

describe("renderExamHTML", () => {
  it("renders the school name, subject, and every question number", () => {
    const html = renderExamHTML(SAMPLE_EXAM, { schoolName: "St. Mary's JHS", subject: "Mathematics", className: "JHS 2" }, "paper");
    // Uppercasing is CSS (text-transform), not applied to the raw HTML string.
    expect(html).toContain("St. Mary's JHS");
    expect(html).toContain("Mathematics");
    for (let i = 1; i <= 5; i++) expect(html).toContain(`data-qnum="${i}"`);
  });

  it("forces solid black / light-only printing regardless of viewer's dark mode", () => {
    const html = renderExamHTML(SAMPLE_EXAM, {}, "paper");
    expect(html).toContain("color-scheme: light only");
    expect(html).toContain("print-color-adjust:exact");
  });

  it("switches to landscape page size when requested", () => {
    const html = renderExamHTML(SAMPLE_EXAM, { landscape: true }, "paper");
    expect(html).toContain("size: A4 landscape");
  });

  it("renders the answer key and marking scheme in answerKey mode", () => {
    const html = renderExamHTML(SAMPLE_EXAM, {}, "answerKey");
    expect(html).toContain("ANSWER KEY");
    expect(html).toContain("MARKING SCHEME");
    expect(html).toContain("x=2; x=3.");
  });

  it("escapes HTML in question text to prevent injection from AI output", () => {
    const malicious = JSON.parse(JSON.stringify(SAMPLE_EXAM));
    malicious.sections[0].questions[0].text = `<img src=x onerror=alert(1)>`;
    const html = renderExamHTML(malicious, {}, "paper");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img");
  });

  it("uses an uploaded diagram image over a placeholder when provided", () => {
    const withDiagram = JSON.parse(JSON.stringify(SAMPLE_EXAM));
    withDiagram.sections[0].questions[0].diagram = { needed: true, description: "A triangle", generatable: false, svg: null };
    const html = renderExamHTML(withDiagram, { diagramImages: { 1: "data:image/png;base64,abc123" } }, "paper");
    expect(html).toContain("data:image/png;base64,abc123");
  });

  it("falls back to a text placeholder when no image or SVG is available", () => {
    const withDiagram = JSON.parse(JSON.stringify(SAMPLE_EXAM));
    withDiagram.sections[0].questions[0].diagram = { needed: true, description: "A labelled plant cell", generatable: false, svg: null };
    const html = renderExamHTML(withDiagram, {}, "paper");
    expect(html).toContain("DIAGRAM: A labelled plant cell");
  });

  it("renders a school logo and version tag in the header when provided", () => {
    const html = renderExamHTML(SAMPLE_EXAM, { schoolLogo: "data:image/png;base64,abc", examVersion: "B" }, "paper");
    expect(html).toContain("data:image/png;base64,abc");
    expect(html).toContain("VERSION B");
  });

  it("shows a friendly explanation instead of a marking scheme when none was generated", () => {
    const questionsOnlyExam = JSON.parse(JSON.stringify(SAMPLE_EXAM));
    questionsOnlyExam.answerKey = [];
    questionsOnlyExam.sections.forEach(s => s.questions.forEach(q => { q.markingGuide = ""; }));
    const html = renderExamHTML(questionsOnlyExam, {}, "answerKey");
    expect(html).toMatch(/Questions Only/);
    expect(html).not.toContain("ANSWER KEY</h2>"); // no answer-key heading when there's nothing to show
  });
});

describe("createExamVariant", () => {
  it("renumbers questions sequentially within each section after shuffling", () => {
    const variant = createExamVariant(SAMPLE_EXAM, "B");
    variant.sections.forEach(s => {
      s.questions.forEach((q, i) => expect(q.number).toBe(i + 1));
    });
  });

  it("preserves the exact same set of question content, just reordered", () => {
    const variant = createExamVariant(SAMPLE_EXAM, "B");
    const originalTexts = SAMPLE_EXAM.sections[0].questions.map(q => q.text).sort();
    const variantTexts = variant.sections[0].questions.map(q => q.text).sort();
    expect(variantTexts).toEqual(originalTexts);
  });

  it("shuffles MCQ option order but keeps the correct answer's TEXT correct after remapping", () => {
    const variant = createExamVariant(SAMPLE_EXAM, "B");
    variant.sections[0].questions.forEach((q) => {
      const original = SAMPLE_EXAM.sections[0].questions.find(orig => orig.text === q.text);
      const originalCorrectText = original.options[["A", "B", "C", "D"].indexOf(original.correctOption)];
      const newCorrectText = q.options[["A", "B", "C", "D"].indexOf(q.correctOption)];
      expect(newCorrectText).toBe(originalCorrectText);
    });
  });

  it("rebuilds the answer key to match the new question numbers/letters", () => {
    const variant = createExamVariant(SAMPLE_EXAM, "B");
    expect(variant.answerKey.length).toBe(5); // 5 objective questions in SAMPLE_EXAM
    variant.answerKey.forEach(k => expect(k.number).toBeGreaterThanOrEqual(1));
  });

  it("is deterministic — the same seed always produces the same shuffle", () => {
    const v1 = createExamVariant(SAMPLE_EXAM, "B");
    const v2 = createExamVariant(SAMPLE_EXAM, "B");
    expect(v1.sections[0].questions.map(q => q.text)).toEqual(v2.sections[0].questions.map(q => q.text));
  });

  it("produces a different order for a different seed (in practice, for this fixture)", () => {
    const vB = createExamVariant(SAMPLE_EXAM, "B");
    const vC = createExamVariant(SAMPLE_EXAM, "C");
    const sameOrder = vB.sections[0].questions.every((q, i) => q.text === vC.sections[0].questions[i].text);
    expect(sameOrder).toBe(false);
  });

  it("does not mutate the original examData", () => {
    const before = JSON.stringify(SAMPLE_EXAM);
    createExamVariant(SAMPLE_EXAM, "B");
    expect(JSON.stringify(SAMPLE_EXAM)).toBe(before);
  });
});
