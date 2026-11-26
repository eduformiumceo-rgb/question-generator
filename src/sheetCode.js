/**
 * sheetCode.js - the machine-readable SHEET ID printed in the corner of the WASSCE answer sheet.
 *
 * A real QR code (error-correction level M) holding a short text payload:
 *     EDQ1|<questions>|<options 4|5>|<index digits>|<paper version A-D>|<paper reference>
 * so a scanned sheet tells the reader how many questions it has, how many options, how long the index number is,
 * which version of the paper it is, and (via the reference) which exam it belongs to - with no setup by the marker.
 */
import qrcode from "qrcode-generator";

export const SHEET_CODE_TAG = "EDQ1";

/** Short stable reference for a paper (letters + digits), from the details that make it unique. */
export function paperRef(parts = []) {
  const s = parts.map(p => String(p ?? "").trim().toLowerCase()).join("|");
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = ((h1 * 33) ^ c) >>> 0; h2 = ((h2 * 31) + c) >>> 0; }
  return ((h1 % 1679616).toString(36).padStart(4, "0") + (h2 % 46656).toString(36).padStart(3, "0")).toUpperCase().slice(0, 6);
}

export function sheetPayload({ n, optionCount = 4, digits = 10, version = "A", ref = "" }) {
  const v = /^[A-D]$/i.test(String(version || "")) ? String(version).toUpperCase() : "A";
  return [SHEET_CODE_TAG, Math.round(n), optionCount === 5 ? 5 : 4, Math.round(digits), v, String(ref || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)].join("|");
}

export function parseSheetPayload(text) {
  const p = String(text || "").trim().split("|");
  if (p[0] !== SHEET_CODE_TAG || p.length < 6) return null;
  const n = parseInt(p[1], 10), optionCount = parseInt(p[2], 10), digits = parseInt(p[3], 10);
  if (!(n >= 1 && n <= 100) || ![4, 5].includes(optionCount) || !(digits >= 4 && digits <= 15) || !/^[A-D]$/.test(p[4])) return null;
  return { n, optionCount, digits, version: p[4], ref: p[5] };
}

/** Dark/light module matrix (array of rows of booleans) for a text. */
export function qrMatrix(text) {
  const q = qrcode(0, "M");
  q.addData(String(text), "Byte");
  q.make();
  const N = q.getModuleCount();
  return Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => q.isDark(r, c)));
}

export const QR_QUIET = 3;   // quiet-zone modules kept clear all round

/** Inline SVG of the code, `sizeMm` square INCLUDING the quiet zone (which stays white). */
export function qrSvg(text, sizeMm, ink = "#000") {
  const m = qrMatrix(text), N = m.length, T = N + 2 * QR_QUIET;
  let d = "";
  for (let r = 0; r < N; r++) {
    let c = 0;
    while (c < N) {
      if (!m[r][c]) { c++; continue; }
      let e = c; while (e < N && m[r][e]) e++;
      d += `M${c + QR_QUIET} ${r + QR_QUIET}h${e - c}v1h${-(e - c)}z`;
      c = e;
    }
  }
  return `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}" width="${sizeMm}mm" height="${sizeMm}mm" shape-rendering="crispEdges"><rect width="${T}" height="${T}" fill="#fff"/><path d="${d}" fill="${ink}"/></svg>`;
}
