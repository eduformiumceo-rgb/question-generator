/**
 * ExamEditor
 * Inline, structured editing of a generated exam — every question's text,
 * marks, MCQ options/correct answer, and marking guide are editable, and
 * every edit writes straight back into examData. Because print, PDF, Word
 * export, and Share all read from that same examData, an edit here
 * immediately flows into every export format — there's no separate
 * "editable copy" to keep in sync.
 *
 * Deliberately a structured editor, not a freeform drag/resize canvas:
 * real exam-editing tools (Word, Google Docs, every mock-exam vendor) work
 * as an editable DOCUMENT — fix wording, adjust a mark, swap a distractor —
 * not a design canvas with repositionable elements. A freeform canvas would
 * be solving a problem teachers don't actually have here.
 */
import React from "react";

export default function ExamEditor({ examData, setExamData, S, F }) {
  const updateQuestion = (sectionIdx, qIdx, patch) => {
    setExamData(prev => {
      const next = { ...prev, sections: prev.sections.map((s, si) => {
        if (si !== sectionIdx) return s;
        return { ...s, questions: s.questions.map((q, qi) => qi === qIdx ? { ...q, ...patch } : q) };
      }) };
      // Keep the top-level answerKey in sync if an objective question's
      // correct option changed — the print/PDF/Word answer-key page reads
      // from examData.answerKey, not from re-deriving it on the fly.
      const objSection = next.sections.find(s => s.id === next.sections[sectionIdx].id);
      if (objSection?.type === "objective") {
        next.answerKey = next.answerKey.filter(k => !objSection.questions.some(q => q.number === k.number));
        objSection.questions.forEach(q => { if (q.correctOption) next.answerKey.push({ number: q.number, answer: q.correctOption }); });
        next.answerKey.sort((a, b) => a.number - b.number);
      }
      return next;
    });
  };

  const updatePart = (sectionIdx, qIdx, partIdx, patch) => {
    setExamData(prev => ({
      ...prev, sections: prev.sections.map((s, si) => {
        if (si !== sectionIdx) return s;
        return { ...s, questions: s.questions.map((q, qi) => {
          if (qi !== qIdx) return q;
          return { ...q, parts: q.parts.map((p, pi) => pi === partIdx ? { ...p, ...patch } : p) };
        }) };
      }),
    }));
  };

  return (
    <div style={S.card}>
      <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Edit Exam</h3>
      <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.5 }}>
        Edit wording, marks, or options directly — every change here updates the print, PDF, Word, and share output immediately.
      </p>

      {examData.sections.map((section, sIdx) => (
        <div key={section.id} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: F, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.03em" }}>
            {section.label}
          </div>

          {section.questions.map((q, qIdx) => (
            <div key={q.number} style={{ border: "1.5px solid var(--border)", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-muted)", fontFamily: F, paddingTop: 8 }}>{q.number}.</span>
                <textarea
                  value={q.text}
                  onChange={e => updateQuestion(sIdx, qIdx, { text: e.target.value })}
                  rows={2}
                  style={{ ...S.inp, flex: 1, resize: "vertical", fontFamily: F, lineHeight: 1.5 }}
                />
                {!q.parts?.length && (
                  <div>
                    <label style={{ ...S.lbl, marginBottom: 3 }}>Marks</label>
                    <input
                      type="number" min={1} value={q.marks}
                      onChange={e => updateQuestion(sIdx, qIdx, { marks: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                      style={{ ...S.inp, width: 64 }}
                    />
                  </div>
                )}
              </div>

              {Array.isArray(q.options) && q.options.length > 0 && (
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {q.options.map((opt, oIdx) => {
                    const letter = ["A", "B", "C", "D", "E", "F"][oIdx];
                    const isCorrect = q.correctOption === letter;
                    return (
                      <div key={oIdx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button
                          type="button" title="Mark as correct answer"
                          onClick={() => updateQuestion(sIdx, qIdx, { correctOption: letter })}
                          style={{
                            width: 22, height: 22, borderRadius: "50%", flexShrink: 0, cursor: "pointer", fontSize: 11, fontWeight: 700,
                            border: `1.5px solid ${isCorrect ? "#0D9488" : "var(--border-strong)"}`,
                            background: isCorrect ? "#0D9488" : "transparent", color: isCorrect ? "#fff" : "var(--text-muted)",
                          }}
                        >{letter}</button>
                        <input
                          value={opt}
                          onChange={e => updateQuestion(sIdx, qIdx, { options: q.options.map((o, i) => i === oIdx ? e.target.value : o) })}
                          style={{ ...S.inp, flex: 1, height: 36, fontSize: 13 }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {Array.isArray(q.parts) && q.parts.length > 0 && (
                <div style={{ marginTop: 10, marginLeft: 18 }}>
                  {q.parts.map((p, pIdx) => (
                    <div key={pIdx} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, paddingTop: 8 }}>({p.label})</span>
                      <textarea
                        value={p.text} rows={1}
                        onChange={e => updatePart(sIdx, qIdx, pIdx, { text: e.target.value })}
                        style={{ ...S.inp, flex: 1, fontSize: 13, resize: "vertical", fontFamily: F }}
                      />
                      <input
                        type="number" min={1} value={p.marks}
                        onChange={e => updatePart(sIdx, qIdx, pIdx, { marks: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        style={{ ...S.inp, width: 56, height: 36, fontSize: 13 }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {q.markingGuide != null && q.markingGuide !== "" && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ ...S.lbl, marginBottom: 3 }}>Marking Guide</label>
                  <textarea
                    value={q.markingGuide} rows={2}
                    onChange={e => updateQuestion(sIdx, qIdx, { markingGuide: e.target.value })}
                    style={{ ...S.inp, width: "100%", fontSize: 12.5, resize: "vertical", fontFamily: F, lineHeight: 1.5, boxSizing: "border-box" }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
