/**
 * TopicSelector
 * Curriculum + Topics step of the exam wizard. GES-only, by design.
 *
 * Flow order - CLASS FIRST, then Subject - matches the real Lesson
 * Planner's CurriculumSelector exactly, verified against src/App.jsx
 * before building this, not guessed:
 *   - ALL_CLASSES is a static, grouped list (Kindergarten / Lower Primary /
 *     Upper Primary / Junior High School / Senior High School), shown
 *     unconditionally as Step 1 - same grouping, same order as the real app.
 *   - Subject only appears once a class is chosen, and the subject list is
 *     FILTERED to that class: `SUPPORTED_SUBJECTS.filter(s =>
 *     getSupportedClasses(s).includes(className))` - the real app's exact
 *     line, not a new lookup function (curriculumIndex.js has no
 *     class-first lookup; the real app derives it client-side the same way).
 *   - Strand → Sub-Strand only appear once Subject is chosen, same
 *     progressive-disclosure pattern.
 *
 * SENIOR HIGH SCHOOL follows the Lesson Planner's two-tier flow exactly:
 *   SHS 1/2/3 -> Programme / Course (General Science, Business, General Arts,
 *   Visual Arts, Home Economics, Agricultural Science, Technical, STEM / TVET,
 *   Core Subjects) -> Subject -> Strands -> Topics. Subjects come from
 *   shsCourses.js (a copy of the planner's SHS_COURSES) and strands/sub-strands
 *   from the same getStrands/getSubStrands helpers. The subject is shown and
 *   stored by its clean name ("Biology"); the internal key ("Biology (GS)") only
 *   drives the curriculum lookup. A subject with no NaCCA data yet stays
 *   selectable and falls back to the pasted syllabus.
 *
 * Four layered ways to set scope, most-automatic first:
 *   0. UPLOAD your Scheme of Learning (Word .docx or PDF). It is read in the
 *      browser (schemeReader.js), its text fills the scheme box below, and the
 *      strands / sub-strands it mentions are matched to the NaCCA curriculum
 *      and ticked automatically (schemeMatch.js). Upload first or pick the
 *      subject first - the match re-runs whenever either changes.
 *   1. List topics directly (type or paste) - the fallback when no scheme is
 *      uploaded, or for SHS (see scope note above).
 *   2. Manual multi-strand + multi-sub-strand picker - always available.
 *
 * IMPORTANT: curriculum data itself is still reused, never duplicated -
 *   import { SUPPORTED_SUBJECTS, getSupportedClasses, getStrands, getSubStrands }
 *     from "../curriculumIndex.js";
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SUPPORTED_SUBJECTS, getSupportedClasses, getStrands, getSubStrands,
} from "../curriculumIndex.js";
import {
  SHS_COURSES, OTHER_SUBJECT_KEY, isSHSClass, displaySubject, shsSubjectsForCourse,
} from "../shsCourses.js";
import { readSchemeFile, SchemeReadError, SCHEME_ACCEPT } from "../schemeReader.js";
import { condenseSchemeText, matchSchemeToCurriculum } from "../schemeMatch.js";
import { MAX_SYLLABUS_CHARS, MAX_TOPICS } from "../moderation.js";

const METHOD_KEY = "topicMethod";
function readLastMethod() {
  try { const v = localStorage.getItem(METHOD_KEY); return v === "strands" || v === "list" || v === "upload" ? v : null; }
  catch { return null; }
}
function saveLastMethod(v) { try { localStorage.setItem(METHOD_KEY, v); } catch { /* storage blocked: fine */ } }

// Large scheme buttons. Flat by design (no shadows, no icons).
// "solid" = the main action (upload); "outline" = the secondary one (load saved).
const bigBtn = (F, variant, disabled) => ({
  width: "100%", height: 52, padding: "0 20px", borderRadius: 12, boxSizing: "border-box",
  display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
  fontFamily: F, fontSize: 15, fontWeight: 800, letterSpacing: ".02em", lineHeight: 1.2,
  cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.65 : 1,
  WebkitTapHighlightColor: "transparent", touchAction: "manipulation", boxShadow: "none",
  ...(variant === "solid"
    ? { background: "linear-gradient(135deg,#0D9488 0%,#0891B2 100%)", color: "#fff", border: "none" }
    : { background: "transparent", color: "var(--accent)", border: "2px solid var(--accent)" }),
});


// Exact grouping and order from the real App.jsx's Step 1 class Select.
const CLASS_GROUPS = [
  { label: "Kindergarten", classes: ["KG 1", "KG 2"] },
  { label: "Lower Primary", classes: ["Basic 1", "Basic 2", "Basic 3"] },
  { label: "Upper Primary", classes: ["Basic 4", "Basic 5", "Basic 6"] },
  { label: "Junior High School", classes: ["Basic 7", "Basic 8", "Basic 9"] },
  { label: "Senior High School", classes: ["SHS 1", "SHS 2", "SHS 3"] },
];

export default function TopicSelector({
  subject, setSubject,
  className, setClassName,
  shsCourse, setShsCourse, // SHS only: programme / course
  shsKey, setShsKey,       // SHS only: internal curriculum key, e.g. "Biology (GS)"
  term, // kept for the caller; no longer used here
  selectedTopics, setSelectedTopics,
  pastedSyllabus, setPastedSyllabus,
  onSuggestTopics,
  S, F,
}) {
  const [selectedStrands, setSelectedStrands] = useState([]); // string[]
  const [suggesting, setSuggesting] = useState(false);

  // Uploaded scheme file: { name, kind, pages, text (full), inserted (what went into the box), truncated, originalLength }
  const [scheme, setScheme] = useState(null);
  const [schemeBusy, setSchemeBusy] = useState(false);
  const [schemeError, setSchemeError] = useState("");
  const [schemeMatch, setSchemeMatch] = useState(null); // { strands, topics, total } once matched against the curriculum
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const schemeMatchRef = useRef(null); // latest match, readable from async handlers without stale closures

  const isSHS = isSHSClass(className);
  const shsOther = isSHS && shsKey === OTHER_SUBJECT_KEY;

  // The key that drives the curriculum lookup: the planner-style internal key
  // for SHS ("Biology (GS)"), the plain subject name for Basic classes.
  const lookupKey = isSHS ? (shsOther ? "" : shsKey || "") : subject;

  // Same derivation as the real App.jsx: subjects available for the chosen
  // class, not classes available for a chosen subject.
  const availableSubjects = useMemo(() => {
    if (!className || isSHS) return [];
    return SUPPORTED_SUBJECTS.filter(s => getSupportedClasses(s).includes(className));
  }, [className, isSHS]);

  const shsSubjects = useMemo(() => (isSHS && shsCourse ? shsSubjectsForCourse(shsCourse) : []), [isSHS, shsCourse]);
  const shsPicked = shsSubjects.find(s => s.key === shsKey) || null;

  // Reset downstream selections when the class changes - a stale subject/strand
  // pick from a different class would silently mis-scope the exam. Moving
  // between SHS 1/2/3 keeps the programme and subject (the teacher is still
  // setting a paper for the same course) but clears strands, which differ by year.
  const prevClass = useRef(className);
  useEffect(() => {
    const stayingInSHS = isSHSClass(prevClass.current) && isSHSClass(className);
    prevClass.current = className;
    if (!stayingInSHS) { setSubject(""); setShsCourse?.(""); setShsKey?.(""); }
    setSelectedStrands([]); setSelectedTopics([]);
  }, [className]); // eslint-disable-line
  useEffect(() => { setSelectedStrands([]); setSelectedTopics([]); }, [lookupKey]); // eslint-disable-line

  const pickCourse = (course) => {
    setShsCourse(course); setShsKey(""); setSubject("");
    setSelectedStrands([]); setSelectedTopics([]);
  };
  const pickShsSubject = (key) => {
    setShsKey(key);
    setSubject(key === OTHER_SUBJECT_KEY || !key ? "" : displaySubject(key));
    setSelectedStrands([]); setSelectedTopics([]);
  };

  const strands = useMemo(() => (lookupKey && className ? getStrands(lookupKey, className) : []), [lookupKey, className]);
  const subStrandsByStrand = useMemo(() => {
    const map = {};
    selectedStrands.forEach(strandName => {
      map[strandName] = getSubStrands(lookupKey, className, strandName).map(ss => ss.name);
    });
    return map;
  }, [lookupKey, className, selectedStrands]);

  // Match the uploaded scheme to the curriculum. Runs when a scheme arrives AND whenever the
  // class/subject changes (the reset effects above have just cleared the ticks, so this re-applies
  // them) - which is what lets a teacher upload first and pick the subject afterwards.
  useEffect(() => {
    if (!scheme || !lookupKey || !className || !strands.length) { schemeMatchRef.current = null; setSchemeMatch(null); return; }
    const m = matchSchemeToCurriculum(scheme.text, strands, subject);
    const topics = m.topics.slice(0, MAX_TOPICS); // the server rejects more than MAX_TOPICS
    setSelectedStrands(prev => Array.from(new Set([...prev, ...m.strands])));
    setSelectedTopics(prev => Array.from(new Set([...prev, ...topics])));
    schemeMatchRef.current = { strands: m.strands, topics, total: m.topics.length };
    setSchemeMatch(schemeMatchRef.current);
  }, [scheme, lookupKey, className, subject]); // eslint-disable-line

  const handleSchemeFile = useCallback(async (file) => {
    if (!file) return;
    setSchemeBusy(true); setSchemeError("");
    try {
      const { text, kind, pages, pagesSkipped } = await readSchemeFile(file);
      const c = condenseSchemeText(text, MAX_SYLLABUS_CHARS);
      // Replacing a scheme: take back what the OLD one ticked, so its topics don't leak into this exam.
      const old = schemeMatchRef.current;
      if (old) {
        setSelectedTopics(prev => prev.filter(t => !old.topics.includes(t)));
        setSelectedStrands(prev => prev.filter(st => !old.strands.includes(st)));
      }
      setScheme({ name: file.name, kind, pages, pagesSkipped, text, inserted: c.text, truncated: c.truncated, originalLength: c.originalLength });
      setPastedSyllabus(c.text);
      saveLastMethod("upload");
    } catch (e) {
      setSchemeError(e instanceof SchemeReadError ? e.message : "Couldn't read that file. Please try another one, or paste the text below.");
    } finally {
      setSchemeBusy(false);
    }
  }, [setPastedSyllabus, setSelectedTopics]);

  const removeScheme = () => {
    if (schemeMatch) {
      // undo what this upload ticked, so "Remove" really removes its influence
      setSelectedTopics(prev => prev.filter(t => !schemeMatch.topics.includes(t)));
      setSelectedStrands(prev => prev.filter(st => !schemeMatch.strands.includes(st)));
    }
    if (scheme && pastedSyllabus === scheme.inserted) setPastedSyllabus(""); // keep it if the teacher has edited it
    schemeMatchRef.current = null;
    setScheme(null); setSchemeMatch(null); setSchemeError("");
  };

  // Topics only appear once the subject is settled, so the screen stays calm until then.
  const subjectReady = isSHS
    ? !!shsKey && (!shsOther || !!subject.trim())
    : !!subject;
  // Accordions start collapsed. The paste box opens by itself when there is no curriculum to pick from.
  // The way the teacher last chose topics is remembered on this device, so a returning teacher
  // lands on their usual route (storage can be blocked, so every access is guarded).
  const [lastMethod] = useState(readLastMethod);
  const [openStrands, setOpenStrandsRaw] = useState(null);
  const [openList, setOpenListRaw] = useState(null);
  const strandsOpen = openStrands ?? lastMethod === "strands";
  const listOpen = openList ?? (lastMethod === "list" || !strands.length);
  const setOpenStrands = (v) => { setOpenStrandsRaw(v); if (v) saveLastMethod("strands"); };
  const setOpenList = (v) => { setOpenListRaw(v); if (v) saveLastMethod("list"); };

  const toggleStrand = (strandName) => {
    setSelectedStrands(prev => prev.includes(strandName) ? prev.filter(s => s !== strandName) : [...prev, strandName]);
  };
  const toggleTopic = (t) => {
    setSelectedTopics(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const handleSuggest = async () => {
    if (!onSuggestTopics) return;
    setSuggesting(true);
    try {
      const suggested = await onSuggestTopics(subject, className, selectedStrands[0] || "", isSHS ? shsCourse : "");
      setSelectedTopics(prev => Array.from(new Set([...prev, ...suggested])));
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div style={S.card}>
      <style>{TS_CSS}</style>
      <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>
        Curriculum <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)" }}>(GES / NaCCA)</span>
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.5 }}>
        Choose the class first. The subject list is filtered to what's actually taught at that level.
      </p>

      {/* -- STEP 1: Class - always shown first -- */}
      <div style={{ marginBottom: className ? 20 : 0 }}>
        <StepLabel F={F} S={S} n={1}>Class *</StepLabel>
        <select value={className} onChange={e => setClassName(e.target.value)} style={S.sel}>
          <option value="">- Select Class -</option>
          {CLASS_GROUPS.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.classes.map(c => <option key={c} value={c}>{c}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {/* -- STEP 2: Subject - shown only once a class is chosen, filtered to that class -- */}
      {className && !isSHS && (
        <div style={{ marginBottom: subject ? 20 : 0 }}>
          <StepLabel F={F} S={S} n={2}>Subject *</StepLabel>
          <select value={subject} onChange={e => setSubject(e.target.value)} style={S.sel}>
            <option value="">- Select Subject -</option>
            {availableSubjects.map(sub => <option key={sub} value={sub}>{sub}</option>)}
          </select>
        </div>
      )}

      {/* -- SHS STEP 2: Programme / Course -- */}
      {isSHS && (
        <div style={{ marginBottom: shsCourse ? 20 : 0 }}>
          <StepLabel F={F} S={S} n={2}>Programme / Course *</StepLabel>
          <select value={shsCourse || ""} onChange={e => pickCourse(e.target.value)} style={S.sel}>
            <option value="">- Select Programme -</option>
            {Object.keys(SHS_COURSES).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* -- SHS STEP 3: Subject, filtered to the programme -- */}
      {isSHS && shsCourse && (
        <div style={{ marginBottom: shsKey ? 20 : 0 }}>
          <StepLabel F={F} S={S} n={3}>Subject *</StepLabel>
          <select value={shsKey || ""} onChange={e => pickShsSubject(e.target.value)} style={S.sel}>
            <option value="">- Select Subject -</option>
            {shsSubjects.map(s => (
              <option key={s.key} value={s.key}>{s.label}{s.hasCurriculum ? "" : " (paste syllabus)"}</option>
            ))}
            <option value={OTHER_SUBJECT_KEY}>Other subject (type it in)</option>
          </select>
        </div>
      )}

      {shsOther && (
        <div style={{ marginBottom: 12 }}>
          <label style={S.lbl}>Subject name *</label>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Elective Geography" style={S.inp} />
        </div>
      )}

      {isSHS && (shsOther || (shsPicked && !shsPicked.hasCurriculum)) && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.5, background: "var(--accent-soft)", border: "1px solid var(--tag-border)", borderRadius: 10, padding: "10px 12px", marginBottom: 4 }}>
          {shsOther ? "" : `NaCCA strands for ${shsPicked.label} aren't loaded yet. `}
          Paste your syllabus or topic list below and the paper will be built from it.
        </div>
      )}

      {/* -- TOPICS: only appears once a subject is chosen. Three ways in, one visible at a time:
            the Upload button, then two collapsed accordions, each separated by "OR". -- */}
      {subjectReady && (
        <div style={{ marginTop: 24, paddingTop: 22, borderTop: "1px solid var(--border)" }}>
          <StepLabel F={F} S={S} n={isSHS ? 4 : 3}>Choose your topics</StepLabel>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.5, margin: "-2px 0 12px 32px" }}>
            Pick whichever way is quickest for you.
          </div>
          <input
            ref={fileInputRef} type="file" accept={SCHEME_ACCEPT} style={{ display: "none" }}
            aria-label="Upload scheme of learning file"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; handleSchemeFile(f); }}
          />

          {/* 1. Upload scheme */}
          {!scheme && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); if (!schemeBusy) handleSchemeFile(e.dataTransfer.files?.[0]); }}
            >
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                <span style={{ fontFamily: F, fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid var(--tag-border)", borderRadius: 99, padding: "3px 10px" }}>
                  Recommended · fastest
                </span>
              </div>
              <button
                type="button" aria-busy={schemeBusy} disabled={schemeBusy}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  ...bigBtn(F, "solid", schemeBusy),
                  ...(dragging ? { background: "var(--accent-hover)" } : null),
                }}
              >
                {schemeBusy ? "Reading your scheme…" : "Upload My Scheme of Learning"}
              </button>
              <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F, marginTop: 8, lineHeight: 1.5, textAlign: "center" }}>
                Word (.docx) or PDF, up to 10 MB. We read it and select your topics for you.
              </div>
            </div>
          )}

          {scheme && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", border: "1.5px solid var(--tag-border)", background: "var(--accent-soft)", borderRadius: 12, padding: "10px 14px", fontFamily: F }}>
              <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--accent)", overflowWrap: "anywhere" }}>{scheme.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
                  {scheme.originalLength.toLocaleString()} characters read{scheme.pages ? ` from ${scheme.pages} page${scheme.pages === 1 ? "" : "s"}` : ""}
                </div>
              </div>
              <button type="button" style={S.sm} disabled={schemeBusy} onClick={() => fileInputRef.current?.click()}>{schemeBusy ? "Reading…" : "Replace"}</button>
              <button type="button" style={S.danger} disabled={schemeBusy} onClick={removeScheme}>Remove</button>
            </div>
          )}

          <div aria-live="polite">
            {schemeError && <div style={{ ...S.err, marginTop: 10, marginBottom: 0 }}><span>{schemeError}</span></div>}

            {scheme && !schemeError && (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.5, marginTop: 8 }}>
                {schemeMatch?.topics.length > 0 ? (
                  <>
                    <b style={{ color: "var(--accent)" }}>Found {schemeMatch.topics.length} topic{schemeMatch.topics.length === 1 ? "" : "s"}</b> in {schemeMatch.strands.length} strand{schemeMatch.strands.length === 1 ? "" : "s"} and selected {schemeMatch.topics.length === 1 ? "it" : "them"}. <button type="button" className="ts-link" onClick={() => setOpenStrands(true)}>Review selection</button>
                    {schemeMatch.total > schemeMatch.topics.length && ` Only the first ${MAX_TOPICS} of ${schemeMatch.total} were selected (the most one paper can use).`}
                  </>
                ) : strands.length ? (
                  <>Scheme read, but no curriculum topics could be matched automatically. <button type="button" className="ts-link" onClick={() => setOpenStrands(true)}>Pick topics yourself</button>. Your scheme text will still be used to build the paper.</>
                ) : (
                  "Scheme read. Its text will be used to build the paper."
                )}
              </div>
            )}
            {scheme?.truncated && (
              <div style={{ ...S.err, marginTop: 10, marginBottom: 0 }}>
                <span>
                  Your scheme is long, so only the first {scheme.inserted.length.toLocaleString()} of {scheme.originalLength.toLocaleString()} characters
                  are used for the paper. Open “Type or paste topics” below to keep just the weeks you're examining.
                </span>
              </div>
            )}
            {scheme?.pagesSkipped && (
              <div style={{ ...S.err, marginTop: 10, marginBottom: 0 }}><span>Only the first 80 pages of that PDF were read.</span></div>
            )}
          </div>

          {/* 2. Strands + topics from the NaCCA curriculum (collapsed) */}
          {strands.length > 0 && (
            <>
              <OrDivider F={F} />
              <Accordion
                F={F} id="ts-strands" open={strandsOpen} onToggle={() => setOpenStrands(!strandsOpen)}
                title="Choose from the curriculum"
                sub={`${strands.length} strand${strands.length === 1 ? "" : "s"} available · tick the ones taught this ${isSHS ? "semester" : "term"}`}
                badge={selectedTopics.length > 0 ? `${selectedTopics.length} selected` : ""}
              >
                <label style={S.lbl}>Strands taught this {isSHS ? "semester" : "term"} (select any number)</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {strands.map(st => {
                    const active = selectedStrands.includes(st.strand);
                    return (
                      <button key={st.strand} type="button" onClick={() => toggleStrand(st.strand)} style={{
                        padding: "8px 14px", borderRadius: 99, fontFamily: F, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                        border: `1.5px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
                        background: active ? "var(--accent-soft)" : "var(--card-bg)",
                        color: active ? "var(--accent)" : "var(--text-secondary)",
                      }}>
                        {st.strand}
                      </button>
                    );
                  })}
                </div>

                {selectedStrands.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <label style={{ ...S.lbl, marginBottom: 0 }}>Topics (Sub-Strands)</label>
                      {onSuggestTopics && (
                        <button type="button" onClick={handleSuggest} disabled={suggesting} style={{ ...S.sm, height: 30, fontSize: 11.5, opacity: suggesting ? 0.6 : 1 }}>
                          {suggesting ? "Suggesting…" : "AI Suggest Topics"}
                        </button>
                      )}
                    </div>
                    {selectedStrands.map(strandName => (
                      <div key={strandName} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", fontFamily: F, marginBottom: 4 }}>{strandName}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {(subStrandsByStrand[strandName] || []).map(name => {
                            const active = selectedTopics.includes(name);
                            return (
                              <button key={name} type="button" onClick={() => toggleTopic(name)} style={{
                                padding: "7px 14px", borderRadius: 16, textAlign: "left", fontFamily: F, fontSize: 12.5, fontWeight: 500,
                                cursor: "pointer", WebkitTapHighlightColor: "transparent",
                                border: `1.5px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
                                background: active ? "var(--accent-soft)" : "var(--card-bg)",
                                color: active ? "var(--accent)" : "var(--text-secondary)",
                              }}>
                                {name}
                              </button>
                            );
                          })}
                          {!(subStrandsByStrand[strandName] || []).length && (
                            <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F }}>No sub-strands found.</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Accordion>
            </>
          )}

          {/* 3. Type / paste topics (collapsed; opens by itself when there is no curriculum to pick from) */}
          <OrDivider F={F} />
          <Accordion
            F={F} id="ts-list" open={listOpen} onToggle={() => setOpenList(!listOpen)}
            title={scheme ? "Edit scheme text" : "Type or paste topics"}
            sub={scheme ? "Focus the paper on particular weeks" : "Write or paste a list of topics"}
            badge={pastedSyllabus.trim() ? (scheme ? "Scheme text added" : "Added") : ""}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <label style={S.lbl}>{scheme ? "Scheme text (edit to focus the paper on certain weeks)" : "List the topics to be examined"}</label>
              {pastedSyllabus.length > MAX_SYLLABUS_CHARS * 0.8 && (
                <span style={{ fontSize: 11.5, fontFamily: F, fontWeight: 600, flexShrink: 0, marginBottom: 7, color: pastedSyllabus.length > MAX_SYLLABUS_CHARS ? "var(--err-text)" : "var(--text-muted)" }}>
                  {pastedSyllabus.length.toLocaleString()} / {MAX_SYLLABUS_CHARS.toLocaleString()}
                </span>
              )}
            </div>
            <textarea
              value={pastedSyllabus}
              onChange={e => setPastedSyllabus(e.target.value)}
              placeholder="List the topics to be examined, separated by commas or one per line…"
              rows={scheme ? 8 : 3}
              style={{ ...S.inp, minHeight: 76, resize: "vertical", fontFamily: F, lineHeight: 1.5 }}
            />
          </Accordion>
        </div>
      )}

      {subjectReady && !selectedTopics.length && !pastedSyllabus.trim() && (
        <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 10, background: "var(--accent-soft)", border: "1px solid var(--tag-border)", fontFamily: F, fontSize: 12.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>
          Add at least one topic (by any of the three ways above) before generating.
        </div>
      )}
    </div>
  );
}

// Numbered step heading: a small teal circle + the label.
function StepLabel({ F, S, n, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <span aria-hidden="true" style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: "var(--accent-soft)", color: "var(--accent)",
        border: "1px solid var(--tag-border)", fontFamily: F, fontSize: 11.5, fontWeight: 800,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{n}</span>
      <span style={{ ...S.lbl, marginBottom: 0 }}>{children}</span>
    </div>
  );
}

// "──── OR ────" separator between the three ways of choosing topics.
function OrDivider({ F }) {
  return (
    <div role="separator" aria-label="or" style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      <span style={{ fontFamily: F, fontSize: 11, fontWeight: 700, letterSpacing: ".14em", color: "var(--text-muted)" }}>OR</span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

// Collapsible section with a smooth open/close. Content stays mounted (so a half-typed
// list is never lost) but is hidden from sight and from keyboard focus while collapsed.
function Accordion({ F, id, open, onToggle, title, sub, badge, children }) {
  return (
    <div style={{ border: `1.5px solid ${open ? "var(--accent)" : "var(--border-strong)"}`, borderRadius: 12, background: "var(--card-bg)", overflow: "hidden", transition: "border-color .2s" }}>
      <button
        type="button" onClick={onToggle} aria-expanded={open} aria-controls={`${id}-panel`} id={`${id}-btn`}
        className="ts-acc-head"
        style={{
          width: "100%", minHeight: 56, padding: "10px 16px", boxSizing: "border-box",
          display: "flex", alignItems: "center", gap: 12, textAlign: "left",
          background: "transparent", border: "none", cursor: "pointer", fontFamily: F,
          color: "var(--text)", WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{title}</span>
          {sub && <span style={{ display: "block", fontSize: 12, fontWeight: 400, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4 }}>{sub}</span>}
        </span>
        {badge && (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid var(--tag-border)", borderRadius: 99, padding: "2px 10px", flexShrink: 0, whiteSpace: "nowrap" }}>
            {badge}
          </span>
        )}
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="ts-chev" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none" }}>
          <polyline points="5 8 10 13 15 8" />
        </svg>
      </button>
      <div
        id={`${id}-panel`} role="region" aria-labelledby={`${id}-btn`}
        className="ts-acc-body"
        style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", visibility: open ? "visible" : "hidden" }}
      >
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div style={{ padding: "6px 16px 16px", borderTop: "1px solid var(--border)" }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

// Tiny stylesheet for what inline styles can't do: focus rings, hover, animation.
const TS_CSS = `
.ts-acc-head:hover{background:var(--accent-soft)!important}
.ts-acc-head:focus-visible,.ts-link:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;border-radius:10px}
.ts-chev{transition:transform .22s ease}
.ts-acc-body{transition:grid-template-rows .25s ease,visibility 0s linear .25s}
.ts-acc-body[style*="visible"]{transition:grid-template-rows .25s ease,visibility 0s}
.ts-link{background:none;border:none;padding:0;font:inherit;font-weight:700;color:var(--accent);text-decoration:underline;cursor:pointer}
@media (prefers-reduced-motion:reduce){.ts-chev,.ts-acc-body{transition:none!important}}
`;
