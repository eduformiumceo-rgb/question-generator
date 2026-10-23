/**
 * ═══════════════════════════════════════════════════════════════════
 * EDUFORMIUM — AI QUESTIONS GENERATOR
 * Main page component
 *
 * Drop-in page for the existing Eduformium shell. Wire it up the same way
 * the Lesson Planner tabs are wired in App.jsx (a new nav item that renders
 * <QuestionsGenerator user={user} onCoinChange={...} />).
 *
 * Reuses, unmodified:
 *   - curriculumIndex.js               (all GES curriculum data + helpers)
 *   - auth.js  (getUser, getToken — unchanged from the Lesson Planner)
 *   - sharedStyles.jsx                  (F / S tokens copied from App.jsx)
 *   - examTemplate.js                  (system prompt + print-safe renderer)
 * ═══════════════════════════════════════════════════════════════════
 */
import React, { useState, useMemo, useRef, useCallback } from "react";
import { F, S, Spinner } from "./sharedStyles.jsx";
import ExamStructureBuilder, { DEFAULT_SECTIONS } from "./components/ExamStructureBuilder.jsx";
import TopicSelector from "./components/TopicSelector.jsx";
import DiagramManager from "./components/DiagramManager.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { renderExamHTML, validateExamData, createExamVariant } from "./examTemplate.js";
// NOT statically imported — docx bundles to ~700KB, which would hurt first-load
// time on low-end Android for a feature most teachers use occasionally, not on
// every visit. Loaded on demand inside handleDownloadWord() instead.
import ExamEditor from "./components/ExamEditor.jsx";
import { screenExamInput } from "./moderation.js";
import { FREE_TIER_MAX_SECTIONS, FREE_TIER_MAX_TOTAL_QUESTIONS, FREE_TIER_ALLOWED_TYPES, FREE_TIER_DAILY_LIMIT } from "./freeTierLimits.js";
import TopUpModal from "./components/TopUpModal.jsx";
// Reuses the Lesson Planner's auth.js UNCHANGED (same Google OAuth flow, same
// getToken()/getUser()) — this app is a separate Cloudflare Pages deployment
// but points at the SAME Supabase project and JWT secret, so a teacher who
// signs in here (or on the Lesson Planner) is recognized on both: real SSO,
// no second account. See functions/api/auth/[[path]].js for the server side.
import { getUser, getToken, completePendingGoogleSignIn, signOut } from "./auth.js";
// Reused unchanged — same Google sign-in modal/UX as the Lesson Planner.
// Because both apps share one Supabase project + JWT secret, signing in here
// creates/reuses the exact same account as the Lesson Planner.
import AuthModal from "./AuthModal_upgraded.jsx";
import { goToHubSignIn } from "./hubSignIn.js";
import AppHeader from "./components/AppHeader.jsx";
import InstallPrompt from "./components/InstallPrompt.jsx";
import { usePwaInstall } from "./pwaInstall.js";

const EXAM_API = "/api/generate-exam";
const ACCOUNT_API = "/api/exam-account";
// Priced consistently with the Lesson Planner's real COINS_PER_LESSON=0.5
// precedent, scaled per section (= per AI call), not a flat guessed number —
// must match functions/api/generate-exam.js's CREDIT_COST_PER_SECTION_*.
// These are RAW coin units — the wallet backend always works in raw units.
const CREDIT_COST_PER_SECTION_WITH_MARKING = 0.5;
const CREDIT_COST_PER_SECTION_QUESTIONS_ONLY = 0.35;

// Your real App.jsx multiplies the raw `coins` balance by 30 before showing
// it to a teacher (confirmed directly in generate-premium.js's own code
// comment: "the UI multiplies real balances by DISPLAY_CREDIT_MULTIPLIER
// (30x)... that constant only exists client-side"). This wallet is shared
// with the Lesson Planner now, so this app must apply the exact same
// multiplier — otherwise the same raw balance would show as two different
// numbers depending on which app a teacher happens to be in, which would
// look like a bug (or missing money) even though nothing is actually wrong.
const DISPLAY_CREDIT_MULTIPLIER = 30;
// raw → the number shown on screen. Rounded for display only — the actual
// amount deducted/charged server-side always stays at full precision.
const toDisplayCredits = (raw) => Math.round(raw * DISPLAY_CREDIT_MULTIPLIER);
const formatCredits = (raw) => toDisplayCredits(raw);

const EXAM_TYPES = ["Class Test", "Quiz", "Mid-Term Exam", "End of Term Exam", "Mock Exam"];
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
  const res = await fetch(EXAM_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
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
    const { done, value } = await reader.read();
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

  if (streamError) {
    const err = new Error(streamError.message);
    err.creditsRemaining = streamError.creditsRemaining;
    throw err;
  }
  if (!finalResult) throw new Error("The connection was interrupted before the exam finished generating. Please try again — you have not been charged for an incomplete generation, but do check your credit balance.");
  return finalResult;
}


function QuestionsGeneratorInner() {
  // ── Auth gate — same account/session as the Lesson Planner ─────
  const [user, setUser] = useState(() => (getUser ? getUser() : null));
  const [showAuthModal, setShowAuthModalRaw] = useState(false);
  // Single sign-in: when VITE_HUB_URL is set, opening sign-in / create account sends the person to the Eduformium Hub (see hubSignIn.js).
  // Off by default, so this app's own sign-in window works exactly as before until the variable is set.
  const setShowAuthModal = useCallback((v) => { if (v && goToHubSignIn("questions")) return; setShowAuthModalRaw(v); }, []);

  // Install-app prompt (same behaviour as the Lesson Planner).
  const pwa = usePwaInstall();

  // ── Basic Information ──────────────────────────────────────────
  const [schoolName, setSchoolName] = useState("");
  const [schoolLogo, setSchoolLogo] = useState(null); // data URL — printed in the paper header
  const logoInputRef = useRef(null);
  const [className, setClassName] = useState("");
  const [term, setTerm] = useState("Term 1");
  const [examType, setExamType] = useState("Class Test");
  const [durationMinutes, setDurationMinutes] = useState(60);

  // ── Curriculum + Topics (GES / NaCCA only) ──────────────────────
  const [subject, setSubject] = useState("");
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
  const [diagramImages, setDiagramImages] = useState({}); // { [questionNumber]: dataURL }

  // ── Generation state ─────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [loadingTier, setLoadingTier] = useState(null); // "free" | "premium" | null — which button is spinning
  const [progress, setProgress] = useState(null); // { index, total, sectionLabel, sectionsDone: Set }
  const [error, setError] = useState("");
  const [examData, setExamData] = useState(null);
  const [examHasMarkingScheme, setExamHasMarkingScheme] = useState(true); // reflects the generated exam, not the current toggle
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const printFrameRef = useRef(null);

  // Credits are the SAME shared `coins` wallet the Lesson Planner uses —
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
    } catch { /* balance display is non-critical — fail quietly */ }
  }, []);
  React.useEffect(() => { fetchBalance(); }, [fetchBalance]);

  // "X/5 left" on the Free button — same proactive-remaining-count pattern
  // as the real App.jsx's Free button badge, not just a failure message.
  const [freeUsage, setFreeUsage] = useState(null); // { used, limit, remaining }
  const fetchFreeUsage = useCallback(async () => {
    try {
      const token = getToken ? getToken() : null;
      if (!token) { setFreeUsage(null); return; }
      const res = await fetch(`${ACCOUNT_API}/free-usage`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      setFreeUsage(await res.json());
    } catch { /* non-critical — fail quietly, the server still enforces the real limit */ }
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

  // Two independent buttons (Free / Premium) call this with their own tier —
  // same pattern as the real App.jsx, where Free and Premium are two
  // separate actions, not a pre-selected mode. Free-tier limits are only
  // checked when the Free button specifically is the one clicked.
  const validate = (tierArg) => {
    if (!subject.trim()) return "Please choose a subject.";
    if (!className.trim()) return "Please choose a class/grade.";
    if (!selectedTopics.length && !pastedSyllabus.trim()) return "Select at least one topic or paste a syllabus.";
    if (!activeSections.length) return "Enable at least one exam section.";
    const tooMany = activeSections.find(s => Number(s.questionCount) > 60);
    if (tooMany) return `Section ${tooMany.id} requests too many questions (max 60 per section).`;
    const invalid = activeSections.find(s => !Number(s.questionCount) || !Number(s.marksPerQuestion));
    if (invalid) return `Section ${invalid.id} needs a valid question count and marks per question.`;
    if (Number(durationMinutes) < 10 || Number(durationMinutes) > 300) return "Duration should be between 10 and 300 minutes.";
    if (tierArg === "free") {
      if (activeSections.length > FREE_TIER_MAX_SECTIONS) return `Free AI is limited to ${FREE_TIER_MAX_SECTIONS} sections — reduce your sections, or use Premium AI for a full exam.`;
      const disallowed = activeSections.find(s => !FREE_TIER_ALLOWED_TYPES.includes(s.type));
      if (disallowed) return "Free AI doesn't support essay sections — remove the essay section, or use Premium AI.";
      const totalQ = activeSections.reduce((sum, s) => sum + (Number(s.questionCount) || 0), 0);
      if (totalQ > FREE_TIER_MAX_TOTAL_QUESTIONS) return `Free AI is limited to ${FREE_TIER_MAX_TOTAL_QUESTIONS} questions total (currently ${totalQ}) — reduce question counts, or use Premium AI.`;
      if (includeMarkingScheme) return "Free AI doesn't include a marking scheme — turn off \"Questions + Marking Scheme\" above, or use Premium AI.";
    }
    // Same screen the server runs — catches obviously-too-long pastes and
    // disallowed content client-side, before even hitting the network.
    const screen = screenExamInput({ schoolName, pastedSyllabus, topics: selectedTopics });
    if (!screen.ok) return screen.error;
    return "";
  };

  /** AI-assisted topic suggestion — used by TopicSelector's "✨ AI Suggest Topics" button. */
  const handleSuggestTopics = useCallback(async (subj, cls, strand) => {
    try {
      const token = getToken ? getToken() : null;
      const res = await fetch(EXAM_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ mode: "suggest-topics", subject: subj, className: cls, strand }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.topics) ? data.topics : [];
    } catch {
      return []; // fail quietly — suggestion is a convenience, not a blocker
    }
  }, []);

  const handleGenerate = async (tierArg) => {
    setError("");
    const validationError = validate(tierArg);
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setLoadingTier(tierArg);
    setExamData(null);
    setProgress({ index: 0, total: activeSections.length, sectionLabel: "", sectionsDone: new Set() });
    try {
      const payload = {
        mode: "generate-exam", tier: tierArg,
        schoolName, className, subject, term, examType, durationMinutes,
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
        }
      });

      const { ok, errors } = validateExamData(result.examData, activeSections);
      if (!ok) throw new Error(`The generated paper didn't match the requested structure: ${errors.join(" ")}`);

      setExamData(result.examData);
      setExamVersion("A");
      setExamHasMarkingScheme(result.includeMarkingScheme !== false);
      setShowAnswerKey(false);
      setDiagramImages({});
      // Server already deducted from the shared coins wallet and returns the
      // fresh raw balance — trust that over a client-side guess so the
      // header never drifts from reality.
      if (typeof result.creditsRemaining === "number") setCreditBalance(result.creditsRemaining);
      else fetchBalance();
      if (tierArg === "free") fetchFreeUsage(); // update the "X/5 left" badge
    } catch (e) {
      // Network/timeout/server failures land here — no credit is deducted server-side
      // unless generation actually succeeded (see generate-exam.js's refund logic).
      if (e.status === 402) {
        setError("You're out of exam credits.");
        setShowTopUp(true);
        // deductCoins() throws rather than returning a balance, so the 402
        // response body has no `balance` field to trust here — re-fetch
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
    }
  };

  const questionsNeedingDiagrams = useMemo(() => {
    if (!examData) return [];
    const out = [];
    (examData.sections || []).forEach(sec => (sec.questions || []).forEach(q => {
      // Only prompt for a manual upload when the AI COULDN'T draw it itself
      // (generatable=false/no svg) — a clean AI-generated SVG needs no
      // teacher action, though DiagramManager still lets them override it.
      if (q.diagram?.needed && !(q.diagram.generatable && q.diagram.svg)) out.push(q);
    }));
    return out;
  }, [examData]);

  const [examVersion, setExamVersion] = useState("A"); // A = original order, B/C = shuffled variants (anti-cheating)
  const activeExamData = useMemo(() => {
    if (!examData) return null;
    return examVersion === "A" ? examData : createExamVariant(examData, examVersion);
  }, [examData, examVersion]);

  const meta = { schoolName, className, subject, term, examType, durationMinutes, landscape, diagramImages, schoolLogo, examVersion: examVersion === "A" ? "" : examVersion };

  const [downloadingWord, setDownloadingWord] = useState(false);
  const handleDownloadWord = async (mode) => {
    if (!activeExamData) return;
    setDownloadingWord(true);
    try {
      const { generateExamDocx } = await import("./examDocx.js"); // lazy — see import comment above
      const blob = await generateExamDocx(activeExamData, meta, mode);
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
    // Sharing the rendered HTML (not a PDF) — this app relies on the browser's
    // own print engine for PDF fidelity via window.print(), and there's no
    // PDF library wired into this project; adding one just for sharing risks
    // a lower-fidelity export than the carefully-tuned print CSS produces.
    // An .html file opens fine in any browser and is a real, honest way to
    // get a finished exam from a phone into WhatsApp/email/Drive in one tap.
    const file = new File([html], fileName, { type: "text/html" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: activeExamData.title || examType }); }
      catch { /* user cancelled the share sheet — not an error */ }
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
    // Give web fonts / images a beat to load before invoking the print dialog.
    setTimeout(() => w.print(), 350);
  };

  // Same pattern as the Lesson Planner's own onLoginRequired: don't hard-wall
  // the whole page behind a sign-in screen. Let a teacher fill in the whole
  // wizard first — subject, topics, sections, everything — and only ask them
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
    />
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 60px", fontFamily: F }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--text)", fontFamily: F }}>
          AI Questions Generator
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)", fontFamily: F }}>
          Build a print-ready exam paper from your curriculum in minutes.
        </p>
      </div>

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

      {/* ── Curriculum + Topics (GES / NaCCA) — CLASS FIRST, matching
           the real Lesson Planner's flow exactly. Everything else in the
           form follows from this, so it comes first on the page too. ── */}
      <TopicSelector
        subject={subject} setSubject={setSubject}
        className={className} setClassName={setClassName}
        term={term}
        selectedTopics={selectedTopics} setSelectedTopics={setSelectedTopics}
        pastedSyllabus={pastedSyllabus} setPastedSyllabus={setPastedSyllabus}
        onSuggestTopics={user ? handleSuggestTopics : async () => { setShowAuthModal(true); return []; }}
        onLoginRequired={() => setShowAuthModal(true)}
        S={S} F={F}
      />

      {/* ── Basic Information — only once a class is chosen, so the
           form doesn't show a wall of fields before the one choice that
           actually drives everything else. ── */}
      {className && (
      <div style={S.card}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Exam Type</h3>
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.5 }}>
          What kind of assessment is this?
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          {EXAM_TYPES.map(t => {
            const active = examType === t;
            return (
              <button key={t} type="button" onClick={() => setExamType(t)} style={{
                padding: "9px 16px", borderRadius: 99, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: `1.5px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
                background: active ? "var(--accent-soft)" : "var(--card-bg)",
                color: active ? "var(--accent)" : "var(--text-secondary)",
              }}>
                {active ? "✓ " : ""}{t}
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
                if (file.size > 800 * 1024) { alert("Please use a logo image under 800KB."); return; }
                const reader = new FileReader();
                reader.onload = () => setSchoolLogo(reader.result);
                reader.readAsDataURL(file);
              }}
            />
            {schoolLogo ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <img src={schoolLogo} alt="School logo" style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8, border: "1px solid var(--border)" }} />
                <button type="button" style={S.danger} onClick={() => setSchoolLogo(null)}>Remove</button>
              </div>
            ) : (
              <button type="button" style={{ ...S.sm, height: 48 }} onClick={() => logoInputRef.current?.click()}>Upload</button>
            )}
          </div>
        </div>
        <div className="eduq-grid-2">
          <div>
            <label style={S.lbl}>Term *</label>
            <select value={term} onChange={e => setTerm(e.target.value)} style={S.sel}>
              {["Term 1", "Term 2", "Term 3"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={S.lbl}>Duration (minutes) *</label>
            <input
              type="number" min={10} max={300} value={durationMinutes}
              onChange={e => setDurationMinutes(e.target.value)}
              style={S.inp}
            />
          </div>
        </div>
      </div>
      )}

      {/* ── Difficulty + Language + Cognitive level — only once there's
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
              }}>{active ? "✓ " : ""}{lvl}</button>
            );
          })}
        </div>
      </div>
      )}

      {/* ── Exam Structure Builder — always full-capability here; a
           config that doesn't fit the Free tier just shows a clear
           message when the Free button specifically is clicked, rather
           than the whole form silently reconfiguring itself. ── */}
      {className && subject && (
      <ExamStructureBuilder sections={sections} setSections={setSections} S={S} F={F} />
      )}

      {/* ── Output mode + diagrams — consolidated into one compact card
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
          <label style={{ position: "relative", display: "inline-block", width: 44, height: 26, flexShrink: 0, marginLeft: 12 }}>
            <input type="checkbox" checked={includeMarkingScheme} onChange={e => setIncludeMarkingScheme(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
            <span style={{ position: "absolute", inset: 0, borderRadius: 99, cursor: "pointer", transition: ".15s", background: includeMarkingScheme ? "#0D9488" : "var(--border-strong)" }} onClick={() => setIncludeMarkingScheme(v => !v)} />
            <span style={{ position: "absolute", top: 3, left: includeMarkingScheme ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: ".15s", pointerEvents: "none", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Allow AI-Suggested Diagrams</div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: F, marginTop: 2 }}>
              When a question needs a figure, graph or map, the AI will flag it so you can upload one.
            </div>
          </div>
          <label style={{ position: "relative", display: "inline-block", width: 44, height: 26, flexShrink: 0, marginLeft: 12 }}>
          <input
            type="checkbox" checked={allowDiagrams} onChange={e => setAllowDiagrams(e.target.checked)}
            aria-label="Allow AI-suggested diagrams" role="switch" aria-checked={allowDiagrams}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span style={{
            position: "absolute", inset: 0, borderRadius: 99, cursor: "pointer", transition: ".15s",
            background: allowDiagrams ? "#0D9488" : "var(--border-strong)",
          }} onClick={() => setAllowDiagrams(v => !v)} />
          <span style={{
            position: "absolute", top: 3, left: allowDiagrams ? 21 : 3, width: 20, height: 20, borderRadius: "50%",
            background: "#fff", transition: ".15s", pointerEvents: "none", boxShadow: "0 1px 2px rgba(0,0,0,.25)",
          }} />
        </label>
      </div>
      </div>
      )}

      {error && <div style={S.err}><span>⚠</span><span>{error}</span></div>}

      {/* ── Bottom generate bar — Free AI (left) / Premium AI (right),
           two independent, always-visible actions — matching the real
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
              <span>✨ Free AI</span>
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
              <span style={{ fontWeight: 700, fontSize: 14 }}>⚡ Premium AI</span>
              <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.9 }}>
                ~{formatCredits(includeMarkingScheme ? estimatedCostWithMarking : estimatedCostQuestionsOnly)} credits
              </span>
            </>
          )}
        </button>
      </div>
      )}
      {loading && progress?.total > 1 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {Array.from({ length: progress.total }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i < progress.index ? "#0D9488" : "var(--border)",
              transition: "background .2s",
            }} />
          ))}
        </div>
      )}
      <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--text-muted)", fontFamily: F, marginTop: 0 }}>
        Nothing is charged unless generation succeeds — failed or timed-out requests are not billed.
      </p>

      {/* ── Diagram uploads (post-generation) ──────────────────── */}
      {examData && (
        <DiagramManager
          questionsNeedingDiagrams={questionsNeedingDiagrams}
          diagramImages={diagramImages}
          setDiagramImages={setDiagramImages}
          S={S} F={F}
        />
      )}

      {/* ── Output ──────────────────────────────────────────────── */}
      {examData && (
        <div style={S.out}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>
              {examData.title || examType} — Ready
              {!examHasMarkingScheme && (
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginLeft: 8 }}>(Questions Only)</span>
              )}
            </h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 4 }}>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: F, marginRight: 4 }}>Version:</span>
                {["A", "B", "C"].map(v => (
                  <button key={v} type="button" onClick={() => setExamVersion(v)} title={v === "A" ? "Original order" : `Shuffled variant ${v} — different question/option order, same content (anti-cheating)`} style={{
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
              {examHasMarkingScheme && (
                <button style={S.sm} onClick={() => setShowAnswerKey(v => !v)}>
                  {showAnswerKey ? "View Question Paper" : "View Answer Key"}
                </button>
              )}
              <button
                style={editMode ? { ...S.sm, borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-soft)" } : S.sm}
                onClick={() => setEditMode(v => !v)}
              >
                {editMode ? "✓ Editing" : "✏️ Edit"}
              </button>
              <button style={S.sm} onClick={() => openPrintWindow(showAnswerKey ? "answerKey" : "paper")}>🖨 Print</button>
              <button style={{ ...S.btn, height: 40, padding: "0 18px", fontSize: 13 }} onClick={() => openPrintWindow(showAnswerKey ? "answerKey" : "paper")}>
                ⬇ Download PDF
              </button>
              <button style={S.sm} disabled={downloadingWord} onClick={() => handleDownloadWord(showAnswerKey ? "answerKey" : "paper")}>
                {downloadingWord ? "Generating…" : "📄 Download Word"}
              </button>
              <button style={S.sm} onClick={handleShare} title="Share as a file — works with WhatsApp, email, Drive, etc. on mobile">
                📤 Share
              </button>
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
    </>
  );
}

/**
 * A small, scoped responsive stylesheet for the couple of fixed 2-column
 * grids used across this wizard (Basic Info, Curriculum, Exam Structure
 * Builder). Inline React styles can't express media queries, and these
 * grids not stacking on a narrow phone — squishing two inputs into ~150px
 * each — is a real usability regression against the "smooth on low-end
 * Android" requirement, not a cosmetic nitpick.
 */
const RESPONSIVE_CSS = `
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
