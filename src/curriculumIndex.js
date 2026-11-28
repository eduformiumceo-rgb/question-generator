/**
 * ═══════════════════════════════════════════════════════════════════
 * GHANA NaCCA CURRICULUM - MASTER INDEX (lazy-loaded)
 *
 * The curriculum is ~14 MB of data across 77 subjects. It used to be imported all at once, so every
 * teacher downloaded all of it. Now:
 *
 *   curriculumManifest.js     which classes each subject has (tiny; answers "does subject X exist for class Y?")
 *   curriculumLoaders.js      one dynamic-import loader per subject (each subject is its own download)
 *   this file                 the same helper functions as before, reading from what has been loaded
 *
 * USING IT: await loadSubject("Mathematics") (or useSubjectData() in React) BEFORE calling getStrands()
 * and friends. Until a subject is loaded they return [] exactly as they do for an unknown subject.
 *
 * ADDING A SUBJECT: add one entry to LOADERS in curriculumLoaders.js, then run `npm run sync:curriculum`.
 * ═══════════════════════════════════════════════════════════════════
 */
import { LOADERS } from "./curriculumLoaders.js";
import MANIFEST from "./curriculumManifest.js";

const EMPTY = Object.freeze({});
const CACHE = new Map();      // subject -> data object
const PENDING = new Map();    // subject -> in-flight promise (so two callers share one download)
const listeners = new Set();

/** Subject name -> { data }. `data` is {} until the subject is loaded, then the full class-keyed object. */
export const ALL_SUBJECTS = Object.fromEntries(Object.keys(LOADERS).map(name => [name, {
  get data() { return CACHE.get(name) || EMPTY; },
}]));

export const isSubjectLoaded = (subject) => CACHE.has(subject);
/** True if there is curriculum data to load for this subject name. */
export const hasSubject = (subject) => Object.prototype.hasOwnProperty.call(LOADERS, subject);

/** Downloads one subject's data (once). Resolves to its data; rejects for an unknown subject or a failed download (and may then be retried). */
export function loadSubject(subject) {
  if (CACHE.has(subject)) return Promise.resolve(CACHE.get(subject));
  if (PENDING.has(subject)) return PENDING.get(subject);
  const loader = LOADERS[subject];
  if (!loader) return Promise.reject(new Error(`Unknown subject: ${subject}`));
  const p = loader().then(data => {
    CACHE.set(subject, data); PENDING.delete(subject);
    listeners.forEach(fn => fn(subject));
    return data;
  }, err => { PENDING.delete(subject); throw err; });   // a failed download is not cached, so the next call retries
  PENDING.set(subject, p);
  return p;
}

export const loadSubjects = (subjects) => Promise.all(subjects.map(loadSubject));
/** Tests and scripts: load everything. The app never needs this. */
export const loadAllSubjects = () => loadSubjects(Object.keys(LOADERS));
/** Called with the subject name each time one finishes loading (used by useSubjectData). */
export function onSubjectLoaded(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/* ─── HELPERS (unchanged; they read whatever has been loaded) ─── */
export const SUPPORTED_SUBJECTS = Object.keys(ALL_SUBJECTS);

/** All classes available for a subject */
export function getSupportedClasses(subject) {
  return MANIFEST[subject] || [];   // from the manifest: answers for ALL subjects instantly, no data downloaded
}

/** All strands for a subject + class */
export function getStrands(subject, cls) {
  return ALL_SUBJECTS[subject]?.data[cls] || [];
}

/** All sub-strands for a subject + class + strand name */
export function getSubStrands(subject, cls, strandName) {
  const strand = getStrands(subject, cls).find(s => s.strand === strandName);
  return strand?.subStrands || [];
}

/** All content standards for a subject + class + strand + sub-strand */
export function getContentStandards(subject, cls, strandName, subStrandName) {
  const sub = getSubStrands(subject, cls, strandName).find(s => s.name === subStrandName);
  return sub?.contentStandards || [];
}

/** All indicators flat for a sub-strand (with contentStandardCode attached) */
export function getIndicators(subject, cls, strandName, subStrandName) {
  return getContentStandards(subject, cls, strandName, subStrandName)
    .flatMap(cs => (cs.indicators || []).map(ind => ({
      ...ind,
      contentStandardCode:  cs.code,
      contentStandardTitle: cs.title,
    })));
}

/**
 * Get full detail for selected indicators including exemplars, resources, keyWords.
 * Returns array of enriched indicator objects for the selected codes.
 */
export function getIndicatorDetails(subject, cls, strandName, subStrandName, indicatorCodes) {
  const all = getIndicators(subject, cls, strandName, subStrandName);
  const codes = indicatorCodes || [];
  return codes
    .map(code => all.find(i => i.code === code))
    .filter(Boolean);
}

/**
 * Parse raw exemplar text into a clean array of step strings.
 * Handles: numbered steps ("1. ..."), bullet/dash lists, plain sentences.
 */
function parseExemplarSteps(text) {
  if (!text || text === "null") return [];

  // Try numbered steps first: "1. Step", "2. Step" etc.
  const numberedMatch = text.match(/\d+\.\s/);
  if (numberedMatch) {
    return text
      .split(/(?=\d+\.\s)/)
      .map(s => s.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);
  }

  // Try bullet/dash lines
  const bulletMatch = text.match(/^[-•*]\s/m);
  if (bulletMatch) {
    return text
      .split(/\n/)
      .map(s => s.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean);
  }

  // Fall back: split on newlines first
  const lines = text.split(/\n/).map(s => s.trim()).filter(Boolean);
  if (lines.length > 1) return lines;

  // Last resort: split on sentence boundaries (capital letter after period+space)
  const sentences = text.split(/\.\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean);
  return sentences.length > 1 ? sentences : [text.trim()];
}

/**
 * Build a prompt-ready exemplar block distributed across lesson days.
 *
 * Design rules:
 *  - Each indicator's exemplar steps are parsed into an ordered list.
 *  - Steps are distributed evenly across days (never duplicated, never skipped).
 *  - When there are MORE exemplars than days, one exemplar per day is used.
 *  - When there are FEWER exemplars than days, the steps are split across days.
 *  - Output is numbered clearly so the AI knows EXACTLY which steps go to which day.
 *  - Each step is labelled with its ORIGINAL text so the AI copies it word-for-word.
 */
export function buildExemplarBlock(subject, cls, strandName, subStrandName, indicatorCodes, selectedDays) {
  const details = getIndicatorDetails(subject, cls, strandName, subStrandName, indicatorCodes);
  if (!details.length) return "";

  const exemplars = details.filter(d => d.exemplar && d.exemplar !== "null");
  const days = (selectedDays && selectedDays.length > 0) ? selectedDays : ["Monday"];
  const numDays = days.length;

  // ── No exemplars in database ──
  if (exemplars.length === 0) {
    const lines = days.map((dayName, i) => {
      const ind = details[Math.min(i, details.length - 1)];
      return [
        `╔══ DAY ${i + 1}: ${dayName.toUpperCase()} ══╗`,
        `  Indicator: ${ind ? ind.code + " - " + ind.text : "as selected"}`,
        `  No NaCCA exemplar stored for this indicator.`,
        `  Write Phase 2 activities based on the indicator text, using NaCCA pedagogy.`,
        `  Include: a teacher-led explanation, a group activity, and an individual task.`,
      ].join("\n");
    });
    return `\n${"═".repeat(60)}\nNaCCA EXEMPLAR STEPS: PER DAY ASSIGNMENT\n${"═".repeat(60)}\n\n${lines.join("\n\n")}`;
  }

  // ── Helper: distribute steps evenly across N days ──
  const distributeSteps = (steps, n) => {
    const dist = Array.from({ length: n }, () => []);
    steps.forEach((step, i) => dist[i % n].push(step));
    return dist;
  };

  // ── Build per-day blocks ──
  const dayBlocks = days.map((dayName, dayIdx) => {
    const header = `╔══ DAY ${dayIdx + 1}: ${dayName.toUpperCase()} ══╗`;

    if (exemplars.length >= numDays) {
      // ── One exemplar per day ──
      const ex = exemplars[Math.min(dayIdx, exemplars.length - 1)];
      const steps = parseExemplarSteps(ex.exemplar);
      const kwLine = (ex.keyWords && ex.keyWords !== "null")
        ? `\n  Key Words for today: ${ex.keyWords}` : "";

      const stepLines = steps.map((s, i) =>
        `  STEP ${i + 1}: ${s}`
      ).join("\n");

      return [
        header,
        `  Indicator: ${ex.code} - ${ex.text}`,
        `  NaCCA Exemplar steps (${steps.length} step${steps.length !== 1 ? "s" : ""}) - copy each WORD FOR WORD, only swap first verb:`,
        stepLines,
        kwLine,
      ].filter(Boolean).join("\n");
    }

    // ── Fewer exemplars than days - split steps across days ──
    // Collect all steps from all exemplars into one pool
    const allSteps = exemplars.flatMap(ex => parseExemplarSteps(ex.exemplar));
    const primaryEx = exemplars[0];
    const distribution = distributeSteps(allSteps, numDays);
    const mySteps = distribution[dayIdx] || [];
    const totalSteps = allSteps.length;
    const globalStart = distribution.slice(0, dayIdx).flat().length + 1;

    if (mySteps.length === 0) {
      return [
        header,
        `  Indicator: ${primaryEx.code} - ${primaryEx.text}`,
        `  All ${totalSteps} exemplar steps were covered on previous days.`,
        `  Use this lesson for review and assessment only - NO new exemplar steps.`,
        `  Write 3-4 activities where learners demonstrate what they have learned.`,
      ].join("\n");
    }

    const stepLines = mySteps.map((s, i) =>
      `  STEP ${globalStart + i} of ${totalSteps}: ${s}`
    ).join("\n");

    const prevDay = dayIdx > 0 ? days[dayIdx - 1] : null;
    const contNote = prevDay
      ? `  (Steps 1–${globalStart - 1} were covered on ${prevDay}. Continue from step ${globalStart}.)`
      : "";

    return [
      header,
      `  Indicator: ${primaryEx.code} - ${primaryEx.text}`,
      `  NaCCA Exemplar - your steps for today (${mySteps.length} of ${totalSteps} total):`,
      contNote,
      `  Copy each step WORD FOR WORD - only swap the very first verb using your synonym table:`,
      stepLines,
      (primaryEx.keyWords && primaryEx.keyWords !== "null")
        ? `  Key Words: ${primaryEx.keyWords}` : "",
    ].filter(Boolean).join("\n");
  });

  return [
    "",
    "═".repeat(60),
    "NaCCA EXEMPLAR STEPS: PER DAY ASSIGNMENT",
    "INSTRUCTION: For each day's [NACCA] block, copy the steps",
    "listed under that day EXACTLY. Change ONLY the first verb.",
    "Every other word must be identical to what is written below.",
    "═".repeat(60),
    "",
    dayBlocks.join("\n\n"),
    "",
  ].join("\n");
}
/* ═══════════════════════════════════════════════════════════════════
 * SHS CURRICULUM HELPERS
 * Mirror of the Primary/JHS helpers but work with the SHS data
 * structure which has learningOutcomes, skills21stCentury, etc.
 * ═══════════════════════════════════════════════════════════════════ */

/** Returns true when a subject has SHS data in ALL_SUBJECTS */
export function shsSubjectInDB(subject) {
  if (!subject) return false;
  const classes = MANIFEST[subject] || [];
  return ["SHS 1","SHS 2","SHS 3"].some(cls => classes.includes(cls));
}

/** All strands for an SHS subject + class */
export function getSHSStrands(subject, cls) {
  return ALL_SUBJECTS[subject]?.data[cls] || [];
}

/** All sub-strands for an SHS subject + class + strand */
export function getSHSSubStrands(subject, cls, strandName) {
  const strand = getSHSStrands(subject, cls).find(s => s.strand === strandName);
  return strand?.subStrands || [];
}

/** All content standards for an SHS subject + class + strand + sub-strand */
export function getSHSContentStandards(subject, cls, strandName, subStrandName) {
  const sub = getSHSSubStrands(subject, cls, strandName).find(s => s.name === subStrandName);
  return sub?.contentStandards || [];
}

/** All indicators for an SHS subject + class + strand + sub-strand */
export function getSHSIndicators(subject, cls, strandName, subStrandName) {
  return getSHSContentStandards(subject, cls, strandName, subStrandName)
    .flatMap(cs => (cs.indicators || []).map(ind => ({
      ...ind,
      contentStandardCode:  cs.code,
      contentStandardTitle: cs.title,
    })));
}

/** Full sub-strand object (has learningOutcomes, skills21stCentury, teachingResources) */
export function getSHSSubStrandDetail(subject, cls, strandName, subStrandName) {
  return getSHSSubStrands(subject, cls, strandName).find(s => s.name === subStrandName) || null;
}