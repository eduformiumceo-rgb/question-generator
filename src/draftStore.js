/**
 * draftStore.js - refresh / crash recovery for the exam wizard.
 *
 * WHAT IT KEEPS (all in THIS browser only, nothing is sent anywhere):
 *   1. Wizard draft   class, subject, topics, difficulty, sections ... (small, localStorage).
 *                     Read synchronously so the page opens already filled in: no flash of an empty form.
 *   2. Paper snapshot the generated paper on screen, with edits not yet saved to My Exams
 *                     (large, IndexedDB; localStorage only as a size-guarded fallback).
 *   3. Generation job a marker that "a generation was running", plus the sections finished so far, so an interrupted run
 *                     can be explained and CONTINUED (only the missing sections are written and charged).
 *
 * RULES THAT MAKE IT SAFE TO SHIP:
 *   - Never trust what comes back out of storage: every field is type-checked, length-capped and
 *     allow-listed (sanitizeWizard), so a stale, hand-edited or corrupted draft cannot crash the page.
 *   - Versioned (DRAFT_VERSION) and expiring (DRAFT_TTL_MS): an old draft from an older build is dropped.
 *   - Owned: a draft made while signed in belongs to that account. Another account on the same computer
 *     (a shared staff-room PC) never sees it, and signing out wipes everything (clearAllDrafts).
 *     A draft made before signing in (e.g. just before the Google / Hub redirect) is adopted by whoever signs in.
 *   - Every storage call is wrapped. Private windows, blocked storage and full disks make saving
 *     silently do nothing; they never throw into the page.
 *   - Crash-loop guard: if restoring a paper crashes the page twice in a row, the paper is discarded.
 */

export const DRAFT_VERSION = 1;
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // a wizard draft or paper copy is kept 7 days from its last change
export const JOB_TTL_MS = 30 * 60 * 1000;               // an "interrupted generation" notice is only meaningful for 30 minutes

export const WIZARD_KEY = "eduq.draft.v1";
export const JOB_KEY = "eduq.job.v1";
const PAPER_LS_KEY = "eduq.paper.v1";
const RESTORE_KEY = "eduq.restoring.v1";
const IDB_NAME = "eduq-drafts";
const IDB_STORE = "paper";
const PAPER_ID = "current";
const PAPER_LS_MAX_CHARS = 1500000;   // localStorage fallback only: stay well inside the ~5 MB origin quota (the school logo lives there too)

const DIFFICULTIES = ["Easy", "Moderate", "Hard"];
const LANGUAGE_STYLES = ["Simple", "Balanced", "Advanced"];
const COGNITIVE_LEVELS = ["Recall", "Application", "Critical Thinking"];
const SECTION_TYPES = ["objective", "structured", "essay"];

/** The id a draft is filed under: the signed-in account, or null when nobody is signed in. */
export const userKey = (u) => {
  const k = u && (u.id ?? u.sub ?? u.email);
  return k ? String(k) : null;
};

/* ── localStorage helpers: every one swallows its own errors ──────────────────── */
const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };
function readJSON(key) {
  try { const raw = store()?.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeJSON(key, value) {
  try { const s = store(); if (!s) return false; s.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function removeKey(key) { try { store()?.removeItem(key); } catch { /* nothing to remove, nothing breaks */ } }

const isFresh = (rec, ttl, now) =>
  !!rec && rec.v === DRAFT_VERSION && Number.isFinite(rec.ts) && now - rec.ts <= ttl && rec.ts - now < 60000; // not from the future (clock changes)
/** A draft made while signed out (uid null) can be adopted by whoever signs in next; otherwise the owner must match. */
const ownedBy = (rec, uid) => rec.uid == null || rec.uid === uid;

/* ── Sanitising ────────────────────────────────────────────────────────────────── */
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : undefined);
const bool = (v) => (typeof v === "boolean" ? v : undefined);
const oneOf = (v, list) => (list.includes(v) ? v : undefined);
const strList = (v, maxItems, maxLen) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.slice(0, maxLen)).slice(0, maxItems) : undefined;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** A JSON-safe deep copy: plain data only, bounded depth / length, no prototype tricks. */
function cleanPlain(v, depth = 0) {
  if (v === null) return null;
  const t = typeof v;
  if (t === "string") return v.slice(0, 4000);
  if (t === "boolean") return v;
  if (t === "number") return Number.isFinite(v) ? v : undefined;
  if (depth >= 4) return undefined;
  if (Array.isArray(v)) return v.slice(0, 100).map((x) => cleanPlain(x, depth + 1)).filter((x) => x !== undefined);
  if (t === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      const c = cleanPlain(x, depth + 1);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return undefined;
}

function cleanSections(v) {
  if (!Array.isArray(v)) return undefined;
  const out = [];
  for (const raw of v.slice(0, 12)) {
    const s = cleanPlain(raw);
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    if (typeof s.id !== "string" || !s.id || s.id.length > 8) continue;
    if (!SECTION_TYPES.includes(s.type)) continue;
    if (!Number.isFinite(s.questionCount) || s.questionCount < 0 || s.questionCount > 60) continue;
    if (!Number.isFinite(s.marksPerQuestion) || s.marksPerQuestion < 0 || s.marksPerQuestion > 1000) continue;
    out.push({ ...s, label: typeof s.label === "string" ? s.label : "", enabled: s.enabled !== false });
  }
  return out.length ? out : undefined;
}

/**
 * Turns whatever came out of storage into a safe set of wizard fields.
 * Unknown keys are dropped; a bad value drops only that one field (the page falls back to its default).
 * Limits mirror the real ones: 40 topics (moderation.js), 8 sections (ExamStructureBuilder).
 */
export function sanitizeWizard(f) {
  if (!f || typeof f !== "object" || Array.isArray(f)) return null;
  const out = {};
  const put = (k, v) => { if (v !== undefined) out[k] = v; };
  put("className", str(f.className, 40));
  put("term", str(f.term, 40));
  put("examType", str(f.examType, 60));
  const dm = f.durationMinutes;
  if (typeof dm === "number" && Number.isFinite(dm) && dm >= 0 && dm <= 1000) put("durationMinutes", dm);
  put("subject", str(f.subject, 120));
  put("shsCourse", str(f.shsCourse, 120));
  put("shsKey", str(f.shsKey, 120));
  put("selectedTopics", strList(f.selectedTopics, 40, 300));
  put("strands", strList(f.strands, 60, 300));
  put("pastedSyllabus", str(f.pastedSyllabus, 60000));
  put("difficulty", oneOf(f.difficulty, DIFFICULTIES));
  put("languageStyle", oneOf(f.languageStyle, LANGUAGE_STYLES));
  if (Array.isArray(f.cognitiveLevels)) put("cognitiveLevels", f.cognitiveLevels.filter((x, i, a) => COGNITIVE_LEVELS.includes(x) && a.indexOf(x) === i));
  put("sections", cleanSections(f.sections));
  put("allowDiagrams", bool(f.allowDiagrams));
  put("includeMarkingScheme", bool(f.includeMarkingScheme));
  put("examStyle", oneOf(f.examStyle, ["school", "public"]));
  put("styleChosen", bool(f.styleChosen));
  return Object.keys(out).length ? out : null;
}

/** A wizard with nothing the teacher actually chose or typed is not worth keeping (and would only get in the way). */
export const isMeaningfulWizard = (f) =>
  !!f && !!(f.className || f.subject || (f.selectedTopics && f.selectedTopics.length) || (f.pastedSyllabus && f.pastedSyllabus.trim()));

/* ── 1. Wizard draft (localStorage, synchronous) ──────────────────────────────── */
export function saveWizardDraft(fields, uid, now = Date.now()) {
  const clean = sanitizeWizard(fields);
  if (!clean || !isMeaningfulWizard(clean)) { removeKey(WIZARD_KEY); return false; }
  return writeJSON(WIZARD_KEY, { v: DRAFT_VERSION, ts: now, uid: uid ?? null, fields: clean });
}

/** → { fields, ts } or null. Drops (and deletes) anything stale, foreign, malformed or empty. */
export function loadWizardDraft(uid, now = Date.now()) {
  const rec = readJSON(WIZARD_KEY);
  if (!rec) return null;
  if (!isFresh(rec, DRAFT_TTL_MS, now) || !ownedBy(rec, uid ?? null)) { removeKey(WIZARD_KEY); return null; }
  const fields = sanitizeWizard(rec.fields);
  if (!isMeaningfulWizard(fields)) { removeKey(WIZARD_KEY); return null; }
  return { fields, ts: rec.ts };
}
export const clearWizardDraft = () => removeKey(WIZARD_KEY);

/* ── 3. Generation job (localStorage) ─────────────────────────────────────────── */
const JOB_SECTIONS_MAX_CHARS = 400000;   // the finished sections ride along only when they comfortably fit

/** Same value for the same settings regardless of key order: lets "continue" check that nothing changed since the interrupted run. */
export function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}
/** A short fingerprint (two 32-bit FNV-1a hashes) of any JSON-like value. */
export function fingerprint(v) {
  const str = stableStringify(v);
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c ^ (i & 0xff), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

const looksLikeSection = (sec) =>
  !!sec && typeof sec === "object" && !Array.isArray(sec) && typeof sec.id === "string" && sec.id.length > 0 && sec.id.length <= 8 &&
  Array.isArray(sec.questions) && sec.questions.length > 0 && sec.questions.every((q) => q && typeof q === "object");

/**
 * job: { tier, total, done, key?, title?, instructions?, sections? }
 *   key       fingerprint of the generation settings the sections belong to
 *   sections  the finished sections so far, kept so the run can be continued rather than redone
 */
export function saveJob(job, uid, now = Date.now()) {
  const secs = Array.isArray(job?.sections) ? job.sections.filter(looksLikeSection).slice(0, 12) : [];
  const keepSections = secs.length > 0 && typeof job?.key === "string" && job.key.length <= 64 && JSON.stringify(secs).length <= JOB_SECTIONS_MAX_CHARS;
  const j = {
    tier: job?.tier === "free" ? "free" : "premium",
    total: Math.max(0, Math.min(50, Number(job?.total) || 0)),
    done: Math.max(0, Math.min(50, Number(job?.done) || 0)),
    ...(keepSections ? {
      key: job.key,
      title: typeof job.title === "string" ? job.title.slice(0, 300) : "",
      instructions: Array.isArray(job.instructions) ? job.instructions.filter((x) => typeof x === "string").slice(0, 30).map((x) => x.slice(0, 800)) : [],
      sections: secs,
    } : {}),
  };
  return writeJSON(JOB_KEY, { v: DRAFT_VERSION, ts: now, uid: uid ?? null, job: j });
}
/** A generation can only be started signed in, so the account must match exactly. Re-validates the stored sections. */
export function loadJob(uid, now = Date.now()) {
  const rec = readJSON(JOB_KEY);
  if (!rec) return null;
  if (!isFresh(rec, JOB_TTL_MS, now) || !uid || rec.uid !== uid || !rec.job || typeof rec.job !== "object") { removeKey(JOB_KEY); return null; }
  const j = rec.job;
  const out = { tier: j.tier === "free" ? "free" : "premium", total: Math.max(0, Math.min(50, Number(j.total) || 0)), done: Math.max(0, Math.min(50, Number(j.done) || 0)), ts: rec.ts };
  if (typeof j.key === "string" && Array.isArray(j.sections) && j.sections.length && j.sections.every(looksLikeSection)) {
    out.key = j.key;
    out.title = typeof j.title === "string" ? j.title : "";
    out.instructions = Array.isArray(j.instructions) ? j.instructions.filter((x) => typeof x === "string") : [];
    out.sections = j.sections;
  }
  return out;
}
export const clearJob = () => removeKey(JOB_KEY);

/* ── 2. Paper snapshot (IndexedDB, localStorage fallback) ─────────────────────── */
let dbPromise = null;
function getDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const idb = globalThis.indexedDB;
      if (!idb) return resolve(null);
      const req = idb.open(IDB_NAME, 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore(IDB_STORE); } catch { /* already there */ } };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { try { db.close(); } catch { /* closing twice is fine */ } dbPromise = null; };
        db.onclose = () => { dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

/** Runs one request in one transaction and says whether it fully committed. */
function idbRun(db, mode, run) {
  return new Promise((resolve) => {
    try {
      const t = db.transaction(IDB_STORE, mode);
      let result;
      const req = run(t.objectStore(IDB_STORE));
      if (req) req.onsuccess = () => { result = req.result; };
      t.oncomplete = () => resolve({ ok: true, result });
      t.onerror = () => resolve({ ok: false });
      t.onabort = () => resolve({ ok: false });
    } catch { resolve({ ok: false }); }
  });
}

/** A paper only needs to look like a paper; the renderer and the crash-loop guard handle the rest. */
const looksLikePaper = (p) =>
  !!p && typeof p === "object" && !Array.isArray(p) && Array.isArray(p.sections) && p.sections.length > 0 &&
  p.sections.every((s) => s && typeof s === "object" && Array.isArray(s.questions));

/**
 * snap: { examData, examTier, examHasMarkingScheme, savedId, dirty, examVersion, openedMeta, landscape, figuresPending }
 * → true when a copy was really written (the page uses this to decide whether to warn before leaving).
 */
export async function savePaperSnapshot(snap, uid, now = Date.now()) {
  if (!snap || !looksLikePaper(snap.examData)) return false;
  const rec = { v: DRAFT_VERSION, ts: now, uid: uid ?? null, snap };
  const db = await getDB();
  if (db) {
    const r = await idbRun(db, "readwrite", (s) => s.put(rec, PAPER_ID));
    if (r.ok) { removeKey(PAPER_LS_KEY); return true; }
  }
  try { // IndexedDB unavailable or full: a small paper still fits in localStorage
    const json = JSON.stringify(rec);
    if (json.length > PAPER_LS_MAX_CHARS) return false;
    const s = store(); if (!s) return false;
    s.setItem(PAPER_LS_KEY, json);
    return true;
  } catch { return false; }
}

/** → { snap, ts } or null. A paper is always the signed-in teacher's own, so the account must match. */
export async function loadPaperSnapshot(uid, now = Date.now()) {
  if (restoreLooksCrashy()) { await clearPaperSnapshot(); clearRestoreAttempt(); return null; }
  let rec = null;
  const db = await getDB();
  if (db) { const r = await idbRun(db, "readonly", (s) => s.get(PAPER_ID)); if (r.ok) rec = r.result || null; }
  if (!rec) rec = readJSON(PAPER_LS_KEY);
  if (!rec) return null;
  const ok = isFresh(rec, DRAFT_TTL_MS, now) && !!uid && rec.uid === uid && rec.snap && looksLikePaper(rec.snap.examData);
  if (!ok) { await clearPaperSnapshot(); return null; }
  return { snap: rec.snap, ts: rec.ts };
}

export async function clearPaperSnapshot() {
  removeKey(PAPER_LS_KEY);
  const db = await getDB();
  if (db) await idbRun(db, "readwrite", (s) => s.delete(PAPER_ID));
}

/* ── Crash-loop guard ──────────────────────────────────────────────────────────── */
// markRestoreAttempt() is called just before a recovered paper is put on screen and clearRestoreAttempt() a moment after it
// has rendered. If the page crashes in between, the marker survives; after two such crashes in a row the snapshot is dropped
// instead of crashing the page on every reload. (Two, not one, so a quick double-refresh never costs anyone their paper.)
const RESTORE_WINDOW_MS = 60000;
export function markRestoreAttempt(now = Date.now()) {
  const rec = readJSON(RESTORE_KEY);
  const count = rec && now - rec.ts < RESTORE_WINDOW_MS ? (Number(rec.count) || 0) + 1 : 1;
  writeJSON(RESTORE_KEY, { ts: now, count });
}
export const clearRestoreAttempt = () => removeKey(RESTORE_KEY);
function restoreLooksCrashy(now = Date.now()) {
  const rec = readJSON(RESTORE_KEY);
  return !!rec && now - rec.ts < RESTORE_WINDOW_MS && (Number(rec.count) || 0) >= 2;
}

/** Sign-out / "start fresh": remove every trace of the work in progress from this browser. */
export async function clearAllDrafts() {
  removeKey(WIZARD_KEY);
  removeKey(JOB_KEY);
  removeKey(RESTORE_KEY);
  await clearPaperSnapshot();
}

/** Test helper: forget the cached IndexedDB handle so each test can start with a fresh database. */
export function __resetDraftStoreForTests() {
  try { dbPromise?.then((db) => { try { db?.close(); } catch { /* already closed */ } }); } catch { /* nothing open */ }
  dbPromise = null;
}
