/**
 * DiagramManager
 * Shown after generation, once the AI has flagged which questions need a
 * diagram (examData.sections[].questions[].diagram.needed). For each
 * flagged question the teacher can:
 *   - upload their own image (stored as a data URL, embedded directly into
 *     the printable HTML by examTemplate.js so it survives print/PDF)
 *   - keep the AI's text description as a clean print-friendly placeholder
 *     box (never a broken image icon)
 *
 * MAX_DIAGRAM_BYTES guards against a huge upload bloating the printable
 * page or blowing the artifact/file size budget.
 */
import React, { useRef } from "react";

const MAX_DIAGRAM_BYTES = 1.5 * 1024 * 1024; // 1.5MB per image — print-friendly, keeps PDF export fast

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function DiagramManager({ questionsNeedingDiagrams, diagramImages, setDiagramImages, S, F }) {
  const inputRefs = useRef({});

  if (!questionsNeedingDiagrams.length) return null;

  const handleUpload = async (qNum, file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file (PNG, JPG, or SVG).");
      return;
    }
    if (file.size > MAX_DIAGRAM_BYTES) {
      alert("That image is too large. Please use a file under 1.5MB so the exam stays fast to print and export.");
      return;
    }
    const dataUrl = await fileToDataURL(file);
    setDiagramImages(prev => ({ ...prev, [qNum]: dataUrl }));
  };

  return (
    <div style={S.card}>
      <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>
        Diagrams &amp; Images
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.55 }}>
        The AI flagged these questions as needing a figure. Upload your own diagram for any of them —
        otherwise a clean, print-friendly description box is used instead.
      </p>

      {questionsNeedingDiagrams.map(q => (
        <div key={q.number} style={{
          border: "1.5px solid var(--border)", borderRadius: 12, padding: "14px 16px", marginBottom: 10,
          display: "flex", gap: 14, alignItems: "flex-start",
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: F, marginBottom: 4 }}>
              Question {q.number}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.5 }}>
              {q.diagram?.description || "Diagram required"}
            </div>
          </div>

          {diagramImages[q.number] ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <img src={diagramImages[q.number]} alt={`Diagram ${q.number}`} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
              <button type="button" style={S.danger} onClick={() => setDiagramImages(prev => { const n = { ...prev }; delete n[q.number]; return n; })}>
                Remove
              </button>
            </div>
          ) : (
            <>
              <input
                ref={el => (inputRefs.current[q.number] = el)}
                type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => handleUpload(q.number, e.target.files?.[0])}
              />
              <button type="button" style={S.sm} onClick={() => inputRefs.current[q.number]?.click()}>
                Upload Image
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
