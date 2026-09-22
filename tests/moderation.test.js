import { describe, it, expect } from "vitest";
import { screenExamInput, MAX_SYLLABUS_CHARS, MAX_TOPICS } from "../src/moderation.js";

describe("screenExamInput", () => {
  it("passes normal, legitimate exam input", () => {
    const result = screenExamInput({
      schoolName: "Achimota School",
      pastedSyllabus: "Photosynthesis, respiration, and the carbon cycle.",
      topics: ["Cell Biology", "Genetics"],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a pasted syllabus over the character cap", () => {
    const result = screenExamInput({ pastedSyllabus: "x".repeat(MAX_SYLLABUS_CHARS + 1), topics: [] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too long/i);
  });

  it("rejects too many topics", () => {
    const topics = Array.from({ length: MAX_TOPICS + 1 }, (_, i) => `Topic ${i}`);
    const result = screenExamInput({ topics });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too many topics/i);
  });

  it("rejects an unreasonably long single topic", () => {
    const result = screenExamInput({ topics: ["x".repeat(200)] });
    expect(result.ok).toBe(false);
  });

  it("rejects a blocked pattern (weapon-instruction request) even if framed as a topic", () => {
    const result = screenExamInput({ topics: ["how to make a bomb at home"] });
    expect(result.ok).toBe(false);
  });

  it("does not false-positive on ordinary chemistry/biology topics", () => {
    const result = screenExamInput({ topics: ["Combustion Reactions", "The Human Reproductive System", "Explosive Volcanic Eruptions"] });
    expect(result.ok).toBe(true);
  });
});
