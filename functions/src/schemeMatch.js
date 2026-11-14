/**
 * schemeMatch.js
 * Pure helpers that turn the raw text of an uploaded Scheme of Learning into
 * (a) a clean, size-capped block of text for the exam prompt, and
 * (b) the NaCCA strands / sub-strands it covers, so the teacher doesn't have to
 *     tick them one by one.
 *
 * No DOM, no network, no file access - everything here is plain string work,
 * which keeps it fast on low-end phones and easy to test.
 *
 * Matching is deliberately conservative: a wrong auto-selection silently
 * mis-scopes an exam, whereas a missed one just means the teacher ticks it
 * by hand (and the full scheme text still goes to the AI regardless). So:
 *   1. Content-standard / indicator CODES (e.g. "B7.1.1.1", "1.1.1.CS.1") are a
 *      precise signal - BUT NaCCA numbers them the same way in every subject
 *      (Maths B7.1.2.1 and English B7.1.2.1 are different topics), so a code on
 *      its own can't show the scheme is for the subject chosen. Codes therefore
 *      only count when the scheme also names the subject, or at least one
 *      strand/sub-strand of it by name.
 *   2. The sub-strand / strand NAME must be found as a phrase, or - for
 *      names of 3+ meaningful words that a table has wrapped across lines - with
 *      all its words close together.
 *   3. One-word names ("Measurement", "Grammar", "Number") are far too common in
 *      ordinary sentences, so they only count when they stand alone as a table
 *      cell or a line of their own.
 */

// ── Cleaning ────────────────────────────────────────────────────────────

const PAGE_NUMBER_LINE = /^(page\s*)?\d{1,3}(\s*(of|\/)\s*\d{1,3})?$/i;

/**
 * Tidies raw extracted text for the prompt: normalises whitespace, drops blank
 * lines and bare page numbers, removes headers/footers that repeat on every
 * page, and caps the result at `maxChars` on a line boundary.
 * @returns {{ text: string, truncated: boolean, originalLength: number }}
 */
export function condenseSchemeText(raw, maxChars) {
  const lines = String(raw || "")
    .replace(/ /g, " ")
    .replace(/[​-‍﻿]/g, "")
    .split(/\r?\n/)
    .map(l => l.replace(/[ \t]+/g, " ").trim())
    // the prompt wraps the syllabus in triple quotes - never let the file close them early
    .map(l => l.replace(/"{3,}/g, '"'))
    .filter(l => l && !PAGE_NUMBER_LINE.test(l));

  // Short lines that recur 3+ times are running headers/footers (school name, "Scheme of Learning - Term 1" ...).
  const counts = new Map();
  for (const l of lines) if (l.length <= 80) counts.set(l, (counts.get(l) || 0) + 1);
  const out = [];
  const seenRepeats = new Set();
  for (const l of lines) {
    if ((counts.get(l) || 0) >= 3) {
      if (seenRepeats.has(l)) continue;
      seenRepeats.add(l);
    }
    if (out.length && out[out.length - 1] === l) continue; // exact consecutive duplicate
    out.push(l);
  }

  const full = out.join("\n");
  if (full.length <= maxChars) return { text: full, truncated: false, originalLength: full.length };

  let cut = full.lastIndexOf("\n", maxChars);
  if (cut < maxChars * 0.5) cut = maxChars; // a single enormous line: hard cut
  return { text: full.slice(0, cut).trimEnd(), truncated: true, originalLength: full.length };
}

// ── Normalising names for comparison ────────────────────────────────────

const STOPWORDS = new Set(["and", "of", "the", "in", "to", "a", "an", "for", "on", "with", "their", "its", "from", "by", "as", "or", "at", "is", "are"]);

/** lower-case, "&"->"and", punctuation -> spaces, single spaces. */
export function normalise(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9À-ɏ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Curriculum names carry numbering the teacher's scheme usually won't:
 *   "Strand 1: Number"  "Sub-Strand 2: Number Operations"  "1. BIOLOGY AS THE SCIENCE OF LIFE"
 */
export function stripNumbering(name) {
  return String(name || "")
    .replace(/^\s*(sub[\s-]*strand|strand)\s*\d+(\.\d+)*\s*[:.\-–]?\s*/i, "")
    .replace(/^\s*\d+(\.\d+)*\s*[.):\-–]\s*/, "")
    .trim();
}

const significantTokens = (norm) => norm.split(" ").filter(t => t && !STOPWORDS.has(t));

// ── Searching the scheme text ───────────────────────────────────────────

/** Indexes built once per scheme so each name lookup is cheap. */
function buildIndex(text) {
  const rawLines = String(text || "").split(/\r?\n/);
  const cells = [];
  for (const line of rawLines) {
    for (const cell of line.split(/\s\|\s|\t/)) {
      const n = normalise(cell.replace(/^[-•*\d.)\s]+(?=[A-Za-z])/, "")); // drop bullets / "1." list markers
      if (n) cells.push(n);
    }
  }
  const norm = normalise(text);
  return { norm, padded: ` ${norm} `, tokens: norm ? norm.split(" ") : [], cells, upper: String(text || "").toUpperCase() };
}

/** Is `code` present as a whole code (not as the start of a longer one like B7.1.1.1 inside B7.1.1.1.2)? */
function hasCode(upper, code) {
  const c = String(code || "").toUpperCase().trim();
  if (c.length < 5) return false;
  let from = 0;
  for (;;) {
    const i = upper.indexOf(c, from);
    if (i === -1) return false;
    const before = upper[i - 1];
    const after = upper[i + c.length];
    const after2 = upper[i + c.length + 1];
    const okBefore = !before || !/[A-Z0-9.]/.test(before);
    const okAfter = !after || (!/[A-Z0-9]/.test(after) && !(after === "." && after2 && /[A-Z0-9]/.test(after2)));
    if (okBefore && okAfter) return true;
    from = i + 1;
  }
}

function windowMatch(tokens, wanted) {
  // all `wanted` tokens appear within a short run of the scheme's words
  const size = Math.max(6, wanted.length * 2 + 2);
  const need = new Set(wanted);
  const counts = new Map();
  let have = 0;
  for (let i = 0; i < tokens.length; i++) {
    const add = tokens[i];
    if (need.has(add)) { const n = (counts.get(add) || 0) + 1; counts.set(add, n); if (n === 1) have++; }
    const drop = i >= size ? tokens[i - size] : null;
    if (drop && need.has(drop)) { const n = counts.get(drop) - 1; counts.set(drop, n); if (n === 0) have--; }
    if (have === need.size) return true;
  }
  return false;
}

/** Does this curriculum name appear in the scheme? (rules 2 and 3 in the header comment) */
function nameAppears(index, rawName) {
  const norm = normalise(stripNumbering(rawName));
  if (!norm) return false;
  const sig = significantTokens(norm);
  if (sig.length === 0) return false;

  if (sig.length === 1) {
    // generic single words: only as a cell / line of their own (or a very short one starting with it)
    return index.cells.some(c => c === norm || (c.startsWith(norm + " ") && c.split(" ").length <= 4));
  }
  if (index.padded.includes(` ${norm} `)) return true;
  if (sig.length >= 3) return windowMatch(index.tokens, sig);
  return false;
}

// ── The public matcher ──────────────────────────────────────────────────

/**
 * @param {string} text         full text read from the file
 * @param {Array}  strands      getStrands(subject, class): [{ strand, subStrands: [{ name, contentStandards }] }]
 * @param {string} [subjectName] the subject's display name ("Mathematics"), used to vouch for code matches
 * @returns {{ strands: string[], topics: string[] }} names exactly as the curriculum stores them
 */
export function matchSchemeToCurriculum(text, strands, subjectName = "") {
  if (!text || !Array.isArray(strands) || !strands.length) return { strands: [], topics: [] };
  const index = buildIndex(text);

  // Pass 1: names.
  const byName = new Map(); // sub-strand name -> true
  const strandByName = new Set();
  for (const st of strands) {
    for (const ss of st.subStrands || []) if (nameAppears(index, ss.name)) byName.set(ss.name, true);
    if (nameAppears(index, st.strand)) strandByName.add(st.strand);
  }

  // Codes are only trusted when something else ties the scheme to this subject.
  const subj = normalise(subjectName);
  const subjectNamed = subj.length >= 3 && index.padded.includes(` ${subj} `);
  const codesTrusted = byName.size > 0 || strandByName.size > 0 || subjectNamed;

  const matchedStrands = [];
  const matchedTopics = [];
  for (const st of strands) {
    let strandHit = strandByName.has(st.strand);
    for (const ss of st.subStrands || []) {
      let hit = byName.has(ss.name);
      if (!hit && codesTrusted) {
        const codes = (ss.contentStandards || []).flatMap(cs => [cs.code, ...(cs.indicators || []).map(i => i.code)]);
        hit = codes.some(c => hasCode(index.upper, c));
      }
      if (hit) { matchedTopics.push(ss.name); strandHit = true; }
    }
    if (strandHit) matchedStrands.push(st.strand);
  }
  return { strands: matchedStrands, topics: matchedTopics };
}
