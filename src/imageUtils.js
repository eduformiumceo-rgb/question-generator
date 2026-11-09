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
