/**
 * ShadingPreview - on-screen preview of the shading (answer) sheet before it is printed.
 * The sheet HTML is rendered in a sandboxed iframe at its true A4-landscape size and scaled to fit
 * the window, so what the teacher sees is exactly what the printer receives. Style and colour can be
 * switched here and the preview updates at once; Print uses the iframe's own @page rules.
 */
import React, { useEffect, useRef, useState } from "react";

const PAGE_W_PX = 1123; // A4 landscape at 96 dpi (297 mm)
const ZOOMS = [1, 1.5, 2, 3];
const WRAP_PAD = 12;

export default function ShadingPreview({ html, style, onStyle, colourMode, onColourMode, questions, onClose, S, F }) {
  const frameRef = useRef(null);
  const wrapRef = useRef(null);
  const [fit, setFit] = useState(0.8);
  const [zoomIdx, setZoomIdx] = useState(0);
  const scale = fit * ZOOMS[zoomIdx];
  const [frameH, setFrameH] = useState(794);
  const [ready, setReady] = useState(false);

  // Escape closes the preview.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fit the A4 page to the available width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const calc = () => setFit(Math.max(0.2, Math.min(1.25, (el.clientWidth - 2 * WRAP_PAD - 2) / PAGE_W_PX)));
    calc();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(calc) : null;
    if (ro) ro.observe(el);
    window.addEventListener("resize", calc);
    return () => { if (ro) ro.disconnect(); window.removeEventListener("resize", calc); };
  }, []);

  useEffect(() => { setReady(false); }, [html]);

  const measure = () => {
    try {
      const d = frameRef.current && frameRef.current.contentDocument;
      if (d) setFrameH(Math.max(794, d.documentElement.scrollHeight));
    } catch { /* same-origin srcdoc; ignore */ }
    setReady(true);
  };

  const print = () => {
    const w = frameRef.current && frameRef.current.contentWindow;
    if (w) { w.focus(); w.print(); }
  };

  const chip = (active) => ({ ...S.sm, height: 36, fontWeight: active ? 700 : 500, borderColor: active ? "var(--accent)" : undefined, color: active ? "var(--accent)" : undefined });

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}
      onClick={onClose} role="presentation"
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby="shade-prev-title" onClick={e => e.stopPropagation()}
        style={{ background: "var(--card-bg)", borderRadius: 14, width: "100%", maxWidth: 1180, maxHeight: "100%", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,.35)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 48px 12px 16px", borderBottom: "1px solid var(--border-strong)", position: "relative" }}>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <h3 id="shade-prev-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Shading sheet preview</h3>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F }}>{questions} questions · A4 landscape · prints two sheets per page, cut along the dashed line</div>
          </div>
          <div role="group" aria-label="Sheet style" style={{ display: "flex", gap: 6 }}>
            <button type="button" style={chip(style === "bece")} aria-pressed={style === "bece"} onClick={() => onStyle("bece")}>BECE-type</button>
            <button type="button" style={chip(style === "wassce")} aria-pressed={style === "wassce"} onClick={() => onStyle("wassce")}>WASSCE-type</button>
          </div>
          <div role="group" aria-label="Print colour" style={{ display: "flex", gap: 6 }}>
            <button type="button" style={chip(colourMode === "school")} aria-pressed={colourMode === "school"} onClick={() => onColourMode("school")}>School colours</button>
            <button type="button" style={chip(colourMode === "mono")} aria-pressed={colourMode === "mono"} onClick={() => onColourMode("mono")}>Black &amp; white</button>
          </div>
          <button type="button" style={{ ...S.btn, height: 40, padding: "0 18px" }} onClick={print} disabled={!ready}>Print</button>
          <button type="button" onClick={onClose} aria-label="Close preview" style={{ position: "absolute", top: 8, right: 10, width: 36, height: 36, background: "none", border: "none", fontSize: 26, cursor: "pointer", color: "var(--text-muted)", lineHeight: 1 }}>×</button>
        </div>

        <div ref={wrapRef} style={{ overflow: "auto", background: "#d9dce1", padding: WRAP_PAD, flex: 1, minHeight: 0 }}>
          <div style={{ width: PAGE_W_PX * scale, height: frameH * scale, margin: "0 auto", position: "relative" }}>
            <iframe
              ref={frameRef} title="Shading sheet preview" srcDoc={html} onLoad={measure} sandbox="allow-same-origin allow-modals"
              style={{ width: PAGE_W_PX, height: frameH, border: 0, background: "#fff", transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", left: 0, top: 0, boxShadow: "0 2px 12px rgba(0,0,0,.25)" }}
            />
          </div>
        </div>

        <div style={{ padding: "8px 16px", fontSize: 12, color: "var(--text-muted)", fontFamily: F, borderTop: "1px solid var(--border-strong)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px" }}>In the print dialog choose <b>A4, Landscape, Margins: None, Scale: 100%</b>. Everything on the sheet, including the timing marks, stays inside the area ordinary office printers can print.</div>
          <div role="group" aria-label="Zoom" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button type="button" style={{ ...S.sm, height: 34, minWidth: 34 }} aria-label="Zoom out" disabled={zoomIdx === 0} onClick={() => setZoomIdx(i => Math.max(0, i - 1))}>−</button>
            <span style={{ minWidth: 44, textAlign: "center", fontWeight: 600 }}>{Math.round(ZOOMS[zoomIdx] * 100)}%</span>
            <button type="button" style={{ ...S.sm, height: 34, minWidth: 34 }} aria-label="Zoom in" disabled={zoomIdx === ZOOMS.length - 1} onClick={() => setZoomIdx(i => Math.min(ZOOMS.length - 1, i + 1))}>+</button>
          </div>
        </div>
      </div>
    </div>
  );
}
