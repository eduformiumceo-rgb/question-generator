/**
 * DiagramManager
 * Shown after generation, once the AI has flagged which questions need a
 * figure (examData.sections[].questions[].diagram.needed) but couldn't draw
 * it. Each flagged question gets the same image control used in the editor:
 * upload, camera, paste, size and caption.
 *
 * The picture is stored on the question itself (question.image), never in a
 * side table keyed by question number - every section restarts at 1, so a
 * number-keyed table put one picture on several questions.
 */
import React from "react";
import QuestionImageControl, { patchQuestionImage } from "./QuestionImageControl.jsx";
import { examImageChars } from "../imageUtils.js";

export default function DiagramManager({ items, examData, setExamData, S, F }) {
  if (!items.length) return null;
  const total = examImageChars(examData);

  return (
    <div style={S.card}>
      <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>
        Diagrams &amp; Images
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.55 }}>
        The AI flagged these questions as needing a figure. Add a picture for any of them: choose a file, take a photo, or paste a screenshot.
        Otherwise a clean, print-friendly description box is used instead. You can add a picture to any other question from Edit.
      </p>

      {items.map(({ sIdx, qIdx, section, q }) => (
        <div key={`${section.id}:${q.number}`} data-qcard style={{
          border: "1.5px solid var(--border)", borderRadius: 12, padding: "14px 16px", marginBottom: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: F, marginBottom: 4 }}>
            {section.label} · Question {q.number}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.5 }}>
            {q.diagram?.description || "Diagram required"}
          </div>
          <QuestionImageControl
            image={q.image}
            onChange={img => patchQuestionImage(setExamData, sIdx, qIdx, img)}
            otherImagesChars={total - (q.image?.src?.length || 0)}
            S={S} F={F}
          />
        </div>
      ))}
    </div>
  );
}
