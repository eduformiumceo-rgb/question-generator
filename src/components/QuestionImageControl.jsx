/**
 * QuestionImageControl
 * Everything a teacher needs to put a figure on ONE question, used both in the
 * preview editor (ExamEditor) and in the Diagrams & Images box:
 *
 *   Add image / Take photo / Paste / From library   -> bring a picture in
 *   Draw diagram                                    -> exact template diagrams
 *   Edit                                            -> crop, rotate, clean up
 *   Size, alignment, placement, caption, "Figure N" -> layout
 *   Save to library                                 -> reuse it in any exam
 *
 * Pictures are shrunk and compressed on the device before they touch the exam,
 * so a 6 MB phone photo becomes a print-sized ~150 KB image.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  IMAGE_SIZES, MAX_CAPTION_LENGTH, MAX_EXAM_IMAGE_CHARS, MAX_RAW_IMAGE_BYTES,
  compressImageFile, clipboardImageFile, imageSizeKey, isSafeImageDataUrl,
} from "../imageUtils.js";
import { IMAGE_ALIGNS, imageAlign, imagePlacement } from "../examFigures.js";
import { loadLibrary, addToLibrary, removeFromLibrary } from "../figureLibrary.js";
import ImageEditor from "./ImageEditor.jsx";
import DiagramBuilder from "./DiagramBuilder.jsx";
import { templateById } from "../diagramRegistry.js";

/** Immutably change one question inside the exam. `fn` gets the question and returns the new one. */
function patchQuestion(setExamData, sectionIdx, qIdx, fn) {
  setExamData(prev => ({
    ...prev,
    sections: prev.sections.map((s, si) => (si !== sectionIdx ? s : { ...s, questions: s.questions.map((q, qi) => (qi !== qIdx ? q : fn(q))) })),
  }));
}

/** Set (or clear, when image is null) the picture on one question. */
export function patchQuestionImage(setExamData, sectionIdx, qIdx, image) {
  patchQuestion(setExamData, sectionIdx, qIdx, q => {
    if (image) return { ...q, image };
    const { image: _drop, ...rest } = q; // eslint-disable-line no-unused-vars
    return rest;
  });
}

/** Set (or clear, when diagram is null) the diagram on one question. */
export function patchQuestionDiagram(setExamData, sectionIdx, qIdx, diagram) {
  patchQuestion(setExamData, sectionIdx, qIdx, q => ({ ...q, diagram: diagram || null }));
}

const kb = (chars) => Math.round((chars * 0.75) / 1024);

export default function QuestionImageControl({ question, onImage, onDiagram, otherImagesChars = 0, hideNumbering = false, S, F }) {
  const image = question?.image;
  const diagram = question?.diagram;
  const parts = Array.isArray(question?.parts) ? question.parts : [];
  const rootRef = useRef(null);
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [panel, setPanel] = useState(null); // "library" | "diagram" | null
  const [editing, setEditing] = useState(false);
  const [library, setLibrary] = useState([]);

  const hasImage = !!(image && isSafeImageDataUrl(image.src));
  const isTouch = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
  const canReadClipboard = typeof navigator !== "undefined" && !!navigator.clipboard?.read;
  const hasTemplate = !!(diagram?.template && templateById(diagram.template) && diagram.svg);

  /** Accepts a finished data URL: checks the exam's picture budget, then stores it on the question. */
  const accept = useCallback((src, keep = {}) => {
    if (otherImagesChars + src.length > MAX_EXAM_IMAGE_CHARS) {
      setError(`This exam already has about ${kb(otherImagesChars)} KB of pictures. The limit is ${kb(MAX_EXAM_IMAGE_CHARS)} KB so exams stay quick to open and save. Remove another picture first.`);
      return false;
    }
    setError("");
    onImage({ src, size: imageSizeKey(image), caption: image?.caption || "", align: imageAlign(image), autoNumber: image ? !!image.autoNumber : !hideNumbering, ...keep });
    return true;
  }, [image, onImage, otherImagesChars]);

  const addFile = useCallback(async (file) => {
    if (!file) return;
    setError(""); setNotice("");
    if (!file.type.startsWith("image/")) { setError("Please choose an image file (JPG, PNG, WebP or SVG)."); return; }
    if (file.size > MAX_RAW_IMAGE_BYTES) { setError("That file is over 25 MB. Please choose a smaller picture."); return; }
    setBusy(true);
    try { accept(await compressImageFile(file)); setPanel(null); }
    catch (e) { setError(e?.message || "Couldn't use that image. Please try another one."); }
    finally { setBusy(false); }
  }, [accept]);

  // Ctrl/Cmd+V anywhere in this question's card. Plain text pastes are left alone.
  const addFileRef = useRef(addFile);
  useEffect(() => { addFileRef.current = addFile; }, [addFile]);
  useEffect(() => {
    const card = rootRef.current?.closest("[data-qcard]");
    if (!card) return undefined;
    const onPaste = (e) => { const f = clipboardImageFile(e); if (f) { e.preventDefault(); addFileRef.current(f); } };
    card.addEventListener("paste", onPaste);
    return () => card.removeEventListener("paste", onPaste);
  }, []);

  const pasteFromClipboard = async () => {
    setError(""); setNotice("");
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find(t => t.startsWith("image/"));
        if (type) { await addFile(new File([await item.getType(type)], "pasted-image", { type })); return; }
      }
      setError("There's no image on the clipboard. Copy a picture or take a screenshot first.");
    } catch { setError("Couldn't read the clipboard. Tap into this question and press Ctrl/Cmd+V instead."); }
  };

  const openLibrary = () => { setLibrary(loadLibrary()); setPanel(p => (p === "library" ? null : "library")); };
  const saveToLibrary = () => {
    const r = addToLibrary({ name: image.caption || "Saved figure", src: image.src });
    setError(r.ok ? "" : r.error);
    setNotice(r.ok ? `Saved to your library${r.dropped ? ` (${r.dropped} oldest removed to make room)` : ""}.` : "");
    setLibrary(r.items);
  };

  const pick = (ref) => () => ref.current?.click();
  const onPicked = (e) => { const f = e.target.files?.[0]; e.target.value = ""; addFile(f); };
  const set = (patch) => onImage({ ...image, ...patch });
  const pill = (on) => ({ ...S.sm, height: 34, padding: "0 12px", ...(on ? { borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-soft)", fontWeight: 700 } : {}) });
  const small = { ...S.sm, height: 34 };
  const hint = { fontSize: 12, color: "var(--text-muted)", fontFamily: F };
  const placement = imagePlacement(question);

  return (
    <div ref={rootRef} style={{ marginTop: 10 }}>
      <input ref={galleryRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPicked} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPicked} />

      {!hasImage && hasTemplate && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
          <div aria-label="Drawn diagram preview" style={{ width: 150, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: 4, overflow: "hidden", flexShrink: 0 }}
            dangerouslySetInnerHTML={{ __html: diagram.svg.replace("<svg ", '<svg style="width:100%;height:auto;display:block" ') }} />
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: F }}>{templateById(diagram.template).label} (drawn to scale)</span>
        </div>
      )}
      {!hasImage && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={S.sm} disabled={busy} onClick={pick(galleryRef)}>{busy ? "Preparing image…" : "Add image"}</button>
          {isTouch && <button type="button" style={S.sm} disabled={busy} onClick={pick(cameraRef)}>Take photo</button>}
          {canReadClipboard && <button type="button" style={S.sm} disabled={busy} onClick={pasteFromClipboard}>Paste</button>}
          <button type="button" style={S.sm} disabled={busy} onClick={openLibrary}>From library</button>
          {onDiagram && <button type="button" style={S.sm} disabled={busy} onClick={() => setPanel(p => (p === "diagram" ? null : "diagram"))}>{hasTemplate ? "Edit diagram" : "Draw diagram"}</button>}
          {onDiagram && hasTemplate && <button type="button" style={{ ...S.danger, height: 34 }} onClick={() => { setPanel(null); onDiagram(null); }}>Remove diagram</button>}
        </div>
      )}

      {hasImage && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <img src={image.src} alt="Question figure" style={{ width: 84, height: 84, objectFit: "contain", background: "#fff", borderRadius: 8, border: "1px solid var(--border)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
              <span style={hint}>Size</span>
              {Object.entries(IMAGE_SIZES).map(([key, s]) => <button key={key} type="button" aria-pressed={imageSizeKey(image) === key} style={pill(imageSizeKey(image) === key)} onClick={() => set({ size: key })}>{s.label}</button>)}
              <span style={{ ...hint, marginLeft: 6 }}>Position</span>
              {IMAGE_ALIGNS.map(a => <button key={a} type="button" aria-pressed={imageAlign(image) === a} style={pill(imageAlign(image) === a)} onClick={() => set({ align: a })}>{a[0].toUpperCase() + a.slice(1)}</button>)}
            </div>
            {parts.length > 0 && (
              <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={hint}>Place</span>
                <select aria-label="Where to place the picture" style={{ ...S.inp, height: 34, minHeight: 34, width: "auto", fontSize: 13, padding: "0 10px" }}
                  value={placement} onChange={e => { const v = Number(e.target.value); const { afterPart: _a, ...rest } = image; onImage(v >= 0 ? { ...rest, afterPart: v } : rest); }}>
                  <option value={-1}>Under the question text</option>
                  {parts.map((p, i) => <option key={i} value={i}>Under part ({p.label})</option>)}
                </select>
              </div>
            )}
            <input value={image.caption || ""} maxLength={MAX_CAPTION_LENGTH} onChange={e => set({ caption: e.target.value })} placeholder="Caption (optional), e.g. Map of Ghana" aria-label="Image caption"
              style={{ ...S.inp, height: 38, minHeight: 38, fontSize: 13, padding: "0 12px" }} />
            {!hideNumbering && (
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, ...hint }}>
                <input type="checkbox" checked={!!image.autoNumber} onChange={e => set({ autoNumber: e.target.checked })} /> Label as “Figure 1, 2, 3…” automatically (numbered in paper order)
              </label>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
              <button type="button" style={small} disabled={busy} onClick={() => setEditing(true)}>Crop / rotate</button>
              <button type="button" style={small} disabled={busy} onClick={pick(galleryRef)}>Replace</button>
              {isTouch && <button type="button" style={small} disabled={busy} onClick={pick(cameraRef)}>Retake</button>}
              <button type="button" style={small} onClick={saveToLibrary}>Save to library</button>
              <button type="button" style={{ ...S.danger, height: 34 }} onClick={() => { setError(""); setNotice(""); onImage(null); }}>Remove</button>
              <span style={hint}>{kb(image.src.length)} KB</span>
            </div>
          </div>
        </div>
      )}

      {hasTemplate && hasImage && onDiagram && <div style={{ ...hint, marginTop: 6 }}>A drawn diagram is also set on this question; your picture is printed instead.</div>}

      {panel === "library" && (
        <div style={{ marginTop: 10, border: "1.5px solid var(--border)", borderRadius: 12, padding: 12 }}>
          <div style={{ ...hint, marginBottom: 8 }}>{library.length ? "Tap a figure to use it here." : "Your library is empty. Add a picture to a question, then choose “Save to library” to keep it for every future exam. The library is stored in this browser."}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
            {library.map(item => (
              <div key={item.id} style={{ position: "relative" }}>
                <button type="button" onClick={() => { if (accept(item.src)) setPanel(null); }} title={item.name} style={{ width: "100%", padding: 4, border: "1px solid var(--border)", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
                  <img src={item.src} alt={item.name} style={{ width: "100%", height: 72, objectFit: "contain", display: "block" }} />
                  <div style={{ fontSize: 11, color: "#444", fontFamily: F, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{item.name}</div>
                </button>
                <button type="button" aria-label={`Delete ${item.name} from library`} onClick={() => setLibrary(removeFromLibrary(item.id))}
                  style={{ position: "absolute", top: 2, right: 2, width: 22, height: 22, borderRadius: 11, border: "1px solid #999", background: "#fff", cursor: "pointer", fontSize: 12, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {panel === "diagram" && onDiagram && (
        <DiagramBuilder
          initial={hasTemplate ? diagram : null}
          S={S} F={F}
          onCancel={() => setPanel(null)}
          onUse={({ template, params, svg }) => {
            onDiagram({ ...(diagram || {}), needed: true, description: diagram?.description || templateById(template).label, generatable: true, template, params, svg, useDrawing: true });
            setPanel(null);
          }}
        />
      )}

      {editing && hasImage && (
        <ImageEditor src={image.src} S={S} F={F} onCancel={() => setEditing(false)}
          onApply={(src) => { if (accept(src, { size: imageSizeKey(image), caption: image.caption || "", align: imageAlign(image), autoNumber: !!image.autoNumber, ...(Number.isInteger(image.afterPart) ? { afterPart: image.afterPart } : {}) })) setEditing(false); }} />
      )}

      {notice && <div role="status" style={{ marginTop: 8, fontSize: 12.5, color: "var(--ok-text, #166534)", fontFamily: F }}>{notice}</div>}
      {error && <div role="alert" style={{ marginTop: 8, fontSize: 12.5, color: "var(--err-text)", fontFamily: F, lineHeight: 1.45 }}>{error}</div>}
    </div>
  );
}
