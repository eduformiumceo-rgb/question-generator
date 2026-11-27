/**
 * ═══════════════════════════════════════════════════════════════════
 * EDUFORMIUM - ASSESSMENT STUDIO
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
import ExamStructureBuilder, { DEFAULT_SECTIONS, paperTotals, nextSectionId, sectionLabel } from "./components/ExamStructureBuilder.jsx";
import TopicSelector, { CLASS_GROUPS } from "./components/TopicSelector.jsx";
import FigurePanel from "./components/FigurePanel.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { diagramDrawing } from "./examFigures.js";
import { ownerDrawing, ownerImageOk, setSlotDiagram, aiDiagram } from "./partFigures.js";
import { autoDrawFigures, requestFigureSVG } from "./aiFigures.js";
import { isSHSClass, termOptionsFor, mapTermForLevel, examTypesFor, mapExamTypeForLevel } from "./shsCourses.js";
import { renderExamHTML, validateExamData, createExamVariant, schoolCrestSVG, isSafeGeneratedSVG, OPTIONS_LAYOUTS, ID_MODES, PAPER_PRESETS, clampIdDigits, DEFAULT_NOTICE } from "./examTemplate.js";
import { fileToPngDataUrl, svgToPngDataUrl } from "./imageUtils.js";
import { getWassceProfile, wassceSections, wassceTotalMinutes, decorateWassceExam, wassceCoverCode, wasscePaper2Code } from "./wassceStyle.js";
import { renderShadingSheetHTML, renderAnswerBookletHTML, printNote, pageFor, SHEET_SPECS, SCHOOL_COLOUR_PRESETS, DEFAULT_SCHOOL_COLOURS, defaultSheetStyle, objectiveCount, clampQuestions, sheetSizeSummary, MAX_QUESTIONS } from "./shadingSheet.js";
import { getBeceProfile, beceSections, beceTotalMinutes, isBeceClass, decorateBeceExam, minutesLabel, answerableMarks, cleanBeceTitle, beceCoverCode } from "./beceStyle.js";
// NOT statically imported - docx bundles to ~700KB, which would hurt first-load
// time on low-end Android for a feature most teachers use occasionally, not on
// every visit. Loaded on demand inside handleDownloadWord() instead.
import ExamEditor from "./components/ExamEditor.jsx";
import MathText from "./components/MathText.jsx";
import PaperAudit from "./components/PaperAudit.jsx";
import CardTitle from "./components/CardTitle.jsx";
import Welcome from "./components/Welcome.jsx";
import WizardProgress from "./components/WizardProgress.jsx";
import FoldCard from "./components/FoldCard.jsx";
import Hint from "./components/Hint.jsx";
import { requestQuestionReplacement } from "./regenerateQuestion.js";
import { screenExamInput } from "./moderation.js";
import { FREE_TIER_MAX_SECTIONS, FREE_TIER_MAX_TOTAL_QUESTIONS, FREE_TIER_ALLOWED_TYPES, FREE_TIER_DAILY_LIMIT } from "./freeTierLimits.js";
import NumberField from "./components/NumberField.jsx";
import BookletPanel from "./components/BookletPanel.jsx";
import ShadingPanel from "./components/ShadingPanel.jsx";
import { Toggle, Segmented, GenerationProgress } from "./components/FormControls.jsx";
import { EXAM_API, ACCOUNT_API, DIFFICULTIES, LANGUAGE_STYLES, COGNITIVE_LEVELS, streamExamAPI } from "./examApi.js";
import TopUpModal from "./components/TopUpModal.jsx";
import ShadingPreview from "./components/ShadingPreview.jsx";
import ScanMarker from "./components/ScanMarker.jsx";
import { keyFromExam } from "./omrReader.js";
import { theoryCount, theoryProfile, suggestBookletPages, BOOKLET_DEFAULT_PAGES, BOOKLET_SHEET, clampBookletPages, clampBookletQuestions, clampBookletPaper, bookletPageCount, bookletSheetCount } from "./bookletSheet.js";
import { TopNav, BottomNav } from "./components/AppNav.jsx";
import SchoolIdentityFields from "./components/SchoolIdentityFields.jsx";
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
import RecoveryBanner from "./components/RecoveryBanner.jsx";
import { useAutosave } from "./hooks/useAutosave.js";
// Refresh / crash / sign-in-redirect recovery: see draftStore.js for what is kept, for how long, and who can see it.
import {
  userKey, fingerprint, loadWizardDraft, saveWizardDraft, saveJob, loadJob, clearJob,
  savePaperSnapshot, loadPaperSnapshot, clearPaperSnapshot, clearAllDrafts, markRestoreAttempt, clearRestoreAttempt,
} from "./draftStore.js";

const DRAFT_NOTICE_MS = 12000; // how long the "welcome back, your setup was restored" note stays up
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


function QuestionsGeneratorInner() {
  // ── Auth gate - same account/session as the Lesson Planner ─────
  const [user, setUser] = useState(() => (getUser ? getUser() : null));
  const uidRef = useRef(null);            // the signed-in account's id (or null): draft copies are filed under it
  uidRef.current = userKey(user);
  const [showAuthModal, setShowAuthModalRaw] = useState(false);
  // Single sign-in: when VITE_HUB_URL is set, opening sign-in / create account sends the person to the Eduformium Hub (see hubSignIn.js).
  // Off by default, so this app's own sign-in window works exactly as before until the variable is set.
  const setShowAuthModal = useCallback((v) => { if (v && goToHubSignIn("questions")) return; setShowAuthModalRaw(v); }, []);

  // Install-app prompt (same behaviour as the Lesson Planner).
  const pwa = usePwaInstall();

  // ── Basic Information ──────────────────────────────────────────
  const savedPrefs = useRef(readPrefs()).current;
  // The unfinished paper setup from before a refresh / redirect, read once and synchronously so the page opens already
  // filled in. {} when there is none, so every `D.x ?? default` below falls back to the normal default.
  const draftRef = useRef(null);
  if (draftRef.current === null) draftRef.current = loadWizardDraft(userKey(getUser ? getUser() : null)) || { fields: {} };
  const D = draftRef.current.fields;
  const [schoolName, setSchoolName] = useState(savedPrefs.schoolName || "");
  const [schoolMotto, setSchoolMotto] = useState(savedPrefs.schoolMotto || "");
  const [emblem, setEmblem] = useState(savedPrefs.emblem === "none" ? "none" : "auto"); // "auto" = generated crest when there's no logo
  const [schoolLogo, setSchoolLogo] = useState(() => readLogo()); // data URL - printed in the paper header
  // Shading sheet (answer sheet for the objective questions). null = follow the level / style default.
  const [sheetStyle, setSheetStyle] = useState(savedPrefs.sheetStyle === "bece" || savedPrefs.sheetStyle === "wassce" ? savedPrefs.sheetStyle : null);
  const [sheetColourMode, setSheetColourMode] = useState(savedPrefs.sheetColourMode === "mono" || savedPrefs.sheetColourMode === "school" ? savedPrefs.sheetColourMode : null);
  const [sheetColours, setSheetColours] = useState(savedPrefs.sheetColours && savedPrefs.sheetColours.main ? savedPrefs.sheetColours : DEFAULT_SCHOOL_COLOURS);
  const [sheetOptions, setSheetOptions] = useState(savedPrefs.sheetOptions === 5 ? 5 : 4); // A-D or A-E
  const [sheetQuestions, setSheetQuestions] = useState(null); // null = count from the paper's objective questions
  // Answer booklet (for the hand-written structured / essay questions)
  const [bookletPages, setBookletPages] = useState(BOOKLET_DEFAULT_PAGES);
  const [bookletPaper, setBookletPaper] = useState(clampBookletPaper(savedPrefs.bookletPaper));   // "a4" portrait pages, or "a3" landscape sheets folded in half
  const [bookletRuling, setBookletRuling] = useState("lined");   // "lined" | "graph" | "plain"
  const [bookletQuestions, setBookletQuestions] = useState(null); // null = count from the paper's theory questions
  // The sheet's own class / exam type / term. null = follow the paper. Setting them here never changes the Assessment form.
  const [sheetClass, setSheetClass] = useState(null);
  const [className, setClassName] = useState(D.className ?? "");
  const [term, setTerm] = useState(D.term ?? "Term 1");
  const [examType, setExamType] = useState(D.examType ?? "Class Test");
  const [durationMinutes, setDurationMinutes] = useState(D.durationMinutes ?? 60);
  const isSHS = isSHSClass(className);
  // SHS runs two semesters, Basic schools three terms: keep the choice sensible when the level changes.
  useEffect(() => {
    setTerm(t => mapTermForLevel(t, className));
    setExamType(t => mapExamTypeForLevel(t, className));
  }, [isSHS]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Curriculum + Topics (GES / NaCCA only) ──────────────────────
  const [subject, setSubject] = useState(D.subject ?? "");        // clean display name, e.g. "Biology" - what the AI, the paper and My Assessments use
  const [shsCourse, setShsCourse] = useState(D.shsCourse ?? "");      // SHS only: programme / course, e.g. "General Science"
  const [shsKey, setShsKey] = useState(D.shsKey ?? "");            // SHS only: internal curriculum key, e.g. "Biology (GS)"
  const programme = isSHS ? shsCourse : "";          // sent to the AI, printed on the paper, saved with the exam
  const [selectedTopics, setSelectedTopics] = useState(D.selectedTopics ?? []);
  const [draftStrands, setDraftStrands] = useState(D.strands ?? []); // the strands ticked in the topic picker (it owns them; we only remember them)
  const [pastedSyllabus, setPastedSyllabus] = useState(D.pastedSyllabus ?? "");

  // ── Difficulty + Language + Cognitive level ────────────────────
  const [difficulty, setDifficulty] = useState(D.difficulty ?? "Moderate");
  const [languageStyle, setLanguageStyle] = useState(D.languageStyle ?? "Balanced");
  const [cognitiveLevels, setCognitiveLevels] = useState(D.cognitiveLevels ?? ["Recall", "Application"]);

  // ── Exam structure ──────────────────────────────────────────────
  const [sections, setSections] = useState(D.sections ?? DEFAULT_SECTIONS);

  // ── Diagrams ─────────────────────────────────────────────────────
  const [allowDiagrams, setAllowDiagrams] = useState(D.allowDiagrams ?? true);
  const [includeMarkingScheme, setIncludeMarkingScheme] = useState(D.includeMarkingScheme ?? true);

  // ── Generation state ─────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [examTier, setExamTier] = useState(null);   // tier the paper on screen was generated with ("free" | "premium")
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

  // ── Exam style: School exam, or BECE (JHS) / WASSCE (SHS) style ─────────────
  // Sits right under Exam Type. Choosing BECE style loads everything a real BECE
  // paper has for the chosen subject (Paper 2 then Paper 1, sections, number of
  // questions, "answer any N", marks, time, instructions, marking scheme format),
  // so nothing else needs setting by hand. Every mock exam uses this style.
  const publicAvailable = isBeceClass(className) || isSHS;
  const isMock = examType === "Mock Exam";
  const [examStyle, setExamStyle] = useState(D.examStyle ?? "school"); // "school" | "public"
  const styleChosenByUser = useRef(!!D.styleChosen);
  const beceActive = examStyle === "public" && isBeceClass(className);
  const wassceActive = examStyle === "public" && isSHS && !isBeceClass(className);
  const publicActive = beceActive || wassceActive;
  // The profile of the chosen public exam (BECE for JHS, WASSCE for SHS): both carry the same fields.
  const beceProfile = useMemo(() => (!subject ? null : beceActive ? getBeceProfile(subject) : wassceActive ? getWassceProfile(subject) : null), [beceActive, wassceActive, subject]);
  const chooseStyle = (v) => { styleChosenByUser.current = true; setExamStyle(v); };
  useEffect(() => {
    if (!publicAvailable) { setExamStyle("school"); return; }
    if (isMock) setExamStyle("public");
    else if (!styleChosenByUser.current) setExamStyle("school");
  }, [isMock, publicAvailable]);
  const prevStyle = useRef("school");
  const beceApplied = useRef(false);
  // A restored public-exam draft already holds the teacher's own sections / duration, so the first pass must not reload the
  // exam-board defaults over them. The pass is skipped only while the style, class kind and subject are still exactly what
  // was restored (matching the values, not a "first run" flag, keeps this right under StrictMode's double effects).
  const restoredStyleKey = useRef(D.examStyle === "public" ? `${examStyle}|${beceActive}|${wassceActive}|${subject}` : null);
  useEffect(() => {
    if (restoredStyleKey.current === `${examStyle}|${beceActive}|${wassceActive}|${subject}`) { prevStyle.current = examStyle; beceApplied.current = publicActive && !!subject; return; }
    restoredStyleKey.current = null;
    if (examStyle === "public") applyPreset("public", false);
    else if (prevStyle.current === "public") applyPreset("school", false);
    prevStyle.current = examStyle;
    if (publicActive && subject) {
      const p = wassceActive ? getWassceProfile(subject) : getBeceProfile(subject);
      // Sections the teacher added by hand (custom) survive a reload of the exam-board structure; they take the next free letter if theirs is now used.
      setSections(prev => {
        const loaded = (wassceActive ? wassceSections(p) : beceSections(p)).map(sc => ({ ...sc }));
        const kept = [];
        for (const sec of prev.filter(x => x.custom)) {
          const id = [...loaded, ...kept].some(x => x.id === sec.id) ? nextSectionId([...loaded, ...kept]) : sec.id;
          if (id) kept.push({ ...sec, id, label: sectionLabel(id, sec.type, sec.title) });
        }
        return [...loaded, ...kept];
      });
      setDurationMinutes(wassceActive ? wassceTotalMinutes(p) : beceTotalMinutes(p));
      setIncludeMarkingScheme(true);
      setLanguageStyle("Simple");
      setCognitiveLevels(["Recall", "Application", "Critical Thinking"]);
      setOptionsLayout("vertical");
      setAllowDiagrams(true);
      beceApplied.current = true;
    } else if (beceApplied.current) {
      setSections(prev => [...DEFAULT_SECTIONS.map(sc => ({ ...sc })), ...prev.filter(x => x.custom).map(sec => { const id = DEFAULT_SECTIONS.some(d => d.id === sec.id) ? nextSectionId([...DEFAULT_SECTIONS, ...prev.filter(x => x.custom)]) : sec.id; return id ? { ...sec, id, label: sectionLabel(id, sec.type, sec.title) } : null; }).filter(Boolean)]);
      setDurationMinutes(60);
      setLanguageStyle("Balanced");
      setCognitiveLevels(["Recall", "Application"]);
      beceApplied.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examStyle, beceActive, wassceActive, subject]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ schoolName, schoolMotto, emblem, optionsLayout, paperPreset: presetChosenByUser.current ? paperPreset : undefined, sheetStyle, sheetColourMode, sheetColours, sheetOptions, idMode, idDigits, idLabel, notice, turnOver, bookletPaper }));
    } catch { /* storage unavailable: nothing to remember, nothing breaks */ }
  }, [schoolName, schoolMotto, emblem, optionsLayout, paperPreset, sheetStyle, sheetColourMode, sheetColours, sheetOptions, idMode, idDigits, idLabel, notice, turnOver, bookletPaper]);
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

  // ── My Assessments (saved papers) ────────────────────────────────────────────
  // Same model as the Lesson Planner's "My Plans": every generated exam is
  // saved automatically, up to MAX_SAVED_EXAMS per teacher; the server evicts
  // the oldest on the next save so Supabase storage stays bounded.
  // Tabs: "generate" (Assessment) | "shading" (Shading Sheet) | "booklet" (Answer Booklet) | "saved" (My Assessments). The tab is kept in the address (#shading, #booklet, #saved)
  // so refresh, Back/Forward and shared links all land on the right tab. Unknown hashes (e.g. a sign-in redirect) are ignored.
  const [view, setView] = useState(viewFromHash);
  const scrollPos = useRef({});                       // scroll position remembered per tab
  const viewRef = useRef(view); viewRef.current = view;
  const [navHidden, setNavHidden] = useState(false);  // phone: bottom nav slides away while scrolling down, back on scroll up
  const [savedCount, setSavedCount] = useState(null);
  const [savedRefresh, setSavedRefresh] = useState(0);
  const [openedMeta, setOpenedMeta] = useState(null); // header details of a paper re-opened from My Assessments
  const [saveToast, setSaveToast] = useState(null); // { type: "info" | "warn", msg }
  const toastTimer = useRef(null);
  const [savedId, setSavedId] = useState(null);        // id of the My Assessments copy of the paper on screen
  const savedExamRef = useRef(null);                   // the examData object that copy was saved from
  const [savingChanges, setSavingChanges] = useState(false);
  const [barMore, setBarMore] = useState(false);       // phone: the "More" sheet of the paper action bar
  useEffect(() => {
    if (!barMore) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setBarMore(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [barMore]);
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
          showSaveToast("warn", `${r.deletedCount > 1 ? `${r.deletedCount} oldest assessments were` : "Your oldest assessment was"} removed to make room. You can save up to ${max}.`);
        } else if (list && list.length >= max - 1) {
          showSaveToast("info", `${list.length} of ${max} slots used. Next save will remove your oldest assessment.`);
        } else {
          showSaveToast("info", "Saved to My Assessments.");
        }
        return true;
      } catch (e) {
        lastErr = e;
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    console.error("[save exam] failed after retries:", lastErr);
    showSaveToast("warn", "Couldn't save this to My Assessments. It's still on screen, but won't be saved for later.");
    return false;
  };

  const hasUnsavedEdits = !!savedId && !!examData && examData !== savedExamRef.current;
  const handleSaveChanges = async () => {
    if (!savedId || !examData) return;
    setSavingChanges(true);
    try {
      await ExamHistory.update(savedId, { exam_json: examData, title: examData.title || undefined });
      savedExamRef.current = examData;
      setSavedRefresh(n => n + 1);
      showSaveToast("info", "Changes saved to My Assessments.");
    } catch (e) {
      if (e?.status === 404) { setSavedId(null); showSaveToast("warn", "This assessment was removed from My Assessments to make room, so the changes can't be saved there."); }
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
    stopFigureDrawing();
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
    scrollPos.current.generate = 0;
    setView("generate");
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
      if (publicActive) return `${wassceActive ? "WASSCE" : "BECE"} style papers have several sections and a full marking scheme, so they need Premium AI.`;
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

  /** Replace one question on the finished paper (standard papers; BECE/WASSCE sections are regenerated whole). */
  const handleReplaceQuestion = async ({ section, question, avoid, note }) => {
    const hasGuide = (examData?.sections || []).some(s => (s.questions || []).some(q => String(q.markingGuide || "").trim()));
    try {
      const { question: nq, creditsRemaining } = await requestQuestionReplacement({
        api: EXAM_API, token: getToken ? getToken() : null,
        settings: {
          tier: examTier || "premium", className, programme, subject, term, examType, durationMinutes,
          topics: selectedTopics, pastedSyllabus, difficulty, languageStyle, cognitiveLevels, includeMarkingScheme: hasGuide, examStyle: "school",
        },
        section, question, avoid, note,
      });
      if (typeof creditsRemaining === "number") setCreditBalance(creditsRemaining);
      return nq;
    } catch (e) {
      if (typeof e.creditsRemaining === "number") setCreditBalance(e.creditsRemaining);
      throw e;
    }
  };

  /** Everything the server needs to write the paper. Its fingerprint also answers "are these exactly the settings an interrupted run used?" */
  const buildGenerationPayload = (tierArg) => ({
    mode: "generate-exam", tier: tierArg,
    schoolName, className, programme, subject, term, examType, durationMinutes,
    topics: selectedTopics, pastedSyllabus,
    difficulty, languageStyle, cognitiveLevels,
    sections: activeSections, allowDiagrams, includeMarkingScheme,
    examStyle: wassceActive ? "wassce" : beceActive ? "bece" : "school",
  });

  /** resumeFrom: { sections, title, instructions } kept from an interrupted run. Only the missing sections are then written (and charged). */
  const handleGenerate = async (tierArg, resumeFrom = null) => {
    setError("");
    const validationError = validate(tierArg);
    if (validationError) { setError(validationError); return; }

    stopFigureDrawing();
    setRecovery(null);                       // any "welcome back" / "interrupted" notice is now out of date
    clearJob();
    clearPaperSnapshot();                    // the paper on screen is about to be replaced (the old one is in My Assessments)
    setLoading(true);
    setLoadingTier(tierArg);
    setExamTier(tierArg);
    setExamData(null);
    setOpenedMeta(null);
    setLivePreview(null);
    setSavedId(null); savedExamRef.current = null;
    // Sections already held from an interrupted run (empty on a normal run).
    let held = resumeFrom ? [...resumeFrom.sections] : [];
    let heldTitle = resumeFrom?.title || "";
    let heldInstructions = resumeFrom?.instructions || [];
    let settingsKey = "";
    let keepJob = false;   // true when the run stopped part-way and the finished sections are worth keeping for "Continue"
    setProgress({ index: held.length, total: activeSections.length, sectionLabel: "", sectionsDone: new Set(held.map(sc => sc.id)) });
    if (held.length) setLivePreview({ title: heldTitle, instructions: heldInstructions, sections: held, answerKey: [] });
    try {
      const payload = buildGenerationPayload(tierArg);
      settingsKey = fingerprint(payload);          // taken BEFORE skipSectionIds is added: it describes the settings, not the continuation
      if (held.length) payload.skipSectionIds = held.map(sc => sc.id);

      const token = getToken ? getToken() : null;
      // The run in progress, with every section as it finishes. If the page is refreshed or the run stops part-way, the next
      // visit can say what happened and continue from here instead of starting again.
      const persistJob = () => saveJob({ tier: tierArg, total: activeSections.length, done: held.length, key: settingsKey, title: heldTitle, instructions: heldInstructions, sections: held }, uidRef.current);
      persistJob();
      const result = await streamExamAPI(payload, token, (event) => {
        if (event.type === "progress") {
          setProgress(prev => ({ ...prev, index: event.index, total: event.total, sectionLabel: event.sectionLabel }));
        } else if (event.type === "section-done") {
          if (event.section) held = [...held, event.section];
          if (event.title !== undefined) heldTitle = event.title;
          if (event.instructions !== undefined) heldInstructions = event.instructions;
          persistJob();
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

      clearJob(); // the run finished: nothing left to explain
      if (resumeFrom) { // the server wrote only the missing sections: put the paper back together in the requested order
        const byId = new Map([...resumeFrom.sections, ...(result.examData.sections || [])].map(sc => [sc.id, sc]));
        const answerKey = [];
        activeSections.forEach(sc => { if (sc.type === "objective") (byId.get(sc.id)?.questions || []).forEach(q => { if (q.correctOption) answerKey.push({ number: q.number, answer: q.correctOption }); }); });
        result.examData = {
          ...result.examData,
          title: resumeFrom.title || result.examData.title,
          instructions: resumeFrom.instructions?.length ? resumeFrom.instructions : result.examData.instructions,
          sections: activeSections.map(sc => byId.get(sc.id)).filter(Boolean),
          answerKey,
        };
      }
      const { ok, errors } = validateExamData(result.examData, activeSections, { style: wassceActive ? "wassce" : "" });
      if (!ok) throw new Error(`The generated paper didn't match the requested structure: ${errors.join(" ")}`);

      if (wassceActive && beceProfile) result.examData = decorateWassceExam(result.examData, activeSections, beceProfile, examType);
      else if (beceActive && beceProfile) result.examData = decorateBeceExam(result.examData, activeSections, beceProfile, examType);
      setExamData(result.examData);
      try { navigator.vibrate?.(14); } catch { /* no haptics here: nothing to do */ }   // a small "done" tap on phones
      setExamVersion("A");
      setExamHasMarkingScheme(result.includeMarkingScheme !== false);
      setShowAnswerKey(false);
      // Save to My Assessments in the background - never blocks showing the paper.
      saveExamToHistory(result.examData, metaForSave(meta, { hasMarkingScheme: result.includeMarkingScheme !== false }));
      // The AI then draws the paper's figures one by one (never blocks the paper either).
      if (allowDiagrams) drawFiguresFor(result.examData);
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
        // Stopped part-way: the sections that did finish are kept, and the teacher is offered "Continue" rather than a full redo.
        if (held.length > 0 && held.length < activeSections.length) {
          keepJob = true;
          setRecovery({ kind: "interrupted", failed: true, tier: tierArg, total: activeSections.length, done: held.length, key: settingsKey, sections: held, title: heldTitle, instructions: heldInstructions });
        }
      }
    } finally {
      if (!keepJob) clearJob(); // finished, failed or cancelled: the run is over (a refresh leaves the marker behind; a part-way stop keeps it on purpose)
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

  // ── Figures: the AI draws each one after generation (see aiFigures.js) ──────────
  // figDrawState holds only the figures being drawn right now ("drawing") or that
  // failed ("failed"), keyed by slot key. Everything else is read from the exam itself.
  const [figuresPending, setFiguresPending] = useState(false); // true while the AI is still drawing this paper's figures
  const [figDrawState, setFigDrawState] = useState({});
  const figAbortRef = useRef(null);
  const examDataRef = useRef(null);
  const savedIdRef = useRef(null);
  useEffect(() => { examDataRef.current = examData; }, [examData]);
  useEffect(() => { savedIdRef.current = savedId; }, [savedId]);
  const markFigure = useCallback((key, st) => setFigDrawState(prev => {
    const next = { ...prev };
    if (st === "done") delete next[key]; else next[key] = st;
    return next;
  }), []);
  const stopFigureDrawing = useCallback(() => {
    if (figAbortRef.current) figAbortRef.current.abort();
    figAbortRef.current = null;
    setFiguresPending(false);
    setFigDrawState({});
  }, []);
  useEffect(() => () => { if (figAbortRef.current) figAbortRef.current.abort(); }, []);

  const redrawFigure = useCallback(async (slot) => {
    markFigure(slot.key, "drawing");
    try {
      const svg = await requestFigureSVG({ api: EXAM_API, token: getToken ? getToken() : null, description: slot.description, subject, className });
      setSlotDiagram(setExamData, slot, aiDiagram(slot.description, svg));
      markFigure(slot.key, "done");
    } catch { markFigure(slot.key, "failed"); }
  }, [markFigure, subject, className]);

  /** Draws every empty figure of a freshly generated paper, then saves the drawings with the paper in My Assessments. */
  const drawFiguresFor = async (generated) => {
    stopFigureDrawing();
    const ctrl = new AbortController();
    figAbortRef.current = ctrl;
    setFiguresPending(true);
    try {
      const drawn = await autoDrawFigures({
        examData: generated, setExamData, api: EXAM_API, token: getToken ? getToken() : null,
        subject, className, onSlot: markFigure, signal: ctrl.signal,
      });
      if (ctrl.signal.aborted || !drawn) return;
      await new Promise(r => setTimeout(r, 80)); // let the last drawing reach state
      for (let i = 0; i < 20 && !savedIdRef.current; i++) await new Promise(r => setTimeout(r, 500)); // the background save may still be running
      const id = savedIdRef.current, latest = examDataRef.current;
      if (ctrl.signal.aborted || !id || !latest) return;
      try { await ExamHistory.update(id, { exam_json: latest }); savedExamRef.current = latest; } catch { /* the drawings are still on screen; "Save changes" remains available */ }
    } finally {
      if (figAbortRef.current === ctrl) { figAbortRef.current = null; setFiguresPending(false); } // not if a newer run has taken over
    }
  };

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

  // ── Recovery after a refresh / crash / sign-in redirect (storage layer: draftStore.js) ─────────────────────────────
  // Three things are remembered in this browser: the paper setup (instantly, before first paint), the generated paper with any
  // edits not yet saved to My Assessments, and a marker that a generation was running. Nothing leaves the device; signing out wipes it.
  const [recovery, setRecovery] = useState(() => (Object.keys(D).length ? {
    kind: "draft",
    summary: [D.className, D.subject, D.selectedTopics?.length ? `${D.selectedTopics.length} topic${D.selectedTopics.length === 1 ? "" : "s"}` : null].filter(Boolean).join(" · "),
  } : null)); // the notice on screen: { kind: "draft" | "paper" | "interrupted", ... }
  const [paperRestoreDone, setPaperRestoreDone] = useState(false); // saving the paper copy waits for this, so an empty start can never erase a copy that is still being read
  const [paperBackedUp, setPaperBackedUp] = useState(false);       // true once a recovery copy of the paper has really been written
  const [recoverySaving, setRecoverySaving] = useState(false);
  const hadPaperRef = useRef(false);
  const loadingRef = useRef(false);
  loadingRef.current = loading;

  /** Back to a blank wizard (also the "Start fresh" button and sign-out). paper:true clears the paper on screen too. */
  const resetWizard = ({ paper = false } = {}) => {
    stopFigureDrawing();
    setClassName(""); setTerm("Term 1"); setExamType("Class Test"); setDurationMinutes(60);
    setSubject(""); setShsCourse(""); setShsKey("");
    setSelectedTopics([]); setDraftStrands([]); setPastedSyllabus("");
    setDifficulty("Moderate"); setLanguageStyle("Balanced"); setCognitiveLevels(["Recall", "Application"]);
    setSections(DEFAULT_SECTIONS.map(sc => ({ ...sc })));
    setAllowDiagrams(true); setIncludeMarkingScheme(true);
    styleChosenByUser.current = false; setExamStyle("school");
    setError("");
    if (paper) {
      setExamData(null); setSavedId(null); savedExamRef.current = null; setOpenedMeta(null);
      setExamVersion("A"); setShowAnswerKey(false); setEditMode(false); setLivePreview(null);
      scrollPos.current.generate = 0;
      setView("generate");
    }
  };

  // 1. The paper setup: written shortly after every change, and the moment the page is hidden or closed.
  const wizardFields = useMemo(() => ({
    className, term, examType, durationMinutes, subject, shsCourse, shsKey, selectedTopics, strands: draftStrands, pastedSyllabus,
    difficulty, languageStyle, cognitiveLevels, sections, allowDiagrams, includeMarkingScheme, examStyle, styleChosen: styleChosenByUser.current,
  }), [className, term, examType, durationMinutes, subject, shsCourse, shsKey, selectedTopics, draftStrands, pastedSyllabus,
    difficulty, languageStyle, cognitiveLevels, sections, allowDiagrams, includeMarkingScheme, examStyle]);
  useAutosave(wizardFields, (f) => saveWizardDraft(f, uidRef.current), { delay: 700 });

  // 2. The paper on screen. "Unsaved" is worked out at the moment of writing (from the refs), not when the snapshot object was built.
  const paperSnap = useMemo(() => (examData ? {
    examData, examTier, examHasMarkingScheme, savedId, examVersion, openedMeta, landscape, figuresPending,
  } : null), [examData, examTier, examHasMarkingScheme, savedId, examVersion, openedMeta, landscape, figuresPending, savedRefresh]); // eslint-disable-line react-hooks/exhaustive-deps
  useAutosave(paperSnap, async (snap) => {
    if (!snap) { // only a paper that was on screen this session is ever erased; an empty start never touches a stored copy
      if (hadPaperRef.current) { hadPaperRef.current = false; await clearPaperSnapshot(); setPaperBackedUp(false); }
      return;
    }
    hadPaperRef.current = true;
    if (!uidRef.current) return;
    const dirty = !savedIdRef.current || examDataRef.current !== savedExamRef.current;
    setPaperBackedUp(await savePaperSnapshot({ ...snap, dirty }, uidRef.current));
  }, { delay: 1000, enabled: paperRestoreDone });

  // 3. On arrival (and again once sign-in completes, e.g. back from the Google / Hub redirect): bring the paper back, or explain an interrupted run.
  const accountId = userKey(user);
  useEffect(() => {
    let alive = true;
    (async () => {
      let rec = null;
      if (accountId) { try { rec = await loadPaperSnapshot(accountId); } catch { rec = null; } }
      if (!alive) return;
      const free = !examDataRef.current && !loadingRef.current; // never replace a paper the teacher already has, or a run in progress
      if (rec && free) {
        const sn = rec.snap;
        markRestoreAttempt();
        setExamData(sn.examData);
        setExamTier(sn.examTier === "free" || sn.examTier === "premium" ? sn.examTier : null);
        setExamHasMarkingScheme(sn.examHasMarkingScheme !== false);
        setSavedId(sn.savedId || null);
        // "Save changes" appears when the paper differs from the copy in My Assessments; a stand-in object marks "it does".
        savedExamRef.current = sn.savedId ? (sn.dirty ? {} : sn.examData) : null;
        setExamVersion(["A", "B", "C"].includes(sn.examVersion) ? sn.examVersion : "A");
        setOpenedMeta(sn.openedMeta && typeof sn.openedMeta === "object" ? sn.openedMeta : null);
        setLandscape(!!sn.landscape);
        setShowAnswerKey(false); setEditMode(false);
        hadPaperRef.current = true;
        clearJob();
        setRecovery({ kind: "paper", hasId: !!sn.savedId, dirty: !!sn.dirty });
        setTimeout(clearRestoreAttempt, 1500); // survived the first paint: the crash-loop guard can stand down
        if (sn.figuresPending) drawFiguresFor(sn.examData); // the AI was still drawing the figures: finish the job
      } else if (accountId && free) {
        const job = loadJob(accountId);
        if (job) setRecovery({ kind: "interrupted", tier: job.tier, total: job.total, done: job.done, key: job.key, sections: job.sections, title: job.title, instructions: job.instructions });
      }
      setPaperRestoreDone(true);
    })();
    return () => { alive = false; };
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving mid-generation can't be recovered, and an unsaved paper can't be recovered if this browser won't store a copy: ask first.
  useEffect(() => {
    const unsavedPaper = !!examData && (!savedId || hasUnsavedEdits);
    if (!(loading || (unsavedPaper && !paperBackedUp))) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; return ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [loading, examData, savedId, hasUnsavedEdits, paperBackedUp]);

  // The "welcome back" note is a courtesy, not a task: it fades by itself. (Notices that need a decision stay until dealt with.)
  useEffect(() => {
    if (recovery?.kind !== "draft") return undefined;
    const t = setTimeout(() => setRecovery((r) => (r?.kind === "draft" ? null : r)), DRAFT_NOTICE_MS);
    return () => clearTimeout(t);
  }, [recovery]);
  const dismissRecovery = () => { if (recovery?.kind === "interrupted") clearJob(); setRecovery(null); };
  const startFresh = () => { resetWizard(); clearAllDrafts(); setRecovery(null); };
  const showRecoveredPaper = () => document.getElementById("qa-paper-output")?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  const saveRecoveredPaper = async () => {
    if (!examData) return;
    setRecoverySaving(true);
    try {
      let ok;
      if (savedId) { await handleSaveChanges(); ok = savedExamRef.current === examDataRef.current; }
      else ok = await saveExamToHistory(examData, metaForSave(meta, { hasMarkingScheme: examHasMarkingScheme }));
      if (ok) setRecovery(null);
    } finally { setRecoverySaving(false); }
  };

  let recoveryBanner = null;
  if (recovery?.kind === "draft") {
    recoveryBanner = (
      <RecoveryBanner testId="recovery-draft" title="Welcome back. Your paper setup was restored." onDismiss={dismissRecovery}
        actions={[{ label: "Start fresh", onClick: startFresh }]}>
        {recovery.summary ? `${recovery.summary}. ` : ""}Carry on from where you stopped.
      </RecoveryBanner>
    );
  } else if (recovery?.kind === "paper") {
    const actions = [{ label: "Show paper", onClick: showRecoveredPaper, primary: recovery.hasId && !recovery.dirty }];
    if (!recovery.hasId) actions.unshift({ label: "Save to My Assessments", onClick: saveRecoveredPaper, primary: true, busy: recoverySaving });
    else if (recovery.dirty) actions.unshift({ label: "Save changes", onClick: saveRecoveredPaper, primary: true, busy: recoverySaving });
    recoveryBanner = (
      <RecoveryBanner testId="recovery-paper" title="We recovered the paper you were working on." onDismiss={dismissRecovery} actions={actions}>
        {!recovery.hasId ? "It isn't in My Assessments yet. Save it so it is kept." : recovery.dirty ? "It includes edits you hadn't saved to My Assessments yet." : "It is also safely stored in My Assessments."}
      </RecoveryBanner>
    );
  } else if (recovery?.kind === "interrupted") {
    const free = recovery.tier === "free";
    const kept = recovery.sections?.length || 0;
    const left = Math.max(0, (recovery.total || 0) - kept);
    // Continuing is only safe when the settings are exactly the ones the kept sections were written for.
    const sameSettings = kept > 0 && !!recovery.key && recovery.key === fingerprint(buildGenerationPayload(recovery.tier));
    const canContinue = sameSettings && left > 0;
    const again = () => requireLogin(() => handleGenerate(recovery.tier))();
    const carryOn = () => requireLogin(() => handleGenerate(recovery.tier, { sections: recovery.sections, title: recovery.title, instructions: recovery.instructions }))();
    const actions = canContinue
      ? [{ label: `Continue (${left} section${left === 1 ? "" : "s"} left)`, onClick: carryOn, primary: true }, { label: "Start over", onClick: again }]
      : [{ label: "Generate again", onClick: again, primary: true }];
    recoveryBanner = (
      <RecoveryBanner testId="recovery-interrupted" tone="warn" onDismiss={dismissRecovery} actions={actions}
        title={recovery.failed ? "This paper stopped part-way." : "Your last paper didn't finish generating."}>
        {recovery.total > 0 ? `${recovery.done} of ${recovery.total} sections ${canContinue ? "were written and kept. " : "had been written. "}` : ""}
        {canContinue
          ? (free ? "Continue writes only the rest, and Free AI is not charged. " : `Continue writes only the remaining ${left} and charges credits for those alone. `)
          : (kept > 0 ? "Your settings have changed since then, so those sections can't be reused. " : "")}
        {!canContinue && (free ? "Free AI is not charged. " : "Your credit balance has been refreshed. If it looks lower than expected, email hello@eduformium.com and we will put it right. ")}
        {canContinue ? "" : "Your settings are restored, so you can generate again straight away."}
      </RecoveryBanner>
    );
  }

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
          for (const p of (Array.isArray(q.parts) ? q.parts : [])) {
            if (ownerDrawing(p) && !ownerImageOk(p) && isSafeGeneratedSVG(p.diagram.svg)) {
              try { docMeta.svgPngs[`${sec.id}:${q.number}:${p.label}`] = await svgToPngDataUrl(p.diagram.svg, 900); }
              catch (e) { console.warn("Figure render skipped:", e); }
            }
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
      try { await navigator.share({ files: [file], title: activeExamData.title || examType, text: "Made with Eduformium Assessment Studio" }); }
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

  // ── Shading sheet ───────────────────────────────────────────────
  // Style follows the level (BECE for Primary/JHS, WASSCE for SHS) until the teacher picks one. The question count comes from the
  // paper's objective questions (real counts once generated, the section set-up before that) unless typed in.
  const effClass = sheetClass !== null ? sheetClass : className;
  const sameAsPaper = effClass === className;
  const sheetIsSHS = isSHSClass(effClass);
  // Exam type and term are NOT printed or asked for on the sheets and booklet. They only feed the hidden scan code
  // (the WASSCE sheet's QR reference), so a Term 1 sheet and a Term 2 sheet of the same subject stay distinguishable.
  const effExamType = sameAsPaper ? examType : (examTypesFor(effClass)[0] || examType);
  const effTerm = sameAsPaper && termOptionsFor(effClass).includes(term) ? term : (termOptionsFor(effClass)[0] || term);
  const shadeStyle = sheetStyle || defaultSheetStyle(sheetIsSHS);
  const shadeColourMode = sheetColourMode || SHEET_SPECS[shadeStyle].defaultColour;
  const autoShadeCount = !sameAsPaper ? 0 : (activeExamData ? objectiveCount(activeExamData.sections, { generated: true }) : objectiveCount(sections));
  const shadeCount = sheetQuestions != null ? clampQuestions(sheetQuestions) : (autoShadeCount > 0 ? clampQuestions(autoShadeCount) : 0);
  const [showShadePreview, setShowShadePreview] = useState(false);
  const [showBookletPreview, setShowBookletPreview] = useState(false);
  const autoBookletCount = !sameAsPaper ? 0 : (activeExamData ? theoryCount(activeExamData.sections, { generated: true }) : theoryCount(sections));
  const bookletProfile = !sameAsPaper ? { structured: 0, essay: 0 } : (activeExamData ? theoryProfile(activeExamData.sections, { generated: true }) : theoryProfile(sections));
  const bookletCount = bookletQuestions != null ? clampBookletQuestions(bookletQuestions) : (autoBookletCount > 0 ? clampBookletQuestions(autoBookletCount) : 8);
  // Leaving a tab remembers where you were on it; coming back restores it (a tab you have not visited opens at the top).
  const goTab = (id) => {
    if (id === viewRef.current) { window.scrollTo?.({ top: 0, behavior: "smooth" }); return; }   // tapping the active tab scrolls to top
    scrollPos.current[viewRef.current] = window.scrollY || 0;
    setNavHidden(false);
    setView(id);
  };
  const openShadingSheet = () => {
    if (!shadeCount) { alert("Add an objective section (or enter the number of questions) to make a shading sheet."); return; }
    setShowShadePreview(true);   // preview first; printing happens from the preview window
  };
  const openAnswerBooklet = () => setShowBookletPreview(true);
  // The booklet's cover repeats the question paper's cover: the same paper-code box, paper names, duration and total marks.
  const bookletCover = (() => {
    if (!beceProfile || !publicActive || !sameAsPaper) return {};
    const p = beceProfile;
    const code = p.order === "21" || !p.paper2 ? (wassceActive ? wassceCoverCode(p) : beceCoverCode(p)) : (wassceActive ? wasscePaper2Code(p) : { code: "2", subject: String(p.label || "").toUpperCase(), kind: "Essay", duration: minutesLabel(p.paper2.minutes) });
    const names = p.paper1 && p.paper2 ? (wassceActive && p.order !== "21" ? `${p.paper1.name} and ${p.paper2.name}` : `${p.paper2.name} and ${p.paper1.name}`) : "";
    return { coverCode: code, paperNames: names };
  })();
  const bookletTotalMarks = activeExamData ? (Number(activeExamData.totalMarks) || "") : "";
  const bookletPrinted = bookletPageCount(bookletPages, bookletPaper);
  const bookletSuggested = suggestBookletPages(bookletProfile.structured + bookletProfile.essay > 0 ? { ...bookletProfile, paper: bookletPaper } : { structured: bookletCount, essay: 0, paper: bookletPaper });
  const setBookletCfg = (patch) => {
    if ("paper" in patch) setBookletPaper(clampBookletPaper(patch.paper));
    if ("pages" in patch) setBookletPages(clampBookletPages(patch.pages));
    if ("ruling" in patch) setBookletRuling(patch.ruling);
    if ("questions" in patch) setBookletQuestions(patch.questions);
  };
  const bookletHtml = showBookletPreview ? renderAnswerBookletHTML({
    pages: bookletPages, paper: bookletPaper, questions: bookletCount, ruling: bookletRuling, colourMode: shadeColourMode, colours: sheetColours,
    meta: { ...meta, className: effClass, term: effTerm, examType: effExamType, ...(sameAsPaper ? { durationMinutes, totalMarks: bookletTotalMarks, ...bookletCover } : { subject: "", programme: "" }) },
    crestSVG: !schoolLogo && emblem !== "none" ? schoolCrestSVG(schoolName) : "", preview: true,
  }) : "";
  const shadeHtml = showShadePreview && shadeCount ? renderShadingSheetHTML({
    style: shadeStyle, questions: shadeCount, optionCount: sheetOptions, colourMode: shadeColourMode, colours: sheetColours,
    meta: { ...meta, className: effClass, term: effTerm, examType: effExamType, ...(sameAsPaper ? {} : { subject: "", programme: "" }) },
    crestSVG: !schoolLogo && emblem !== "none" ? schoolCrestSVG(schoolName) : "", preview: true,
  }) : "";

  // Same pattern as the Lesson Planner's own onLoginRequired: don't hard-wall
  // the whole page behind a sign-in screen. Let a teacher fill in the whole
  // wizard first - subject, topics, sections, everything - and only ask them
  // to sign in at the moment they take an action that actually needs an
  // account (Generate, or opening the top-up modal). Confirmed against the
  // real App.jsx: `onClick={!user ? onLoginRequired : generate}` is the
  // exact pattern used throughout, not something invented for this app.
  // Address <-> tab. Changing the tab pushes #shading / #saved (Assessment clears it); Back/Forward and manual edits change the tab.
  useEffect(() => {
    if (window.history && "scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    const onNav = () => {
      const h = window.location.hash;
      if (h !== "" && h !== "#shading" && h !== "#booklet" && h !== "#saved") return;          // not one of ours
      const next = viewFromHash();
      if (next === viewRef.current) return;
      scrollPos.current[viewRef.current] = window.scrollY || 0;
      setNavHidden(false);
      setView(next);
    };
    window.addEventListener("popstate", onNav);
    window.addEventListener("hashchange", onNav);
    return () => { window.removeEventListener("popstate", onNav); window.removeEventListener("hashchange", onNav); };
  }, []);
  useEffect(() => {
    if (viewFromHash() !== view) window.history.pushState(null, "", window.location.pathname + window.location.search + TAB_HASH[view]);
    document.title = TAB_TITLE[view];
    const y = scrollPos.current[view] || 0;
    const id = requestAnimationFrame(() => window.scrollTo?.({ top: y }));
    return () => cancelAnimationFrame(id);
  }, [view]);
  // Phone: slide the bottom nav away on scroll down, bring it back on scroll up, so a finished paper never has two bars stacked on it.
  useEffect(() => {
    let last = window.scrollY || 0, ticking = false;
    const onScroll = () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY || 0, d = y - last;
        if (Math.abs(d) > 8) { setNavHidden(y > 120 && d > 0); last = y; }
        if (y <= 40) setNavHidden(false);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const requireLogin = (action) => (user ? action : () => setShowAuthModal(true));

  const handleSignOut = () => {
    signOut();
    clearAllDrafts();                 // this browser keeps nothing of the account's work in progress
    resetWizard({ paper: true });     // and the next person on this computer starts from a blank page
    setRecovery(null);
    setUser(null);
    setCreditBalance(null);
  };

  const schoolExamCard = (
      <div style={S.card}>
        <CardTitle F={F} mb={16} desc="Printed on the sheet. Shared with the Assessment tab, so you only enter it once.">School details</CardTitle>
        <div style={{ marginBottom: 14 }}>
          <label style={S.lbl}>Class</label>
          <select value={effClass} onChange={e => setSheetClass(e.target.value)} style={S.sel}>
            <option value="">- Select Class -</option>
            {CLASS_GROUPS.map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.classes.map(c => <option key={c} value={c}>{c}</option>)}
              </optgroup>
            ))}
          </select>
          {!sameAsPaper && className && (
            <div className="qa-note" style={{ fontFamily: F, marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span>Different from your paper's class ({className}). Your Assessment form is not affected.</span>
              <button type="button" style={S.sm} onClick={() => { setSheetClass(null); }}>Use paper's class</button>
            </div>
          )}
        </div>
        {effClass && (
          <>
            <SchoolIdentityFields S={S} schoolName={schoolName} setSchoolName={setSchoolName} schoolLogo={schoolLogo} setSchoolLogo={setSchoolLogo} schoolMotto={schoolMotto} setSchoolMotto={setSchoolMotto} emblem={emblem} setEmblem={setEmblem} />
          </>
        )}
      </div>
  );
  const colourGroup = (
    <div className="qa-group" data-testid="colour-group">
      <label style={S.lbl}>Print colour</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {[{ id: "school", l: "School colour" }, { id: "mono", l: "Black & white" }].map(o => (
          <button key={o.id} type="button" className="qa-chip" aria-pressed={shadeColourMode === o.id} onClick={() => setSheetColourMode(o.id)}>{o.l}</button>
        ))}
      </div>
      {shadeColourMode === "school" && (
        <div style={{ marginTop: 12 }}>
          <div className="qa-swatches" role="group" aria-label="School colour presets">
            {SCHOOL_COLOUR_PRESETS.map(c => (
              <button key={c.id} type="button" className="qa-swatch" aria-pressed={sheetColours.main === c.main} aria-label={c.label} title={c.label} onClick={() => setSheetColours({ main: c.main, accent: c.main })} style={{ background: c.main }}>
                <svg width="16" height="16" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 6.5l2.2 2.2L9.5 3.6" /></svg>
              </button>
            ))}
          </div>
          <p className="qa-colour-name" style={{ fontFamily: F }}>{(SCHOOL_COLOUR_PRESETS.find(c => c.main === sheetColours.main) || {}).label || "Custom colour"}</p>
          <label style={{ ...S.lbl, marginTop: 12 }}>Or pick your own colour</label>
          <input type="color" value={sheetColours.main} onChange={e => { const v = e.target.value.toUpperCase(); setSheetColours({ main: v, accent: v }); }} aria-label="School colour" style={{ ...S.inp, padding: 3, height: 40, width: 64, minHeight: 40, cursor: "pointer" }} />
          <Hint className="qa-desc" label="Where it prints" style={{ fontFamily: F, marginTop: 8 }}>One colour prints the title bars, rules, boxes and bubbles, on the shading sheet and the answer booklet.</Hint>
        </div>
      )}
    </div>
  );

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
      onOpenSaved={() => goTab("saved")}
    />
    <TopNav tab={view} setTab={goTab} savedCount={savedCount} F={F} />
    <div className={`qa-page${examData && view === "generate" ? " has-paper" : ""}`} style={{ paddingBottom: examData && view === "generate" ? 110 : 60, fontFamily: F }}>
      {view === "generate" && (
        <>
        <header className="qa-hero qa-rise">
          <div className="qa-hero-row">
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontFamily: F }}>Assessment Studio</h1>
              <p style={{ fontFamily: F }}>Create tests, quizzes and exams in minutes.</p>
            </div>
          </div>
          <WizardProgress hasClass={!!(className && subject)} hasTopics={selectedTopics.length > 0 || !!pastedSyllabus.trim()} hasExam={!!examData} />
        </header>
        {recoveryBanner}
        </>
      )}

      {view === "saved" && (
        <div role="tabpanel" aria-labelledby="qa-tab-saved">
        <SavedExams
          user={user} refreshKey={savedRefresh} S={S} F={F}
          onOpen={handleOpenSaved}
          onBack={() => setView("generate")}
          onSignIn={() => setShowAuthModal(true)}
          onCount={setSavedCount}
        />
        </div>
      )}

      {saveToast && (
        <div role="status" className={`qa-toast${examData && view === "generate" ? " has-bar" : ""}`} style={{
          position: "fixed", left: 12, right: 12, bottom: examData && view === "generate" ? 84 : "max(16px, env(safe-area-inset-bottom, 16px))", margin: "0 auto", maxWidth: 420, zIndex: 200,
          padding: "11px 14px", borderRadius: 12, fontFamily: F, fontSize: 13, lineHeight: 1.45,
          background: "var(--card-bg)", color: saveToast.type === "warn" ? "var(--orange-text)" : "var(--text)",
          border: `1px solid ${saveToast.type === "warn" ? "var(--orange-text)" : "var(--border-strong)"}`, boxShadow: "none",
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

      {showShadePreview && shadeHtml && (
        <ShadingPreview
          html={shadeHtml} questions={shadeCount} S={S} F={F}
          style={shadeStyle} onStyle={(id) => { setSheetStyle(id); setSheetColourMode(null); }}
          colourMode={shadeColourMode} onColourMode={setSheetColourMode}
          onClose={() => setShowShadePreview(false)} page={pageFor(shadeStyle)}
        />
      )}
      {showBookletPreview && bookletHtml && (
        <ShadingPreview
          html={bookletHtml} questions={bookletCount} S={S} F={F} page={BOOKLET_SHEET[bookletPaper]}
          title="Answer booklet preview"
          subtitle={bookletPaper === "a3" ? `${bookletPrinted} pages · ${bookletSheetCount(bookletPages, "a3")} A3 landscape sheets, each folded in half into A4 pages` : `${bookletPrinted} pages · A4 portrait · cover + ${bookletPrinted - 1} ruled pages`} showStyle={false}
          colourMode={shadeColourMode} onColourMode={setSheetColourMode}
          printHint={bookletPaper === "a3"
            ? <>In the print dialog choose <b>A3, Landscape, Margins: None, Scale: 100%</b>. Print <b>double-sided, flip on the SHORT edge</b>. Nest the sheets in order, fold them in half and staple on the fold: every half is one A4 page.</>
            : <>In the print dialog choose <b>A4, Portrait, Margins: None, Scale: 100%</b>. Print <b>double-sided (flip on the long edge)</b>, put the cover on top, and staple at the left to make the booklet.</>}
          onClose={() => setShowBookletPreview(false)}
        />
      )}

      {/* Wizard + result stay mounted (just hidden) while the Shading Sheet or My Assessments tab is open, so nothing the teacher typed is lost */}
      <div className="qa-flow" role="tabpanel" aria-labelledby="qa-tab-generate" style={{ display: view !== "generate" ? "none" : undefined }}>
      {/* ── Curriculum + Topics (GES / NaCCA) - CLASS FIRST, matching
           the real Lesson Planner's flow exactly. Everything else in the
           form follows from this, so it comes first on the page too. ── */}
      <TopicSelector
        initialStrands={D.strands} onStrandsChange={setDraftStrands}
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

      {!className && <Welcome F={F} />}

      {/* ── Basic Information - only once a class is chosen, so the
           form doesn't show a wall of fields before the one choice that
           actually drives everything else. ── */}
      {className && (
      <div style={S.card}>
        <CardTitle F={F} mb={14} desc="What kind of assessment is this?">Exam type</CardTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {examTypesFor(className).map(t => (
            <button key={t} type="button" className="qa-chip" aria-pressed={examType === t} onClick={() => setExamType(t)}>{t}</button>
          ))}
        </div>

        {publicAvailable && (
          <div className="qa-group">
            <hr className="qa-divider" style={{ marginTop: 22 }} />
            <CardTitle F={F} level={2} mb={14} desc="Choose how the paper is laid out and structured.">Exam style</CardTitle>
            <div className="qa-choices" role="group" aria-label="Exam style">
              {[
                { id: "school", label: "School exam", desc: "Everyday class-test layout. You choose the sections, questions and marks." },
                { id: "public", label: isSHS ? "WASSCE style" : "BECE style", desc: `The real ${isSHS ? "WASSCE" : "BECE"} paper format. Sections, marks, time and marking scheme are set for you.` },
              ].map(o => {
                const locked = isMock && o.id === "school";
                return (
                  <button key={o.id} type="button" className="qa-choice" aria-pressed={examStyle === o.id} disabled={locked}
                    title={locked ? "Mock exams always follow the BECE / WASSCE format" : ""}
                    onClick={() => chooseStyle(o.id)}>
                    <span className="qa-choice-t" style={{ fontFamily: F }}>{o.label}</span>
                    <span className="qa-choice-d" style={{ fontFamily: F }}>{o.desc}</span>
                  </button>
                );
              })}
            </div>
            <p className="qa-choice-sel" style={{ fontFamily: F }}>
              {examStyle === "public" ? `The real ${isSHS ? "WASSCE" : "BECE"} paper format. Sections, marks, time and marking scheme are set for you.` : "Everyday class-test layout. You choose the sections, questions and marks."}
            </p>
            {(isMock || examStyle === "public") && !(publicActive && beceProfile && subject) && (
              <div className="qa-note" style={{ fontFamily: F, marginTop: 12 }}>
                {examStyle === "public" && (publicActive
                  ? (subject
                      ? `The ${wassceActive ? "WASSCE" : "BECE"} paper structure for ${subject} has been loaded below.`
                      : `Choose a subject above and its ${wassceActive ? "WASSCE" : "BECE"} paper structure will load automatically.`)
                  : "Index-number boxes, a sealed-paper notice and a WASSCE-style layout are applied.")}
                {isMock ? `${examStyle === "public" ? " " : ""}Mock exams always use this style.` : ""}
              </div>
            )}
            {publicActive && beceProfile && subject && (
              <div className="qa-note" style={{ marginTop: 12, fontFamily: F, lineHeight: 1.7 }}>
                <div style={{ marginBottom: 6 }}>The {wassceActive ? "WASSCE" : "BECE"} paper structure for {subject} has been loaded below.{isMock ? " Mock exams always use this style." : ""}</div>
                {(wassceActive && beceProfile.order !== "21" ? ["p1", "p2"] : ["p2", "p1"]).map(k => k === "p2"
                  ? <div key="p2"><b>Paper 2 (Essay):</b> {beceProfile.paper2.marks} marks, {minutesLabel(beceProfile.paper2.minutes)}</div>
                  : <div key="p1"><b>Paper 1 (Objective):</b> {beceProfile.paper1.marks} questions, {minutesLabel(beceProfile.paper1.minutes)}</div>)}
                {!beceProfile.verified && (
                  <div style={{ marginTop: 6, color: "var(--text-muted)" }}>Please check against a real paper: {beceProfile.unverified.join("; ")}.</div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
      )}

      {className && (
      <div style={S.card}>
        <CardTitle F={F} mb={16} desc="Printed in the header of the paper.">Paper details</CardTitle>
        <SchoolIdentityFields S={S} schoolName={schoolName} setSchoolName={setSchoolName} schoolLogo={schoolLogo} setSchoolLogo={setSchoolLogo} schoolMotto={schoolMotto} setSchoolMotto={setSchoolMotto} emblem={emblem} setEmblem={setEmblem} />
        <div className="eduq-grid-2 is-pair">
          <div>
            <label style={S.lbl}>{isSHS ? "Semester" : "Term"}</label>
            <select value={term} onChange={e => setTerm(e.target.value)} style={S.sel}>
              {termOptionsFor(className).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={S.lbl}>Duration (minutes)</label>
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
      <FoldCard S={S} F={F} title="Difficulty &amp; language"
        summary={[difficulty, (LANGUAGE_STYLES.find(o => o.value === languageStyle) || {}).label, cognitiveLevels.length ? cognitiveLevels.join(", ") : null].filter(Boolean).join(" · ")}>

        <div className="qa-group">
          <label style={S.lbl}>Difficulty</label>
          <div style={{ display: "flex", gap: 8 }}>
            {DIFFICULTIES.map(d => (
              <button key={d} type="button" className="qa-chip is-sq is-fill" aria-pressed={difficulty === d} onClick={() => setDifficulty(d)}>{d}</button>
            ))}
          </div>
        </div>

        <div className="qa-group">
          <label style={S.lbl}>Language Style</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {LANGUAGE_STYLES.map(opt => (
              <button key={opt.value} type="button" className="qa-chip is-sq" aria-pressed={languageStyle === opt.value} onClick={() => setLanguageStyle(opt.value)}>{opt.label}</button>
            ))}
          </div>
        </div>

        <div className="qa-group">
          <label style={S.lbl}>Cognitive Level (select any)</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {COGNITIVE_LEVELS.map(lvl => (
              <button key={lvl} type="button" className="qa-chip is-sq" aria-pressed={cognitiveLevels.includes(lvl)} onClick={() => toggleCognitive(lvl)}>{lvl}</button>
            ))}
          </div>
        </div>
      </FoldCard>
      )}

      {/* ── Exam Structure Builder - always full-capability here; a
           config that doesn't fit the Free tier just shows a clear
           message when the Free button specifically is clicked, rather
           than the whole form silently reconfiguring itself. ── */}
      {className && subject && (
      <ExamStructureBuilder sections={sections} setSections={setSections} S={S} F={F} note={wassceActive ? (beceProfile && beceProfile.generic ? "No official WASSCE paper structure is on file for this subject, so a standard WASSCE shape (Paper 1 objective, Paper 2 essay) was loaded. Please check the sections and marks against the subject's syllabus and adjust them." : `Structure loaded automatically from the real WASSCE paper for this subject (${beceProfile && beceProfile.order === "21" ? "Paper 2, then Paper 1" : "Paper 1, then Paper 2"}). You can still adjust it if you need to.${beceProfile && beceProfile.verified === false && beceProfile.unverified && beceProfile.unverified.length ? " Some details follow WAEC's published scheme and may differ slightly from a given year's paper." : ""}`) : beceActive ? "Structure loaded automatically from the real BECE paper for this subject (Paper 2, then Paper 1). You can still adjust it if you need to." : undefined} />
      )}

      {/* ── Output mode + diagrams - consolidated into one compact card
           instead of two, to cut down on card count. ── */}
      {className && subject && (
      <FoldCard S={S} F={F} title="Marking scheme &amp; diagrams"
        summary={`Marking scheme ${includeMarkingScheme ? "on" : "off"} · Diagrams ${allowDiagrams ? "on" : "off"}`}>

        <div className="qa-opt">
          <div>
            <div className="qa-opt-t" style={{ fontFamily: F }}>Marking scheme</div>
            <Hint>Adds the answer key and a point-by-point marking guide. Turn it off for a faster, cheaper question paper only. Premium AI only.</Hint>
          </div>
          <Toggle checked={includeMarkingScheme} onChange={setIncludeMarkingScheme} label="Include marking scheme" />
        </div>

        <div className="qa-opt">
          <div>
            <div className="qa-opt-t" style={{ fontFamily: F }}>AI-drawn diagrams</div>
            <Hint>Where a question needs a figure, graph or map, the AI draws it for you. You can replace any figure afterwards.</Hint>
          </div>
          <Toggle checked={allowDiagrams} onChange={setAllowDiagrams} label="Allow AI-suggested diagrams" />
        </div>
      </FoldCard>
      )}

      {error && <div style={S.err}><span>{error}</span></div>}

      {/* ── Bottom generate bar - Free AI (left) / Premium AI (right),
           two independent, always-visible actions - matching the real
           App.jsx's GENERATE BAR exactly, not a pre-selected tier toggle
           feeding one shared button. ── */}
      {className && subject && (() => {
        const t = paperTotals(sections);
        const meta = [className, subject, selectedTopics.length ? `${selectedTopics.length} topic${selectedTopics.length === 1 ? "" : "s"}` : (pastedSyllabus.trim() ? "Topics added" : null), `${t.questions} questions`, `${t.marks} marks`].filter(Boolean).join(" · ");
        return (
      <section className="qa-gen" aria-label="Generate">
        <div className="qa-gen-title" style={{ fontFamily: F }}>Ready to generate</div>
        <div className="qa-gen-meta" style={{ fontFamily: F }}>{meta}</div>
        <div className="qa-gen-actions">
          <button type="button" className="qa-gen-btn is-free"
            onClick={requireLogin(() => handleGenerate("free"))}
            disabled={loading || freeUsage?.remaining === 0}
            style={{ opacity: (loading && loadingTier !== "free") || freeUsage?.remaining === 0 ? 0.5 : 1 }}>
            {loading && loadingTier === "free" ? <Spinner /> : (
              <>
                <b>Free AI</b>
                <span>{freeUsage ? `${freeUsage.remaining} / ${freeUsage.limit} left today` : `${FREE_TIER_DAILY_LIMIT}/day`}</span>
              </>
            )}
          </button>
          <button type="button" className="qa-gen-btn is-pro"
            onClick={requireLogin(() => handleGenerate("premium"))}
            disabled={loading}
            style={{ opacity: loading && loadingTier !== "premium" ? 0.6 : 1 }}>
            {loading && loadingTier === "premium" ? <Spinner /> : (
              <>
                <b>Premium AI</b>
                <span>~{formatCredits(includeMarkingScheme ? estimatedCostWithMarking : estimatedCostQuestionsOnly)} credits</span>
              </>
            )}
          </button>
        </div>
        <p className="qa-gen-foot" style={{ fontFamily: F }}>Nothing is charged unless generation succeeds. Failed or timed-out requests are not billed.</p>
      </section>
        );
      })()}
      {loading && <GenerationProgress progress={progress} elapsed={elapsed} />}
      {loading && livePreview?.sections?.length > 0 && (
        <div style={{ ...S.out, marginTop: 8, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontFamily: F }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", animation: "qgPulse 1.2s ease-in-out infinite" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Live preview</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {livePreview.sections.length} of {progress?.total || activeSections.length} sections written. More appear as they finish.
            </span>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 12, background: "var(--card-bg)", padding: "6px 14px" }}>
            {livePreview.title && <div style={{ fontFamily: F, fontSize: 15, fontWeight: 700, color: "var(--text)", padding: "8px 0 2px" }}>{livePreview.title}</div>}
            {livePreview.sections.map((sec) => (
              <div key={sec.id || sec.label} className="eduq-live-sec" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontFamily: F, fontSize: 13, fontWeight: 700, letterSpacing: 0, textTransform: "none", color: "var(--accent)" }}>{sec.label}</div>
                {sec.instructions && <div style={{ fontFamily: F, fontSize: 13, color: "var(--text-muted)", margin: "2px 0 6px", fontStyle: "italic" }}>{sec.instructions}</div>}
                {(sec.questions || []).map((q) => (
                  <div key={q.number} style={{ fontFamily: F, fontSize: 13, color: "var(--text)", lineHeight: 1.5, margin: "6px 0" }}>
                    <b>{q.number}.</b> <MathText text={q.text} />
                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <div style={{ color: "var(--text-secondary)", fontSize: 12, marginLeft: 16 }}>
                        {q.options.map((o, i) => <div key={i}>{String.fromCharCode(65 + i)}. <MathText text={o} /></div>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* ── Output ──────────────────────────────────────────────── */}
      <div className="qa-split-out">
      {examData && (
        <div id="qa-paper-output" style={S.out}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--brand)", fontFamily: F }}>
              {(examData.style === "bece" ? cleanBeceTitle(examData.title, examType) : examData.title) || examType}: Ready
              {!examHasMarkingScheme && (
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginLeft: 8 }}>(Questions Only)</span>
              )}
            </h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={editMode ? { ...S.sm, borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-soft)" } : S.sm}
                onClick={() => setEditMode(v => !v)}
              >
                {editMode ? "Editing" : "Edit"}
              </button>
            </div>
          </div>

          {/* ── Paper settings: version, orientation and answer-option arrangement ── */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 28px", alignItems: "flex-end", background: "var(--surface-2)", borderRadius: 12, padding: "14px 18px", marginBottom: 12 }}>
            <Segmented
              label="Paper version"
              value={examVersion}
              onChange={setExamVersion}
              options={[
                { id: "A", label: "A", compact: true, title: "Original question order" },
                { id: "B", label: "B", compact: true, title: "Shuffled variant B: different question and option order, same content" },
                { id: "C", label: "C", compact: true, title: "Shuffled variant C: different question and option order, same content" },
              ]}
            />
            <Segmented
              label="Orientation"
              value={landscape ? "landscape" : "portrait"}
              onChange={v => setLandscape(v === "landscape")}
              options={[
                { id: "portrait", label: "Portrait", title: "Standard upright A4 page" },
                { id: "landscape", label: "Landscape", title: "Wide A4 page" },
              ]}
            />
            <Segmented
              label="Answer options"
              value={optionsLayout}
              onChange={setOptionsLayout}
              options={OPTIONS_LAYOUTS.map(o => ({ ...o, title: o.title }))}
            />
          </div>

          {/* ── Candidate index number: its own card so it's easy to find ── */}
          <div className="qa-inset" style={{ marginBottom: 12 }}>
            {/* One clear switch for the index number; style/boxes/label only appear while it's on. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", fontFamily: F }}>Include candidate index number</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: F, marginTop: 2 }}>
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
          <div className="qa-inset" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", fontFamily: F, marginRight: 4 }}>Paper format</span>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: F }}>
                {examStyle === "public" ? (isSHS ? "WASSCE style" : "BECE style") : "School exam"}
              </span>
              {paperPreset === "custom" && <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F }}>Custom</span>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 22px", marginTop: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", fontFamily: F, cursor: "pointer" }}>
                <input type="checkbox" checked={turnOver} onChange={e => customise(setTurnOver)(e.target.checked)} style={{ accentColor: "#0D9488" }} />
                "Turn over" on every page except the last
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", fontFamily: F, cursor: "pointer" }}>
                <input type="checkbox" checked={notice} onChange={e => customise(setNotice)(e.target.checked)} style={{ accentColor: "#0D9488" }} />
                "Do not open until told to" notice
              </label>
            </div>
          </div>

          {editMode ? (
            <ExamEditor examData={examData} setExamData={setExamData} S={S} F={F} onReplace={(wassceActive || beceActive) ? undefined : handleReplaceQuestion} />
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

      {/* ── Review area: paper check + figures, set apart from the paper preview above ── */}
      {examData && (
        <section className="qa-review" aria-label="Review your paper">
          <h3 className="qa-review-h" style={{ fontFamily: F }}>Review &amp; refine</h3>
          <p className="qa-review-d" style={{ fontFamily: F }}>Check the paper for problems and adjust its figures before you print or download it.</p>
          <PaperAudit examData={examData} setExamData={setExamData} targetLevels={cognitiveLevels} S={S} F={F} />
          <FigurePanel
            examData={examData}
            setExamData={setExamData}
            draw={{ state: figDrawState, redraw: redrawFigure }}
            S={S} F={F}
          />
        </section>
      )}
      </div>
      </div>

      {/* ── Shading Sheet tab: its own page, like the Lesson Planner's tabs. Two A5 answer sheets per A4 landscape page, to cut out. ── */}
      {view === "booklet" && (
        <div data-testid="booklet-tab" role="tabpanel" aria-labelledby="qa-tab-booklet">
          <header className="qa-hero qa-rise">
            <div className="qa-hero-row" style={{ marginBottom: 4 }}>
              <h1 style={{ fontFamily: F }}>Answer Booklet</h1>
              <p style={{ fontFamily: F }}>A cover, examiner's table and ruled answer pages for your structured and essay questions.</p>
            </div>
          </header>
          {schoolExamCard}
          {effClass ? (
            <div>
            <BookletPanel S={S} F={F} colourGroup={colourGroup}
              cfg={{ paper: bookletPaper, pages: bookletPages, ruling: bookletRuling, questions: bookletQuestions }}
              set={setBookletCfg} autoQuestions={autoBookletCount} questionCount={bookletCount}
              suggested={bookletSuggested} printed={bookletPrinted} sheets={bookletSheetCount(bookletPages, "a3")} onPreview={openAnswerBooklet} />
            </div>
          ) : (
            <div className="qa-note" style={{ fontFamily: F, lineHeight: 1.6 }}>Choose a class above to set up your answer booklet.</div>
          )}
        </div>
      )}

      {view === "shading" && (
        <div data-testid="shading-tab" role="tabpanel" aria-labelledby="qa-tab-shading">
          <header className="qa-hero qa-rise">
            <div className="qa-hero-row" style={{ marginBottom: 4 }}>
              <h1 style={{ fontFamily: F }}>Shading Sheet</h1>
              <p style={{ fontFamily: F }}>An answer sheet for your objective questions, in BECE or WASSCE style.</p>
            </div>
          </header>
      {schoolExamCard}

          {effClass && sameAsPaper && autoShadeCount > 0 && sheetQuestions == null && (
            <div className="qa-note" role="status" style={{ fontFamily: F, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span><b>Linked to your paper:</b> {autoShadeCount} objective question{autoShadeCount === 1 ? "" : "s"}{subject ? ` · ${subject}` : ""}{examData ? "" : " (from your set-up, not generated yet)"}.</span>
              <button type="button" style={S.sm} onClick={() => goTab("generate")}>Open Assessment</button>
            </div>
          )}
          {effClass ? (
            <div>
            <ShadingPanel S={S} F={F} colourGroup={colourGroup} style={shadeStyle} onStyle={(id) => { setSheetStyle(id); setSheetColourMode(null); }}
              options={sheetOptions} onOptions={setSheetOptions} questions={sheetQuestions} onQuestions={setSheetQuestions}
              count={shadeCount} autoCount={autoShadeCount} maxQuestions={MAX_QUESTIONS} onPreview={openShadingSheet} />

            {shadeStyle === "wassce" && (
              <ScanMarker S={S} F={F} expectedN={shadeCount} optionCount={sheetOptions} digits={clampIdDigits(idDigits)}
                keyFor={(v) => (examData ? keyFromExam(!v || v === "A" ? examData : createExamVariant(examData, v)) : null)} />
            )}
            </div>
          ) : (
            <div className="qa-note" style={{ fontFamily: F, lineHeight: 1.6 }}>Choose a class above to set up your shading sheet.</div>
          )}
        </div>
      )}
    </div>
    {/* Room at the bottom of the page so the sticky action bar never covers the last card */}
    <div aria-hidden="true" style={{ height: examData ? 96 : 40 }} />
    <div className="qa-nav-space" aria-hidden="true" />

    {/* ── Sticky action bar: the things you do with a finished paper, always one tap away ── */}
    {view === "generate" && examData && !loading && !barHidden && (
      <>
      {barMore && <div className="qa-bar-scrim" onClick={() => setBarMore(false)} aria-hidden="true" />}
      <div className={`eduq-bar${navHidden ? " nav-hidden" : ""}`} style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 120,
        background: "var(--card-bg)", borderTop: "1px solid var(--border)",
        padding: "10px 12px max(10px, env(safe-area-inset-bottom, 10px))",
        boxShadow: "none",
      }}>
        <div className="qa-bar-in" style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 8, alignItems: "center", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {examHasMarkingScheme && (
            <div role="group" aria-label="What to show" className="qa-bar-seg" style={{ display: "flex", flexShrink: 0, border: "1.5px solid var(--border-strong)", borderRadius: 99, overflow: "hidden" }}>
              {[{ k: false, l: "Paper" }, { k: true, l: "Answers" }].map(o => (
                <button key={o.l} type="button" aria-pressed={showAnswerKey === o.k} onClick={() => setShowAnswerKey(o.k)} style={{
                  height: 38, padding: "0 14px", border: "none", cursor: "pointer", fontFamily: F, fontSize: 13, fontWeight: 600,
                  background: showAnswerKey === o.k ? "var(--accent-soft)" : "transparent",
                  color: showAnswerKey === o.k ? "var(--tag-text)" : "var(--text-secondary)",
                }}>{o.l}</button>
              ))}
            </div>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" className="qa-bar-morebtn" aria-expanded={barMore} aria-controls="qa-bar-more" onClick={() => setBarMore(o => !o)}>
            More{savedId && hasUnsavedEdits && <span className="qa-bar-dot" role="img" aria-label="unsaved changes" />}
          </button>
          <div id="qa-bar-more" className={`qa-bar-sec${barMore ? " is-open" : ""}`} onClick={(e) => { if (e.target.closest?.("button")) setBarMore(false); }}>
          {savedId && (
            hasUnsavedEdits ? (
              <button type="button" disabled={savingChanges} onClick={handleSaveChanges} style={{ ...S.sm, height: 40, flexShrink: 0, borderColor: "var(--accent)", color: "var(--accent)", fontWeight: 700 }}>
                {savingChanges ? "Saving…" : "Save changes"}
              </button>
            ) : (
              <span style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: F, flexShrink: 0 }}>Saved</span>
            )
          )}
          <button type="button" style={{ ...S.sm, height: 40, flexShrink: 0 }} disabled={downloadingWord} onClick={() => handleDownloadWord(showAnswerKey ? "answerKey" : "paper")}>
            {downloadingWord ? "Preparing…" : "Word"}
          </button>
          <button type="button" style={{ ...S.sm, height: 40, flexShrink: 0 }} onClick={handleShare} title="Share as a file (WhatsApp, email, Drive…)">Share</button>
          {shadeCount > 0 && (
            <button type="button" style={{ ...S.sm, height: 40, flexShrink: 0 }} onClick={openShadingSheet} title="Answer sheet for the objective questions">Shading sheet</button>
          )}
          {autoBookletCount > 0 && (
            <button type="button" style={{ ...S.sm, height: 40, flexShrink: 0 }} onClick={openAnswerBooklet} title="Cover, examiner's table and ruled pages for the written questions">Answer booklet</button>
          )}
          </div>
          <button type="button" className="qa-bar-print" style={{ ...S.btn, height: 40, padding: "0 20px", fontSize: 15, flexShrink: 0 }} onClick={() => openPrintWindow(showAnswerKey ? "answerKey" : "paper")}>
            Print / PDF
          </button>
        </div>
      </div>
      </>
    )}
    <BottomNav tab={view} setTab={goTab} savedCount={savedCount} hidden={navHidden} F={F} />
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
const TAB_HASH = { generate: "", shading: "#shading", booklet: "#booklet", saved: "#saved" };
const TAB_TITLE = { generate: "Eduformium Assessment Studio: Tests, Quizzes & Exams", shading: "Shading Sheet · Eduformium Assessment Studio", booklet: "Answer Booklet · Eduformium Assessment Studio", saved: "My Assessments · Eduformium Assessment Studio" };
function viewFromHash() {
  if (typeof window === "undefined") return "generate";
  const h = window.location.hash;
  return h === "#shading" ? "shading" : h === "#booklet" ? "booklet" : h === "#saved" ? "saved" : "generate";
}

const RESPONSIVE_CSS = `
  @keyframes eduq-rise { from { transform: translateY(100%); opacity: 0; } to { transform: none; opacity: 1; } }
  .eduq-bar { animation: eduq-rise .22s ease-out backwards; }
  @keyframes eduq-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .eduq-live-sec { animation: eduq-in .3s ease-out both; }
  @media (prefers-reduced-motion: reduce) { .eduq-bar, .eduq-live-sec { animation: none; } }
  .eduq-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .eduq-grid-2 > * { min-width: 0; }
  @media (max-width: 480px) {
    .eduq-grid-2:not(.is-pair) { grid-template-columns: 1fr; }
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
