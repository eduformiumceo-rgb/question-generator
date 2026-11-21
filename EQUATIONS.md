# Equation support (new in v6)

Maths is written as LaTeX between single dollar signs anywhere in a question, option, part or marking guide:
`Simplify $\frac{3x^{2}}{6x}$`. Money is never maths: `$5 and $10` stays text; write a literal dollar as `\$`.

| Piece | File |
|---|---|
| Parser + MathML / Word (OMML) / plain-text output | `src/mathText.js` |
| Print, preview, PDF (MathML) | `src/examTemplate.js` (`nl`, `inl` wrapped with `withMath`) |
| Word export (native, editable equations) | `src/examDocx.js` (`textRuns`, `plainRuns`) |
| AI notation rules (maths-type subjects only) | `src/mathPrompt.js` = `functions/_shared/mathPrompt.js` (keep identical; a test checks) |
| Fixes LaTeX backslashes breaking the AI's JSON | `functions/_shared/mathJson.js`, used by `extractJSON` |
| Editor toolbar + live preview | `src/components/MathField.jsx`, `MathText.jsx` |
| Tests | `tests/math.test.js`, `tests/mathField.test.jsx` |

# Added in v7

| Feature | Files |
|---|---|
| Paper check (answer key, marks, duplicates, answer-letter bias, formulas) + one-click fixes | `src/paperAudit.js`, `src/components/PaperAudit.jsx` |
| Table of Specification (topic x thinking level), in the app and in the printed/Word marking scheme | `src/tableOfSpec.js`, `examTemplate.js`, `examDocx.js` |
| `topic` tag on every AI question | both prompt copies |
| Replace ONE question (0.1 credit, refunded on failure; standard papers) | `functions/api/generate-exam.js` (mode `regenerate-question`), `src/regenerateQuestion.js`, `src/components/ReplaceQuestion.jsx`, `src/regenPrompt.js` = `functions/_shared/regenPrompt.js` |
| Tests | `tests/paperAudit*.test.js*`, `tests/regenerate.test.js`, `tests/replaceQuestion.test.jsx` |

# Bug-hunt notes (v8)

Found and fixed by stress-testing (30,000 random formulas, 30,000 random JSON strings, hostile characters through the real .docx export, a real browser on desktop and phone):

1. **Word file corrupt from one stray control character** (older bug, also hit plain text): `generateExamDocx` now cleans every string (`cleanXmlDeep`).
2. **Nested square roots froze the page** (6+ seconds at 600 characters): plain-text conversion was exponential.
3. **JSON repair could rewrite correct text**: a lettered list line `e. ...` after a newline became the LaTeX command `\ne`. Short ambiguous commands (`\ne \nu \ni \not \tan \to \top`) are now only repaired inside `$...$`.
4. **Replace question had no rate limit** (free tier could call the AI without limit): 12 per 10 minutes, 40/day free, 200/day premium; every attempt is logged first; does not count toward the exam-generation limits.
5. Duplicate HTML ids in the replace box; "avoid" list ignored multi-part question text; "Application of knowledge" was read as Recall; ambiguous "Question 1" messages; options too narrow for formulas on phones; option letter circles misaligned.

Known limits (cannot be fully solved):
- JSON repair: an UNCLOSED `$` followed by a newline and a lone letter (`$\nu` vs newline + "u") is ambiguous. A real tab/CR glued to `au`, `ext`, `imes`... reads as LaTeX.
- If the model ignores the "double every backslash" rule, a matrix row break `\\` is lost (it is valid JSON by itself).
- Equations on screen use MathML: Chrome/Edge 109+, current Safari/Firefox.
- Replace question: standard papers only (BECE/WASSCE regenerate the section).
- Not yet tested against the live AI provider or in Microsoft Word itself.
