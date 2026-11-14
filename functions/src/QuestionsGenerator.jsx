/**
 * ═══════════════════════════════════════════════════════════════════
 * EDUFORMIUM - AI QUESTIONS GENERATOR
 * Main page component
 *
 * Drop-in page for the existing Eduformium shell. Wire it up the same way
 * the Lesson Planner tabs are wired in App.jsx (a new nav item that renders
 * <QuestionsGenerator user={user} onCoinChange={...} />).
 *
 * Reuses, unmodified:
 *   - curriculumIndex.js               (all GES curriculum data + helpers)
 *   - auth.js  (getUser, getToken - unchanged from the Lesson Planner)
 *   - sharedStyles.jsx                  (F / S tokens copied from App.jsx)
 *   - examTemplate.js                  (system prompt + print-safe renderer)
 * ═══════════════════════════════════════════════════════════════════
 */
import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { F, S, Spinner } from "./sharedStyles.jsx";
import ExamStructureBuilder, { DEFAULT_SECTIONS } from "./components/ExamStructureBuilder.jsx";
import TopicSelector from "./components/TopicSelector.jsx";
import DiagramManager from "./components/DiagramManager.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { diagramDrawing } from "./examFigures.js";
import { isSHSClass, termOptionsFor, mapTermForLevel, examTypesFor, mapExamTypeForLevel } from "./shsCourses.js";
import { renderExamHTML, validateExamData, createExamVariant, schoolCrestSVG, OPTIONS_LAYOUTS, ID_MODES, PAPER_PRESETS, clampIdDigits, DEFAULT_NOTICE } from "./examTemplate.js";
import { fileToPngDataUrl, svgToPngDataUrl } from "./imageUtils.js";
// NOT statically imported - docx bundles to ~700KB, which would hurt first-load
// time on low-end Android for a feature most teachers use occasionally, not on
// every visit. Loaded on demand inside handleDownloadWord() instead.
import ExamEditor from "./components/ExamEditor.jsx";
import { screenExamInput } from "./moderation.js";
import { FREE_TIER_MAX_SECTIONS, FREE_TIER_MAX_TOTAL_QUESTIONS, FREE_TIER_ALLOWED_TYPES, FREE_TIER_DAILY_LIMIT } from "./freeTierLimits.js";
import NumberField from "./components/NumberField.jsx";
import TopUpModal from "./components/TopUpModal.jsx";
// Reuses the Lesson Planner's auth.js UNCHANGED (same Google OAuth flow, same
// getToken()/getUser()) - this app is a separate Cloudflare Pages deployment
// but points at the SAME Supabase project and JWT secret, so a teacher who
// signs in here (or on the Lesson Planner) is recognized on both: real SSO,
// no second account. See functions/api/auth/[[path]].js for the server side.
import { getUser, getToken, completePendingGoogleSignIn, signOut } from "./auth.js";
// Reused unchanged - same Google sign-in modal/UX as the Lesson Planner.
// Because both apps share one Supabase project + JWT secret, signing in here
// creates/reuses the exact same account as the Lesson Planner.
import AuthModal from "./AuthModal_upgraded.jsx";
import { goToHubSignIn } from "./hubSignIn.js";
import AppHeader from "./components/AppHeader.jsx";
import SavedExams from "./components/SavedExams.jsx";
import { ExamHistory, MAX_SAVED_EXAMS, metaForSave } from "./examHistory.js";
import InstallPrompt from "./components/InstallPrompt.jsx";
import { usePwaInstall } from "./pwaInstall.js";

const EXAM_API = "/api/generate-exam";
const ACCOUNT_API = "/api/exam-account";
// Priced consistently with the Lesson Planner's real COINS_PER_LESSON=0.5
// precedent, scaled per section (= per AI call), not a flat guessed number -
// must match functions/api/generate-exam.js's CREDIT_COST_PER_SECTION_*.
// These are RAW coin units - the wallet backend always works in raw units.
const CREDIT_COST_PER_SECTION_WITH_MARKING = 0.5;
const CREDIT_COST_PER_SECTION_QUESTIONS_ONLY = 0.35;

// Your real App.jsx multiplies the raw `coins` balance by 30 before showing
// it to a teacher (confirmed directly in generate-premium.js's own code
// comment: "the UI multiplies real balances by DISPLAY_CREDIT_MULTIPLIER
// (30x)... that constant only exists client-side"). This wallet is shared
// with the Lesson Planner now, so this app must apply the exact same
// multiplier - otherwise the same raw balance would show as two different
// numbers depending on which app a teacher happens to be in, which would
// look like a bug (or missing money) even though nothing is actually wrong.
const DISPLAY_CREDIT_MULTIPLIER = 30;
// raw → the number shown on screen. Rounded for display only - the actual
// amount deducted/charged server-side always stays at full precision.
const toDisplayCredits = (raw) => Math.round(raw * DISPLAY_CREDIT_MULTIPLIER);
const formatCredits = (raw) => toDisplayCredits(raw);


// ── Remembered school identity + paper format (this browser only) ──────────
// A teacher prints dozens of papers a term for the same school, so the school
// name, motto, logo and paper format are saved locally and pre-filled next time.
// Every access is wrapped: private windows / blocked storage must never break the page.
const PREFS_KEY = "eduq.paperPrefs.v1";
const LOGO_KEY = "eduq.schoolLogo.v1";
const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch { return {}; } };
const readLogo = () => { try { return localStorage.getItem(LOGO_KEY) || null; } catch { return null; } };
const isPublicExamClass = (cls) => /^(JHS\s*3|SHS\s*3|Basic\s*9)\b/i.test(String(cls || "").trim());

/** Accessible on/off switch. A single <button> - no hidden checkbox inside a <label>,
 *  which previously fired twice per tap (span onClick + label→input onChange) and
 *  cancelled itself out, so the toggles appeared dead. */
function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative", width: 44, height: 26, flexShrink: 0, marginLeft: 12, padding: 0,
        border: "none", borderRadius: 99, cursor: "pointer", transition: "background .15s",
        background: checked ? "#0D9488" : "var(--border-strong)",
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: checked ? 21 : 3, width: 20, height: 20, borderRadius: "50%",
        background: "#fff", transition: "left .15s", pointerEvents: "none", boxShadow: "0 1px 2px rgba(0,0,0,.25)",
      }} />
    </button>
  );
}

/** Progress panel: real per-section fill, an animated "working" segment, elapsed time. */
function GenerationProgress({ progress, elapsed }) {
  const total = Math.max(progress?.total || 1, 1);
  const done = progress?.sectionsDone?.size || 0;
  const current = Math.min(progress?.index || 1, total);
  const mm = Math.floor(elapsed / 60), ss = String(elapsed % 60).padStart(2, "0");
  return (
    <div style={{ marginBottom: 10 }} aria-live="polite">
      <style>{`@keyframes qgPulse{0%,100%{opacity:.35}50%{opacity:1}}`}</style>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {Array.from({ length: total }).map((_, i) => {
          const isDone = i < done;
          const isActive = !isDone && i === done;
          return (
            <div key={i} style={{
              flex: 1, height: 6, borderRadius: 3,
              background: isDone || isActive ? "#0D9488" : "var(--border)",
              animation: isActive ? "qgPulse 1.2s ease-in-out infinite" : "none",
              transition: "background .2s",
            }} />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--text-muted)" }}>
        <span>{progress?.sectionLabel ? `Writing ${progress.sectionLabel} (${current} of ${total})` : "Starting…"}</span>
        <span>{mm}:{ss}</span>
      </div>
    </div>
  );
}

const DIFFICULTIES = ["Easy", "Moderate", "Hard"];
const LANGUAGE_STYLES = [
  { value: "Simple", label: "Simple & Clear" },
  { value: "Balanced", label: "Balanced" },
  { value: "Advanced", label: "Advanced / Academic" },
];
const COGNITIVE_LEVELS = ["Recall", "Application", "Critical Thinking"];

/**
 * Streams the generation endpoint's newline-delimited JSON response, calling
 * onProgress for each event as it arrives so the UI can show real
 * per-section progress instead of one long blocking spinner.
 * Returns the final { examData, creditsRemaining } from the "done" event.
 */
async function streamExamAPI(payload, token, onProgress) {
  const controller = new AbortController();
  let watchdog;
  const arm = () => { clearTimeout(watchdog); watchdog = setTimeout(() => controller.abort(), 120000); };
  arm();
  let res;
  try {
    res = await fetch(EXAM_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(watchdog);
    throw new Error(e.name === "AbortError" ? "The server took too long to respond. Please try again. You have not been charged." : e.message);
  }

  if (!res.ok) {
    clearTimeout(watchdog);
    const errBody = await res.json().catch(() => ({}));
    const err = new Error(errBody.error || errBody.message || `Generation failed (HTTP ${res.status}).`);
    err.status = res.status;
    err.balance = errBody.balance;
    throw err;
  }
  if (!res.body) throw new Error("Streaming is not supported in this browser. Please update your browser and try again.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult = null;
  let streamError = null;

  while (true) {
    let chunk;
    try { chunk = await reader.read(); }
    catch (e) {
      clearTimeout(watchdog);
      throw new Error(e.name === "AbortError" ? "Generation stalled and was stopped. Please try again. You have not been charged." : "Connection lost while generating. Please try again.");
    }
    arm(); // any bytes (including server keep-alive pings) reset the stall timer
    const { done, value } = chunk;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // last (possibly incomplete) line stays in the buffer
    for (const line of lines) {
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      onProgress?.(event);
      if (event.type === "done") finalResult = event;
      if (event.type === "error") streamError = event;
    }
  }

  clearTimeout(watchdog);
  if (streamError) {
    const err = new Error(streamError.message);
    err.creditsRemaining = streamError.creditsRemaining;
    throw err;
  }
  if (!finalResult) throw new Error("The connection was interrupted before the exam finished generating. Please try again. You have not been charged for an incomplete generation, but do check your credit balance.");
  return finalResult;
}


function QuestionsGeneratorInner() {
  // ── Auth gate - same account/session as the Lesson Planner ─────
  const [user, setUser] = useState(() => (getUser ? getUser() : null));
  const [showAuthModal, setShowAuthModalRaw] = useState(false);
  // Single sign-in: when VITE_HUB_URL is set, opening sign-in / create account sends the person to the Eduformium Hub (see hubSignIn.js).
  // Off by default, so this app's own sign-in window works exactly as before until the variable is set.
  const setShowAuthModal = useCallback((v) => { if (v && goToHubSignIn("questions")) return; setShowAuthModalRaw(v); }, []);

  // Install-app prompt (same behaviour as the Lesson Planner).
  const pwa = usePwaInstall();

  // ── Basic Information ──────────────────────────────────────────
  const savedPrefs = useRef(readPrefs()).current;
  const [schoolName, setSchoolName] = useState(savedPrefs.schoolName || "");
  const [schoolMotto, setSchoolMotto] = useState(savedPrefs.schoolMotto || "");
  const [emblem, setEmblem] = useState(savedPrefs.emblem === "none" ? "none" : "auto"); // "auto" = generated crest when there's no logo
  const [schoolLogo, setSchoolLogo] = useState(() => readLogo()); // data URL - printed in the paper header
  const logoInputRef = useRef(null);
  const [className, setClassName] = useState("");
  const [term, setTerm] = useState("Term 1");
  const [examType, setExamType] = useState("Class Test");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const isSHS = isSHSClass(className);
  // SHS runs two semesters, Basic schools three terms: keep the choice sensible when the level changes.
  useEffect(() => {
    setTerm(t => mapTermForLevel(t, className));
    setExamType(t => mapExamTypeForLevel(t, className));
  }, [isSHS]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Curriculum + Topics (GES / NaCCA only) ──────────────────────
  const [subject, setSubject] = useState("");        // clean display name, e.g. "Biology" - what the AI, the paper and My Exams use
  const [shsCourse, setShsCourse] = useState("");      // SHS only: programme / course, e.g. "General Science"
  const [shsKey, setShsKey] = useState("");            // SHS only: internal curriculum key, e.g. "Biology (GS)"
  const programme = isSHS ? shsCourse : "";          // sent to the AI, printed on the paper, saved with the exam
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [pastedSyllabus, setPastedSyllabus] = useState("");

  // ── Difficulty + Language + Cognitive level ────────────────────
  const [difficulty, setDifficulty] = useState("Moderate");
  const [languageStyle, setLanguageStyle] = useState("Balanced");
  const [cognitiveLevels, setCognitiveLevels] = useState(["Recall", "Application"]);

  // ── Exam structure ──────────────────────────────────────────────
  const [sections, setSections] = useState(DEFAULT_SECTIONS);

  // ── Diagrams ─────────────────────────────────────────────────────
  const [allowDiagrams, setAllowDiagrams] = useState(true);
  const [includeMarkingScheme, setIncludeMarkingScheme] = useState(true);

  // ── Generation state ─────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [loadingTier, setLoadingTier] = useState(null); // "free" | "premium" | null - which button is spinning
  const [progress, setProgress] = useState(null); // { index, total, sectionLabel, sectionsDone: Set }
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [examData, setExamData] = useState(null);
  const [livePreview, setLivePreview] = useState(null); // partial paper shown while sections are still being written
  const [examHasMarkingScheme, setExamHasMarkingScheme] = useState(true); // reflects the generated exam, not the current toggle
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [optionsLayout, setOptionsLayout] = useState(["vertical", "two", "row"].includes(savedPrefs.optionsLayout) ? savedPrefs.optionsLayout : "vertical"); // MCQ options: "vertical" | "two" | "row"

  // ── Paper format: candidate details, sealed-paper notice, "Turn over" ───
  // Presets are shortcuts (everyday school exam vs BECE/WASSCE-style paper);
  // every control stays individually editable, so a class test, a mock for
  // external candidates or a plain worksheet all print the way the teacher wants.
  const [paperPreset, setPaperPreset] = useState(savedPrefs.paperPreset || "school"); // "school" | "public" | "custom"
  const [idMode, setIdMode] = useState(["line", "boxes", "none"].includes(savedPrefs.idMode) ? savedPrefs.idMode : PAPER_PRESETS.school.idMode);
  const [idDigits, setIdDigits] = useState(clampIdDigits(savedPrefs.idDigits ?? PAPER_PRESETS.school.idDigits));
  const [idLabel, setIdLabel] = useState(typeof savedPrefs.idLabel === "string" ? savedPrefs.idLabel : PAPER_PRESETS.school.idLabel);
  const [notice, setNotice] = useState(!!savedPrefs.notice);
  const [turnOver, setTurnOver] = useState(savedPrefs.turnOver !== false);
  const presetChosenByUser = useRef(!!savedPrefs.paperPreset);
  const lastIdMode = useRef(null); // remembers Boxes/Line while the index-number switch is off
  const applyPreset = (id, byUser = true) => {
    const p = PAPER_PRESETS[id];
    if (!p) return;
    if (byUser) presetChosenByUser.current = true;
    setPaperPreset(id); setIdMode(p.idMode); setIdDigits(p.idDigits); setIdLabel(p.idLabel); setNotice(p.notice); setTurnOver(p.turnOver);
  };
  const customise = (setter) => (v) => { presetChosenByUser.current = true; setPaperPreset("custom"); setter(v); };

  // Sensible default: a mock exam for a final-year class (JHS 3 / SHS 3) gets the
  // public-exam look. Only until the teacher picks a style themselves.
  useEffect(() => {
    if (presetChosenByUser.current) return;
    applyPreset(examType === "Mock Exam" && isPublicExamClass(className) ? "public" : "school", false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examType, className]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ schoolName, schoolMotto, emblem, optionsLayout, paperPreset: presetChosenByUser.current ? paperPreset : undefined, idMode, idDigits, idLabel, notice, turnOver }));
    } catch { /* storage unavailable: nothing to remember, nothing breaks */ }
  }, [schoolName, schoolMotto, emblem, optionsLayout, paperPreset, idMode, idDigits, idLabel, notice, turnOver]);
  useEffect(() => {
    try {
      if (schoolLogo && schoolLogo.length < 900000) localStorage.setItem(LOGO_KEY, schoolLogo);
      else if (!schoolLogo) localStorage.removeItem(LOGO_KEY);
    } catch { /* ignore */ }
  }, [schoolLogo]);
  const [showTopUp, setShowTopUp] = useState(false);
  const printFrameRef = useRef(null);

  // Credits are the SAME shared `coins` wallet the Lesson Planner uses -
  // not a separate balance. `creditBalance` here is always the RAW value;
  // toDisplayCredits() is applied only at render time, matching the real
  // App.jsx's rule ("never show coins raw to the user").
  const [creditBalance, setCreditBalance] = useState(null);
  const fetchBalance = useCallback(async () => {
    try {
      const token = getToken ? getToken() : null;
      if (!token) { setCreditBalance(null); return; }
      const res = await fetch(`${ACCOUNT_API}/balance`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      setCreditBalance(data.balance);
    } catch { /* balance display is non-critical - fail quietly */ }
  }, []);
  React.useEffect(() => { fetchBalance(); }, [fetchBalance]);

  // ── My Exams (saved papers) ────────────────────────────────────────────
  // Same model as the Lesson Planner's "My Plans": every generated exam is
  // saved automatically, up to MAX_SAVED_EXAMS per teacher; the server evicts
  // the oldest on the next save so Supabase storage stays bounded.
  const [view, setView] = useState("generate"); // "generate" | "saved"
  const [savedCount, setSavedCount] = useState(null);
  const [savedRefresh, setSavedRefresh] = useState(0);
  const [openedMeta, setOpenedMeta] = useState(null); // header details of a paper re-opened from My Exams
  const [saveToast, setSaveToast] = useState(null); // { type: "info" | "warn", msg }
  const toastTimer = useRef(null);
  const [savedId, setSavedId] = useState(null);        // id of the My Exams copy of the paper on screen
  const savedExamRef = useRef(null);                   // the examData object that copy was saved from
  const [savingChanges, setSavingChanges] = useState(false);
  const [barHidden, setBarHidden] = useState(false);   // hide the bottom bar while typing so it never covers inputs/keyboard
  const showSaveToast = (type, msg) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setSaveToast({ type, msg });
    toastTimer.current = setTimeout(() => setSaveToast(null), 5000);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const refreshSavedCount = useCallback(async () => {
    try { if (getToken && getToken()) setSavedCount((await ExamHistory.list()).length); else setSavedCount(null); }
    catch { /* count is a nicety - fail quietly */ }
  }, []);
  useEffect(() => { refreshSavedCount(); }, [refreshSavedCount, user]);

  // Retry with backoff (1s, 2s) - teachers are often on unstable mobile data.
  const saveExamToHistory = async (generated, metaToSave) => {
    const entry = {
      title: generated.title || `${metaToSave.subject || ""} ${metaToSave.examType || "Exam"}`.trim(),
      subject: metaToSave.subject, class: metaToSave.className, exam_type: metaToSave.examType,
      exam_json: generated, meta_json: metaToSave,
    };
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await ExamHistory.save(entry);
        setSavedId(r?.id || null); savedExamRef.current = generated;
        setSavedRefresh(n => n + 1);
        const max = r?.max || MAX_SAVED_EXAMS;
        const list = await ExamHistory.list().catch(() => null);
        if (list) setSavedCount(list.length);
        if (r?.deletedCount > 0) {
          showSaveToast("warn", `${r.deletedCount > 1 ? `${r.deletedCount} oldest exams were` : "Your oldest exam was"} removed to make room. You can save up to ${max} exams.`);
        } else if (list && list.length >= max - 1) {
          showSaveToast("info", `${list.length} of ${max} exam slots used. Next save will remove your oldest exam.`);
        } else {
          showSaveToast("info", "Saved to My Exams.");
        }
        return;
      } catch (e) {
        lastErr = e;
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    console.error("[save exam] failed after retries:", lastErr);
    showSaveToast("warn", "Couldn't save this exam to My Exams. It's still on screen, but won't be saved for later.");
  };

  const hasUnsavedEdits = !!savedId && !!examData && examData !== savedExamRef.current;
  const handleSaveChanges = async () => {
    if (!savedId || !examData) return;
    setSavingChanges(true);
    try {
      await ExamHistory.update(savedId, { exam_json: examData, title: examData.title || undefined });
      savedExamRef.current = examData;
      setSavedRefresh(n => n + 1);
      showSaveToast("info", "Changes saved to My Exams.");
    } catch (e) {
      if (e?.status === 404) { setSavedId(null); showSaveToast("warn", "This exam was removed from My Exams to make room, so the changes can't be saved there."); }
      else showSaveToast("warn", e?.message || "Couldn't save your changes. Please try again.");
    } finally { setSavingChanges(false); }
  };
  useEffect(() => {
    const isField = (t) => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") && t.type !== "checkbox" && t.type !== "radio";
    const on = (e) => setBarHidden(isField(e.target));
    const off = () => setBarHidden(false);
    document.addEventListener("focusin", on); document.addEventListener("focusout", off);
    return () => { document.removeEventListener("focusin", on); document.removeEventListener("focusout", off); };
  }, []);

  const handleOpenSaved = async (id) => {
    const row = await ExamHistory.get(id);
    if (!row?.exam_json) throw new Error("That exam has no saved content.");
    const m = row.meta_json || {};
    setSavedId(row.id); savedExamRef.current = row.exam_json;
    setExamData(row.exam_json);
    setExamVersion("A");
    setExamHasMarkingScheme(m.hasMarkingScheme !== false);
    setShowAnswerKey(false);
    setEditMode(false);
    setOpenedMeta({
      schoolName: m.schoolName, className: row.class || m.className, programme: m.programme, subject: row.subject || m.subject,
      term: m.term, examType: row.exam_type || m.examType, durationMinutes: m.durationMinutes,
      idMode: m.idMode, idDigits: m.idDigits, idLabel: m.idLabel, notice: m.notice, turnOver: m.turnOver, schoolMotto: m.schoolMotto,
    });
    if (typeof m.landscape === "boolean") setLandscape(m.landscape);
    if (["vertical", "two", "row"].includes(m.optionsLayout)) setOptionsLayout(m.optionsLayout);
    setView("generate");
    window.scrollTo?.({ top: 0 });
  };

  // "X/5 left" on the Free button - same proactive-remaining-count pattern
  // as the real App.jsx's Free button badge, not just a failure message.
  const [freeUsage, setFreeUsage] = useState(null); // { used, limit, remaining }
  const fetchFreeUsage = useCallback(async () => {
    try {
      const token = getToken ? getToken() : null;
      if (!token) { setFreeUsage(null); return; }
      const res = await fetch(`${ACCOUNT_API}/free-usage`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      setFreeUsage(await res.json());
    } catch { /* non-critical - fail quietly, the server still enforces the real limit */ }
  }, []);
  React.useEffect(() => { fetchFreeUsage(); }, [fetchFreeUsage]);

  // Safety net, mirrored from the real App.jsx: if Google/Supabase lands the
  // teacher on "/" instead of "/auth/callback" (misconfigured Redirect URL,
  // cached link), finish the handshake here so login still completes.
  React.useEffect(() => {
    completePendingGoogleSignIn()
      .then(fresh => { if (fresh) { setUser(fresh); fetchBalance(); fetchFreeUsage(); } })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCognitive = (level) => {
    setCognitiveLevels(prev => prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]);
  };

  const activeSections = useMemo(() => sections.filter(s => s.enabled), [sections]);
  const estimatedCostWithMarking = Math.round(activeSections.length * CREDIT_COST_PER_SECTION_WITH_MARKING * 100) / 100;
  const estimatedCostQuestionsOnly = Math.round(activeSections.length * CREDIT_COST_PER_SECTION_QUESTIONS_ONLY * 100) / 100;

  // Two independent buttons (Free / Premium) call this with their own tier -
  // same pattern as the real App.jsx, where Free and Premium are two
  // separate actions, not a pre-selected mode. Free-tier limits are only
  // checked when the Free button specifically is the one clicked.
  const validate = (tierArg) => {
    if (!className.trim()) return "Please choose a class/grade.";
    if (isSHS && !shsCourse) return "Please choose a programme / course.";
    if (!subject.trim()) return "Please choose a subject.";
    if (!selectedTopics.length && !pastedSyllabus.trim()) return "Select at least one topic, upload your scheme, or paste a syllabus.";
    if (!activeSections.length) return "Enable at least one exam section.";
    const tooMany = activeSections.find(s => Number(s.questionCount) > 60);
    if (tooMany) return `Section ${tooMany.id} requests too many questions (max 60 per section).`;
    const invalid = activeSections.find(s => !Number(s.questionCount) || !Number(s.marksPerQuestion));
    if (invalid) return `Section ${invalid.id} needs a valid question count and marks per question.`;
    if (Number(durationMinutes) < 10 || Number(durationMinutes) > 300) return "Duration should be between 10 and 300 minutes.";
    if (tierArg === "free") {
      if (activeSections.length > FREE_TIER_MAX_SECTIONS) return `Free AI is limited to ${FREE_TIER_MAX_SECTIONS} sections. Reduce your sections, or use Premium AI for a full exam.`;
      const disallowed = activeSections.find(s => !FREE_TIER_ALLOWED_TYPES.includes(s.type));
      if (disallowed) return "Free AI doesn't support essay sections. Remove the essay section, or use Premium AI.";
      const totalQ = activeSections.reduce((sum, s) => sum + (Number(s.questionCount) || 0), 0);
      if (totalQ > FREE_TIER_MAX_TOTAL_QUESTIONS) return `Free AI is limited to ${FREE_TIER_MAX_TOTAL_QUESTIONS} questions total (currently ${totalQ}). Reduce question counts, or use Premium AI.`;
      if (includeMarkingScheme) return "Free AI doesn't include a marking scheme. Turn off \"Questions + Marking Scheme\" above, or use Premium AI.";
    }
    // Same screen the server runs - catches obviously-too-long pastes and
    // disallowed content client-side, before even hitting the network.
    const screen = screenExamInput({ schoolName, pastedSyllabus, topics: selectedTopics });
    if (!screen.ok) return screen.error;
    return "";
  };

  /** AI-assisted topic suggestion - used by TopicSelector's "AI Suggest Topics" button. */
  const handleSuggestTopics = useCallback(async (subj, cls, strand, prog) => {
    try {
      const token = getToken ? getToken() : null;
      const res = await fetch(EXAM_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ mode: "suggest-topics", subject: subj, className: cls, strand, programme: prog || "" }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.topics) ? data.topics : [];
    } catch {
      return []; // fail quietly - suggestion is a convenience, not a blocker
    }
  }, []);

  const handleGenerate = async (tierArg) => {
    setError("");
    const validationError = validate(tierArg);
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setLoadingTier(tierArg);
    setExamData(null);
    setOpenedMeta(null);
    setLivePreview(null);
    setSavedId(null); savedExamRef.current = null;
    setProgress({ index: 0, total: activeSections.length, sectionLabel: "", sectionsDone: new Set() });
    try {
      const payload = {
        mode: "generate-exam", tier: tierArg,
        schoolName, className, programme, subject, term, examType, durationMinutes,
        topics: selectedTopics, pastedSyllabus,
        difficulty, languageStyle, cognitiveLevels,
        sections: activeSections, allowDiagrams, includeMarkingScheme,
      };

      const token = getToken ? getToken() : null;
      const result = await streamExamAPI(payload, token, (event) => {
        if (event.type === "progress") {
          setProgress(prev => ({ ...prev, index: event.index, total: event.total, sectionLabel: event.sectionLabel }));
        } else if (event.type === "section-done") {
          setProgress(prev => ({ ...prev, sectionsDone: new Set([...(prev?.sectionsDone || []), event.sectionId]) }));
          if (event.section) {
            setLivePreview(prev => ({
              title: event.title ?? prev?.title ?? "",
              instructions: event.instructions ?? prev?.instructions ?? [],
              sections: [...(prev?.sections || []), event.section],
              answerKey: [],
            }));
          }
        }
      });

      const { ok, errors } = validateExamData(result.examData, activeSections);
      if (!ok) throw new Error(`The generated paper didn't match the requested structure: ${errors.join(" ")}`);

      setExamData(result.examData);
      setExamVersion("A");
      setExamHasMarkingScheme(result.includeMarkingScheme !== false);
      setShowAnswerKey(false);
      // Save to My Exams in the background - never blocks showing the paper.
      saveExamToHistory(result.examData, metaForSave(meta, { hasMarkingScheme: result.includeMarkingScheme !== false }));
      // Server already deducted from the shared coins wallet and returns the
      // fresh raw balance - trust that over a client-side guess so the
      // header never drifts from reality.
      if (typeof result.creditsRemaining === "number") setCreditBalance(result.creditsRemaining);
      else fetchBalance();
      if (tierArg === "free") fetchFreeUsage(); // update the "X/5 left" badge
    } catch (e) {
      // Network/timeout/server failures land here - no credit is deducted server-side
      // unless generation actually succeeded (see generate-exam.js's refund logic).
      if (e.status === 402) {
        setError("You're out of exam credits.");
        setShowTopUp(true);
        // deductCoins() throws rather than returning a balance, so the 402
        // response body has no `balance` field to trust here - re-fetch
        // instead of reading a field that no longer exists.
        fetchBalance();
      } else if (e.status === 429) {
        setError(e.message);
        if (tierArg === "free") fetchFreeUsage(); // refresh the badge if they've hit today's free limit
      } else {
        setError(e.message || "Something went wrong generating the exam. Please try again.");
        if (typeof e.creditsRemaining === "number") setCreditBalance(e.creditsRemaining);
        else fetchBalance();
      }
    } finally {
      setLoading(false);
      setLoadingTier(null);
      setProgress(null);
      setLivePreview(null);
    }
  };

  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);

  const questionsNeedingDiagrams = useMemo(() => {
    if (!examData) return [];
    const out = [];
    (examData.sections || []).forEach((sec, sIdx) => (sec.questions || []).forEach((q, qIdx) => {
      // Every flagged figure is listed so the teacher can SEE what will print:
      // drawn ones get a preview to check, the rest ask for a picture.
      // Any other question can still get a picture from Edit.
      // sIdx/qIdx identify the question: numbers restart in every section.
      if (q.diagram?.needed) out.push({ sIdx, qIdx, section: sec, q });
    }));
    return out;
  }, [examData]);

  const [examVersion, setExamVersion] = useState("A"); // A = original order, B/C = shuffled variants (anti-cheating)
  const activeExamData = useMemo(() => {
    if (!examData) return null;
    return examVersion === "A" ? examData : createExamVariant(examData, examVersion);
  }, [examData, examVersion]);

  const openedOverride = openedMeta ? Object.fromEntries(Object.entries(openedMeta).filter(([, v]) => v !== undefined && v !== null && v !== "")) : {};
  const meta = {
    schoolName, className, programme, subject, term, examType, durationMinutes, landscape, schoolLogo, optionsLayout,
    examVersion: examVersion === "A" ? "" : examVersion,
    schoolMotto: schoolMotto.trim(), emblem, idMode, idDigits: clampIdDigits(idDigits), idLabel: idLabel.trim(),
    notice, noticeText: DEFAULT_NOTICE, turnOver,
    ...openedOverride,
  };

  const [downloadingWord, setDownloadingWord] = useState(false);
  const handleDownloadWord = async (mode) => {
    if (!activeExamData) return;
    setDownloadingWord(true);
    try {
      const { generateExamDocx } = await import("./examDocx.js"); // lazy - see import comment above
      // Word can't embed SVG, so turn the fallback school seal and any AI-drawn
      // diagrams into PNGs first. Failures just fall back to the text placeholder.
      const docMeta = { ...meta, svgPngs: {} };
      try {
        if (!docMeta.schoolLogo && emblem !== "none") {
          const seal = schoolCrestSVG(schoolName);
          if (seal) docMeta.schoolLogo = await svgToPngDataUrl(seal, 400);
        }
      } catch (e) { console.warn("Seal render skipped:", e); }
      for (const sec of activeExamData.sections || []) {
        for (const q of sec.questions || []) {
          if (diagramDrawing(q) && !q.image?.src) {
            try { docMeta.svgPngs[`${sec.id}:${q.number}`] = await svgToPngDataUrl(q.diagram.svg, 900); }
            catch (e) { console.warn("Diagram render skipped:", e); }
          }
        }
      }
      const blob = await generateExamDocx(activeExamData, docMeta, mode);
      const fileName = `${(activeExamData.title || examType || "exam").replace(/[^a-z0-9]+/gi, "_")}${mode === "answerKey" ? "_marking_scheme" : ""}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Couldn't generate the Word document. Please try Print/PDF instead, or try again.");
      console.error("Word export failed:", e);
    } finally {
      setDownloadingWord(false);
    }
  };

  const handleShare = async () => {
    if (!activeExamData) return;
    const html = renderExamHTML(activeExamData, meta, showAnswerKey ? "answerKey" : "paper");
    const fileName = `${(activeExamData.title || examType || "exam").replace(/[^a-z0-9]+/gi, "_")}.html`;
    // Sharing the rendered HTML (not a PDF) - this app relies on the browser's
    // own print engine for PDF fidelity via window.print(), and there's no
    // PDF library wired into this project; adding one just for sharing risks
    // a lower-fidelity export than the carefully-tuned print CSS produces.
    // An .html file opens fine in any browser and is a real, honest way to
    // get a finished exam from a phone into WhatsApp/email/Drive in one tap.
    const file = new File([html], fileName, { type: "text/html" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: activeExamData.title || examType }); }
      catch { /* user cancelled the share sheet - not an error */ }
    } else {
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      const a = document.createElement("a");
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const openPrintWindow = (mode) => {
    if (!activeExamData) return;
    const html = renderExamHTML(activeExamData, meta, mode);
    const w = window.open("", "_blank");
    if (!w) { alert("Please allow pop-ups to print or export this exam."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    // The paper lays itself out onto A4 pages once its images and fonts are in
    // (it sets __paperReady when done): print only then, or the dialog would
    // show an unpaginated page. The 6 s cap means a stuck image can't block printing.
    const t0 = Date.now();
    const tick = () => {
      if (w.closed) return;
      if (w.__paperReady || Date.now() - t0 > 6000) setTimeout(() => w.print(), 150);
      else setTimeout(tick, 80);
    };
    tick();
  };

  // Same pattern as the Lesson Planner's own onLoginRequired: don't hard-wall
  // the whole page behind a sign-in screen. Let a teacher fill in the whole
  // wizard first - subject, topics, sections, everything - and only ask them
  // to sign in at the moment they take an action that actually needs an
  // account (Generate, or opening the top-up modal). Confirmed against the
  // real App.jsx: `onClick={!user ? onLoginRequired : generate}` is the
  // exact pattern used throughout, not something invented for this app.
  const requireLogin = (action) => (user ? action : () => setShowAuthModal(true));

  const handleSignOut = () => {
    signOut();
    setUser(null);
    setCreditBalance(null);
  };

  return (
    <>
    <AppHeader
      user={user}
      creditBalance={creditBalance}
      toDisplayCredits={toDisplayCredits}
      onSignIn={() => setShowAuthModal(true)}
      onTopUp={requireLogin(() => setShowTopUp(true))}
      onSignOut={handleSignOut}
      canInstall={pwa.canReopen}
      onInstall={pwa.reopen}
      savedCount={savedCount}
      onOpenSaved={() => { setView("saved"); window.scrollTo?.({ top: 0 }); }}
    />
    <div style={{ maxWidth: 760, margin: "0 auto", padding: `24px 16px ${examData && view === "generate" ? 110 : 60}px`, fontFamily: F }}>
      {view === "generate" && (
        <div style={{ marginBottom: 22, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--text)", fontFamily: F }}>
              AI Questions Generator
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)", fontFamily: F }}>
              Build a print-ready exam paper from your curriculum in minutes.
            </p>
          </div>
          <button type="button" style={S.sm} onClick={requireLogin(() => setView("saved"))}>
            My Exams{savedCount ? ` (${savedCount})` : ""}
          </button>
        </div>
      )}

      {view === "saved" && (
        <SavedExams
          user={user} refreshKey={savedRefresh} S={S} F={F}
          onOpen={handleOpenSaved}
          onBack={() => setView("generate")}
          onSignIn={() => setShowAuthModal(true)}
          onCount={setSavedCount}
        />
      )}

      {saveToast && (
        <div role="status" style={{
          position: "fixed", left: 12, right: 12, bottom: examData && view === "generate" ? 84 : "max(16px, env(safe-area-inset-bottom, 16px))", margin: "0 auto", maxWidth: 420, zIndex: 200,
          padding: "11px 14px", borderRadius: 12, fontFamily: F, fontSize: 13, lineHeight: 1.45,
          background: "var(--card-bg)", color: saveToast.type === "warn" ? "var(--orange-text)" : "var(--text)",
          border: `1px solid ${saveToast.type === "warn" ? "var(--orange-text)" : "var(--border-strong)"}`, boxShadow: "0 2px 8px rgba(0,0,0,.08)",
        }}>{saveToast.msg}</div>
      )}

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onAuth={(u) => { setUser(u); setShowAuthModal(false); fetchBalance(); }}
        />
      )}

      {pwa.showInstall && (
        <InstallPrompt deferredPromptRef={pwa.deferredPromptRef} onClose={pwa.handleClose} />
      )}

      {showTopUp && (
        <TopUpModal
          S={S} F={F}
          onClose={() => setShowTopUp(false)}
          onPurchased={() => { setShowTopUp(false); fetchBalance(); }}
        />
      )}

      {/* Wizard + result stay mounted (just hidden) while My Exams is open, so nothing the teacher typed is lost */}
      <div style={{ display: view === "saved" ? "none" : undefined }}>
      {/* ── Curriculum + Topics (GES / NaCCA) - CLASS FIRST, matching
           the real Lesson Planner's flow exactly. Everything else in the
           form follows from this, so it comes first on the page too. ── */}
      <TopicSelector
        subject={subject} setSubject={setSubject}
        className={className} setClassName={setClassName}
        shsCourse={shsCourse} setShsCourse={setShsCourse}
        shsKey={shsKey} setShsKey={setShsKey}
        term={term}
        selectedTopics={selectedTopics} setSelectedTopics={setSelectedTopics}
        pastedSyllabus={pastedSyllabus} setPastedSyllabus={setPastedSyllabus}
        onSuggestTopics={user ? handleSuggestTopics : async () => { setShowAuthModal(true); return []; }}
        onLoginRequired={() => setShowAuthModal(true)}
        S={S} F={F}
      />

      {/* ── Basic Information - only once a class is chosen, so the
           form doesn't show a wall of fields before the one choice that
           actually drives everything else. ── */}
      {className && (
      <div style={S.card}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Exam Type</h3>
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.5 }}>
          What kind of assessment is this?
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          {examTypesFor(className).map(t => {
            const active = examType === t;
            return (
              <button key={t} type="button" aria-pressed={active} onClick={() => setExamType(t)} style={{
                padding: "9px 16px", borderRadius: 99, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: `1.5px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
                background: active ? "var(--accent-soft)" : "var(--card-bg)",
                color: active ? "var(--accent)" : "var(--text-secondary)",
              }}>
                {t}
              </button>
            );
          })}
        </div>

        <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Basic Information</h3>
        <div style={{ marginBottom: 14, display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={S.lbl}>School Name</label>
            <input value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="e.g. St. Mary's JHS" style={S.inp} />
          </div>
          <div>
            <label style={S.lbl}>School Logo</label>
            <input
              ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 4 * 1024 * 1024) { alert("Please use a logo image under 4MB."); return; }
                try { setSchoolLogo(await fileToPngDataUrl(file, 512)); }
                catch { alert("Sorry, that image couldn't be read. Please try a PNG or JPG."); }
                e.target.value = "";
              }}
            />
            {schoolLogo ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <img src={schoolLogo} alt="School logo" style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8, border: "1px solid var(--border)", background: "#fff" }} />
                <button type="button" style={S.danger} onClick={() => setSchoolLogo(null)}>Remove</button>
              </div>
            ) : (
              <button type="button" style={{ ...S.sm, height: 48 }} onClick={() => logoInputRef.current?.click()}>Upload</button>
            )}
          </div>
        </div>
        <div className="eduq-grid-2" style={{ marginBottom: 14 }}>
          <div>
            <label style={S.lbl}>Motto or address line <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></label>
            <input value={schoolMotto} maxLength={90} onChange={e => setSchoolMotto(e.target.value)} placeholder="e.g. Knowledge, Discipline, Service" style={S.inp} />
          </div>
          <div>
            <label style={S.lbl}>Emblem when no logo</label>
            <select value={emblem} onChange={e => setEmblem(e.target.value)} style={S.sel} disabled={!!schoolLogo} title={schoolLogo ? "Your uploaded logo is used" : ""}>
              <option value="auto">Generated school crest</option>
              <option value="none">No emblem</option>
            </select>
          </div>
        </div>
        <div className="eduq-grid-2">
          <div>
            <label style={S.lbl}>{isSHS ? "Semester" : "Term"} *</label>
            <select value={term} onChange={e => setTerm(e.target.value)} style={S.sel}>
              {termOptionsFor(className).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={S.lbl}>Duration (minutes) *</label>
            <NumberField
              min={10} max={300} value={durationMinutes}
              onChange={setDurationMinutes}
              aria-label="Duration in minutes"
              style={S.inp}
            />
          </div>
        </div>
      </div>
      )}

      {/* ── Difficulty + Language + Cognitive level - only once there's
           a class AND subject chosen, so the form doesn't dump every
           option on screen before there's anything to configure it for. ── */}
      {className && subject && (
      <div style={S.card}>
        <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Difficulty &amp; Language Control</h3>

        <label style={S.lbl}>Difficulty</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {DIFFICULTIES.map(d => (
            <button key={d} type="button" onClick={() => setDifficulty(d)} style={{
              flex: 1, padding: "10px 0", borderRadius: 12, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: `1.5px solid ${difficulty === d ? "var(--accent)" : "var(--border-strong)"}`,
              background: difficulty === d ? "var(--accent-soft)" : "var(--card-bg)",
              color: difficulty === d ? "var(--accent)" : "var(--text)",
            }}>{d}</button>
          ))}
        </div>

        <label style={S.lbl}>Language Style</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {LANGUAGE_STYLES.map(opt => (
            <button key={opt.value} type="button" onClick={() => setLanguageStyle(opt.value)} style={{
              padding: "10px 16px", borderRadius: 12, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: `1.5px solid ${languageStyle === opt.value ? "var(--accent)" : "var(--border-strong)"}`,
              background: languageStyle === opt.value ? "var(--accent-soft)" : "var(--card-bg)",
              color: languageStyle === opt.value ? "var(--accent)" : "var(--text)",
            }}>{opt.label}</button>
          ))}
        </div>

        <label style={S.lbl}>Cognitive Level (select any)</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {COGNITIVE_LEVELS.map(lvl => {
            const active = cognitiveLevels.includes(lvl);
            return (
              <button key={lvl} type="button" onClick={() => toggleCognitive(lvl)} style={{
                padding: "10px 16px", borderRadius: 12, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: `1.5px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
                background: active ? "var(--accent-soft)" : "var(--card-bg)",
                color: active ? "var(--accent)" : "var(--text)",
              }}>{lvl}</button>
            );
          })}
        </div>
      </div>
      )}

      {/* ── Exam Structure Builder - always full-capability here; a
           config that doesn't fit the Free tier just shows a clear
           message when the Free button specifically is clicked, rather
           than the whole form silently reconfiguring itself. ── */}
      {className && subject && (
      <ExamStructureBuilder sections={sections} setSections={setSections} S={S} F={F} />
      )}

      {/* ── Output mode + diagrams - consolidated into one compact card
           instead of two, to cut down on card count. ── */}
      {className && subject && (
      <div style={S.card}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Options</h3>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Include Marking Scheme</div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: F, marginTop: 2 }}>
              Full answer key + point-by-point marking guide. Off = just the question paper, faster and cheaper.
              {" "}Not available on Free AI.
            </div>
          </div>
          <Toggle checked={includeMarkingScheme} onChange={setIncludeMarkingScheme} label="Include marking scheme" />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Allow AI-Suggested Diagrams</div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: F, marginTop: 2 }}>
              When a question needs a figure, graph or map, the AI will flag it so you can upload one.
            </div>
          </div>
          <Toggle checked={allowDiagrams} onChange={setAllowDiagrams} label="Allow AI-suggested diagrams" />
      </div>
      </div>
      )}

      {error && <div style={S.err}><span>{error}</span></div>}

      {/* ── Bottom generate bar - Free AI (left) / Premium AI (right),
           two independent, always-visible actions - matching the real
           App.jsx's GENERATE BAR exactly, not a pre-selected tier toggle
           feeding one shared button. ── */}
      {className && subject && (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
        <button
          onClick={requireLogin(() => handleGenerate("free"))}
          disabled={loading || freeUsage?.remaining === 0}
          style={{
            ...S.sm, height: 56, flexDirection: "column", gap: 2, fontWeight: 700, fontSize: 14,
            opacity: (loading && loadingTier !== "free") || freeUsage?.remaining === 0 ? 0.5 : 1,
          }}
        >
          {loading && loadingTier === "free" ? <Spinner /> : (
            <>
              <span>Free AI</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}>
                {freeUsage ? `${freeUsage.remaining} / ${freeUsage.limit} left today` : `${FREE_TIER_DAILY_LIMIT}/day`}
              </span>
            </>
          )}
        </button>
        <button
          onClick={requireLogin(() => handleGenerate("premium"))}
          disabled={loading}
          style={{
            height: 56, border: "none", borderRadius: 99, cursor: "pointer", fontFamily: F,
            background: "linear-gradient(135deg,#0D9488 0%,#0891B2 100%)", color: "#fff",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
            opacity: loading && loadingTier !== "premium" ? 0.6 : 1,
          }}
        >
          {loading && loadingTier === "premium" ? <Spinner /> : (
            <>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Premium AI</span>
              <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.9 }}>
                ~{formatCredits(includeMarkingScheme ? estimatedCostWithMarking : estimatedCostQuestionsOnly)} credits
              </span>
            </>
          )}
        </button>
      </div>
      )}
      {loading && <GenerationProgress progress={progress} elapsed={elapsed} />}
      {loading && livePreview?.sections?.length > 0 && (
        <div style={{ ...S.out, marginTop: 8, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontFamily: F }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#0D9488", animation: "qgPulse 1.2s ease-in-out infinite" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Live preview</span>
            <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              {livePreview.sections.length} of {progress?.total || activeSections.length} sections written. More appear as they finish.
            </span>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 12, background: "var(--card-bg)", padding: "6px 14px" }}>
            {livePreview.title && <div style={{ fontFamily: F, fontSize: 14, fontWeight: 800, color: "var(--text)", padding: "8px 0 2px" }}>{livePreview.title}</div>}
            {livePreview.sections.map((sec) => (
              <div key={sec.id || sec.label} className="eduq-live-sec" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontFamily: F, fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--accent)" }}>{sec.label}</div>
                {sec.instructions && <div style={{ fontFamily: F, fontSize: 12, color: "var(--text-muted)", margin: "2px 0 6px", fontStyle: "italic" }}>{sec.instructions}</div>}
                {(sec.questions || []).map((q) => (
                  <div key={q.number} style={{ fontFamily: F, fontSize: 13, color: "var(--text)", lineHeight: 1.5, margin: "6px 0" }}>
                    <b>{q.number}.</b> {q.text}
                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <div style={{ color: "var(--text-secondary)", fontSize: 12.5, marginLeft: 16 }}>
                        {q.options.map((o, i) => <div key={i}>{String.fromCharCode(65 + i)}. {o}</div>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--text-muted)", fontFamily: F, marginTop: 0 }}>
        Nothing is charged unless generation succeeds. Failed or timed-out requests are not billed.
      </p>

      {/* ── Diagram uploads (post-generation) ──────────────────── */}
      {examData && (
        <DiagramManager
          items={questionsNeedingDiagrams}
          examData={examData}
          setExamData={setExamData}
          S={S} F={F}
        />
      )}

      {/* ── Output ──────────────────────────────────────────────── */}
      {examData && (
        <div style={S.out}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>
              {examData.title || examType}: Ready
              {!examHasMarkingScheme && (
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginLeft: 8 }}>(Questions Only)</span>
              )}
            </h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 4 }}>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: F, marginRight: 4 }}>Version:</span>
                {["A", "B", "C"].map(v => (
                  <button key={v} type="button" onClick={() => setExamVersion(v)} title={v === "A" ? "Original order" : `Shuffled variant ${v}: different question/option order, same content (anti-cheating)`} style={{
                    width: 28, height: 28, borderRadius: 8, fontFamily: F, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    border: `1.5px solid ${examVersion === v ? "var(--accent)" : "var(--border-strong)"}`,
                    background: examVersion === v ? "var(--accent-soft)" : "var(--card-bg)",
                    color: examVersion === v ? "var(--accent)" : "var(--text)",
                  }}>{v}</button>
                ))}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", fontFamily: F }}>
                <input type="checkbox" checked={landscape} onChange={e => setLandscape(e.target.checked)} style={{ accentColor: "#0D9488" }} />
                Landscape
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", fontFamily: F }}>
                Options:
                <select
                  value={optionsLayout}
                  onChange={e => setOptionsLayout(e.target.value)}
                  title="How multiple-choice options are arranged in the printed paper and Word file"
                  style={{ height: 32, borderRadius: 8, border: "1.5px solid var(--border-strong)", background: "var(--card-bg)", color: "var(--text)", fontFamily: F, fontSize: 12, padding: "0 6px" }}
                >
                  {OPTIONS_LAYOUTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
              <button
                style={editMode ? { ...S.sm, borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-soft)" } : S.sm}
                onClick={() => setEditMode(v => !v)}
              >
                {editMode ? "Editing" : "Edit"}
              </button>
            </div>
          </div>

          {/* ── Candidate index number: its own card so it's easy to find ── */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
            {/* One clear switch for the index number; style/boxes/label only appear while it's on. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", fontFamily: F }}>Include candidate index number</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F, marginTop: 2 }}>
                  {idMode === "none" ? "Off: no index number on the paper." : "On: candidates write their index number at the top."}
                </div>
              </div>
              <Toggle
                checked={idMode !== "none"}
                label="Include candidate index number"
                onChange={(on) => {
                  if (on) customise(setIdMode)(lastIdMode.current || (paperPreset === "public" ? "boxes" : "line"));
                  else { if (idMode !== "none") lastIdMode.current = idMode; customise(setIdMode)("none"); }
                }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, alignItems: "end" }}>
              {idMode !== "none" && (
              <div>
                <label style={{ ...S.lbl, marginBottom: 4 }}>Index number style</label>
                <select value={idMode} onChange={e => customise(setIdMode)(e.target.value)} style={{ ...S.sel, minHeight: 40, padding: "8px 34px 8px 12px", fontSize: 13 }}>
                  {ID_MODES.filter(m => m.id !== "none").map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              )}
              {idMode === "boxes" && (
                <div>
                  <label style={{ ...S.lbl, marginBottom: 4 }}>Boxes (digits)</label>
                  <NumberField min={4} max={15} value={idDigits}
                    onChange={customise(setIdDigits)}
                    aria-label="Number of index-number boxes"
                    style={{ ...S.inp, minHeight: 40, padding: "8px 12px", fontSize: 13 }} />
                </div>
              )}
              {idMode !== "none" && (
                <div>
                  <label style={{ ...S.lbl, marginBottom: 4 }}>ID label</label>
                  <input value={idLabel} maxLength={24} onChange={e => customise(setIdLabel)(e.target.value)} placeholder={idMode === "boxes" ? "Index Number" : "Index No."} style={{ ...S.inp, minHeight: 40, padding: "8px 12px", fontSize: 13 }} />
                </div>
              )}
            </div>
          </div>

          {/* ── Paper format: live preview below updates as these change ── */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", fontFamily: F, marginRight: 4 }}>Paper style</span>
              {Object.values(PAPER_PRESETS).map(p => {
                const active = paperPreset === p.id;
                return (
                  <button key={p.id} type="button" onClick={() => applyPreset(p.id)} aria-pressed={active} style={{
                    padding: "7px 14px", borderRadius: 99, fontFamily: F, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    border: `1.5px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
                    background: active ? "var(--accent-soft)" : "var(--card-bg)",
                    color: active ? "var(--accent)" : "var(--text-secondary)",
                  }}>{p.label}</button>
                );
              })}
              {paperPreset === "custom" && <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: F }}>Custom</span>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 22px", marginTop: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-secondary)", fontFamily: F, cursor: "pointer" }}>
                <input type="checkbox" checked={turnOver} onChange={e => customise(setTurnOver)(e.target.checked)} style={{ accentColor: "#0D9488" }} />
                "Turn over" on every page except the last
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-secondary)", fontFamily: F, cursor: "pointer" }}>
                <input type="checkbox" checked={notice} onChange={e => customise(setNotice)(e.target.checked)} style={{ accentColor: "#0D9488" }} />
                "Do not open until told to" notice
              </label>
            </div>
          </div>

          {editMode ? (
            <ExamEditor examData={examData} setExamData={setExamData} S={S} F={F} />
          ) : (
            <iframe
              ref={printFrameRef}
              title="Exam preview"
              srcDoc={renderExamHTML(activeExamData, meta, showAnswerKey ? "answerKey" : "paper")}
              style={{ width: "100%", height: 640, border: "1px solid var(--border)", borderRadius: 12, background: "#fff" }}
            />
          )}
        </div>
      )}
      </div>
    </div>

    {/* ── Sticky action bar: the things you do with a finished paper, always one tap away ── */}
    {view === "generate" && examData && !loading && !barHidden && (
      <div className="eduq-bar" style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 120,
        background: "var(--card-bg)", borderTop: "1px solid var(--border)",
        padding: "10px 12px max(10px, env(safe-area-inset-bottom, 10px))",
        boxShadow: "0 -1px 6px rgba(0,0,0,.05)",
      }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 8, alignItems: "center", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {examHasMarkingScheme && (
            <div role="group" aria-label="What to show" style={{ display: "flex", flexShrink: 0, border: "1.5px solid var(--border-strong)", borderRadius: 99, overflow: "hidden" }}>
              {[{ k: false, l: "Paper" }, { k: true, l: "Answers" }].map(o => (
                <button key={o.l} type="button" aria-pressed={showAnswerKey === o.k} onClick={() => setShowAnswerKey(o.k)} style={{
                  height: 38, padding: "0 14px", border: "none", cursor: "pointer", fontFamily: F, fontSize: 13, fontWeight: 600,
                  background: showAnswerKey === o.k ? "var(--accent-soft)" : "transparent",
                  color: showAnswerKey === o.k ? "var(--accent)" : "var(--text-secondary)",
                }}>{o.l}</button>
              ))}
            </div>
          )}
          <div style={{ flex: 1 }} />
          {savedId && (
            hasUnsavedEdits ? (
              <button type="button" disabled={savingChanges} onClick={handleSaveChanges} style={{ ...S.sm, height: 40, flexShrink: 0, borderColor: "var(--accent)", color: "var(--accent)", fontWeight: 700 }}>
                {savingChanges ? "Saving…" : "Save changes"}
              </button>
            ) : (
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F, flexShrink: 0 }}>✓ Saved</span>
            )
          )}
          <button type="button" style={{ ...S.sm, height: 40, flexShrink: 0 }} disabled={downloadingWord} onClick={() => handleDownloadWord(showAnswerKey ? "answerKey" : "paper")}>
            {downloadingWord ? "Preparing…" : "Word"}
          </button>
          <button type="button" style={{ ...S.sm, height: 40, flexShrink: 0 }} onClick={handleShare} title="Share as a file (WhatsApp, email, Drive…)">Share</button>
          <button type="button" style={{ ...S.btn, height: 40, padding: "0 20px", fontSize: 14, flexShrink: 0 }} onClick={() => openPrintWindow(showAnswerKey ? "answerKey" : "paper")}>
            Print / PDF
          </button>
        </div>
      </div>
    )}
    </>
  );
}

/**
 * A small, scoped responsive stylesheet for the couple of fixed 2-column
 * grids used across this wizard (Basic Info, Curriculum, Exam Structure
 * Builder). Inline React styles can't express media queries, and these
 * grids not stacking on a narrow phone - squishing two inputs into ~150px
 * each - is a real usability regression against the "smooth on low-end
 * Android" requirement, not a cosmetic nitpick.
 */
const RESPONSIVE_CSS = `
  @keyframes eduq-rise { from { transform: translateY(100%); opacity: 0; } to { transform: none; opacity: 1; } }
  .eduq-bar { animation: eduq-rise .22s ease-out both; }
  @keyframes eduq-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .eduq-live-sec { animation: eduq-in .3s ease-out both; }
  @media (prefers-reduced-motion: reduce) { .eduq-bar, .eduq-live-sec { animation: none; } }
  .eduq-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 480px) {
    .eduq-grid-2 { grid-template-columns: 1fr; }
  }
`;

export default function QuestionsGenerator() {
  return (
    <ErrorBoundary>
      <style>{RESPONSIVE_CSS}</style>
      <QuestionsGeneratorInner />
    </ErrorBoundary>
  );
}
