import { describe, it, expect } from "vitest";
import fs from "fs";
import JSZip from "jszip";
import { splitMath, hasMath, parseLatex, isValidLatex, latexToMathML, latexToPlain, stripMath, latexToOmml, protectMath, restoreMath, textWithMathToHtml } from "../src/mathText.js";
import { repairLatexJson } from "../functions/_shared/mathJson.js";
import { mathRulesBlock, subjectUsesMath } from "../src/mathPrompt.js";
import { renderExamHTML, buildSectionPrompt } from "../src/examTemplate.js";
import { generateExamDocx } from "../src/examDocx.js";
import { insertMath } from "../src/components/MathField.jsx";

describe("finding maths in text", () => {
  it("splits inline and display maths", () => {
    expect(splitMath("Solve $x^2$ now")).toEqual([{ text: "Solve " }, { math: "x^2", display: false }, { text: " now" }]);
    expect(splitMath("A $$\\frac{a}{b}$$ B")[1]).toEqual({ math: "\\frac{a}{b}", display: true });
  });
  it("never treats money as maths", () => {
    expect(hasMath("It costs $5 and $10 in total")).toBe(false);
    expect(hasMath("Pay $ 5 now")).toBe(false);
    expect(splitMath("price \\$7")).toEqual([{ text: "price $7" }]);
    expect(hasMath("GH¢50 and $x$")).toBe(true);
  });
  it("does not run across lines", () => { expect(hasMath("a $x\ny$ b")).toBe(false); });
});

describe("parser and emitters", () => {
  const ok = ["\\frac{3x^{2}}{6x}", "\\sqrt[3]{27}", "\\sum_{i=1}^{n} i^2", "\\int_0^1 x^2\\,dx", "\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}",
    "\\left(\\frac{a}{b}\\right)^2", "\\lim_{x\\to 0}\\frac{\\sin x}{x}", "\\overline{AB}", "\\mathrm{H_{2}SO_{4}}", "10^-3", "\\binom{n}{r}",
    "\\begin{cases}x&x>0\\\\-x&x<0\\end{cases}", "12,500", "\\text{cm}^{2}"];
  it.each(ok)("parses %s without errors", (t) => { expect(parseLatex(t).errors).toBe(0); });
  it("flags typos but never throws", () => {
    for (const bad of ["\\frac{1", "\\foo{x}", "x^{2", "}", "\\begin{pmatrix}1&2", "\\left(x", "^", "_"]) {
      expect(() => { latexToMathML(bad); latexToPlain(bad); latexToOmml(bad); }).not.toThrow();
    }
    expect(isValidLatex("\\frac{1")).toBe(false);
    expect(isValidLatex("x^2")).toBe(true);
  });
  it("is bounded: huge or deeply nested input cannot hang", () => {
    expect(latexToMathML("x".repeat(5000))).toBeNull();
    const deep = "{".repeat(200) + "x" + "}".repeat(200);
    expect(() => latexToMathML(deep)).not.toThrow();
  });
  it("MathML escapes everything: no markup can be injected", () => {
    const m = latexToMathML("a<b \\text{<script>alert(1)</script>}");
    expect(m).not.toContain("<script>");
    expect(m).toContain("&lt;script&gt;");
  });
  it("produces expected structures", () => {
    expect(latexToMathML("\\frac{1}{2}")).toContain("<mfrac>");
    expect(latexToMathML("\\sqrt{x}")).toContain("<msqrt>");
    expect(latexToMathML("x^2_1")).toContain("<msubsup>");
    expect(latexToMathML("\\begin{pmatrix}1&2\\end{pmatrix}")).toContain("<mtable");
    expect(JSON.stringify(latexToOmml("\\frac{1}{2}"))).toContain("m:f");
    expect(JSON.stringify(latexToOmml("\\sqrt[3]{x}"))).not.toContain("degHide");
  });
  it("keeps the space in \\text{ cm}", () => { expect(latexToMathML("7\\text{ cm}")).toContain("\u00A0cm"); });
  it("plain-text fallback is readable", () => {
    expect(latexToPlain("\\frac{3x^{2}}{6x}")).toBe("(3x²)/(6x)");
    expect(latexToPlain("10^-3")).toBe("10⁻³");
    expect(stripMath("Find $\\sqrt{49}$ and $x^{2}$.")).toBe("Find √49 and x².");
  });
});

describe("placeholders for the HTML pipeline", () => {
  it("round-trips maths through escaping untouched", () => {
    const { text, items } = protectMath("a < b and $x<y$ & _word_");
    expect(items).toHaveLength(1);
    const html = restoreMath(text.replace(/&/g, "&amp;").replace(/</g, "&lt;"), items);
    expect(html).toContain("&lt; b and <math");
    expect(html).toContain("<mo>&lt;</mo>");
  });
  it("live preview helper escapes plain text", () => {
    expect(textWithMathToHtml("<b>$x$</b>")).toContain("&lt;b&gt;");
  });
});

describe("JSON repair for LaTeX from the model", () => {
  const parse = (raw) => JSON.parse(repairLatexJson(raw));
  it("accepts single-backslash LaTeX that would otherwise break or corrupt JSON", () => {
    const raw = '{"t":"Find $\\frac{1}{2}\\times 3 \\theta \\neq \\sqrt{x}$, then $\\{1,2\\}$ and $a\\,b$"}';
    expect(() => JSON.parse(raw)).toThrow();
    expect(parse(raw).t).toBe("Find $\\frac{1}{2}\\times 3 \\theta \\neq \\sqrt{x}$, then $\\{1,2\\}$ and $a\\,b$");
  });
  it("leaves correctly escaped JSON alone", () => {
    const good = JSON.stringify({ t: "Line1\nLine2 \"q\" $\\frac{1}{2}$ \\ \u00e9 tab\there" });
    expect(repairLatexJson(good)).toBe(good);
    expect(JSON.parse(repairLatexJson(good))).toEqual(JSON.parse(good));
  });
  it("keeps real newlines, even before words starting with n/t/r/b/f", () => {
    expect(parse('{"t":"a\\nnext\\nfinal\\ntotal\\nbeta\\nright"}').t).toBe("a\nnext\nfinal\ntotal\nbeta\nright");
  });
  it("handles \\right, \\to, \\beta, \\text, \\bar, \\nu", () => {
    expect(parse('{"t":"$\\left(x\\right) \\to \\beta \\text{m} \\bar{x} \\nu$"}').t).toBe("$\\left(x\\right) \\to \\beta \\text{m} \\bar{x} \\nu$");
  });
});

describe("JSON repair: it must never damage text that was already correct", () => {
  it("lettered and numbered lists after a newline are untouched (\\ne. \\ni. \\nu. are NOT LaTeX outside maths)", () => {
    const text = "a. one\nb. two\nc. three\nd. four\ne. five\ni. six\nu. seven\nnot this\n\tan example\tto finish";
    const json = JSON.stringify({ t: text });
    expect(repairLatexJson(json)).toBe(json);
    // and the same words written as an unescaped LaTeX command INSIDE maths are repaired
    const raw = '{"t":"$\\tan x$ then $x \\to 0$ and $\\nu\\ne 1$"}';
    expect(JSON.parse(repairLatexJson(raw)).t).toBe("$\\tan x$ then $x \\to 0$ and $\\nu\\ne 1$");
  });
  it("money does not confuse it", () => {
    expect(JSON.parse(repairLatexJson('{"t":"costs $5 then $x \\to 0$"}')).t).toBe("costs $5 then $x \\to 0$");
    expect(JSON.parse(repairLatexJson('{"t":"price \\$7 and $\\tan x$"}')).t).toBe("price \\$7 and $\\tan x$");
  });
  it("is the identity on 6000 random strings of ordinary text (seeded)", () => {
    let seed = 987654321; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const POOL = ["a", "e.", "i.", "u.", "n", "t", "r", "f", "b", " ", " ", "\n", "\t ", "\r ", '"', "\\", "GH¢", "\u00e9", "\u2014", ".", "/", "(a)", "(ii)", "to", "an", "ne", "nu", "text", "times", "right", "beta"];
    for (let i = 0; i < 6000; i++) {
      const obj = { a: Array.from({ length: 12 }, () => POOL[Math.floor(rnd() * POOL.length)]).join(""), list: ["x", "y\nz"] };
      const json = JSON.stringify(obj);
      expect(JSON.parse(repairLatexJson(json))).toEqual(obj);
    }
  });
  it("is the identity on already-correct JSON that contains maths", () => {
    const json = JSON.stringify({ t: "Find $\\frac{1}{2}\\times\\tan\\theta\\to\\nu$ now\nand $\\neq$" });
    expect(repairLatexJson(json)).toBe(json);
  });
  it("repairs EVERY supported command when the model forgets to double the backslash", () => {
    const cmds = ("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega " +
      "times div pm mp cdot cup cap leq le geq ge neq ne approx equiv sim cong propto ll gg in notin ni subset subseteq supset to rightarrow leftarrow leftrightarrow Rightarrow Leftarrow Leftrightarrow mapsto " +
      "infty partial nabla angle triangle emptyset forall exists neg degree prime ldots cdots sin cos tan cot sec csc log ln exp lim sum prod int frac dfrac tfrac binom sqrt text mathrm mathbf mathbb " +
      "left right begin end overline bar hat vec tilde dot underline langle rangle quad qquad therefore because perp parallel ").split(" ").filter(Boolean);
    for (const c of cmds) {
      const arg = ["frac", "dfrac", "tfrac", "binom"].includes(c) ? "{1}{2}" : ["sqrt", "text", "mathrm", "mathbf", "mathbb", "overline", "bar", "hat", "vec", "tilde", "dot", "underline"].includes(c) ? "{x}" : c === "left" ? "( x \\right)" : c === "begin" ? "{pmatrix}1&2\\end{pmatrix}" : c === "end" || c === "right" ? "" : " ";
      if (c === "end" || c === "right") continue;                         // only meaningful paired with \\left / \\begin, covered above
      const tex = `x \\${c}${arg} y`;
      const raw = `{"t":"$${tex}$"}`;
      expect(JSON.parse(repairLatexJson(raw)).t, c).toBe(`$${tex}$`);
    }
  });
});

describe("prompt rules", () => {
  it("only maths-heavy subjects get the notation block", () => {
    expect(subjectUsesMath("Integrated Science")).toBe(true);
    expect(subjectUsesMath("Elective Mathematics")).toBe(true);
    expect(subjectUsesMath("English Language")).toBe(false);
    expect(mathRulesBlock({ subject: "History" })).toBe("");
    expect(mathRulesBlock({ subject: "Mathematics" })).toContain("LaTeX");
  });
  it("is in the section prompt for Maths and absent for History", () => {
    const base = { schoolName: "S", className: "JHS 2", term: "T1", examType: "Test", durationMinutes: 60, topics: ["x"], difficulty: "Moderate", languageStyle: "Balanced", cognitiveLevels: ["Recall"], allowDiagrams: false, includeMarkingScheme: true };
    const sec = { id: "A", label: "A", type: "objective", questionCount: 2, marksPerQuestion: 1 };
    expect(buildSectionPrompt({ ...base, subject: "Mathematics" }, sec, true)).toContain("MATH NOTATION");
    expect(buildSectionPrompt({ ...base, subject: "History" }, sec, true)).not.toContain("MATH NOTATION");
  });
  it("server copy of the math prompt is identical to the client copy", () => {
    const a = fs.readFileSync(new URL("../src/mathPrompt.js", import.meta.url), "utf8");
    const b = fs.readFileSync(new URL("../functions/_shared/mathPrompt.js", import.meta.url), "utf8");
    expect(b).toBe(a);
  });
});

const EXAM = {
  title: "T", instructions: ["Do."], answerKey: [{ number: 1, answer: "B" }],
  sections: [
    { id: "A", label: "Section A", type: "objective", instructions: "Pick.", questions: [
      { number: 1, text: "Simplify $\\frac{3x^{2}}{6x}$ for GH¢5 or $5 and $10.", options: ["$\\frac{x}{2}$", "$2x$", "c", "d"], correctOption: "B", parts: [], marks: 1, diagram: null, cognitiveLevel: "Recall", markingGuide: "Because $x=\\sqrt{4}$" },
    ] },
    { id: "B", label: "Section B", type: "structured", instructions: "Do.", questions: [
      { number: 1, text: "Solve.", options: null, correctOption: null, parts: [{ label: "a", text: "Find $\\det A$ for $A=\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$.", marks: 5, subparts: [] }], marks: 5, diagram: null, cognitiveLevel: "Application", markingGuide: "$x=\\sqrt{4}$ so $-2$" },
    ] },
  ],
};
const META = { schoolName: "S", className: "SHS 1", subject: "Mathematics", term: "T1", examType: "Test", durationMinutes: 60 };

describe("print / preview HTML", () => {
  it("paper mode draws question maths as MathML, money stays text", () => {
    const html = renderExamHTML(EXAM, META, "paper");
    expect(html).toContain("<mfrac>");
    expect(html).toContain("<mtable");
    expect(html).not.toContain("$\\frac");
    expect(html).toContain("$5 and $10");
  });
  it("marking scheme draws the maths in the marking guide", () => {
    const html = renderExamHTML(EXAM, META, "answerKey");
    expect(html).toContain("<msqrt>");
    expect(html).not.toContain("$x=\\sqrt");
  });
  it("works in BECE and WASSCE styles too", () => {
    for (const style of ["bece", "wassce"]) {
      const html = renderExamHTML({ ...EXAM, style }, { ...META, className: style === "bece" ? "Basic 9" : "SHS 3" }, "paper");
      expect(html).toContain("<mfrac>");
    }
  });
});

describe("Word export", () => {
  it.each(["paper", "answerKey"])("embeds native Word equations (%s)", async (mode) => {
    const blob = await generateExamDocx(EXAM, META, mode);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file("word/document.xml").async("string");
    expect(xml).toContain("<m:oMath>");
    expect(xml).not.toMatch(/\$\\frac/);
    if (mode === "paper") { expect(xml).toContain("<m:f>"); expect(xml).toContain("<m:m>"); expect(xml).toContain("$5 and $10"); }
    expect(new DOMParserLike(xml).ok).toBe(true);
  });
});
// tiny well-formedness check without a DOM dependency
class DOMParserLike { constructor(x) { const tags = []; this.ok = true; for (const m of x.matchAll(/<(\/?)([A-Za-z0-9:_-]+)[^>]*?(\/?)>/g)) { if (m[3] || m[0].startsWith("<?")) continue; if (m[1]) { if (tags.pop() !== m[2]) { this.ok = false; break; } } else tags.push(m[2]); } if (tags.length) this.ok = false; } }

describe("regressions found by fuzzing", () => {
  it("nested square roots cannot freeze the page (plain-text conversion was exponential: 6+ seconds at 600 characters)", () => {
    const deep = "\\sqrt{".repeat(80) + "x" + "}".repeat(80);
    const t0 = performance.now();
    latexToMathML(deep); latexToPlain(deep); latexToOmml(deep);
    expect(performance.now() - t0).toBeLessThan(500);
    const roots = "\\sqrt[3]{".repeat(40) + "x" + "}".repeat(40);
    const t1 = performance.now();
    latexToPlain(roots);
    expect(performance.now() - t1).toBeLessThan(500);
  });
  it("control characters and lone surrogates cannot corrupt the Word file (plain text AND equations)", async () => {
    const bell = "\u0007", lone = "\uD83D";
    const exam = { title: `T${bell}`, instructions: [`I${bell}`], answerKey: [], sections: [{ id: "A", label: `A${bell}`, type: "objective", instructions: `i${bell}`, questions: [
      { number: 1, text: `Plain${bell} text ${lone} and $x${bell}^2$ ok \uD83D\uDE00`, options: [`$\\frac{1}{${bell}2}$`, "b", "c", "d"], correctOption: "A", parts: [], marks: 1, markingGuide: `g${bell} $\\sqrt{${lone}x}$` }] }] };
    for (const mode of ["paper", "answerKey"]) {
      const blob = await generateExamDocx(exam, { schoolName: `Sch${bell}ool`, className: "SHS 1", subject: `Ma${bell}ths`, term: "T", examType: "Test", durationMinutes: 60 }, mode);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      for (const name of Object.keys(zip.files).filter(n => /^word\/.*\.xml$/.test(n))) {
        const xml = await zip.file(name).async("string");
        expect(xml, `${mode}:${name}`).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
        expect(new DOMParserLike(xml).ok, `${mode}:${name}`).toBe(true);
      }
    }
  });
  it("the emoji (a valid surrogate PAIR) survives cleaning", async () => {
    const { cleanXmlText } = await import("../src/mathText.js");
    expect(cleanXmlText("a\u0007b \uD83D\uDE00 c\uD83D")).toBe("ab \uD83D\uDE00 c");
  });
});

describe("editor insert helper", () => {
  const frac = { tex: "\\frac{\u2038}{}" }, pow = { tex: "^{\u2038}", needsBase: true }, times = { tex: "\\times " };
  it("wraps a new formula in $...$ and puts the cursor in the first slot", () => {
    const r = insertMath("Simplify ", 9, 9, frac);
    expect(r.text).toBe("Simplify $\\frac{}{}$");
    expect(r.caret).toBe("Simplify $\\frac{".length);
  });
  it("uses the selected text as the content", () => {
    const r = insertMath("Find 3 now", 5, 6, frac);
    expect(r.text).toBe("Find $\\frac{3}{}$ now");
  });
  it("does not add a second pair of dollars inside maths", () => {
    const r = insertMath("A $x+$", 5, 5, times);
    expect(r.text).toBe("A $x+\\times $");
  });
  it("pulls the variable before the cursor in as the base of a power", () => {
    expect(insertMath("Solve for x", 11, 11, pow).text).toBe("Solve for $x^{}$");
    expect(insertMath("Solve", 5, 5, pow).text).toBe("Solve$x^{}$");
  });
});
