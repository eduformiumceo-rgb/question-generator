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
import { FREE_TIER_MAX_SECTIONS, FREE_TIER_MAX_TOTAL_QUESTIONS, FREE_TIER_ALLOWED_TYPES } from "./freeTierLimits.js";
import TopUpModal from "./components/TopUpModal.jsx";
// Reuses the Lesson Planner's auth.js UNCHANGED (same Google OAuth flow, same
// getToken()/getUser()) — this app is a separate Cloudflare Pages deployment
// but points at the SAME Supabase project and JWT secret, so a teacher who
// signs in here (or on the Lesson Planner) is recognized on both: real SSO,
// no second account. See functions/api/auth/[[path]].js for the server side.
import { getUser, getToken } from "./auth.js";
// Reused unchanged — same Google sign-in modal/UX as the Lesson Planner.
// Because both apps share one Supabase project + JWT secret, signing in here
// creates/reuses the exact same account as the Lesson Planner.
import AuthModal from "./AuthModal_upgraded.jsx";

const EXAM_API = "/api/generate-exam";
const ACCOUNT_API = "/api/exam-account";
// Priced consistently with the Lesson Planner's real COINS_PER_LESSON=0.5
// precedent, scaled per section (= per AI call), not a flat guessed number —
// must match functions/api/generate-exam.js's CREDIT_COST_PER_SECTION_*.
const CREDIT_COST_PER_SECTION_WITH_MARKING = 0.5;
const CREDIT_COST_PER_SECTION_QUESTIONS_ONLY = 0.35;
const formatCredits = (n) => (Number.isInteger(n) ? n : n.toFixed(2));

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
  const [showAuthModal, setShowAuthModal] = useState(false);

  // ── Tier: Free Quiz vs Premium Exam — must match FREE_TIER_* in
  // functions/api/generate-exam.js exactly, or the client will let a
  // teacher configure something the server then rejects.
  const [tier, setTier] = useState("premium"); // "premium" | "free"
  const isFree = tier === "free";

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

  // Switching to Free auto-adjusts the structure to stay within free-tier
  // caps, rather than letting the teacher configure something premium-only
  // and then hit a confusing rejection at generate time.
  React.useEffect(() => {
    if (!isFree) return;
    setSections(prev => prev.map(sec => {
      if (!FREE_TIER_ALLOWED_TYPES.includes(sec.type)) return { ...sec, enabled: false };
      return sec;
    }));
    setIncludeMarkingScheme(false);
  }, [isFree]);

  // ── Diagrams ─────────────────────────────────────────────────────
  const [allowDiagrams, setAllowDiagrams] = useState(true);
  const [includeMarkingScheme, setIncludeMarkingScheme] = useState(true);
  const [diagramImages, setDiagramImages] = useState({}); // { [questionNumber]: dataURL }

  // ── Generation state ─────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null); // { index, total, sectionLabel, sectionsDone: Set }
  const [error, setError] = useState("");
  const [examData, setExamData] = useState(null);
  const [examHasMarkingScheme, setExamHasMarkingScheme] = useState(true); // reflects the generated exam, not the current toggle
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const printFrameRef = useRef(null);

  // Exam credits are THIS app's own wallet (exam_credits table) — a separate
  // balance from the Lesson Planner's `coins`, fetched from exam-account.
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

  const toggleCognitive = (level) => {
    setCognitiveLevels(prev => prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]);
  };

  const activeSections = useMemo(() => sections.filter(s => s.enabled), [sections]);
  const estimatedCostWithMarking = Math.round(activeSections.length * CREDIT_COST_PER_SECTION_WITH_MARKING * 100) / 100;
  const estimatedCostQuestionsOnly = Math.round(activeSections.length * CREDIT_COST_PER_SECTION_QUESTIONS_ONLY * 100) / 100;

  // ── Edge-case validation before spending a credit ────────────────
  const validate = () => {
    if (!subject.trim()) return "Please choose a subject.";
    if (!className.trim()) return "Please choose a class/grade.";
    if (!selectedTopics.length && !pastedSyllabus.trim()) return "Select at least one topic or paste a syllabus.";
    if (!activeSections.length) return "Enable at least one exam section.";
    const tooMany = activeSections.find(s => Number(s.questionCount) > 60);
    if (tooMany) return `Section ${tooMany.id} requests too many questions (max 60 per section).`;
    const invalid = activeSections.find(s => !Number(s.questionCount) || !Number(s.marksPerQuestion));
    if (invalid) return `Section ${invalid.id} needs a valid question count and marks per question.`;
    if (Number(durationMinutes) < 10 || Number(durationMinutes) > 300) return "Duration should be between 10 and 300 minutes.";
    if (isFree) {
      if (activeSections.length > FREE_TIER_MAX_SECTIONS) return `Free quizzes are limited to ${FREE_TIER_MAX_SECTIONS} sections. Switch to Premium for full exams.`;
      const disallowed = activeSections.find(s => !FREE_TIER_ALLOWED_TYPES.includes(s.type));
      if (disallowed) return "Free quizzes don't support essay sections. Switch to Premium for full exams.";
      const totalQ = activeSections.reduce((sum, s) => sum + (Number(s.questionCount) || 0), 0);
      if (totalQ > FREE_TIER_MAX_TOTAL_QUESTIONS) return `Free quizzes are limited to ${FREE_TIER_MAX_TOTAL_QUESTIONS} questions total (currently ${totalQ}).`;
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

  const handleGenerate = async () => {
    setError("");
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setExamData(null);
    setProgress({ index: 0, total: activeSections.length, sectionLabel: "", sectionsDone: new Set() });
    try {
      const payload = {
        mode: "generate-exam", tier,
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
      // Server already deducted from exam_credits and returns the fresh balance —
      // trust that over a client-side guess so the header never drifts from reality.
      if (typeof result.creditsRemaining === "number") setCreditBalance(result.creditsRemaining);
      else fetchBalance();
    } catch (e) {
      // Network/timeout/server failures land here — no credit is deducted server-side
      // unless generation actually succeeded (see generate-exam.js's refund logic).
      if (e.status === 402) {
        setError("You're out of exam credits.");
        setShowTopUp(true);
        if (typeof e.balance === "number") setCreditBalance(e.balance);
      } else if (e.status === 429) {
        setError(e.message);
      } else {
        setError(e.message || "Something went wrong generating the exam. Please try again.");
        if (typeof e.creditsRemaining === "number") setCreditBalance(e.creditsRemaining);
      }
    } finally {
      setLoading(false);
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

  if (!user) {
    return (
      <div style={{ maxWidth: 420, margin: "80px auto", padding: "0 16px", fontFamily: F, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", fontFamily: F, marginBottom: 8 }}>
          AI Questions Generator
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", fontFamily: F, marginBottom: 20, lineHeight: 1.6 }}>
          Sign in with the same account you use on the Lesson Planner — your login carries
          over automatically, this app just has its own exam-credit wallet.
        </p>
        <button style={{ ...S.btn, width: "100%" }} onClick={() => setShowAuthModal(true)}>
          Sign in to continue
        </button>
        {showAuthModal && (
          <AuthModal
            onClose={() => setShowAuthModal(false)}
            onAuth={(u) => { setUser(u); setShowAuthModal(false); }}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 60px", fontFamily: F }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--text)", fontFamily: F }}>
            AI Questions Generator
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)", fontFamily: F }}>
            Build a print-ready exam paper from your curriculum in minutes.
          </p>
        </div>
        {creditBalance !== null && (
          <button onClick={() => setShowTopUp(true)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 99,
            background: "var(--accent-soft)", border: "1px solid var(--tag-border)", fontSize: 13, fontWeight: 700, color: "var(--accent)",
            cursor: "pointer", fontFamily: F,
          }}>
            {creditBalance} credits · Top up
          </button>
        )}
      </div>

      {showTopUp && (
        <TopUpModal
          S={S} F={F}
          onClose={() => setShowTopUp(false)}
          onPurchased={() => { setShowTopUp(false); fetchBalance(); }}
        />
      )}

      {/* ── Tier: Free Quiz vs Premium Exam ─────────────────────── */}
      <div style={S.card}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Generation Tier</h3>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.5 }}>
          Free is a quick quiz — {FREE_TIER_MAX_SECTIONS} sections max, {FREE_TIER_MAX_TOTAL_QUESTIONS} questions total, no essay, no marking scheme.
          Premium unlocks full multi-section exams with essay questions and a professional marking scheme.
        </p>
        <div className="eduq-grid-2">
          <button
            type="button" onClick={() => setTier("free")}
            style={{
              textAlign: "left", padding: "14px 16px", borderRadius: 12, cursor: "pointer", fontFamily: F,
              border: `1.5px solid ${isFree ? "var(--accent)" : "var(--border-strong)"}`,
              background: isFree ? "var(--accent-soft)" : "var(--card-bg)",
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, color: isFree ? "var(--accent)" : "var(--text)" }}>{isFree ? "✓ " : ""}Free Quiz</div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>0 credits · up to {FREE_TIER_MAX_SECTIONS} sections</div>
          </button>
          <button
            type="button" onClick={() => setTier("premium")}
            style={{
              textAlign: "left", padding: "14px 16px", borderRadius: 12, cursor: "pointer", fontFamily: F,
              border: `1.5px solid ${!isFree ? "var(--accent)" : "var(--border-strong)"}`,
              background: !isFree ? "var(--accent-soft)" : "var(--card-bg)",
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, color: !isFree ? "var(--accent)" : "var(--text)" }}>{!isFree ? "✓ " : ""}Premium Exam</div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>Full exams, essay questions, marking scheme</div>
          </button>
        </div>
      </div>

      {/* ── Basic Information ───────────────────────────────────── */}
      <div style={S.card}>
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
        <div className="eduq-grid-2" style={{ marginBottom: 14 }}>
          <div>
            <label style={S.lbl}>Exam Type *</label>
            <select value={examType} onChange={e => setExamType(e.target.value)} style={S.sel}>
              {EXAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={S.lbl}>Term *</label>
            <select value={term} onChange={e => setTerm(e.target.value)} style={S.sel}>
              {["Term 1", "Term 2", "Term 3"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={S.lbl}>Duration (minutes) *</label>
          <input
            type="number" min={10} max={300} value={durationMinutes}
            onChange={e => setDurationMinutes(e.target.value)}
            style={{ ...S.inp, maxWidth: 160 }}
          />
        </div>
      </div>

      {/* ── Curriculum + Topics (GES / NaCCA) ───────────────────── */}
      <TopicSelector
        subject={subject} setSubject={setSubject}
        className={className} setClassName={setClassName}
        term={term}
        selectedTopics={selectedTopics} setSelectedTopics={setSelectedTopics}
        pastedSyllabus={pastedSyllabus} setPastedSyllabus={setPastedSyllabus}
        onSuggestTopics={handleSuggestTopics}
        S={S} F={F}
      />

      {/* ── Difficulty + Language + Cognitive level ────────────── */}
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

      {/* ── Exam Structure Builder ─────────────────────────────── */}
      <ExamStructureBuilder
        sections={sections} setSections={setSections} S={S} F={F}
        isFree={isFree} freeMaxTotalQuestions={FREE_TIER_MAX_TOTAL_QUESTIONS}
      />

      {/* ── Output mode: Questions Only vs Questions + Marking Scheme ──
           (Premium only — free tier is always Questions Only, enforced
           by the useEffect above and by the server regardless.) ── */}
      {!isFree && (
      <div style={S.card}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Output Mode</h3>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.5 }}>
          Choose whether to generate a full marking scheme alongside the questions, or just the question paper.
        </p>
        <div className="eduq-grid-2">
          <button
            type="button" onClick={() => setIncludeMarkingScheme(false)}
            style={{
              flex: 1, textAlign: "left", padding: "14px 16px", borderRadius: 12, cursor: "pointer", fontFamily: F,
              border: `1.5px solid ${!includeMarkingScheme ? "var(--accent)" : "var(--border-strong)"}`,
              background: !includeMarkingScheme ? "var(--accent-soft)" : "var(--card-bg)",
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, color: !includeMarkingScheme ? "var(--accent)" : "var(--text)" }}>
              {!includeMarkingScheme ? "✓ " : ""}Questions Only
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>
              Just the question paper — faster, cheaper (~{formatCredits(estimatedCostQuestionsOnly)} credits for this paper). No answer key.
            </div>
          </button>
          <button
            type="button" onClick={() => setIncludeMarkingScheme(true)}
            style={{
              flex: 1, textAlign: "left", padding: "14px 16px", borderRadius: 12, cursor: "pointer", fontFamily: F,
              border: `1.5px solid ${includeMarkingScheme ? "var(--accent)" : "var(--border-strong)"}`,
              background: includeMarkingScheme ? "var(--accent-soft)" : "var(--card-bg)",
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, color: includeMarkingScheme ? "var(--accent)" : "var(--text)" }}>
              {includeMarkingScheme ? "✓ " : ""}Questions + Marking Scheme
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>
              Full answer key + point-by-point marking guide (~{formatCredits(estimatedCostWithMarking)} credits for this paper).
            </div>
          </button>
        </div>
      </div>
      )}

      {/* ── Diagram toggle (pre-generation) ────────────────────── */}
      <div style={{ ...S.card, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Allow AI-Suggested Diagrams</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F, marginTop: 3 }}>
            When a question needs a figure, graph or map, the AI will flag it so you can upload one.
          </div>
        </div>
        <label style={{ position: "relative", display: "inline-block", width: 44, height: 26, flexShrink: 0 }}>
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

      {error && <div style={S.err}><span>⚠</span><span>{error}</span></div>}

      <button onClick={handleGenerate} disabled={loading} style={{ ...S.btn, width: "100%", opacity: loading ? 0.75 : 1, marginBottom: 8 }}>
        {loading
          ? <><Spinner /> {progress?.sectionLabel ? `Generating ${progress.sectionLabel} (${progress.index}/${progress.total})…` : "Starting…"}</>
          : (isFree ? <>✨ Generate Free Quiz (Free)</> : <>✨ Generate Exam (~{formatCredits(includeMarkingScheme ? estimatedCostWithMarking : estimatedCostQuestionsOnly)} credits)</>)}
      </button>
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
