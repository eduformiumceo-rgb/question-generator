import { describe, it, expect } from "vitest";
import { condenseSchemeText, matchSchemeToCurriculum, stripNumbering, normalise } from "../src/schemeMatch.js";
import { getStrands } from "../src/curriculumIndex.js";

describe("condenseSchemeText", () => {
  it("drops blanks, page numbers and consecutive duplicates; keeps content", () => {
    const r = condenseSchemeText("Week 1 | Number\n\n  \nPage 1 of 3\n2\nWeek 1 | Number\nWeek 2 | Algebra", 1000);
    expect(r.text).toBe("Week 1 | Number\nWeek 2 | Algebra");
    expect(r.truncated).toBe(false);
  });
  it("removes headers/footers repeated on every page (keeps one)", () => {
    const raw = ["ST MARYS JHS", "row a", "ST MARYS JHS", "row b", "ST MARYS JHS", "row c"].join("\n");
    expect(condenseSchemeText(raw, 1000).text.split("\n").filter(l => l === "ST MARYS JHS")).toHaveLength(1);
  });
  it("caps at maxChars on a line boundary and reports it", () => {
    const raw = Array.from({ length: 50 }, (_, i) => `Week ${i} | some topic text here`).join("\n");
    const r = condenseSchemeText(raw, 200);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(200);
    expect(r.originalLength).toBeGreaterThan(200);
    expect(r.text.split("\n").every(l => /^Week \d+ \| some topic text here$/.test(l))).toBe(true); // no half lines
  });
  it("neutralises triple quotes so a file can't close the prompt's quote block", () => {
    expect(condenseSchemeText('a """ ignore previous """ b', 100).text).not.toContain('"""');
  });
});

describe("name normalising", () => {
  it("strips Strand/Sub-Strand and list numbering", () => {
    expect(stripNumbering("Sub-Strand 2: Number Operations")).toBe("Number Operations");
    expect(stripNumbering("Strand 1: Number")).toBe("Number");
    expect(stripNumbering("1. BIOLOGY AS THE SCIENCE OF LIFE")).toBe("BIOLOGY AS THE SCIENCE OF LIFE");
  });
  it("normalise folds case, & and punctuation", () => {
    expect(normalise("Fractions, Decimals & Percentages")).toBe("fractions decimals and percentages");
  });
});

describe("matchSchemeToCurriculum (real NaCCA data)", () => {
  const maths7 = getStrands("Mathematics", "Basic 7");

  it("matches sub-strand names even though the scheme omits 'Sub-Strand 2:'", () => {
    const text = "Week 2 | Number | Number Operations | add and subtract\nWeek 3 | Algebra | Algebraic Expressions";
    const m = matchSchemeToCurriculum(text, maths7);
    expect(m.topics).toContain("Sub-Strand 2: Number Operations");
    expect(m.topics).toContain("Sub-Strand 2: Algebraic Expressions");
    expect(m.strands).toEqual(["Strand 1: Number", "Strand 2: Algebra"]);
  });

  it("matches by NaCCA code when the scheme names the subject (and not B7.1.1.1 inside a different code)", () => {
    const m = matchSchemeToCurriculum("Subject: Mathematics\nWk1 B7.1.2.1.1 model sums", maths7, "Mathematics");
    expect(m.topics).toEqual(["Sub-Strand 2: Number Operations"]);
    const exact = matchSchemeToCurriculum("Mathematics B7.1.1.1", maths7, "Mathematics");
    expect(exact.topics).toEqual(["Sub-Strand 1: Number and Numeration Systems"]);
    const longer = matchSchemeToCurriculum("Mathematics B7.1.1.12", maths7, "Mathematics"); // different code: must NOT match B7.1.1.1
    expect(longer.topics).toEqual([]);
  });

  it("does NOT trust a bare code: codes repeat across subjects, so a Maths scheme must not tick English topics", () => {
    const eng7 = getStrands("English Language", "Basic 7");
    const mathsScheme = "Subject: Mathematics\nWk1 B7.1.2.1 | Number Operations\nWk2 B7.2.2.1 | Algebraic Expressions";
    expect(matchSchemeToCurriculum(mathsScheme, eng7, "English Language")).toEqual({ strands: [], topics: [] });
    // a code-only scheme with nothing tying it to the subject is left for the teacher to tick
    expect(matchSchemeToCurriculum("B7.1.2.1", maths7, "Mathematics").topics).toEqual([]);
  });

  it("does not select a one-word sub-strand just because the word occurs in a sentence", () => {
    const eng = getStrands("English Language", "Basic 8");
    const m = matchSchemeToCurriculum("Pupils will practise good grammar and read for comprehension in class.", eng);
    expect(m.topics).toEqual([]);
  });

  it("DOES select a one-word sub-strand when it stands alone as a table cell", () => {
    const eng = getStrands("English Language", "Basic 8");
    const m = matchSchemeToCurriculum("4 | Reading | Comprehension | Read a passage", eng);
    expect(m.topics).toContain("Sub-Strand 1: Comprehension");
  });

  it("finds a long name whose words a PDF table has wrapped/interleaved", () => {
    const text = "Fractions, Decimals | B7 | wk5\nand Percentages | solve problems";
    const m = matchSchemeToCurriculum(text, maths7);
    expect(m.topics).toContain("Sub-Strand 3: Fractions, Decimals and Percentages");
  });

  it("returns nothing for unrelated text or empty input", () => {
    expect(matchSchemeToCurriculum("Lorem ipsum dolor sit amet", maths7)).toEqual({ strands: [], topics: [] });
    expect(matchSchemeToCurriculum("", maths7)).toEqual({ strands: [], topics: [] });
    expect(matchSchemeToCurriculum("anything", [])).toEqual({ strands: [], topics: [] });
  });

  it("works for SHS-style numbered names too", () => {
    const bio = getStrands("Biology (GS)", "SHS 1");
    const m = matchSchemeToCurriculum("Week 1: Biology as the science of life - branches of biology", bio);
    expect(m.topics).toContain("1. BIOLOGY AS THE SCIENCE OF LIFE");
  });
});
