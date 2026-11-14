import { describe, it, expect } from "vitest";
import { buildSectionPrompt as srcPrompt } from "../src/examTemplate.js";
import { buildSectionPrompt as serverPrompt } from "../functions/_shared/examPrompt.js";
import { DIAGRAM_GUIDE } from "../functions/_shared/diagramGuide.js";
import { diagramGuideText } from "../src/diagramRegistry.js";

const CFG = { schoolName: "S", className: "JHS 2", subject: "Mathematics", term: "Term 1", examType: "Class Test", durationMinutes: 60, topics: ["Geometry"], pastedSyllabus: "", difficulty: "Moderate", languageStyle: "Balanced", cognitiveLevels: ["Recall"], allowDiagrams: true, includeMarkingScheme: true };
const SEC = { id: "B", label: "Section B", type: "structured", questionCount: 2, marksPerQuestion: 10 };

describe("server prompt stays in sync with the client prompt", () => {
  it("the diagram guide copy is current (run `npm run sync:diagrams` if this fails)", () => {
    expect(DIAGRAM_GUIDE).toBe(diagramGuideText());
  });
  it.each([[true, true], [false, false]])("section prompt is identical (first=%s)", (first) => {
    for (const allowDiagrams of [true, false]) {
      expect(serverPrompt({ ...CFG, allowDiagrams }, SEC, first)).toBe(srcPrompt({ ...CFG, allowDiagrams }, SEC, first));
    }
  });
});
