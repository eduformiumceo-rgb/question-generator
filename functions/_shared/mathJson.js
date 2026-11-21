/**
 * mathJson.js
 * ─────────────────────────────────────────────────────────────────
 * The model returns each exam section as JSON, and LaTeX is full of
 * backslashes. Inside a JSON string a single backslash is only legal
 * before  " \ / b f n r t u  - so the model writing  "$\frac{1}{2}$"  or
 * "$\times$"  either breaks JSON.parse outright ("\{", "\,", "\l") or is
 * silently read as a form-feed / tab / newline ("\f", "\t", "\n").
 *
 * repairLatexJson() runs on the raw text BEFORE JSON.parse and doubles the
 * backslash wherever it is really the start of a LaTeX command. It is a
 * no-op on text the model already escaped correctly ("\\frac" is skipped as
 * a pair), and it leaves genuine JSON escapes (\n newline, \" quote, \uXXXX)
 * alone.
 *
 * Only the five ambiguous letters (b f n r t) need a word list: those are
 * the real LaTeX commands that start with them. Everything else that is not
 * a legal JSON escape is doubled unconditionally. Short commands that are also
 * ordinary text after a newline (\\ne, \\nu, \\tan, \\to...) are only doubled inside $...$.
 * ─────────────────────────────────────────────────────────────────
 */

// Commands that cannot plausibly be ordinary text after a tab/newline/CR: doubled everywhere.
const LONG = [
  "bar", "beta", "begin", "binom", "because", "bigcup", "bigcap", "bigoplus", "bmatrix", "bullet", "boldsymbol",
  "frac", "forall", "flat",
  "neq", "nabla", "notin", "neg", "nolimits", "nsubseteq",
  "right", "rho", "rangle", "rightarrow", "rfloor", "rceil", "rbrace", "rvert", "rVert", "relax",
  "times", "theta", "tau", "text", "textbf", "textit", "textrm", "textnormal", "textsf", "therefore", "triangle", "tfrac", "tilde", "thinspace", "tbinom",
];
// Short commands that ARE ordinary text after a newline/tab ("\ne. fifth point" in a lettered list, "\tan" + " apple"):
// doubled only inside an open $...$, where real LaTeX always is.
const SHORT = ["ne", "nu", "ni", "not", "tan", "to", "top", "bm", "bot", "big", "bigg"];
const mk = (list) => new RegExp(`^(?:${[...list].sort((a, b) => b.length - a.length).join("|")})(?![A-Za-z])`);
const LONG_RE = mk(LONG), SHORT_RE = mk(SHORT);

export function repairLatexJson(raw) {
  const s = String(raw ?? "");
  if (!s.includes("\\")) return s;
  let out = "";
  let inStr = false;      // inside a JSON string?
  let mathOpen = false;   // inside an open $...$ of the current string?
  let afterBackslash = false;   // previous raw char was a backslash, so a "$" now is the escaped "\$" and not a delimiter
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { inStr = !inStr; if (inStr) mathOpen = false; out += c; afterBackslash = false; continue; }
    if (c === "$" && inStr) {
      if (!afterBackslash && !(!mathOpen && /[0-9]/.test(s[i + 1] ?? ""))) mathOpen = !mathOpen;   // "$5" is money, not maths
      out += c; afterBackslash = false; continue;
    }
    if (c !== "\\") { out += c; afterBackslash = false; continue; }
    const n = s[i + 1];
    afterBackslash = true;
    if (n === undefined) { out += "\\\\"; continue; }
    if (n === "\\" || n === "/") { out += c + n; i++; continue; }          // already a valid pair
    if (n === '"') { out += c + n; i++; afterBackslash = false; continue; }
    if (n === "u" && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) { out += c; afterBackslash = false; continue; }   // \uXXXX
    if ("bfnrt".includes(n)) {
      const rest = s.slice(i + 1, i + 24);
      const isLatex = LONG_RE.test(rest) || (mathOpen && SHORT_RE.test(rest));
      out += isLatex ? "\\\\" : c;                                          // LaTeX command vs real JSON escape
      afterBackslash = !isLatex ? false : true;
      continue;
    }
    out += "\\\\";                                                            // not a JSON escape at all: must be LaTeX
  }
  return out;
}
