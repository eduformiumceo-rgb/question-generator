/**
 * mathPrompt.js
 * ─────────────────────────────────────────────────────────────────
 * The notation rules given to the AI so equations come back as LaTeX in
 * $...$ (see mathText.js for how they are drawn). Only added to the prompt
 * for subjects that actually use formulas, to save output tokens elsewhere.
 *
 * Duplicated (not imported) into functions/_shared/mathPrompt.js for the
 * same bundler-boundary reason as examPrompt.js. Keep both files identical;
 * tests/math.test.js fails if they drift.
 * ─────────────────────────────────────────────────────────────────
 */

const MATHY = /math|science|physics|chemistry|biology|computing|ict|technology|engineering|economics|accounting|statistic|geometry|robotics|aviation|electric|agricultur|food|nutrition|textile/i;

/** True when the subject is likely to need formulas, equations or symbols. */
export const subjectUsesMath = (subject = "") => MATHY.test(String(subject));

export function mathRulesBlock(cfg = {}) {
  if (!subjectUsesMath(cfg.subject)) return "";
  return `
MATH NOTATION (this subject uses formulas and symbols)
- Write every equation, formula, fraction, root, power, subscript, Greek letter and maths symbol as LaTeX between single dollar signs: $\\frac{3}{4}$, $x^{2}+5x-6=0$, $\\sqrt{49}$, $\\theta=30^{\\circ}$, $a\\times b$, $\\pi r^{2}$, $x\\leq 5$.
- Chemical formulas and units: $\\mathrm{H_{2}SO_{4}}$, $\\mathrm{CO_{2}}$, $12\\text{ cm}^{2}$, $9.8\\text{ m/s}^{2}$.
- Plain words and plain whole numbers stay outside the dollar signs. Never put a whole sentence inside $...$.
- Keep each expression on one line. Use only standard LaTeX commands (\\frac, \\sqrt, ^, _, \\times, \\div, \\pm, \\leq, \\geq, \\neq, \\approx, \\pi, \\theta, \\alpha, \\beta, \\Delta, \\sum, \\int, \\sin, \\cos, \\tan, \\log, \\vec, \\overline, \\angle, \\triangle, \\begin{pmatrix} for matrices).
- Money is written GH¢50 or GH¢1,200.00, never with a dollar sign. If a literal dollar sign is truly needed, write \\$.
- Inside the JSON, every backslash must be doubled (write \\\\frac, not \\frac).
- Options for objective questions follow the same rules: an option that is a fraction or expression is written like $\\frac{1}{2}$, with no letter prefix.
`;
}
