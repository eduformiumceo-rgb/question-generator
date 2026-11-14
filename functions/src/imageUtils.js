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

/** Line art (diagrams, scanned text) is stored as PNG so thin lines and labels stay razor sharp. */
export const LINE_ART_TARGET_CHARS = 240 * 1024;

/**
 * Is this mostly near-grey pixels that are either light or dark (a diagram or
 * a page of text) rather than a continuous-tone photo? Pure function so it can
 * be tested without a browser. `data` is RGBA, as from getImageData().
 */
export function looksLikeLineArt(data, step = 4) {
  let n = 0, grey = 0, extreme = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    n++;
    if (Math.max(r, g, b) - Math.min(r, g, b) < 28) grey++;
    if (lum > 225 || lum < 90) extreme++;
  }
  return n > 0 && grey / n >= 0.93 && extreme / n >= 0.88;
}

/**
 * "Clean up a scan": converts to greyscale and stretches the levels so a
 * photographed textbook page turns from grey-ish to white paper with black
 * ink. Mutates and returns `data` (RGBA). Leaves low-contrast input alone.
 */
export function stretchLevels(data) {
  const hist = new Uint32Array(256);
  const px = data.length / 4;
  for (let i = 0; i < data.length; i += 4) hist[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])]++;
  const pct = (p) => { let acc = 0; const goal = px * p; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= goal) return v; } return 255; };
  const lo = pct(0.01), hi = pct(0.75);
  if (hi - lo < 40) return data;
  const scale = 255 / (hi - lo);
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const v = Math.max(0, Math.min(255, (lum - lo) * scale));
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  return data;
}

/**
 * A drag from (x0,y0) to (x1,y1) inside a box of boxW x boxH -> a crop
 * rectangle as FRACTIONS of the image (0..1). Order-independent, clamped to the
 * box, and never smaller than `minFrac` of either side. Returns null for a tap.
 */
export function cropFractions(x0, y0, x1, y1, boxW, boxH, minFrac = 0.04) {
  if (!(boxW > 0 && boxH > 0)) return null;
  const cl = (v, m) => Math.max(0, Math.min(m, v));
  const xa = cl(Math.min(x0, x1), boxW), xb = cl(Math.max(x0, x1), boxW);
  const ya = cl(Math.min(y0, y1), boxH), yb = cl(Math.max(y0, y1), boxH);
  const w = (xb - xa) / boxW, h = (yb - ya) / boxH;
  if (w < minFrac || h < minFrac) return null;
  return { x: xa / boxW, y: ya / boxH, w, h };
}

/** Size after rotating a w x h image by a multiple of 90 degrees. */
export function rotatedSize(w, h, deg) {
  return ((deg % 180) + 180) % 180 === 90 ? { w: h, h: w } : { w, h };
}

function canvasOf(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Draws an image onto a white canvas, limited to `maxSide` pixels on its longest side. */
export function imageToCanvas(img, maxSide = 2400) {
  const w0 = img.naturalWidth || img.width || 800, h0 = img.naturalHeight || img.height || 600;
  const s = Math.min(1, maxSide / Math.max(w0, h0));
  const c = canvasOf(w0 * s, h0 * s);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function rotateCanvas(src, deg) {
  const { w, h } = rotatedSize(src.width, src.height, deg);
  const c = canvasOf(w, h);
  const ctx = c.getContext("2d");
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

export function cropCanvas(src, f) {
  const c = canvasOf(src.width * f.w, src.height * f.h);
  c.getContext("2d").drawImage(src, src.width * f.x, src.height * f.y, src.width * f.w, src.height * f.h, 0, 0, c.width, c.height);
  return c;
}

export function enhanceCanvas(src) {
  const c = canvasOf(src.width, src.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(src, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  stretchLevels(id.data);
  ctx.putImageData(id, 0, 0);
  return c;
}

function scaledTo(src, side) {
  const s = Math.min(1, side / Math.max(src.width, src.height));
  if (s === 1) return src;
  const c = canvasOf(src.width * s, src.height * s);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/**
 * Canvas -> the smallest good-looking data URL.
 *   - line art (diagrams, scanned text): PNG, up to 1400 px, so labels stay sharp
 *   - photos: JPEG, up to 1000 px, quality stepped down until it fits
 */
export function compressCanvas(canvas, { maxSide = 1000, targetChars = TARGET_IMAGE_CHARS } = {}) {
  const sample = scaledTo(canvas, 200);
  const sctx = sample.getContext("2d");
  if (looksLikeLineArt(sctx.getImageData(0, 0, sample.width, sample.height).data, 1)) {
    for (const side of [1400, 1150, 900, 720]) {
      const url = scaledTo(canvas, side).toDataURL("image/png");
      if (url.length <= LINE_ART_TARGET_CHARS) return url;
    }
  }
  let side = maxSide, best = null;
  for (let round = 0; round < 8; round++) {
    const c = scaledTo(canvas, side);
    for (const q of [0.85, 0.75, 0.65, 0.55]) {
      const url = c.toDataURL("image/jpeg", q);
      best = url;
      if (url.length <= targetChars) return url;
    }
    side = Math.round(side * 0.82);
    if (side < 320) break;
  }
  return best; // smallest attempt; the caller's budget check decides if it is acceptable
}

/** Photo / screenshot / diagram File -> compressed data URL. */
export async function compressImageFile(file, opts) {
  return compressCanvas(await fileToCanvas(file), opts);
}

export async function fileToCanvas(file) {
  const raw = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read that file."));
    r.readAsDataURL(file);
  });
  return imageToCanvas(await loadImage(raw));
}

export async function dataUrlToCanvas(src) {
  return imageToCanvas(await loadImage(src));
}

/** First image File on a paste event's clipboard, or null. */
export function clipboardImageFile(event) {
  const items = event?.clipboardData?.items || [];
  for (const it of items) {
    if (it.kind === "file" && it.type.startsWith("image/")) return it.getAsFile();
  }
  return null;
}
