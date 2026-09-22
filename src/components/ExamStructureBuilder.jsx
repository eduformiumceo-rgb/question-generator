/**
 * ExamStructureBuilder
 * Lets the teacher define Section A (Objective/MCQ), Section B (Structured/
 * Theory) and Section C (Essay) — each with a question count and marks per
 * question. Auto-calculates section and paper totals. Sections can be
 * removed/re-added (e.g. a Class Test may only need Section A + B).
 *
 * Reuses the exact style tokens (S, F, CSS vars) already defined in App.jsx —
 * import { S, F } from "../App.jsx"-equivalent shared style module in your
 * integration, or copy the small subset below if this file is used standalone.
 */
import React from "react";

export const DEFAULT_SECTIONS = [
  { id: "A", label: "Section A: Objective (Multiple Choice)", type: "objective", questionCount: 20, marksPerQuestion: 1, enabled: true },
  { id: "B", label: "Section B: Structured / Theory",         type: "structured", questionCount: 5,  marksPerQuestion: 10, enabled: true },
  { id: "C", label: "Section C: Essay",                       type: "essay",       questionCount: 2,  marksPerQuestion: 20, enabled: false },
];

const MAX_QUESTIONS_PER_SECTION = 60; // edge-case guard against runaway generation

export default function ExamStructureBuilder({ sections, setSections, S, F, sty, isFree = false, freeMaxTotalQuestions = 15 }) {
  const s = S || sty; // tolerate either prop name

  const update = (id, patch) => {
    setSections(prev => prev.map(sec => sec.id === id ? { ...sec, ...patch } : sec));
  };

  const totalMarks = sections
    .filter(sec => sec.enabled)
    .reduce((sum, sec) => sum + (Number(sec.questionCount) || 0) * (Number(sec.marksPerQuestion) || 0), 0);

  const totalQuestions = sections
    .filter(sec => sec.enabled)
    .reduce((sum, sec) => sum + (Number(sec.questionCount) || 0), 0);

  const perSectionMax = isFree ? Math.min(MAX_QUESTIONS_PER_SECTION, freeMaxTotalQuestions) : MAX_QUESTIONS_PER_SECTION;

  return (
    <div style={s.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>
          Exam Structure Builder
        </h3>
        <div style={{
          fontSize: 12.5, fontWeight: 700, color: "var(--accent)", fontFamily: F,
          background: "var(--accent-soft)", border: "1px solid var(--tag-border)",
          borderRadius: 99, padding: "5px 14px",
        }}>
          {totalQuestions} questions · {totalMarks} marks total
        </div>
      </div>

      {sections.map(sec => {
        const lockedForFree = isFree && sec.type === "essay";
        return (
        <div key={sec.id} style={{
          border: "1.5px solid var(--border)", borderRadius: 14, padding: "16px 18px",
          marginBottom: 12, opacity: (sec.enabled && !lockedForFree) ? 1 : 0.55, transition: "opacity .15s",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: (sec.enabled && !lockedForFree) ? 14 : 0 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: lockedForFree ? "not-allowed" : "pointer", flex: 1 }}>
              <input
                type="checkbox" checked={sec.enabled && !lockedForFree} disabled={lockedForFree}
                onChange={e => update(sec.id, { enabled: e.target.checked })}
                style={{ width: 17, height: 17, accentColor: "#0D9488", cursor: lockedForFree ? "not-allowed" : "pointer" }}
              />
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: F }}>{sec.label}</span>
              {lockedForFree && (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid var(--tag-border)", borderRadius: 99, padding: "2px 8px" }}>
                  Premium only
                </span>
              )}
            </label>
            {sec.enabled && !lockedForFree && (
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F, fontWeight: 600 }}>
                = {(Number(sec.questionCount) || 0) * (Number(sec.marksPerQuestion) || 0)} marks
              </span>
            )}
          </div>

          {sec.enabled && !lockedForFree && (
            <div className="eduq-grid-2">
              <div>
                <label style={s.lbl}>Number of Questions</label>
                <input
                  type="number" min={1} max={perSectionMax}
                  value={sec.questionCount}
                  onChange={e => {
                    let v = parseInt(e.target.value, 10);
                    if (isNaN(v)) v = 1;
                    v = Math.max(1, Math.min(perSectionMax, v));
                    update(sec.id, { questionCount: v });
                  }}
                  style={s.inp}
                />
              </div>
              <div>
                <label style={s.lbl}>Marks per Question</label>
                <input
                  type="number" min={1} max={50}
                  value={sec.marksPerQuestion}
                  onChange={e => {
                    let v = parseInt(e.target.value, 10);
                    if (isNaN(v)) v = 1;
                    v = Math.max(1, Math.min(50, v));
                    update(sec.id, { marksPerQuestion: v });
                  }}
                  style={s.inp}
                />
              </div>
            </div>
          )}

          {sec.enabled && !lockedForFree && Number(sec.questionCount) >= perSectionMax && (
            <div style={{ fontSize: 11.5, color: "var(--amber-text,#B45309)", fontFamily: F, marginTop: 8 }}>
              {isFree
                ? `Free quizzes are capped at ${freeMaxTotalQuestions} questions total. Switch to Premium for larger papers.`
                : `Capped at ${MAX_QUESTIONS_PER_SECTION} questions per section for generation quality and load time.`}
            </div>
          )}
        </div>
        );
      })}

      {totalQuestions === 0 && (
        <div style={s.err}>
          <span>⚠</span>
          <span>Enable at least one section before generating the exam.</span>
        </div>
      )}
      {isFree && totalQuestions > freeMaxTotalQuestions && (
        <div style={s.err}>
          <span>⚠</span>
          <span>Free quizzes are limited to {freeMaxTotalQuestions} questions total (currently {totalQuestions}). Reduce question counts or switch to Premium.</span>
        </div>
      )}
    </div>
  );
}
