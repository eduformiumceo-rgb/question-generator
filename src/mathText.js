/**
 * mathText.js
 * ─────────────────────────────────────────────────────────────────
 * Equation support for exam papers.
 *
 * Teachers and the AI write maths as LaTeX between single dollar signs
 * inside any question text, option, part, or marking guide:
 *
 *     Simplify $\frac{3x^{2}}{6x}$ and find $\sqrt{49}$.
 *
 * One small parser (no dependencies) turns that LaTeX into a tree, and the
 * tree is written out three ways:
 *   - MathML   for the on-screen paper, print and PDF (browsers draw it natively)
 *   - OMML     for the Word export: real, editable Word equations, not pictures
 *   - plain    readable Unicode text, for places that cannot draw maths
 *
 * Safety: output is built only from whitelisted tags and every piece of text
 * is escaped, so a saved exam coming back from the database can never inject
 * markup. The parser never throws; bad input degrades to readable text.
 *
 * Dollar signs and money: Ghana papers use GH¢, but a stray "$" must not
 * swallow a sentence. A pair only counts as maths when the opening "$" is
 * followed by a non-space and the closing "$" is preceded by a non-space and
 * not followed by a digit (so "costs $5 and $10" stays plain text).
 * Write a literal dollar sign as \$.
 * ─────────────────────────────────────────────────────────────────
 */

const MAX_TEX = 600;
const MAX_DEPTH = 24;

/**
 * Characters XML 1.0 cannot contain: most control characters, U+FFFE/FFFF and unpaired surrogates.
 * One of these in a .docx makes Word report the whole file as corrupt, and they do turn up
 * in pasted text and odd AI output.
 */
const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
export const cleanXmlText = (s) => (typeof s === "string" ? s.replace(XML_BAD, "") : s);

/** Cleans every string inside plain objects/arrays (images, Blobs and other non-plain values are left alone). */
export function cleanXmlDeep(v) {
  if (typeof v === "string") return cleanXmlText(v);
  if (Array.isArray(v)) return v.map(cleanXmlDeep);
  if (v && typeof v === "object" && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)) {
    const o = {};
    for (const k of Object.keys(v)) o[k] = cleanXmlDeep(v[k]);
    return o;
  }
  return v;
}

const escXml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ── 1. Finding maths inside ordinary text ─────────────────────── */

/**
 * Splits text into [{ text } | { math, display }] pieces.
 * "\$" becomes a literal "$" inside the text pieces.
 */
export function splitMath(input) {
  const s = String(input ?? "");
  if (!s.includes("$")) return [{ text: s }];
  const out = [];
  let buf = "", i = 0;
  const flush = () => { if (buf) { out.push({ text: buf }); buf = ""; } };
  while (i < s.length) {
    const c = s[i];
    if (c === "\\" && s[i + 1] === "$") { buf += "$"; i += 2; continue; }
    if (c === "$") {
      if (s[i + 1] === "$") {
        const j = s.indexOf("$$", i + 2);
        const tex = j > i + 2 ? s.slice(i + 2, j) : "";
        if (tex.trim() && !tex.includes("\n")) { flush(); out.push({ math: tex.trim(), display: true }); i = j + 2; continue; }
        buf += "$$"; i += 2; continue;
      }
      const nx = s[i + 1];
      let found = -1;
      if (nx !== undefined && !/\s/.test(nx)) {
        for (let k = i + 1; k < s.length; k++) {
          const d = s[k];
          if (d === "\n") break;
          if (d === "\\") { k++; continue; }
          if (d === "$") {
            if (k > i + 1 && !/\s/.test(s[k - 1]) && !/[0-9]/.test(s[k + 1] ?? "")) found = k;
            break;
          }
        }
      }
      if (found > 0) { flush(); out.push({ math: s.slice(i + 1, found), display: false }); i = found + 1; continue; }
      buf += "$"; i++; continue;
    }
    buf += c; i++;
  }
  flush();
  return out;
}

export const hasMath = (text) => typeof text === "string" && text.includes("$") && splitMath(text).some(p => p.math !== undefined);

/* Placeholders let existing text pipelines (escaping, bold, underline) run
   untouched over a string whose maths has been swapped out for a token. */
const PH_OPEN = "\uE000", PH_CLOSE = "\uE001";

/** Replaces each maths piece with a placeholder. Returns { text, items }. */
export function protectMath(input) {
  const s = String(input ?? "").replace(/[\uE000\uE001]/g, "");
  if (!s.includes("$")) return { text: s, items: [] };
  const items = [];
  const text = splitMath(s).map(p => {
    if (p.math === undefined) return p.text;
    items.push({ tex: p.math, display: p.display });
    return `${PH_OPEN}${items.length - 1}${PH_CLOSE}`;
  }).join("");
  return { text, items };
}

/** Puts rendered maths back where the placeholders are. */
export function restoreMath(html, items) {
  if (!items || !items.length) return html;
  return String(html).replace(new RegExp(`${PH_OPEN}(\\d+)${PH_CLOSE}`, "g"), (_, n) => {
    const it = items[Number(n)];
    return it ? renderMathHtml(it.tex, it.display) : "";
  });
}

/** Wraps a text->html function so it understands maths. */
export const withMath = (fn) => (t, ...rest) => {
  const { text, items } = protectMath(t);
  return restoreMath(fn(text, ...rest), items);
};

/* ── 2. LaTeX -> tree ──────────────────────────────────────────── */

const GREEK = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ",
  iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", varrho: "ϱ", sigma: "σ", tau: "τ", upsilon: "υ",
  phi: "ϕ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
};
const GREEK_UP = {
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};
// binary operators and relations (k = kind)
const OPS = {
  times: ["×", "bin"], div: ["÷", "bin"], pm: ["±", "bin"], mp: ["∓", "bin"], cdot: ["⋅", "bin"], ast: ["∗", "bin"], circ: ["∘", "bin"],
  cup: ["∪", "bin"], cap: ["∩", "bin"], setminus: ["∖", "bin"], land: ["∧", "bin"], wedge: ["∧", "bin"], lor: ["∨", "bin"], vee: ["∨", "bin"],
  oplus: ["⊕", "bin"], otimes: ["⊗", "bin"],
  leq: ["≤", "rel"], le: ["≤", "rel"], geq: ["≥", "rel"], ge: ["≥", "rel"], neq: ["≠", "rel"], ne: ["≠", "rel"],
  approx: ["≈", "rel"], equiv: ["≡", "rel"], sim: ["∼", "rel"], simeq: ["≃", "rel"], cong: ["≅", "rel"], propto: ["∝", "rel"],
  ll: ["≪", "rel"], gg: ["≫", "rel"], in: ["∈", "rel"], notin: ["∉", "rel"], ni: ["∋", "rel"],
  subset: ["⊂", "rel"], subseteq: ["⊆", "rel"], supset: ["⊃", "rel"], supseteq: ["⊇", "rel"], nsubseteq: ["⊈", "rel"],
  to: ["→", "rel"], rightarrow: ["→", "rel"], leftarrow: ["←", "rel"], leftrightarrow: ["↔", "rel"], longrightarrow: ["⟶", "rel"],
  Rightarrow: ["⇒", "rel"], Leftarrow: ["⇐", "rel"], Leftrightarrow: ["⇔", "rel"], implies: ["⟹", "rel"], iff: ["⟺", "rel"], mapsto: ["↦", "rel"],
  uparrow: ["↑", "rel"], downarrow: ["↓", "rel"], parallel: ["∥", "rel"], perp: ["⊥", "rel"], mid: ["∣", "rel"],
  therefore: ["∴", "rel"], because: ["∵", "rel"], colon: [":", "punct"],
  lbrace: ["{", "open"], rbrace: ["}", "close"], langle: ["⟨", "open"], rangle: ["⟩", "close"],
  lfloor: ["⌊", "open"], rfloor: ["⌋", "close"], lceil: ["⌈", "open"], rceil: ["⌉", "close"],
  vert: ["|", "other"], lvert: ["|", "other"], rvert: ["|", "other"], Vert: ["‖", "other"], lVert: ["‖", "other"], rVert: ["‖", "other"],
};
// plain symbols (ordinary)
const ORD = {
  infty: "∞", partial: "∂", nabla: "∇", angle: "∠", triangle: "△", square: "□", emptyset: "∅", varnothing: "∅",
  forall: "∀", exists: "∃", neg: "¬", degree: "°", prime: "′", ell: "ℓ", hbar: "ℏ", aleph: "ℵ", Re: "ℜ", Im: "ℑ",
  ldots: "…", dots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱", dagger: "†", star: "⋆", bullet: "•", checkmark: "✓",
  measuredangle: "∡", sphericalangle: "∢", top: "⊤", bot: "⊥", wp: "℘",
};
const FUNCS = new Set(["sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "coth",
  "log", "ln", "lg", "exp", "det", "min", "max", "gcd", "lcm", "mod", "deg", "dim", "ker", "sup", "inf", "arg", "Pr", "hom"]);
const NARY = { sum: "∑", prod: "∏", coprod: "∐", int: "∫", iint: "∬", iiint: "∭", oint: "∮", bigcup: "⋃", bigcap: "⋂", bigoplus: "⨁" };
const INTEGRALS = new Set(["∫", "∬", "∭", "∮"]);
const ACCENTS = {
  overline: ["bar", "\u00AF", "\u0305"], bar: ["bar", "\u00AF", "\u0305"], underline: ["under", "_", "_"],
  hat: ["acc", "^", "\u0302"], widehat: ["acc", "^", "\u0302"], tilde: ["acc", "~", "\u0303"], widetilde: ["acc", "~", "\u0303"],
  vec: ["acc", "→", "\u20D7"], overrightarrow: ["acc", "→", "\u20D7"], dot: ["acc", "˙", "\u0307"], ddot: ["acc", "¨", "\u0308"],
  overleftrightarrow: ["acc", "↔", "\u20E1"],
};
const BLACKBOARD = { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ", P: "ℙ", H: "ℍ" };
const SPACES = { ",": 0.17, ":": 0.22, ";": 0.28, " ": 0.28, quad: 1, qquad: 2, enspace: 0.5, thinspace: 0.17, "!": 0 };
const ENVS = {
  pmatrix: ["(", ")", "matrix"], bmatrix: ["[", "]", "matrix"], Bmatrix: ["{", "}", "matrix"], vmatrix: ["|", "|", "matrix"],
  Vmatrix: ["‖", "‖", "matrix"], matrix: ["", "", "matrix"], smallmatrix: ["", "", "matrix"], array: ["", "", "matrix"],
  cases: ["{", "", "cases"], aligned: ["", "", "align"], align: ["", "", "align"], "align*": ["", "", "align"], split: ["", "", "align"], gathered: ["", "", "align"],
};

const mkRow = (c = []) => ({ t: "row", c });
const mkOp = (v, k = "other") => ({ t: "op", v, k });

function charNode(ch) {
  if (/[0-9]/.test(ch)) return { t: "num", v: ch };
  if (/\p{L}/u.test(ch)) return { t: "ord", v: ch };
  switch (ch) {
    case "+": return mkOp("+", "bin");
    case "-": return mkOp("−", "bin");
    case "*": return mkOp("∗", "bin");
    case "/": return mkOp("/", "bin");
    case "=": return mkOp("=", "rel");
    case "<": return mkOp("<", "rel");
    case ">": return mkOp(">", "rel");
    case ",": case ";": return mkOp(ch, "punct");
    case ":": return mkOp(":", "rel");
    case "(": case "[": return mkOp(ch, "open");
    case ")": case "]": return mkOp(ch, "close");
    case "|": return mkOp("|", "other");
    case "!": return mkOp("!", "other");
    case "~": return { t: "space", w: 0.28 };
    case ".": return { t: "ord", v: "." };
    default:
      if ("×÷±∓⋅∪∩∧∨".includes(ch)) return mkOp(ch, "bin");
      if ("≤≥≠≈≡∈∉⊂⊃⊆⊇→←⇒⇔↔∝≅∼∥⊥".includes(ch)) return mkOp(ch, "rel");
      return { t: "ord", v: ch };
  }
}

const skipWs = (p) => { while (p.i < p.s.length && /\s/.test(p.s[p.i])) p.i++; };

function peekCmd(p) {
  if (p.s[p.i] !== "\\") return null;
  const m = /^[A-Za-z]+/.exec(p.s.slice(p.i + 1, p.i + 24));
  return m ? m[0] : (p.s[p.i + 1] ?? "");
}

/** Reads a {braced} raw string (nesting-aware) or a single character. */
function readBraced(p) {
  skipWs(p);
  if (p.s[p.i] !== "{") { const ch = p.s[p.i] ?? ""; if (ch) p.i++; return ch; }
  let depth = 0, start = p.i + 1;
  for (; p.i < p.s.length; p.i++) {
    if (p.s[p.i] === "\\") { p.i++; continue; }
    if (p.s[p.i] === "{") depth++;
    else if (p.s[p.i] === "}" && --depth === 0) { const out = p.s.slice(start, p.i); p.i++; return out; }
  }
  p.errors++;
  return p.s.slice(start);
}

function readDelim(p) {
  skipWs(p);
  const c = p.s[p.i];
  if (c === undefined) return "";
  if (c === ".") { p.i++; return ""; }
  if (c === "\\") {
    p.i++;
    const m = /^[A-Za-z]+/.exec(p.s.slice(p.i));
    const name = m ? m[0] : (p.s[p.i] ?? "");
    p.i += name.length || 0;
    const map = { "{": "{", "}": "}", "|": "‖", langle: "⟨", rangle: "⟩", lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉",
      lbrace: "{", rbrace: "}", vert: "|", lvert: "|", rvert: "|", Vert: "‖", lVert: "‖", rVert: "‖" };
    return map[name] ?? "";
  }
  p.i++;
  return c;
}

function parseGroup(p) {
  p.i++; // {
  const c = parseRow(p, { brace: true });
  if (p.s[p.i] === "}") p.i++; else p.errors++;
  return mkRow(c);
}

function parseArg(p) {
  skipWs(p);
  if (p.s[p.i] === "{") return parseGroup(p);
  if (p.i >= p.s.length) { p.errors++; return mkRow(); }
  return parseAtom(p) || mkRow();
}

function parseScriptArg(p) {
  skipWs(p);
  const c = p.s[p.i];
  if (c === "{") return parseGroup(p);
  if (c === undefined) { p.errors++; return mkRow(); }
  if (c === "\\") return parseAtom(p) || mkRow();
  // lenient: 10^-3 and x^+2 are read as a signed number
  const m = /^[+-]\d+/.exec(p.s.slice(p.i));
  if (m) { p.i += m[0].length; return mkRow([charNode(m[0][0]), { t: "num", v: m[0].slice(1) }]); }
  p.i++;
  return charNode(c);
}

function parseScripts(p, atom) {
  let sub = null, sup = null;
  for (;;) {
    skipWs(p);
    const c = p.s[p.i];
    if (c === "^" && !sup) { p.i++; sup = parseScriptArg(p); }
    else if (c === "_" && !sub) { p.i++; sub = parseScriptArg(p); }
    else if (c === "'") { p.i++; sup = mkRow([...(sup ? (sup.t === "row" ? sup.c : [sup]) : []), { t: "ord", v: "′" }]); }
    else break;
  }
  if (!sub && !sup) return atom;
  if (atom.t === "nary") { atom.lower = sub; atom.upper = sup; return atom; }
  if (atom.t === "lim") { atom.lower = sub; return sup ? { t: "sup", base: atom, sup } : atom; }
  return { t: sub && sup ? "subsup" : sup ? "sup" : "sub", base: atom, sub, sup };
}

function markStyle(node, flags) {
  if (!node || typeof node !== "object") return node;
  if (["ord", "num", "op"].includes(node.t)) Object.assign(node, flags);
  for (const k of ["c", "n", "d", "body", "base", "sub", "sup", "lower", "upper", "idx"]) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(x => markStyle(x, flags)); else if (v) markStyle(v, flags);
  }
  return node;
}

function parseEnv(p) {
  const env = readBraced(p).trim();
  const def = ENVS[env];
  if (!def) p.errors++;
  const [open, close, kind] = def || ["", "", "matrix"];
  if (env === "array") { skipWs(p); if (p.s[p.i] === "{") readBraced(p); }
  const rows = [];
  let cur = [];
  for (;;) {
    cur.push(mkRow(parseRow(p, { amp: true, row: true, end: true })));
    const c = p.s[p.i];
    if (c === "&") { p.i++; continue; }
    if (c === "\\" && p.s[p.i + 1] === "\\") { p.i += 2; rows.push(cur); cur = []; continue; }
    if (peekCmd(p) === "end") { p.i += 4; readBraced(p); rows.push(cur); cur = null; break; }
    p.errors++; rows.push(cur); cur = null; break; // ran out of text
  }
  const last = rows[rows.length - 1];
  if (rows.length > 1 && last.length === 1 && !last[0].c.length) rows.pop(); // trailing "\\"
  return { t: "table", rows, open, close, kind };
}

function command(p, name) {
  if (GREEK[name]) return { t: "ord", v: GREEK[name] };
  if (GREEK_UP[name]) return { t: "ord", v: GREEK_UP[name], up: true };
  if (OPS[name]) return mkOp(OPS[name][0], OPS[name][1]);
  if (ORD[name]) return { t: "ord", v: ORD[name], up: true };
  if (NARY[name]) return { t: "nary", ch: NARY[name], lower: null, upper: null, body: null };
  if (name in SPACES) return { t: "space", w: SPACES[name] };
  if (ACCENTS[name]) { const [kind, ch, comb] = ACCENTS[name]; return { t: "accent", kind, ch, comb, body: parseArg(p) }; }
  if (name === "lim" || name === "limsup" || name === "liminf") return { t: "lim", name: name === "lim" ? "lim" : name.replace("lim", "lim ") };
  if (FUNCS.has(name)) return { t: "fn", name };
  switch (name) {
    case "frac": case "dfrac": case "tfrac": { const n = parseArg(p), d = parseArg(p); return { t: "frac", n, d }; }
    case "binom": case "dbinom": case "tbinom": { const n = parseArg(p), k = parseArg(p); return { t: "binom", n, k }; }
    case "sqrt": {
      skipWs(p);
      let idx = null;
      if (p.s[p.i] === "[") {
        const j = p.s.indexOf("]", p.i);
        if (j > 0) { idx = parseInner(p, p.s.slice(p.i + 1, j)); p.i = j + 1; }
      }
      return { t: "sqrt", idx, body: parseArg(p) };
    }
    case "text": case "textrm": case "textnormal": case "textsf": case "mbox": case "hbox": return { t: "text", v: readBraced(p) };
    case "operatorname": return { t: "fn", name: readBraced(p).replace(/[^A-Za-z]/g, "") || "?" };
    case "mathrm": return markStyle(parseArg(p), { up: true });
    case "mathbf": case "boldsymbol": case "bm": case "textbf": return markStyle(parseArg(p), { bold: true, up: name !== "boldsymbol" && name !== "bm" });
    case "mathit": case "mathcal": case "mathscr": case "mathsf": case "mathtt": case "textit": return parseArg(p);
    case "mathbb": { const raw = readBraced(p); return mkRow([...raw].map(ch => ({ t: "ord", v: BLACKBOARD[ch] || ch, up: true }))); }
    case "left": {
      const open = readDelim(p);
      const body = parseRow(p, { right: true });
      let close = "";
      if (peekCmd(p) === "right") { p.i += 6; close = readDelim(p); } else p.errors++;
      return { t: "fence", open, close, body: mkRow(body) };
    }
    case "right": readDelim(p); p.errors++; return null;
    case "big": case "Big": case "bigg": case "Bigg": case "bigl": case "bigr": case "Bigl": case "Bigr": case "biggl": case "biggr":
    case "displaystyle": case "textstyle": case "scriptstyle": case "limits": case "nolimits": case "relax": case "mathstrut":
      return null;
    case "begin": return parseEnv(p);
    case "end": readBraced(p); p.errors++; return null;
    case "%": case "#": case "&": case "_": case "$": return { t: "ord", v: name, up: true };
    case "{": return mkOp("{", "open");
    case "}": return mkOp("}", "close");
    case "|": return mkOp("‖", "other");
    case "\\": return { t: "space", w: 0.28 };
    case "": return null;
    default: p.errors++; return { t: "text", v: name };
  }
}

function parseInner(p, tex) {
  const q = { s: tex, i: 0, depth: p.depth, errors: 0 };
  const row = mkRow(parseRow(q, {}));
  p.errors += q.errors;
  return row;
}

function parseAtom(p) {
  const s = p.s, c = s[p.i];
  if (c === "{") return parseGroup(p);
  if (c === "\\") {
    p.i++;
    const m = /^[A-Za-z]+/.exec(s.slice(p.i));
    const name = m ? m[0] : (s[p.i] ?? "");
    p.i += name.length;
    return command(p, name);
  }
  if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s[p.i + 1] ?? ""))) {
    const m = /^(?:\d{1,3}(?:,\d{3})+(?![\d])(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)/.exec(s.slice(p.i));
    p.i += m[0].length;
    return { t: "num", v: m[0] };
  }
  const cp = String.fromCodePoint(s.codePointAt(p.i));
  p.i += cp.length;
  return charNode(cp);
}

const isTermBreak = (n) => n.t === "op" && ["bin", "rel", "punct", "close"].includes(n.k);

/** A sum or integral takes the following term as its operand (Word's equation model needs this). */
function absorbOperands(nodes) {
  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.t === "nary" && !n.body) {
      const body = [];
      let j = i + 1;
      while (j < nodes.length && !isTermBreak(nodes[j])) body.push(nodes[j++]);
      n.body = mkRow(body);
      i = j - 1;
    }
    out.push(n);
  }
  return out;
}

function parseRow(p, stop) {
  if (++p.depth > MAX_DEPTH) { p.errors++; p.i = p.s.length; p.depth--; return []; }
  const out = [];
  while (p.i < p.s.length) {
    skipWs(p);
    if (p.i >= p.s.length) break;
    const c = p.s[p.i];
    if (c === "}") { if (stop.brace) break; p.i++; p.errors++; continue; }
    if (c === "&") { if (stop.amp) break; p.i++; continue; }
    if (c === "\\") {
      const cmd = peekCmd(p);
      if (cmd === "\\") { if (stop.row) break; p.i += 2; continue; }
      if (cmd === "right" && stop.right) break;
      if (cmd === "end" && stop.end) break;
    }
    let atom;
    if (c === "^" || c === "_") atom = mkRow();
    else { atom = parseAtom(p); if (!atom) continue; }
    out.push(parseScripts(p, atom));
  }
  p.depth--;
  return absorbOperands(out);
}

/** LaTeX string -> { ast, errors }. Never throws. */
export function parseLatex(tex) {
  const s = cleanXmlText(String(tex ?? ""));
  if (s.length > MAX_TEX) return { ast: mkRow([{ t: "text", v: s }]), errors: 1, tooLong: true };
  try {
    const p = { s, i: 0, depth: 0, errors: 0 };
    const ast = mkRow(parseRow(p, {}));
    return { ast, errors: p.errors };
  } catch {
    return { ast: mkRow([{ t: "text", v: s }]), errors: 1 };
  }
}

/** True when the LaTeX parsed cleanly (used by the editor to warn about typos). */
export const isValidLatex = (tex) => parseLatex(tex).errors === 0;

/* ── 3. Tree -> MathML ─────────────────────────────────────────── */

const styleAttr = (n, fallbackUp = false) => {
  const up = n.up ?? fallbackUp;
  if (n.bold) return up ? ' mathvariant="bold"' : ' mathvariant="bold-italic"';
  return up ? ' mathvariant="normal"' : "";
};
const isFnLike = (n) => n && (n.t === "fn" || ((n.t === "sup" || n.t === "sub" || n.t === "subsup") && n.base && n.base.t === "fn"));

function mmlList(nodes) {
  let out = "";
  for (let i = 0; i < nodes.length; i++) {
    out += mml(nodes[i]);
    const nx = nodes[i + 1];
    if (isFnLike(nodes[i]) && nx && !(nx.t === "op" && ["bin", "rel", "punct", "close"].includes(nx.k)) && nx.t !== "space") out += '<mspace width="0.17em"></mspace>';
  }
  return out;
}
const mmlRow = (n) => (n.t === "row" ? `<mrow>${mmlList(n.c)}</mrow>` : `<mrow>${mml(n)}</mrow>`);
const mo = (v, extra = "") => `<mo${extra}>${escXml(v)}</mo>`;

function mml(n) {
  switch (n.t) {
    case "num": return `<mn${n.bold ? ' mathvariant="bold"' : ""}>${escXml(n.v)}</mn>`;
    case "ord": return `<mi${styleAttr(n, n.v.length > 1 || !/[A-Za-z\u03B1-\u03C9]/.test(n.v))}>${escXml(n.v)}</mi>`;
    case "op": {
      const stretch = n.k === "open" || n.k === "close" ? ' stretchy="false"' : "";
      return mo(n.v, stretch);
    }
    // MathML trims spaces at the ends of <mtext>; a non-breaking space survives, so "7\\text{ cm}" keeps its gap.
    case "text": return `<mtext>${escXml(n.v.replace(/^ +| +$/g, (m) => "\u00A0".repeat(m.length)))}</mtext>`;
    case "space": return n.w > 0 ? `<mspace width="${n.w}em"></mspace>` : "";
    case "row": return `<mrow>${mmlList(n.c)}</mrow>`;
    case "frac": return `<mfrac>${mmlRow(n.n)}${mmlRow(n.d)}</mfrac>`;
    case "binom": return `<mrow>${mo("(")}<mfrac linethickness="0">${mmlRow(n.n)}${mmlRow(n.k)}</mfrac>${mo(")")}</mrow>`;
    case "sqrt": return n.idx ? `<mroot>${mmlRow(n.body)}${mmlRow(n.idx)}</mroot>` : `<msqrt>${mmlList(n.body.t === "row" ? n.body.c : [n.body])}</msqrt>`;
    case "sup": return `<msup>${mmlRow(n.base)}${mmlRow(n.sup)}</msup>`;
    case "sub": return `<msub>${mmlRow(n.base)}${mmlRow(n.sub)}</msub>`;
    case "subsup": return `<msubsup>${mmlRow(n.base)}${mmlRow(n.sub)}${mmlRow(n.sup)}</msubsup>`;
    case "fence": {
      const o = n.open ? mo(n.open, ' fence="true" form="prefix"') : "";
      const c = n.close ? mo(n.close, ' fence="true" form="postfix"') : "";
      return `<mrow>${o}${mmlList(n.body.c)}${c}</mrow>`;
    }
    case "accent": {
      if (n.kind === "under") return `<munder>${mmlRow(n.body)}${mo("_", ' stretchy="true"')}</munder>`;
      return `<mover accent="true">${mmlRow(n.body)}${mo(n.ch, ' stretchy="true"')}</mover>`;
    }
    case "nary": {
      const big = mo(n.ch, INTEGRALS.has(n.ch) ? ' largeop="true"' : ' largeop="true"');
      const l = n.lower, u = n.upper;
      let head;
      if (INTEGRALS.has(n.ch)) head = l && u ? `<msubsup>${big}${mmlRow(l)}${mmlRow(u)}</msubsup>` : l ? `<msub>${big}${mmlRow(l)}</msub>` : u ? `<msup>${big}${mmlRow(u)}</msup>` : big;
      else head = l && u ? `<munderover>${big}${mmlRow(l)}${mmlRow(u)}</munderover>` : l ? `<munder>${big}${mmlRow(l)}</munder>` : u ? `<mover>${big}${mmlRow(u)}</mover>` : big;
      return `<mrow>${head}${n.body ? mmlList(n.body.c) : ""}</mrow>`;
    }
    case "fn": return `<mi mathvariant="normal">${escXml(n.name)}</mi>`;
    case "lim": return n.lower ? `<munder><mi mathvariant="normal">${escXml(n.name)}</mi>${mmlRow(n.lower)}</munder>` : `<mi mathvariant="normal">${escXml(n.name)}</mi>`;
    case "table": {
      const align = n.kind === "cases" ? ' columnalign="left"' : n.kind === "align" ? ' columnalign="right left"' : "";
      const rows = n.rows.map(r => `<mtr>${r.map(c => `<mtd>${mmlList(c.c)}</mtd>`).join("")}</mtr>`).join("");
      const o = n.open ? mo(n.open, ' fence="true" form="prefix"') : "";
      const c = n.close ? mo(n.close, ' fence="true" form="postfix"') : "";
      return `<mrow>${o}<mtable${align}>${rows}</mtable>${c}</mrow>`;
    }
    default: return "";
  }
}

/** LaTeX -> MathML string, or null when it cannot be drawn. */
export function latexToMathML(tex, display = false) {
  const { ast, tooLong } = parseLatex(tex);
  if (tooLong) return null;
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${display ? "block" : "inline"}" class="${display ? "m-display" : "m-inline"}">${mmlList(ast.c)}</math>`;
}

/** Maths as HTML: MathML, or the original source in a quiet box if it cannot be drawn. */
export function renderMathHtml(tex, display = false) {
  const out = latexToMathML(tex, display);
  return out ?? `<span class="m-raw">${escXml(tex)}</span>`;
}

/** Whole string (text with $maths$) -> escaped HTML. Used by the live preview and the editor. */
export function textWithMathToHtml(input) {
  return splitMath(input).map(p => p.math === undefined ? escXml(p.text).replace(/\n/g, "<br/>") : renderMathHtml(p.math, p.display)).join("");
}

/* ── 4. Tree -> plain text ─────────────────────────────────────── */

const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "−": "⁻", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ" };
const SUB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", "+": "₊", "−": "₋", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", o: "ₒ", x: "ₓ", h: "ₕ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", p: "ₚ", s: "ₛ", t: "ₜ", i: "ᵢ", j: "ⱼ", r: "ᵣ", u: "ᵤ", v: "ᵥ" };

function plain(n) {
  switch (n.t) {
    case "num": case "ord": case "text": return n.v;
    case "fn": return n.name;
    case "lim": return n.name + (n.lower ? `(${plain(n.lower)})` : "");
    case "op": return n.k === "bin" || n.k === "rel" ? ` ${n.v} ` : n.k === "punct" ? `${n.v} ` : n.v;
    case "space": return n.w >= 0.2 ? " " : "";
    case "row": return n.c.map(plain).join("").replace(/ {2,}/g, " ");
    case "frac": { const a = plain(n.n).trim(), b = plain(n.d).trim(); const w = (x) => (/^(?:\d+(?:\.\d+)?|\p{L})$/u.test(x) ? x : `(${x})`); return `${w(a)}/${w(b)}`; }
    case "binom": return `C(${plain(n.n)}, ${plain(n.k)})`;
    case "sqrt": { const b = plain(n.body); return (n.idx ? plain(n.idx) : "") + "√" + (/^[\w.]+$/.test(b) ? b : `(${b})`); }   // computed ONCE: three calls per level made nested roots exponential
    case "sup": case "sub": case "subsup": {
      const out = [plain(n.base)];
      for (const [k, map, mark] of [["sub", SUB, "_"], ["sup", SUP, "^"]]) {
        if (!n[k]) continue;
        const txt = plain(n[k]).replace(/\s+/g, "");
        out.push([...txt].every(ch => map[ch]) ? [...txt].map(ch => map[ch]).join("") : `${mark}(${txt})`);
      }
      return out.join("");
    }
    case "fence": return `${n.open}${plain(n.body)}${n.close}`;
    case "accent": return n.kind === "under" ? plain(n.body) : plain(n.body) + n.comb;
    case "nary": return n.ch + (n.lower ? `(${plain(n.lower)}` + (n.upper ? `..${plain(n.upper)})` : ")") : "") + (n.body ? plain(n.body) : "");
    case "table": return `${n.open}${n.rows.map(r => r.map(c => plain(c)).join(", ")).join("; ")}${n.close}`;
    default: return "";
  }
}

/** LaTeX -> readable Unicode text, e.g. "\frac{3}{4}x^{2}" -> "3/4x²". */
export const latexToPlain = (tex) => plain(parseLatex(tex).ast).trim();

/** Text with $maths$ -> text with the maths written as readable Unicode. */
export const stripMath = (input) => splitMath(input).map(p => p.math === undefined ? p.text : latexToPlain(p.math)).join("");

/* ── 5. Tree -> OMML (Word's native equation XML) ──────────────── */
// Elements are built in the same object form the `docx` package serialises
// (see RawXml in examDocx.js): { "m:f": [child, child] }, attributes in `_attr`.

const el = (name, attrs, ...kids) => {
  const k = kids.flat().filter(Boolean);
  if (!k.length) return { [name]: attrs ? { _attr: attrs } : {} };
  return { [name]: attrs ? [{ _attr: attrs }, ...k] : k };
};
const val = (name, v) => el(name, { "m:val": v });

function mRun(text, { up, bold, plainText } = {}, ctx = {}) {
  const sty = bold ? (up ? "b" : "bi") : up ? "p" : null;
  const rPr = plainText ? el("m:rPr", null, el("m:nor")) : sty ? el("m:rPr", null, val("m:sty", sty)) : null;
  const wPr = ctx.size ? el("w:rPr", null, el("w:rFonts", { "w:ascii": "Cambria Math", "w:hAnsi": "Cambria Math" }), el("w:sz", { "w:val": ctx.size }), el("w:szCs", { "w:val": ctx.size })) : null;
  return el("m:r", null, rPr, wPr, el("m:t", { "xml:space": "preserve" }, String(text)));
}

const ommlArg = (name, n, ctx) => el(name, null, ommlNodes(n.t === "row" ? n.c : [n], ctx));

function ommlNodes(nodes, ctx) {
  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    out.push(omml(nodes[i], ctx));
    const nx = nodes[i + 1];
    if (isFnLike(nodes[i]) && nx && !(nx.t === "op" && ["bin", "rel", "punct", "close"].includes(nx.k)) && nx.t !== "space") out.push(mRun("\u2009", { plainText: true }, ctx));
  }
  return out.flat();
}

function omml(n, ctx) {
  switch (n.t) {
    case "num": return mRun(n.v, { bold: n.bold, up: true }, ctx);
    case "ord": return mRun(n.v, { up: n.up ?? n.v.length > 1, bold: n.bold }, ctx);
    case "op": return mRun(n.v, { bold: n.bold, up: !!n.bold }, ctx);
    case "text": return mRun(n.v, { plainText: true }, ctx);
    case "space": return n.w > 0 ? mRun(n.w >= 1 ? "\u2003".repeat(Math.round(n.w)) : n.w >= 0.28 ? "\u2005" : "\u2009", { plainText: true }, ctx) : [];
    case "row": return ommlNodes(n.c, ctx);
    case "frac": return el("m:f", null, ommlArg("m:num", n.n, ctx), ommlArg("m:den", n.d, ctx));
    case "binom": return el("m:d", null, el("m:dPr", null, val("m:begChr", "("), val("m:endChr", ")")),
      el("m:e", null, el("m:f", null, el("m:fPr", null, val("m:type", "noBar")), ommlArg("m:num", n.n, ctx), ommlArg("m:den", n.k, ctx))));
    case "sqrt": return el("m:rad", null, el("m:radPr", null, n.idx ? null : val("m:degHide", "1")), el("m:deg", null, n.idx ? ommlNodes(n.idx.t === "row" ? n.idx.c : [n.idx], ctx) : []), ommlArg("m:e", n.body, ctx));
    case "sup": return el("m:sSup", null, ommlArg("m:e", n.base, ctx), ommlArg("m:sup", n.sup, ctx));
    case "sub": return el("m:sSub", null, ommlArg("m:e", n.base, ctx), ommlArg("m:sub", n.sub, ctx));
    case "subsup": return el("m:sSubSup", null, ommlArg("m:e", n.base, ctx), ommlArg("m:sub", n.sub, ctx), ommlArg("m:sup", n.sup, ctx));
    case "fence": return el("m:d", null, el("m:dPr", null, val("m:begChr", n.open), val("m:endChr", n.close)), ommlArg("m:e", n.body, ctx));
    case "accent":
      if (n.kind === "bar") return el("m:bar", null, el("m:barPr", null, val("m:pos", "top")), ommlArg("m:e", n.body, ctx));
      if (n.kind === "under") return el("m:bar", null, el("m:barPr", null, val("m:pos", "bot")), ommlArg("m:e", n.body, ctx));
      return el("m:acc", null, el("m:accPr", null, val("m:chr", n.comb)), ommlArg("m:e", n.body, ctx));
    case "nary": {
      const integral = INTEGRALS.has(n.ch);
      return el("m:nary", null,
        el("m:naryPr", null, val("m:chr", n.ch), val("m:limLoc", integral ? "subSup" : "undOvr"), n.lower ? null : val("m:subHide", "1"), n.upper ? null : val("m:supHide", "1")),
        el("m:sub", null, n.lower ? ommlNodes(n.lower.t === "row" ? n.lower.c : [n.lower], ctx) : []),
        el("m:sup", null, n.upper ? ommlNodes(n.upper.t === "row" ? n.upper.c : [n.upper], ctx) : []),
        el("m:e", null, n.body ? ommlNodes(n.body.c, ctx) : []));
    }
    case "fn": return mRun(n.name, { up: true }, ctx);
    case "lim": return n.lower
      ? el("m:limLow", null, el("m:e", null, mRun(n.name, { up: true }, ctx)), el("m:lim", null, ommlNodes(n.lower.t === "row" ? n.lower.c : [n.lower], ctx)))
      : mRun(n.name, { up: true }, ctx);
    case "table": {
      let body;
      if (n.kind === "matrix") body = el("m:m", null, n.rows.map(r => el("m:mr", null, r.map(c => ommlArg("m:e", c, ctx)))));
      else body = el("m:eqArr", null, n.rows.map(r => el("m:e", null, r.flatMap(c => ommlNodes(c.c, ctx)))));
      if (!n.open && !n.close) return body;
      return el("m:d", null, el("m:dPr", null, val("m:begChr", n.open), val("m:endChr", n.close)), el("m:e", null, body));
    }
    default: return [];
  }
}

/**
 * LaTeX -> the object for a Word equation. Wrap it in RawXml and put it in a
 * Paragraph's children. `size` (half-points) makes it match the surrounding text.
 */
export function latexToOmml(tex, { display = false, size = 0 } = {}) {
  const { ast, tooLong } = parseLatex(tex);
  if (tooLong) return null;
  const math = el("m:oMath", null, ommlNodes(ast.c, { size }));
  return display ? el("m:oMathPara", null, math) : math;
}
