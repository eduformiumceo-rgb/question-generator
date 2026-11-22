/**
 * ExamStructureBuilder
 * Lets the teacher define Section A (Objective/MCQ), Section B (Structured/
 * Theory) and Section C (Essay) - each with a question count and marks per
 * question. Auto-calculates section and paper totals. The three standard
 * sections are ticked on/off (e.g. a Class Test may only need Section A + B);
 * extra sections (D, E, ...) can be added with "Add section" and removed again.
 *
 * Always shows full capability - Free-tier eligibility is checked at the
 * moment the Free button is clicked (see QuestionsGenerator.jsx's
 * validate()), not by pre-locking sections here. An earlier version of
 * this component took isFree/freeMaxTotalQuestions props and greyed out
 * the essay section whenever a "Free" mode was pre-selected; that UI
 * pattern was removed when the generate flow changed to two independent
 * buttons (Free / Premium) instead of a tier toggle - this component
 * stopped being passed those props and the matching logic became dead
 * code, so it's removed here rather than left stale.
 *
 * Reuses the exact style tokens (S, F, CSS vars) already defined in App.jsx -
 * import { S, F } from "../App.jsx"-equivalent shared style module in your
 * integration, or copy the small subset below if this file is used standalone.
 */
import React, { useState } from "react";
import NumberField from "./NumberField.jsx";
import CardTitle from "./CardTitle.jsx";

export const DEFAULT_SECTIONS = [
  { id: "A", label: "Section A: Objective (Multiple Choice)", type: "objective", questionCount: 20, marksPerQuestion: 1, enabled: true },
  { id: "B", label: "Section B: Structured / Theory",         type: "structured", questionCount: 5,  marksPerQuestion: 10, enabled: true },
  { id: "C", label: "Section C: Essay",                       type: "essay",       questionCount: 2,  marksPerQuestion: 20, enabled: false },
];

const MAX_QUESTIONS_PER_SECTION = 60; // edge-case guard against runaway generation
const MAX_SECTIONS = 8;               // a paper with more sections than this is not a realistic exam, and generation time grows with each one

// What each kind of section starts with when the teacher adds it.
export const SECTION_TYPES = {
  objective:  { name: "Objective (Multiple Choice)", short: "Objective", questionCount: 20, marksPerQuestion: 1 },
  structured: { name: "Structured / Theory",         short: "Structured", questionCount: 5,  marksPerQuestion: 10 },
  essay:      { name: "Essay",                       short: "Essay",      questionCount: 2,  marksPerQuestion: 20 },
};

/** The first free section letter (A-Z) that no existing section is using. null when all are taken. */
export function nextSectionId(sections) {
  const used = new Set((sections || []).map(sec => String(sec.id)));
  for (let i = 0; i < 26; i++) { const id = String.fromCharCode(65 + i); if (!used.has(id)) return id; }
  return null;
}

/**
 * A section title is typed by the teacher and ends up inside the AI prompt and the printed paper, so keep it to plain
 * letters, digits, spaces and basic punctuation (no quotes, brackets or line breaks) and a sensible length.
 */
export const cleanSectionTitle = (t) => String(t ?? "").replace(/[^\p{L}\p{N} \-/&,.:]/gu, "").replace(/\s+/g, " ").slice(0, 40);

/** The label shown on the form and printed on the paper: "Section D: <title or the type's name>". */
export const sectionLabel = (id, type, title) => `Section ${id}: ${cleanSectionTitle(title).trim() || (SECTION_TYPES[type] || SECTION_TYPES.structured).name}`;

/** A new, enabled section of the given type with the next free letter. */
export function makeSection(sections, type) {
  const id = nextSectionId(sections);
  const t = SECTION_TYPES[type];
  if (!id || !t) return null;
  return { id, label: sectionLabel(id, type, ""), type, questionCount: t.questionCount, marksPerQuestion: t.marksPerQuestion, enabled: true, custom: true, title: "" };
}

// What a candidate can actually earn / answer: an "answer any N" section counts N questions.
const answered = (sec) => sec.answerAny ? Math.min(Number(sec.answerAny) || 0, Number(sec.questionCount) || 0) : (Number(sec.questionCount) || 0);

/** { questions, marks } a candidate can answer / earn across the enabled sections (also used by the Generate panel). */
export function paperTotals(sections) {
  const on = (sections || []).filter(sec => sec.enabled);
  return {
    questions: on.reduce((n, sec) => n + answered(sec), 0),
    marks: on.reduce((n, sec) => n + answered(sec) * (Number(sec.marksPerQuestion) || 0), 0),
  };
}

export default function ExamStructureBuilder({ sections, setSections, S, F, sty, note }) {
  const s = S || sty; // tolerate either prop name

  const [newType, setNewType] = useState("structured");

  const update = (id, patch) => {
    setSections(prev => prev.map(sec => sec.id === id ? { ...sec, ...patch } : sec));
  };
  const addSection = () => {
    setSections(prev => {
      if (prev.length >= MAX_SECTIONS) return prev;
      const sec = makeSection(prev, newType);
      return sec ? [...prev, sec] : prev;
    });
  };
  const removeSection = (id) => setSections(prev => prev.filter(sec => sec.id !== id));
  const canAdd = sections.length < MAX_SECTIONS && nextSectionId(sections) !== null;

  const { questions: totalQuestions, marks: totalMarks } = paperTotals(sections);

  return (
    <div style={s.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}>
          <CardTitle F={F} mb={0} desc="Tick the sections this paper needs, add more if you need them, then set how many questions and marks each has.">Exam Structure Builder</CardTitle>
        </div>
        <div className="qa-stat" style={{ fontFamily: F }}>{totalQuestions} questions · {totalMarks} marks total</div>
      </div>

      {note && <div className="qa-note" style={{ fontFamily: F, marginBottom: 14 }}>{note}</div>}

      {sections.map(sec => (
        <div key={sec.id} className="qa-inset" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: sec.enabled ? 14 : 0 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
              <input
                type="checkbox" checked={!!sec.enabled}
                onChange={e => update(sec.id, { enabled: e.target.checked })}
                aria-label={`Include ${sec.label}`}
              />
              <span style={{ fontSize: 14.5, fontWeight: 700, color: sec.enabled ? "var(--text)" : "var(--text-muted)", fontFamily: F }}>{sec.paper ? `Paper ${sec.paper}: ` : ""}{sec.label}</span>
              {sec.type === "essay" && (
                <span className="qa-tag" style={{ fontFamily: F }}>Premium AI only</span>
              )}
            </label>
            {sec.enabled && (
              <span style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: F, fontWeight: 600 }}>
                {sec.answerAny ? `answer any ${answered(sec)} of ${Number(sec.questionCount) || 0}, ` : ""}= {answered(sec) * (Number(sec.marksPerQuestion) || 0)} marks
              </span>
            )}
            {sec.custom && (
              <button type="button" onClick={() => removeSection(sec.id)} aria-label={`Remove ${sec.label}`}
                style={{ background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 99, padding: "0 12px", height: 30, fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer", fontFamily: F }}>
                Remove
              </button>
            )}
          </div>

          {sec.custom && sec.enabled && (
            <div style={{ marginBottom: 12 }}>
              <label style={s.lbl}>Section title (optional)</label>
              <input
                type="text" value={sec.title || ""} maxLength={40} placeholder={SECTION_TYPES[sec.type]?.name}
                onChange={e => { const title = cleanSectionTitle(e.target.value); update(sec.id, { title, label: sectionLabel(sec.id, sec.type, title) }); }}
                aria-label={`${sec.label}: title`}
                style={s.inp}
              />
            </div>
          )}

          {sec.enabled && (
            <div className="qa-pair">
              <div>
                <label style={s.lbl}>Number of Questions</label>
                <NumberField
                  min={1} max={MAX_QUESTIONS_PER_SECTION}
                  value={sec.questionCount}
                  onChange={v => update(sec.id, { questionCount: v, ...(sec.answerAny ? { answerAny: Math.max(1, Math.min(Number(sec.answerAny) || 1, Number(v) || 1)) } : {}) })}
                  aria-label={`${sec.label}: number of questions`}
                  style={s.inp}
                />
              </div>
              <div>
                <label style={s.lbl}>Marks per Question</label>
                <NumberField
                  min={1} max={50}
                  value={sec.marksPerQuestion}
                  onChange={v => update(sec.id, { marksPerQuestion: v })}
                  aria-label={`${sec.label}: marks per question`}
                  style={s.inp}
                />
              </div>
            </div>
          )}

          {sec.enabled && Number(sec.questionCount) >= MAX_QUESTIONS_PER_SECTION && (
            <div style={{ fontSize: 12.5, color: "var(--amber-text,#B45309)", fontFamily: F, marginTop: 8 }}>
              Capped at {MAX_QUESTIONS_PER_SECTION} questions per section for generation quality and load time.
            </div>
          )}
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
        <select value={newType} onChange={e => setNewType(e.target.value)} aria-label="Type of section to add" disabled={!canAdd}
          style={{ ...s.sel, width: "auto", minWidth: 200, flex: "1 1 200px" }}>
          {Object.entries(SECTION_TYPES).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}
        </select>
        <button type="button" onClick={addSection} disabled={!canAdd}
          style={{ ...s.sm, height: 48, padding: "0 20px", flex: "0 0 auto", opacity: canAdd ? 1 : 0.5, cursor: canAdd ? "pointer" : "not-allowed", fontFamily: F }}>
          + Add Section {canAdd ? nextSectionId(sections) : ""}
        </button>
      </div>
      {!canAdd && (
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, marginTop: 8 }}>
          A paper can have at most {MAX_SECTIONS} sections. Remove one to add another.
        </div>
      )}

      {totalQuestions === 0 && (
        <div style={s.err}>
          <span>Enable at least one section before generating the exam.</span>
        </div>
      )}
    </div>
  );
}
