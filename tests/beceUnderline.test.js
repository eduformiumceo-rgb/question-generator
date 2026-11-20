import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderExamHTML } from "../src/examTemplate.js";
import { generateExamDocx } from "../src/examDocx.js";
import { getBeceProfile, beceSections, decorateBeceExam } from "../src/beceStyle.js";

const prof = getBeceProfile("English Language");
const secs = beceSections(prof).filter(s => s.paper === 1);
const exam = (texts, options = ["a", "b", "c", "d"]) => decorateBeceExam({ title: "x", answerKey: [], sections: [{ id: "OBJ", label: "x", type: "objective", questions: texts.map((t, i) => ({ number: i + 1, text: t, marks: 1, options, correctOption: "A" })) }] }, secs, prof, "Mock Exam");
const meta = { schoolName: "S", className: "Basic 9", subject: "English Language", term: "T", examType: "Mock Exam", durationMinutes: 60 };
const body = (h) => h.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");

describe("BECE underlined words (the English prompts ask for _word_)", () => {
  it("prints _word_ as an underline in questions and options", () => {
    const h = body(renderExamHTML(exam(["The manager _kept an eye on_ the workers."], ["_stress_ on", "b", "c", "d"]), meta, "paper"));
    expect(h).toContain("The manager <u>kept an eye on</u> the workers.");
    expect(h).toContain("<u>stress</u> on");
    expect(h).not.toMatch(/_kept an eye on_/);
  });
  it("leaves blanks, names with underscores and unmatched underscores alone", () => {
    const h = body(renderExamHTML(exam(["He ______ home. user_name and first_name stay. _a_b_ end_"]), meta, "paper"));
    expect(h).toContain("He ______ home. user_name and first_name stay. _a_b_ end_");
    expect(h).not.toMatch(/<u>/);
  });
  it("does not switch on WASSCE-only markup for BECE: **bold** and {{italic}} stay literal", () => {
    const h = body(renderExamHTML(exam(["**not bold** {{not italic}}"]), meta, "paper"));
    expect(h).toContain("**not bold** {{not italic}}");
  });
  it("Word export underlines the phrase too, with no literal underscores around it", async () => {
    const blob = await generateExamDocx(exam(["The manager _kept an eye on_ the workers."]), meta, "paper");
    const f = join(mkdtempSync(join(tmpdir(), "bece-")), "x.docx");
    writeFileSync(f, Buffer.from(await blob.arrayBuffer()));
    const xml = execSync(`unzip -p "${f}" word/document.xml`).toString();
    expect(xml).toMatch(/<w:u [^>]*\/><\/w:rPr><w:t[^>]*>kept an eye on<\/w:t>/);
    expect(xml).not.toContain("_kept an eye on_");
  });
});
