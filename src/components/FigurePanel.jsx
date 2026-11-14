/**
 * FigurePanel - one compact, collapsed-by-default strip for ALL the paper's figures.
 *
 * It replaces the old "Diagrams & Images" box that listed every question with one
 * set of buttons (so "Q1(a) needs an image, Q1(b) needs an image" shared a single
 * button). Now:
 *   - the AI draws each figure itself right after generation (see aiFigures.js);
 *   - every figure is its own row: small preview, "Q1(a)", what it shows, status;
 *   - each row has ONE button, "Change image", that opens that figure's options
 *     (your own picture / camera / paste / library / draw a diagram / redraw with AI /
 *     plain box). Everything else stays tucked away so the page stays short.
 */
import React, { useMemo, useState } from "react";
import QuestionImageControl from "./QuestionImageControl.jsx";
import { extractFigureSlots, slotState, setSlotImage, setSlotDiagram, ownerImageOk } from "../partFigures.js";
import { examImageChars } from "../imageUtils.js";
import { isSafeGeneratedSVG } from "../examTemplate.js";

const STATUS_TEXT = { picture: "Your picture", drawn: "Drawn by AI", textbox: "Plain box", empty: "Needs a picture" };

export default function FigurePanel({ examData, setExamData, draw, S, F }) {
  const slots = useMemo(() => extractFigureSlots(examData), [examData]);
  const [open, setOpen] = useState(false);      // whole list shown?
  const [editKey, setEditKey] = useState(null);  // the one figure whose options are open
  if (!slots.length) return null;

  const stateOf = (slot) => (draw?.state?.[slot.key] === "drawing" ? "drawing" : slotState(slot));
  const counts = slots.reduce((a, s) => { const st = stateOf(s); a[st] = (a[st] || 0) + 1; return a; }, {});
  const needing = (counts.empty || 0);
  const drawingNow = counts.drawing || 0;
  const total = examImageChars(examData);

  const chip = (st) => {
    const warn = st === "empty";
    return (
      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: F, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
        background: warn ? "var(--warn-bg, #fff4d6)" : "var(--accent-soft)", color: warn ? "var(--warn-text, #8a5a00)" : "var(--accent)" }}>
        {st === "drawing" ? "Drawing…" : (STATUS_TEXT[st] || st)}
      </span>
    );
  };

  const summary = drawingNow
    ? `Drawing your figures… ${slots.length - drawingNow - needing} of ${slots.length} ready`
    : needing
      ? `${slots.length} figure${slots.length === 1 ? "" : "s"}: ${needing} still need${needing === 1 ? "s" : ""} a picture`
      : `${slots.length} figure${slots.length === 1 ? "" : "s"}, all in place`;

  const thumb = (slot) => {
    const o = slot.owner;
    const box = { width: 72, height: 54, flexShrink: 0, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" };
    if (ownerImageOk(o)) return <div style={box}><img src={o.image.src} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /></div>;
    const svg = o?.diagram?.svg;
    if (svg && isSafeGeneratedSVG(svg)) return <div style={{ ...box, padding: 2 }} dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", '<svg style="width:100%;height:100%;display:block" ') }} />;
    return <div style={{ ...box, borderStyle: "dashed", fontSize: 10, color: "var(--text-muted)", fontFamily: F }}>{draw?.state?.[slot.key] === "drawing" ? "…" : "No image"}</div>;
  };

  return (
    <div style={{ ...S.card, padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Figures</div>
          <div role="status" style={{ fontSize: 12.5, color: "var(--text-muted)", fontFamily: F, marginTop: 2 }}>{summary}</div>
        </div>
        <button type="button" style={S.sm} aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? "Hide figures" : "Review figures"}</button>
      </div>

      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {slots.map(slot => {
            const st = stateOf(slot);
            const failed = draw?.state?.[slot.key] === "failed" && st === "empty";
            const editing = editKey === slot.key;
            const o = slot.owner;
            return (
              <div key={slot.key} data-qcard style={{ border: "1.5px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {thumb(slot)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: F }}>{slot.label}</span>
                      {failed ? chip("empty") : chip(st)}
                      {failed && <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: F }}>AI couldn&apos;t draw this one</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F, lineHeight: 1.4, marginTop: 2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {slot.description || "Figure"}
                    </div>
                  </div>
                  <button type="button" style={{ ...S.sm, height: 34, flexShrink: 0 }} aria-expanded={editing} disabled={st === "drawing"}
                    onClick={() => setEditKey(editing ? null : slot.key)}>{editing ? "Done" : "Change image"}</button>
                </div>

                {editing && (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {draw?.redraw && slot.description && (
                        <button type="button" style={{ ...S.sm, height: 34 }} onClick={() => draw.redraw(slot)}>{o?.diagram?.svg ? "Redraw with AI" : "Draw with AI"}</button>
                      )}
                      {st === "drawn" && <button type="button" style={{ ...S.sm, height: 34 }} onClick={() => setSlotDiagram(setExamData, slot, { ...o.diagram, useDrawing: false })}>Use a plain box</button>}
                      {st === "textbox" && <button type="button" style={{ ...S.sm, height: 34 }} onClick={() => setSlotDiagram(setExamData, slot, { ...o.diagram, useDrawing: true })}>Use the drawing</button>}
                    </div>
                    <QuestionImageControl
                      question={{ image: o.image, diagram: o.diagram, parts: [] }}
                      onImage={img => setSlotImage(setExamData, slot, img)}
                      onDiagram={d => setSlotDiagram(setExamData, slot, d)}
                      otherImagesChars={total - (o.image?.src?.length || 0)}
                      hideNumbering={slot.kind === "part"}
                      S={S} F={F}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
