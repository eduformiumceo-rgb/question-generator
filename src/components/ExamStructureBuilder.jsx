/**
 * ExamStructureBuilder
 * Lets the teacher define Section A (Objective/MCQ), Section B (Structured/
 * Theory) and Section C (Essay) - each with a question count and marks per
 * question. Auto-calculates section and paper totals. Sections can be
 * removed/re-added (e.g. a Class Test may only need Section A + B).
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
import React from "react";
import NumberField from "./NumberField.jsx";
import CardTitle from "./CardTitle.jsx";

export const DEFAULT_SECTIONS = [
  { id: "A", label: "Section A: Objective (Multiple Choice)", type: "objective", questionCount: 20, marksPerQuestion: 1, enabled: true },
  { id: "B", label: "Section B: Structured / Theory",         type: "structured", questionCount: 5,  marksPerQuestion: 10, enabled: true },
  { id: "C", label: "Section C: Essay",                       type: "essay",       questionCount: 2,  marksPerQuestion: 20, enabled: false },
];

const MAX_QUESTIONS_PER_SECTION = 60; // edge-case guard against runaway generation

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

  const update = (id, patch) => {
    setSections(prev => prev.map(sec => sec.id === id ? { ...sec, ...patch } : sec));
  };

  const { questions: totalQuestions, marks: totalMarks } = paperTotals(sections);

  return (
    <div style={s.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}>
          <CardTitle F={F} mb={0} desc="Tick the sections this paper needs, then set how many questions and marks each has.">Exam Structure Builder</CardTitle>
        </div>
        <div className="qa-stat" style={{ fontFamily: F }}>{totalQuestions} questions · {totalMarks} marks total</div>
      </div>

      {note && <div className="qa-note" style={{ fontFamily: F, marginBottom: 14 }}>{note}</div>}

      {sections.map(sec => (
        <div key={sec.id} className="qa-inset" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: sec.enabled ? 14 : 0 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
              <input
                type="checkbox" checked={sec.enabled}
                onChange={e => update(sec.id, { enabled: e.target.checked })}
                style={{ width: 17, height: 17, accentColor: "var(--btn)", cursor: "pointer" }}
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
          </div>

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

      {totalQuestions === 0 && (
        <div style={s.err}>
          <span>Enable at least one section before generating the exam.</span>
        </div>
      )}
    </div>
  );
}
