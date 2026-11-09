/**
 * QuestionImageControl
 * One reusable "add a picture to this question" control, used both in the
 * preview editor (ExamEditor) and in the Diagrams & Images box.
 *
 *   - Add image      -> file picker / photo gallery
 *   - Take photo     -> phone camera (only offered on touch devices)
 *   - Paste          -> button (where the browser allows it) AND plain Ctrl/Cmd+V
 *                       anywhere inside the question's card
 *   - Size + caption -> small / medium / large and a "Figure 1" style caption
 *
 * Pictures are shrunk and compressed on the device before they touch the exam,
 * so a 6 MB phone photo becomes a print-sized ~150 KB image.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  IMAGE_SIZES, MAX_CAPTION_LENGTH, MAX_EXAM_IMAGE_CHARS, MAX_RAW_IMAGE_BYTES,
  compressImageFile, clipboardImageFile, imageSizeKey, isSafeImageDataUrl,
} from "../imageUtils.js";

/** Immutably set (or clear, when image is null) the image on one question. */
export function patchQuestionImage(setExamData, sectionIdx, qIdx, image) {
  setExamData(prev => ({
    ...prev,
    sections: prev.sections.map((s, si) => {
      if (si !== sectionIdx) return s;
      return {
        ...s,
        questions: s.questions.map((q, qi) => {
          if (qi !== qIdx) return q;
          if (image) return { ...q, image };
          const { image: _drop, ...rest } = q; // eslint-disable-line no-unused-vars
          return rest;
        }),
      };
    }),
  }));
}

const kb = (chars) => Math.round((chars * 0.75) / 1024);

export default function QuestionImageControl({ image, onChange, otherImagesChars = 0, S, F }) {
  const rootRef = useRef(null);
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const hasImage = !!(image && isSafeImageDataUrl(image.src));
  const isTouch = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
  const canReadClipboard = typeof navigator !== "undefined" && !!navigator.clipboard?.read;

  const addFile = useCallback(async (file) => {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) { setError("Please choose an image file (JPG, PNG, WebP or SVG)."); return; }
    if (file.size > MAX_RAW_IMAGE_BYTES) { setError("That file is over 25 MB. Please choose a smaller picture."); return; }
    setBusy(true);
    try {
      const src = await compressImageFile(file);
      if (otherImagesChars + src.length > MAX_EXAM_IMAGE_CHARS) {
        setError(`This exam already has about ${kb(otherImagesChars)} KB of pictures. The limit is ${kb(MAX_EXAM_IMAGE_CHARS)} KB so exams stay quick to open and save. Remove another picture first.`);
        return;
      }
      onChange({ src, size: imageSizeKey(image), caption: image?.caption || "" });
    } catch (e) {
      setError(e?.message || "Couldn't use that image. Please try another one.");
    } finally {
      setBusy(false);
    }
  }, [image, onChange, otherImagesChars]);

  // Ctrl/Cmd+V anywhere in this question's card. Plain text pastes are left alone.
  const addFileRef = useRef(addFile);
  useEffect(() => { addFileRef.current = addFile; }, [addFile]);
  useEffect(() => {
    const card = rootRef.current?.closest("[data-qcard]");
    if (!card) return undefined;
    const onPaste = (e) => {
      const file = clipboardImageFile(e);
      if (!file) return;
      e.preventDefault();
      addFileRef.current(file);
    };
    card.addEventListener("paste", onPaste);
    return () => card.removeEventListener("paste", onPaste);
  }, []);

  const pasteFromClipboard = async () => {
    setError("");
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(t => t.startsWith("image/"));
        if (type) { await addFile(new File([await item.getType(type)], "pasted-image", { type })); return; }
      }
      setError("There's no image on the clipboard. Copy a picture or take a screenshot first.");
    } catch {
      setError("Couldn't read the clipboard. Tap into this question and press Ctrl/Cmd+V instead.");
    }
  };

  const pick = (ref) => () => ref.current?.click();
  const onPicked = (e) => { const f = e.target.files?.[0]; e.target.value = ""; addFile(f); };
  const set = (patch) => onChange({ ...image, ...patch });

  const hiddenInputs = (
    <>
      <input ref={galleryRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPicked} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPicked} />
    </>
  );

  return (
    <div ref={rootRef} style={{ marginTop: 10 }}>
      {hiddenInputs}

      {!hasImage ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={S.sm} disabled={busy} onClick={pick(galleryRef)}>
            {busy ? "Preparing image…" : "Add image"}
          </button>
          {isTouch && <button type="button" style={S.sm} disabled={busy} onClick={pick(cameraRef)}>Take photo</button>}
          {canReadClipboard && <button type="button" style={S.sm} disabled={busy} onClick={pasteFromClipboard}>Paste</button>}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <img
            src={image.src} alt="Question figure"
            style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)", flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {Object.entries(IMAGE_SIZES).map(([key, s]) => {
                const on = imageSizeKey(image) === key;
                return (
                  <button
                    key={key} type="button" onClick={() => set({ size: key })} aria-pressed={on}
                    style={{ ...S.sm, height: 34, padding: "0 14px", ...(on ? { borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-soft)", fontWeight: 700 } : {}) }}
                  >{s.label}</button>
                );
              })}
            </div>
            <input
              value={image.caption || ""} maxLength={MAX_CAPTION_LENGTH}
              onChange={e => set({ caption: e.target.value })}
              placeholder="Caption, e.g. Figure 1"
              aria-label="Image caption"
              style={{ ...S.inp, height: 38, minHeight: 38, fontSize: 13, padding: "0 12px" }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
              <button type="button" style={{ ...S.sm, height: 34 }} disabled={busy} onClick={pick(galleryRef)}>{busy ? "Preparing…" : "Replace"}</button>
              {isTouch && <button type="button" style={{ ...S.sm, height: 34 }} disabled={busy} onClick={pick(cameraRef)}>Retake</button>}
              <button type="button" style={{ ...S.danger, height: 34 }} onClick={() => { setError(""); onChange(null); }}>Remove</button>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: F }}>{kb(image.src.length)} KB</span>
            </div>
          </div>
        </div>
      )}

      {error && <div role="alert" style={{ marginTop: 8, fontSize: 12.5, color: "var(--err-text)", fontFamily: F, lineHeight: 1.45 }}>{error}</div>}
    </div>
  );
}
