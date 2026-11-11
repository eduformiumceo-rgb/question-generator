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
 * Three layered ways to set scope, most-automatic first:
 *   1. "Load my Scheme of Learning" - pulls the teacher's own saved SOL
 *      (or, failing that, aggregated weekly lesson plans) from the SAME
 *      Supabase `lesson_plans` table the Lesson Planner already writes to.
 *   2. Paste the scheme/syllabus directly - the fallback when #1 finds
 *      nothing, or for SHS (see scope note above).
 *   3. Manual multi-strand + multi-sub-strand picker - always available.
 *
 * IMPORTANT: curriculum data itself is still reused, never duplicated -
 *   import { SUPPORTED_SUBJECTS, getSupportedClasses, getStrands, getSubStrands }
 *     from "../curriculumIndex.js";
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SUPPORTED_SUBJECTS, getSupportedClasses, getStrands, getSubStrands,
} from "../curriculumIndex.js";
import { getToken } from "../auth.js";
import {
  SHS_COURSES, OTHER_SUBJECT_KEY, isSHSClass, displaySubject, shsSubjectsForCourse,
} from "../shsCourses.js";

const SOL_LOOKUP_API = "/api/exam-account/sol-lookup";

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
  term, // read-only here - used only to scope the SOL lookup
  selectedTopics, setSelectedTopics,
  pastedSyllabus, setPastedSyllabus,
  onSuggestTopics,
  onLoginRequired, // called instead of hitting the server when signed out
  S, F,
}) {
  const [selectedStrands, setSelectedStrands] = useState([]); // string[]
  const [suggesting, setSuggesting] = useState(false);
  const [solStatus, setSolStatus] = useState(null); // { loading, source, savedAt, weeksFound, error }

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
    setSelectedStrands([]); setSelectedTopics([]); setSolStatus(null);
  }, [className]); // eslint-disable-line
  useEffect(() => { setSelectedStrands([]); setSelectedTopics([]); }, [lookupKey]); // eslint-disable-line

  const pickCourse = (course) => {
    setShsCourse(course); setShsKey(""); setSubject("");
    setSelectedStrands([]); setSelectedTopics([]); setSolStatus(null);
  };
  const pickShsSubject = (key) => {
    setShsKey(key);
    setSubject(key === OTHER_SUBJECT_KEY || !key ? "" : displaySubject(key));
    setSelectedStrands([]); setSelectedTopics([]); setSolStatus(null);
  };

  const strands = useMemo(() => (lookupKey && className ? getStrands(lookupKey, className) : []), [lookupKey, className]);
  const subStrandsByStrand = useMemo(() => {
    const map = {};
    selectedStrands.forEach(strandName => {
      map[strandName] = getSubStrands(lookupKey, className, strandName).map(ss => ss.name);
    });
    return map;
  }, [lookupKey, className, selectedStrands]);

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

  const loadScheme = async () => {
    if (!subject || !className) return;
    if (!getToken || !getToken()) { onLoginRequired?.(); return; }
    setSolStatus({ loading: true });
    try {
      const token = getToken();
      const params = new URLSearchParams({ subject, className, ...(term ? { term } : {}) });
      const res = await fetch(`${SOL_LOOKUP_API}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load your Scheme of Learning.");

      if (data.source === "none" || !data.strands?.length) {
        setSolStatus({ loading: false, source: "none" });
        return;
      }
      const matchedStrandNames = data.strands.map(s => s.strand).filter(name => strands.some(st => st.strand === name));
      setSelectedStrands(prev => Array.from(new Set([...prev, ...matchedStrandNames])));
      const allSubStrands = data.strands.flatMap(s => s.subStrands);
      setSelectedTopics(prev => Array.from(new Set([...prev, ...allSubStrands])));
      setSolStatus({ loading: false, source: data.source, savedAt: data.savedAt, weeksFound: data.weeksFound, term: data.term, matchedCount: matchedStrandNames.length, totalCount: data.strands.length });
    } catch (e) {
      setSolStatus({ loading: false, error: e.message || "Couldn't load your Scheme of Learning." });
    }
  };

  return (
    <div style={S.card}>
      <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>
        Curriculum <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)" }}>(GES / NaCCA)</span>
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.5 }}>
        Choose the class first. The subject list is filtered to what's actually taught at that level.
      </p>

      {/* -- STEP 1: Class - always shown first -- */}
      <div style={{ marginBottom: className ? 20 : 0 }}>
        <label style={S.lbl}>Class *</label>
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
          <label style={S.lbl}>Subject *</label>
          <select value={subject} onChange={e => setSubject(e.target.value)} style={S.sel}>
            <option value="">- Select Subject -</option>
            {availableSubjects.map(sub => <option key={sub} value={sub}>{sub}</option>)}
          </select>
        </div>
      )}

      {/* -- SHS STEP 2: Programme / Course -- */}
      {isSHS && (
        <div style={{ marginBottom: shsCourse ? 20 : 0 }}>
          <label style={S.lbl}>Programme / Course *</label>
          <select value={shsCourse || ""} onChange={e => pickCourse(e.target.value)} style={S.sel}>
            <option value="">- Select Programme -</option>
            {Object.keys(SHS_COURSES).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* -- SHS STEP 3: Subject, filtered to the programme -- */}
      {isSHS && shsCourse && (
        <div style={{ marginBottom: shsKey ? 20 : 0 }}>
          <label style={S.lbl}>Subject *</label>
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

      {subject && className && (!isSHS || !shsOther) && (
        <div style={{ marginTop: 20, marginBottom: 4 }}>
          <button type="button" onClick={loadScheme} disabled={solStatus?.loading} style={{ ...S.sm, opacity: solStatus?.loading ? 0.6 : 1 }}>
            {solStatus?.loading ? "Checking your Scheme of Learning…" : "Load my Scheme of Learning"}
          </button>

          {solStatus && !solStatus.loading && solStatus.source === "scheme_of_learning" && (
            <div style={{ ...S.err, background: "var(--accent-soft)", borderColor: "var(--tag-border)", color: "var(--accent)", marginTop: 10, marginBottom: 0 }}>
              <span>
                Loaded {solStatus.matchedCount} strand(s) from your saved Scheme of Learning
                {solStatus.term ? ` (${solStatus.term})` : ""}. Review the selection below. Add or remove anything before generating.
              </span>
            </div>
          )}
          {solStatus && !solStatus.loading && solStatus.source === "weekly_plans_partial" && (
            <div style={{ ...S.err, marginTop: 10, marginBottom: 0 }}>
              <span>
                No saved Scheme of Learning found. Loaded strands from {solStatus.weeksFound} saved weekly lesson plan(s)
                instead. This may not cover the whole term. Please double-check the selection below.
              </span>
            </div>
          )}
          {solStatus && !solStatus.loading && solStatus.source === "none" && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F, marginTop: 8 }}>
              No saved Scheme of Learning found. Select strands manually below, or paste your scheme.
            </div>
          )}
          {solStatus?.error && (
            <div style={{ ...S.err, marginTop: 10, marginBottom: 0 }}><span>{solStatus.error}</span></div>
          )}
        </div>
      )}

      {className && strands.length > 0 && (
        <div style={{ marginTop: 20, marginBottom: 4 }}>
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
        </div>
      )}

      {selectedStrands.length > 0 && (
        <div style={{ marginTop: 16 }}>
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
                      padding: "7px 14px", borderRadius: 99, fontFamily: F, fontSize: 12.5, fontWeight: 500,
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

      {className && (
        <div style={{ marginTop: 20 }}>
          <label style={S.lbl}>Or paste your Scheme of Learning / topic list (optional)</label>
          <textarea
            value={pastedSyllabus}
            onChange={e => setPastedSyllabus(e.target.value)}
            placeholder="Paste your Scheme of Learning, scheme of work, or a comma-separated topic list…"
            rows={3}
            style={{ ...S.inp, minHeight: 76, resize: "vertical", fontFamily: F, lineHeight: 1.5 }}
          />
        </div>
      )}

      {className && !selectedTopics.length && !pastedSyllabus.trim() && (
        <div style={{ ...S.err, marginTop: 14, marginBottom: 0 }}>
          <span>Select at least one topic, or paste a syllabus, before generating.</span>
        </div>
      )}
    </div>
  );
}
