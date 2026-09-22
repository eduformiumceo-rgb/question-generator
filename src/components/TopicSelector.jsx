/**
 * TopicSelector
 * Curriculum + Topics step of the exam wizard. GES-only, by design.
 *
 * Three layered ways to set scope, most-automatic first:
 *   1. "Load my Scheme of Learning" — pulls the teacher's own saved SOL
 *      (or, failing that, aggregated weekly lesson plans) from the SAME
 *      Supabase `lesson_plans` table the Lesson Planner already writes to.
 *      Read-only, same user_id. This is the whole point of sharing one
 *      Supabase project: this app can know what was actually taught,
 *      because the teacher already planned it in the other app.
 *   2. Paste the scheme/syllabus directly — the fallback when #1 finds
 *      nothing (never saved one, or it's aged out of the Lesson Planner's
 *      10-plan retention cap).
 *   3. Manual multi-strand + multi-sub-strand picker — always available,
 *      and necessary regardless since a real exam spans more than one
 *      strand across a term.
 *
 * IMPORTANT: curriculum data itself is still reused, never duplicated —
 *   import { SUPPORTED_SUBJECTS, getSupportedClasses, getStrands, getSubStrands }
 *     from "../curriculumIndex.js";
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  SUPPORTED_SUBJECTS, getSupportedClasses, getStrands, getSubStrands,
} from "../curriculumIndex.js";
import { getToken } from "../auth.js";

const SOL_LOOKUP_API = "/api/exam-account/sol-lookup";

export default function TopicSelector({
  subject, setSubject,
  className, setClassName,
  term, // read-only here — used only to scope the SOL lookup
  selectedTopics, setSelectedTopics,
  pastedSyllabus, setPastedSyllabus,
  onSuggestTopics,
  S, F,
}) {
  const [selectedStrands, setSelectedStrands] = useState([]); // string[]
  const [suggesting, setSuggesting] = useState(false);
  const [solStatus, setSolStatus] = useState(null); // { loading, source, savedAt, weeksFound, error }

  const classes = useMemo(() => (subject ? getSupportedClasses(subject) : []), [subject]);
  const strands = useMemo(() => (subject && className ? getStrands(subject, className) : []), [subject, className]);

  // Reset downstream selections when subject/class changes — stale
  // sub-strand picks from a different subject would silently mis-scope
  // the exam otherwise.
  useEffect(() => { setSelectedStrands([]); setSelectedTopics([]); setSolStatus(null); }, [subject, className]); // eslint-disable-line

  const subStrandsByStrand = useMemo(() => {
    const map = {};
    selectedStrands.forEach(strandName => {
      map[strandName] = getSubStrands(subject, className, strandName).map(ss => ss.name);
    });
    return map;
  }, [subject, className, selectedStrands]);

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
      const suggested = await onSuggestTopics(subject, className, selectedStrands[0] || "");
      setSelectedTopics(prev => Array.from(new Set([...prev, ...suggested])));
    } finally {
      setSuggesting(false);
    }
  };

  const loadScheme = async () => {
    if (!subject || !className) return;
    setSolStatus({ loading: true });
    try {
      const token = getToken ? getToken() : null;
      const params = new URLSearchParams({ subject, className, ...(term ? { term } : {}) });
      const res = await fetch(`${SOL_LOOKUP_API}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load your Scheme of Learning.");

      if (data.source === "none" || !data.strands?.length) {
        setSolStatus({ loading: false, source: "none" });
        return;
      }
      // Only auto-select strands/sub-strands that exist in THIS curriculum
      // index — a saved plan's strand naming should match, but never let a
      // mismatch silently select nothing without explanation.
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
      <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>
        Curriculum &amp; Topics <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)" }}>(GES / NaCCA)</span>
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.5 }}>
        A Mid-Term or End-of-Term exam usually spans several strands taught across the whole term —
        select as many strands and sub-strands as you need below, or load them automatically from your Scheme of Learning.
      </p>

      <div className="eduq-grid-2" style={{ marginBottom: 14 }}>
        <div>
          <label style={S.lbl}>Subject *</label>
          <select value={subject} onChange={e => setSubject(e.target.value)} style={S.sel}>
            <option value="">- Select Subject -</option>
            {SUPPORTED_SUBJECTS.map(sub => <option key={sub} value={sub}>{sub}</option>)}
          </select>
        </div>
        <div>
          <label style={S.lbl}>Class *</label>
          <select value={className} onChange={e => setClassName(e.target.value)} style={S.sel} disabled={!subject}>
            <option value="">- Select Class -</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {subject && className && (
        <div style={{ marginBottom: 16 }}>
          <button type="button" onClick={loadScheme} disabled={solStatus?.loading} style={{ ...S.sm, opacity: solStatus?.loading ? 0.6 : 1 }}>
            {solStatus?.loading ? "Checking your Scheme of Learning…" : "📋 Load my Scheme of Learning"}
          </button>

          {solStatus && !solStatus.loading && solStatus.source === "scheme_of_learning" && (
            <div style={{ ...S.err, background: "var(--accent-soft)", borderColor: "var(--tag-border)", color: "var(--accent)", marginTop: 10, marginBottom: 0 }}>
              <span>✓</span>
              <span>
                Loaded {solStatus.matchedCount} strand(s) from your saved Scheme of Learning
                {solStatus.term ? ` (${solStatus.term})` : ""}. Review the selection below — add or remove anything before generating.
              </span>
            </div>
          )}
          {solStatus && !solStatus.loading && solStatus.source === "weekly_plans_partial" && (
            <div style={{ ...S.err, marginTop: 10, marginBottom: 0 }}>
              <span>⚠</span>
              <span>
                No saved Scheme of Learning found — loaded strands from {solStatus.weeksFound} saved weekly lesson plan(s)
                instead. This may not cover the whole term (older plans can age out). Please double-check the selection below.
              </span>
            </div>
          )}
          {solStatus && !solStatus.loading && solStatus.source === "none" && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F, marginTop: 8 }}>
              No saved Scheme of Learning or lesson plans found for this subject/class{term ? `/${term}` : ""} — select strands manually below, or paste your scheme.
            </div>
          )}
          {solStatus?.error && (
            <div style={{ ...S.err, marginTop: 10, marginBottom: 0 }}><span>⚠</span><span>{solStatus.error}</span></div>
          )}
        </div>
      )}

      {className && strands.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <label style={S.lbl}>Strands taught this term (select any number)</label>
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
                  {active ? "✓ " : ""}{st.strand}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedStrands.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ ...S.lbl, marginBottom: 0 }}>Topics (Sub-Strands) — grouped by strand</label>
            {onSuggestTopics && (
              <button type="button" onClick={handleSuggest} disabled={suggesting} style={{ ...S.sm, height: 30, fontSize: 11.5, opacity: suggesting ? 0.6 : 1 }}>
                {suggesting ? "Suggesting…" : "✨ AI Suggest Topics"}
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
                      {active ? "✓ " : ""}{name}
                    </button>
                  );
                })}
                {!(subStrandsByStrand[strandName] || []).length && (
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F }}>No sub-strands found.</span>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <label style={S.lbl}>Or paste your Scheme of Learning / topic list (optional — overrides/extends the picks above)</label>
        <textarea
          value={pastedSyllabus}
          onChange={e => setPastedSyllabus(e.target.value)}
          placeholder="Paste your Scheme of Learning, scheme of work, or a comma-separated topic list covering the weeks you want this exam to include…"
          rows={4}
          style={{ ...S.inp, minHeight: 90, resize: "vertical", fontFamily: F, lineHeight: 1.5 }}
        />
      </div>

      {!selectedTopics.length && !pastedSyllabus.trim() && (
        <div style={{ ...S.err, marginTop: 14, marginBottom: 0 }}>
          <span>⚠</span>
          <span>Select at least one topic, or paste a syllabus, before generating.</span>
        </div>
      )}
    </div>
  );
}
