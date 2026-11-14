/**
 * ImageEditor - crop, rotate and clean up a picture before it goes on a paper.
 * Works with touch as well as mouse: drag on the picture to choose the part to
 * keep. Nothing is saved until the teacher taps Apply.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { dataUrlToCanvas, rotateCanvas, cropCanvas, enhanceCanvas, compressCanvas, cropFractions } from "../imageUtils.js";

export default function ImageEditor({ src, onApply, onCancel, S, F }) {
  const originalRef = useRef(null);
  const workRef = useRef(null);
  const viewRef = useRef(null);
  const boxRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [crop, setCrop] = useState(null);       // fractions of the picture, or null
  const [drag, setDrag] = useState(null);       // {x0,y0,x1,y1} in pixels while dragging
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const paint = useCallback(() => {
    const work = workRef.current, view = viewRef.current;
    if (!work || !view) return;
    view.width = work.width; view.height = work.height;
    view.getContext("2d").drawImage(work, 0, 0);
  }, []);

  useEffect(() => {
    let alive = true;
    dataUrlToCanvas(src).then(c => {
      if (!alive) return;
      originalRef.current = c; workRef.current = c; setReady(true);
    }).catch(() => alive && setError("Couldn't open that picture."));
    return () => { alive = false; };
  }, [src]);
  useEffect(() => { if (ready) paint(); }, [ready, paint]);

  const change = (fn) => { workRef.current = fn(workRef.current); setCrop(null); paint(); };
  const reset = () => { workRef.current = originalRef.current; setCrop(null); paint(); };

  const point = (e) => { const r = boxRef.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, r.width, r.height]; };
  const down = (e) => { const [x, y] = point(e); e.currentTarget.setPointerCapture?.(e.pointerId); setDrag({ x0: x, y0: y, x1: x, y1: y }); setCrop(null); };
  const move = (e) => { if (!drag) return; const [x, y] = point(e); setDrag(d => ({ ...d, x1: x, y1: y })); };
  const up = () => {
    if (!drag) return;
    const r = boxRef.current.getBoundingClientRect();
    setCrop(cropFractions(drag.x0, drag.y0, drag.x1, drag.y1, r.width, r.height));
    setDrag(null);
  };

  const apply = async () => {
    setBusy(true);
    try {
      let c = workRef.current;
      if (crop) c = cropCanvas(c, crop);
      onApply(compressCanvas(c));
    } catch { setError("Couldn't process that picture."); setBusy(false); }
  };

  const showRect = drag
    ? { l: Math.min(drag.x0, drag.x1), t: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) }
    : crop && boxRef.current
      ? { l: crop.x * boxRef.current.clientWidth, t: crop.y * boxRef.current.clientHeight, w: crop.w * boxRef.current.clientWidth, h: crop.h * boxRef.current.clientHeight }
      : null;
  const btn = { ...S.sm, height: 38 };

  return (
    <div role="dialog" aria-modal="true" aria-label="Edit picture" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div style={{ background: "var(--card, #fff)", borderRadius: 14, padding: 16, width: "min(720px, 100%)", maxHeight: "96vh", overflow: "auto" }}>
        <div style={{ fontFamily: F, fontWeight: 700, fontSize: 16, marginBottom: 4, color: "var(--text)" }}>Edit picture</div>
        <div style={{ fontFamily: F, fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10 }}>Drag on the picture to choose the part to keep.</div>

        <div style={{ display: "flex", justifyContent: "center", background: "#e9e9ec", borderRadius: 10, padding: 8 }}>
          <div ref={boxRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            style={{ position: "relative", display: "inline-block", touchAction: "none", cursor: "crosshair", lineHeight: 0, userSelect: "none" }}>
            <canvas ref={viewRef} style={{ maxWidth: "100%", maxHeight: "52vh", display: "block", background: "#fff" }} />
            {showRect && <div style={{ position: "absolute", left: showRect.l, top: showRect.t, width: showRect.w, height: showRect.h, border: "2px solid #fff", outline: "1px solid #000", boxShadow: "0 0 0 9999px rgba(0,0,0,.45)", pointerEvents: "none" }} />}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" style={btn} disabled={!ready} onClick={() => change(c => rotateCanvas(c, -90))}>Rotate left</button>
          <button type="button" style={btn} disabled={!ready} onClick={() => change(c => rotateCanvas(c, 90))}>Rotate right</button>
          <button type="button" style={btn} disabled={!ready} onClick={() => change(enhanceCanvas)} title="Whitens the paper and darkens the ink. Best for photos of book pages.">Clean up scan</button>
          {crop && <button type="button" style={btn} onClick={() => setCrop(null)}>Clear crop</button>}
          <button type="button" style={btn} disabled={!ready} onClick={reset}>Start over</button>
        </div>
        {error && <div role="alert" style={{ marginTop: 8, fontSize: 12.5, color: "var(--err-text)", fontFamily: F }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" style={btn} onClick={onCancel}>Cancel</button>
          <button type="button" style={{ ...btn, background: "var(--accent)", borderColor: "var(--accent)", color: "#fff", fontWeight: 700 }} disabled={!ready || busy} onClick={apply}>{busy ? "Working…" : "Apply"}</button>
        </div>
      </div>
    </div>
  );
}
