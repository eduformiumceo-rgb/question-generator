/**
 * imageUtils.js - small browser-only helpers for the paper header & Word export.
 *
 * Word can't embed SVG/WebP reliably and school logos arrive in every format
 * imaginable, so anything uploaded is normalised to a clean PNG (downscaled,
 * transparency kept). The same trick turns the AI's SVG diagrams and the
 * fallback school seal into PNGs the .docx can embed.
 */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = src;
  });
}

function drawToPng(img, maxSide) {
  const w0 = img.naturalWidth || img.width || maxSide;
  const h0 = img.naturalHeight || img.height || maxSide;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/** Uploaded logo File -> PNG data URL, longest side <= maxSide px. */
export async function fileToPngDataUrl(file, maxSide = 512) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read that file."));
    r.readAsDataURL(file);
  });
  const img = await loadImage(dataUrl);
  return drawToPng(img, maxSide);
}

/** SVG markup -> PNG data URL (used for Word, which can't embed SVG reliably). */
export async function svgToPngDataUrl(svgMarkup, width = 800) {
  const withSize = /\swidth=/.test(svgMarkup.slice(0, 200))
    ? svgMarkup
    : svgMarkup.replace(/<svg/i, `<svg width="${width}"`);
  const url = URL.createObjectURL(new Blob([withSize], { type: "image/svg+xml" }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    const ratio = (img.naturalHeight || 1) / (img.naturalWidth || 1);
    canvas.width = width;
    canvas.height = Math.max(1, Math.round(width * ratio));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ────────────────────────────────────────────────────────────────
   QUESTION IMAGES (teacher-supplied figures, maps, photos)
   ────────────────────────────────────────────────────────────────
   An image lives ON the question it belongs to: question.image =
   { src, size, caption }. Because it travels inside the exam data it
   (a) can never land on the wrong question, even though every section
   restarts its numbering at 1, (b) survives shuffled Version B/C papers,
   and (c) is saved with the exam in My Exams with no extra plumbing.
   ──────────────────────────────────────────────────────────────── */

/**
 * Print sizes. Used by BOTH the printable HTML and the Word export, in CSS
 * pixels (96 per inch), so a "medium" figure is the same size in either.
 */
export const IMAGE_SIZES = {
  small:  { label: "Small",  maxW: 220, maxH: 130 },
  medium: { label: "Medium", maxW: 340, maxH: 200 },
  large:  { label: "Large",  maxW: 450, maxH: 300 },
};
export const DEFAULT_IMAGE_SIZE = "medium";
export const MAX_CAPTION_LENGTH = 120;

/** Everything is stored as a compressed JPEG of roughly this size (data-URL characters). */
export const TARGET_IMAGE_CHARS = 200 * 1024;      // ~150 KB of picture
/** Total image data allowed in one saved exam (data-URL characters). Mirrors the server. */
export const MAX_EXAM_IMAGE_CHARS = 1024 * 1024;
/** Raw files bigger than this aren't even attempted (phone photos are 3-8 MB). */
export const MAX_RAW_IMAGE_BYTES = 25 * 1024 * 1024;

/** Only our own compressed raster data URLs are ever allowed into the page. */
const SAFE_IMAGE_RE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
export function isSafeImageDataUrl(src) {
  return typeof src === "string" && src.length < 4 * 1024 * 1024 && SAFE_IMAGE_RE.test(src);
}

export function imageSizeKey(image) {
  return IMAGE_SIZES[image?.size] ? image.size : DEFAULT_IMAGE_SIZE;
}

/** Total size of every question image in an exam (data-URL characters). */
export function examImageChars(examData) {
  let total = 0;
  for (const s of examData?.sections || []) {
    for (const q of s.questions || []) total += q.image?.src?.length || 0;
  }
  return total;
}

/**
 * Photo / screenshot / diagram File -> compressed JPEG data URL.
 * Phone photos are huge, so the longest side is capped and the quality is
 * stepped down (then the size) until the result fits `targetChars`.
 * Transparent PNGs are flattened onto white so they print cleanly.
 */
export async function compressImageFile(file, { maxSide = 1000, targetChars = TARGET_IMAGE_CHARS } = {}) {
  const raw = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read that file."));
    r.readAsDataURL(file);
  });
  const img = await loadImage(raw);
  const w0 = img.naturalWidth || img.width || 800;
  const h0 = img.naturalHeight || img.height || 600;

  let side = maxSide;
  let best = null;
  for (let round = 0; round < 8; round++) {
    const scale = Math.min(1, side / Math.max(w0, h0));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.75, 0.65, 0.55]) {
      const url = canvas.toDataURL("image/jpeg", q);
      best = url;
      if (url.length <= targetChars) return url;
    }
    side = Math.round(side * 0.82);
    if (side < 320) break;
  }
  return best; // smallest attempt; the caller's budget check decides if it is acceptable
}

/** First image File on a paste event's clipboard, or null. */
export function clipboardImageFile(event) {
  const items = event?.clipboardData?.items || [];
  for (const it of items) {
    if (it.kind === "file" && it.type.startsWith("image/")) return it.getAsFile();
  }
  return null;
}
