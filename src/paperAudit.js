/**
 * paperAudit.js
 * ─────────────────────────────────────────────────────────────────
 * Automatic quality check of a finished paper, the way a moderator would
 * read it before it goes to the printer. Pure and offline: no AI call, no
 * credits, runs instantly on every edit.
 *
 * Findings have a level:
 *   error  the paper is wrong as printed (a bad answer key, marks that do not add up, a broken formula)
 *   warn   probably a problem a teacher should look at (near-duplicate questions, answer-letter bias)
 *   tip    good item-writing advice (avoid "all of the above", correct option is much longer)
 *
 * Each finding says where it is and, where a safe automatic repair exists, a
 * `fix` id that applyAuditFix() understands.
 * ─────────────────────────────────────────────────────────────────
 */
import { splitMath, isValidLatex } from "./mathText.js";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const words = (s) => norm(String(s ?? "").replace(/\$[^$]*\$/g, " ").replace(/[^\p{L}\p{N} ]/gu, " ")).split(" ").filter(w => w.length > 2);

function jaccard(a, b) {
  if (!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  A.forEach(x => { if (B.has(x)) inter++; });
  return inter / (A.size + B.size - inter);
}

const num = (v) => Number(v);
const isNum = (v) => Number.isFinite(num(v));

/** Runs every check. Returns { findings, errors, warnings, tips, score, ok }. */
export function auditExam(exam) {
  const findings = [];
  const add = (level, code, where, message, fix) => findings.push({ level, code, ...where, message, ...(fix ? { fix } : {}) });
  // tolerate junk from older saves or hand edits: skip anything that is not an object
  const isObj = (v) => v && typeof v === "object";
  const sections = (Array.isArray(exam?.sections) ? exam.sections : []).filter(isObj)
    .map(s => ({ ...s, questions: (Array.isArray(s.questions) ? s.questions : []).filter(isObj) }));

  const texts = [];                      // for duplicate detection
  const objective = [];                  // { q, section }
  let hasAnyGuide = false;
  sections.forEach(s => (s.questions || []).forEach(q => { if (String(q.markingGuide || "").trim()) hasAnyGuide = true; }));

  sections.forEach((section) => {
    const sid = section.id;
    const qs = Array.isArray(section.questions) ? section.questions : [];
    if (!qs.length) add("error", "empty-section", { section: sid }, `${section.label || `Section ${sid}`} has no questions.`);
    let prev = null;

    qs.forEach((q0) => {
      let q = q0;
      const where = { section: sid, number: q.number };
      const label = `${sections.length > 1 ? `Section ${sid}, ` : ""}Question ${q.number}`;   // "Question 1" alone is ambiguous when two sections both have one
      const stem = String(q.text ?? "");

      // numbering
      if (prev !== null && isNum(q.number) && num(q.number) !== prev + 1) add("warn", "numbering", where, `${label}: numbering jumps from ${prev} to ${q.number}.`);
      if (isNum(q.number)) prev = num(q.number);

      // wording
      const hasParts = Array.isArray(q.parts) && q.parts.length > 0;
      if (!stem.trim() && !hasParts) add("error", "empty-question", where, `${label} has no text.`);
      else if (stem.trim().length > 0 && stem.trim().length < 8 && !hasParts) add("warn", "short-question", where, `${label} is very short. Check that nothing is missing.`);
      if (/\u2014/.test(stem)) add("tip", "em-dash", where, `${label} contains a long dash. Use a comma, colon or brackets.`);

      // maths
      if (hasParts) q = { ...q, parts: q.parts.filter(isObj) };
      const allTexts = [stem, ...(Array.isArray(q.options) ? q.options : []), q.markingGuide || "", ...(hasParts ? q.parts.flatMap(p => [p.text, ...(Array.isArray(p.subparts) ? p.subparts : []).filter(isObj).map(sp => sp.text)]) : [])];
      for (const t of allTexts) {
        const pieces = splitMath(t);
        for (const p of pieces) {
          if (p.math !== undefined) {
            if (!isValidLatex(p.math)) { add("error", "bad-formula", where, `${label}: a formula looks mistyped: ${p.math.slice(0, 50)}`); break; }
          } else if (/\\[A-Za-z]{2,}/.test(p.text)) {
            add("error", "latex-outside", where, `${label}: a formula command (like \\frac) is outside $...$ and will print as raw code.`); break;
          } else if (/\$(?=[A-Za-z\\{])/.test(p.text)) {
            add("warn", "unfinished-math", where, `${label}: a $ sign looks like the start of a formula that was never closed.`); break;
          }
        }
      }

      // marks
      if (!isNum(q.marks) || num(q.marks) <= 0) add("error", "marks-invalid", where, `${label} has no valid mark.`);
      if (hasParts) {
        const sum = q.parts.reduce((a, p) => a + (num(p.marks) || 0), 0);
        if (sum !== num(q.marks)) add("error", "marks-parts", where, `${label}: the parts add up to ${sum} but the question says ${q.marks}.`, "marks-from-parts");
        q.parts.forEach((p) => {
          if (Array.isArray(p.subparts) && p.subparts.length) {
            const ss = p.subparts.filter(isObj).reduce((a, sp) => a + (num(sp.marks) || 0), 0);
            if (ss !== num(p.marks)) add("error", "marks-subparts", { ...where, part: p.label }, `${label}(${p.label}): the sub-parts add up to ${ss} but the part says ${p.marks}.`);
          }
          if (!String(p.text ?? "").trim()) add("error", "empty-part", { ...where, part: p.label }, `${label}(${p.label}) has no text.`);
        });
      }

      // marking guide
      if (section.type !== "objective" && hasAnyGuide && !String(q.markingGuide || "").trim()) add("warn", "no-guide", where, `${label} has no marking guide, though other questions do.`);

      // duplicates are checked across the whole paper below
      texts.push({ where, label, words: words([stem, ...(hasParts ? q.parts.map(p => p.text) : [])].join(" ")) });

      // objective items
      if (section.type === "objective") {
        objective.push({ q, section });
        const opts = Array.isArray(q.options) ? q.options : [];
        if (opts.length !== 4) add("error", "option-count", where, `${label} has ${opts.length} options. Objective questions need exactly 4.`);
        opts.forEach((o, i) => { if (!String(o ?? "").trim()) add("error", "empty-option", where, `${label}: option ${LETTERS[i]} is empty.`); });
        const seen = new Map();
        opts.forEach((o, i) => { const k = norm(o); if (!k) return; if (seen.has(k)) add("error", "duplicate-option", where, `${label}: options ${LETTERS[seen.get(k)]} and ${LETTERS[i]} are the same.`); else seen.set(k, i); });
        const ci = LETTERS.indexOf(String(q.correctOption || "").toUpperCase());
        if (ci < 0) add("error", "no-correct", where, `${label} has no correct option marked.`);
        else if (ci >= opts.length) add("error", "correct-out-of-range", where, `${label}: the marked answer ${q.correctOption} does not exist.`);
        if (opts.some(o => /^\s*(all|none|both)\s+of\s+the\s+(above|these)\b/i.test(String(o)))) add("tip", "all-of-above", where, `${label} uses "all/none of the above". Good item writing avoids it.`);
        if (ci >= 0 && ci < opts.length && opts.length === 4) {
          const lens = opts.map(o => String(o).length);
          const others = lens.filter((_, i) => i !== ci);
          const avg = others.reduce((a, b) => a + b, 0) / others.length;
          if (lens[ci] >= 25 && lens[ci] > avg * 1.8) add("tip", "longest-correct", where, `${label}: the correct option is much longer than the others, which gives it away.`);
        }
      }
    });
  });

  // answer key vs marked answers
  const keyMap = new Map((Array.isArray(exam?.answerKey) ? exam.answerKey : []).filter(isObj).map(k => [num(k.number), String(k.answer || "").toUpperCase()]));
  const seenNumbers = new Set();
  let fixKey = false;
  objective.forEach(({ q, section }) => {
    const n = num(q.number);
    if (seenNumbers.has(n)) return;          // two objective sections sharing numbers: cannot be mapped reliably
    seenNumbers.add(n);
    const want = String(q.correctOption || "").toUpperCase();
    if (!want) return;
    if (!keyMap.has(n)) { add("error", "key-missing", { section: section.id, number: q.number }, `Question ${q.number} is missing from the answer key.`, "sync-answer-key"); fixKey = true; }
    else if (keyMap.get(n) !== want) { add("error", "key-mismatch", { section: section.id, number: q.number }, `Question ${q.number}: the answer key says ${keyMap.get(n)} but the question is marked ${want}.`, "sync-answer-key"); fixKey = true; }
  });
  keyMap.forEach((_, n) => { if (!seenNumbers.has(n)) add("warn", "key-orphan", { number: n }, `The answer key lists question ${n}, which is not an objective question.`, "sync-answer-key"); });

  // total marks
  const total = sections.reduce((a, s) => a + (s.questions || []).reduce((b, q) => b + (num(q.marks) || 0), 0), 0);
  if (isNum(exam?.totalMarks) && num(exam.totalMarks) !== total && !sections.some(s => s.answerAny)) {
    add("warn", "total-marks", {}, `The paper says ${exam.totalMarks} marks in total but the questions add up to ${total}.`, "total-marks");
  }

  // near-duplicate questions
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (texts[i].words.length >= 5 && texts[j].words.length >= 5 && jaccard(texts[i].words, texts[j].words) >= 0.75) {
        add("warn", "near-duplicate", texts[j].where, `${texts[j].label} is almost the same as ${texts[i].label}.`);
      }
    }
  }

  // answer-letter bias and give-away patterns (objective)
  const keyed = objective.filter(({ q }) => LETTERS.includes(String(q.correctOption || "").toUpperCase()));
  if (keyed.length >= 8) {
    const counts = { A: 0, B: 0, C: 0, D: 0 };
    keyed.forEach(({ q }) => { const l = String(q.correctOption).toUpperCase(); if (l in counts) counts[l]++; });
    const [topLetter, top] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top / keyed.length > 0.45) add("warn", "letter-bias", {}, `${Math.round((top / keyed.length) * 100)}% of the correct answers are ${topLetter}. Pupils can guess the pattern. Use "Version B" shuffling or swap some options.`);
    if (keyed.length >= 12) Object.entries(counts).forEach(([l, c]) => { if (c === 0) add("tip", "letter-unused", {}, `No question has ${l} as its answer.`); });
  }
  const longCount = findings.filter(f => f.code === "longest-correct").length;
  if (keyed.length >= 8 && longCount / keyed.length >= 0.3) add("warn", "length-bias", {}, "Many correct options are the longest one. Pupils can pick the longest answer without knowing the topic.");

  const errors = findings.filter(f => f.level === "error").length;
  const warnings = findings.filter(f => f.level === "warn").length;
  const tips = findings.filter(f => f.level === "tip").length;
  const score = Math.max(0, 100 - errors * 15 - warnings * 4 - tips);
  return { findings, errors, warnings, tips, score, ok: errors === 0, hasFixableKey: fixKey };
}

/** Applies one safe automatic repair. Returns a new exam; the input is not changed. */
export function applyAuditFix(exam, fix) {
  const next = { ...exam, sections: (exam.sections || []).map(s => ({ ...s, questions: (s.questions || []).map(q => ({ ...q })) })) };
  if (fix === "sync-answer-key") {
    const key = [], seen = new Set();
    next.sections.filter(s => s.type === "objective").forEach(s => s.questions.forEach(q => {
      const l = String(q.correctOption || "").toUpperCase();
      if (l && !seen.has(q.number)) { seen.add(q.number); key.push({ number: q.number, answer: l }); }
    }));
    next.answerKey = key.sort((a, b) => a.number - b.number);
  } else if (fix === "marks-from-parts") {
    next.sections.forEach(s => s.questions.forEach(q => {
      if (Array.isArray(q.parts) && q.parts.length) q.marks = q.parts.reduce((a, p) => a + (num(p.marks) || 0), 0);
    }));
  } else if (fix === "total-marks") {
    next.totalMarks = next.sections.reduce((a, s) => a + s.questions.reduce((b, q) => b + (num(q.marks) || 0), 0), 0);
  }
  return next;
}
