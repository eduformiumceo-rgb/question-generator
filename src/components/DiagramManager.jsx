/**
 * DiagramManager - "Diagrams & Images" review box.
 *
 * Lists every question the AI flagged as needing a figure and shows what will
 * actually print, so a wrong drawing is caught BEFORE the paper is printed:
 *   - AI-drawn diagram: shown as a preview. Keep it, edit its numbers, swap in
 *     your own picture, or fall back to a plain text box.
 *   - Needs a picture: add one (file, camera, paste, library) or draw one.
 *
 * Pictures and drawings live on the question itself (never in a table keyed by
 * question number - every section restarts at 1).
 */
import React from "react";
import QuestionImageControl, { patchQuestionImage, patchQuestionDiagram } from "./QuestionImageControl.jsx";
import { examImageChars, isSafeImageDataUrl } from "../imageUtils.js";
import { isSafeGeneratedSVG } from "../examTemplate.js";

export default function DiagramManager({ items, examData, setExamData, S, F }) {
  if (!items.length) return null;
  const total = examImageChars(examData);
  const status = (q) => {
    if (q.image && isSafeImageDataUrl(q.image.src)) return "picture";
    if (q.diagram?.generatable && q.diagram.svg && isSafeGeneratedSVG(q.diagram.svg)) return q.diagram.useDrawing === false ? "textbox" : "drawn";
    return "needs";
  };
  const needing = items.filter(({ q }) => status(q) === "needs").length;
  const tag = (txt, tone) => (
    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: F, padding: "2px 8px", borderRadius: 999, marginLeft: 8,
      background: tone === "warn" ? "var(--warn-bg, #fff4d6)" : "var(--accent-soft)", color: tone === "warn" ? "var(--warn-text, #8a5a00)" : "var(--accent)" }}>{txt}</span>
  );

  return (
    <div style={S.card}>
      <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Diagrams &amp; Images</h3>
      <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.55 }}>
        {needing
          ? `${needing} figure${needing === 1 ? "" : "s"} still need${needing === 1 ? "s" : ""} a picture. `
          : "Every figure is covered. "}
        Check each drawing below matches its question. You can fix it, replace it with your own picture, or use a plain text box. To add a picture to any other question, use Edit.
      </p>

      {items.map(({ sIdx, qIdx, section, q }) => {
        const st = status(q);
        return (
          <div key={`${section.id}:${q.number}`} data-qcard style={{ border: "1.5px solid var(--border)", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: F, marginBottom: 4 }}>
              {section.label} · Question {q.number}
              {st === "drawn" && tag("Drawn for you: please check", "info")}
              {st === "needs" && tag("Needs a picture", "warn")}
              {st === "picture" && tag("Using your picture", "info")}
              {st === "textbox" && tag("Text box", "info")}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.5, marginBottom: 8 }}>
              <strong style={{ color: "var(--text)" }}>Question:</strong> {q.text}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.5 }}>{q.diagram?.description || "Diagram required"}</div>

            {st === "drawn" && (
              <>
                <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: 8, marginTop: 10, display: "flex", justifyContent: "center", overflow: "auto" }}
                  dangerouslySetInnerHTML={{ __html: q.diagram.svg }} />
                <div style={{ marginTop: 8 }}>
                  <button type="button" style={{ ...S.sm, height: 34 }} onClick={() => patchQuestionDiagram(setExamData, sIdx, qIdx, { ...q.diagram, useDrawing: false })}>Use a text box instead</button>
                </div>
              </>
            )}
            {st === "textbox" && (
              <div style={{ marginTop: 10 }}>
                <button type="button" style={{ ...S.sm, height: 34 }} onClick={() => patchQuestionDiagram(setExamData, sIdx, qIdx, { ...q.diagram, useDrawing: true })}>Use the drawing again</button>
              </div>
            )}

            <QuestionImageControl
              question={q}
              onImage={img => patchQuestionImage(setExamData, sIdx, qIdx, img)}
              onDiagram={d => patchQuestionDiagram(setExamData, sIdx, qIdx, d)}
              otherImagesChars={total - (q.image?.src?.length || 0)}
              S={S} F={F}
            />
          </div>
        );
      })}
    </div>
  );
}
