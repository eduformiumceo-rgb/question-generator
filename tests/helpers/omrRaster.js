// Draws a filled-in WASSCE answer sheet from its own geometry, then "scans" it: rotated, shifted, flipped, noisy.
import { wassceSheetModel, wassceSheetCode, WASSCE_GEOM } from "../../src/wassceSheet.js";
import { qrMatrix, QR_QUIET } from "../../src/sheetCode.js";

export function rng(seed = 1) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** A random pupil: answers ('' blank, '*' double, else a letter) and an index number. */
export function randomPupil(n, optionCount, digits, seed = 1, { blanks = 0.05, doubles = 0.04 } = {}) {
  const r = rng(seed), L = "ABCDE".slice(0, optionCount);
  return {
    answers: Array.from({ length: n }, () => { const x = r(); return x < blanks ? "" : x < blanks + doubles ? "*" : L[Math.floor(r() * optionCount)]; }),
    index: Array.from({ length: digits }, () => Math.floor(r() * 10)).join(""),
  };
}

export function drawSheet({ n, optionCount = 4, digits = 10, meta = { schoolName: "Test SHS", subject: "Maths", examVersion: "B" }, pupil, sex = "F", ppm = 10, pencil = 0.62, ghosts = [], absent = false }) {
  const M = wassceSheetModel(n, optionCount, digits), W = Math.round(M.page.w * ppm), H = Math.round(M.page.h * ppm);
  const img = new Float32Array(W * H);                         // 0 = paper, 1 = ink
  const ink = (x0, y0, x1, y1, v = 1) => { for (let y = Math.max(0, Math.floor(y0 * ppm)); y < Math.min(H, Math.ceil(y1 * ppm)); y++) for (let x = Math.max(0, Math.floor(x0 * ppm)); x < Math.min(W, Math.ceil(x1 * ppm)); x++) img[y * W + x] = Math.max(img[y * W + x], v); };
  const ring = (cx, cy, w, h, fill = 0, letter = 0.22) => {
    const x0 = Math.floor((cx - w / 2 - 0.3) * ppm), x1 = Math.ceil((cx + w / 2 + 0.3) * ppm), y0 = Math.floor((cy - h / 2 - 0.3) * ppm), y1 = Math.ceil((cy + h / 2 + 0.3) * ppm);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const dx = ((x + 0.5) / ppm - cx) / (w / 2), dy = ((y + 0.5) / ppm - cy) / (h / 2), d = dx * dx + dy * dy;
      let v = 0;
      if (d > 0.84 && d < 1.0) v = 0.9;                       // outline
      else if (d <= 0.84) { v = fill; if (letter && Math.abs(dx) < 0.28 && Math.abs(dy) < 0.5) v = Math.max(v, letter); }   // faint letter in the middle
      if (v) img[y * W + x] = Math.max(img[y * W + x], v);
    }
  };
  // corners, timing marks
  const s = WASSCE_GEOM.mark.size;
  for (const c of Object.values(M.corners)) ink(c.x - s / 2, c.y - s / 2, c.x + s / 2, c.y + s / 2);
  for (const y of M.strip) ink(WASSCE_GEOM.strip.x, y - 0.475, WASSCE_GEOM.strip.x + WASSCE_GEOM.strip.w, y + 0.475);
  for (const x of M.top) ink(x - WASSCE_GEOM.topMark.w / 2, WASSCE_GEOM.topMark.y, x + WASSCE_GEOM.topMark.w / 2, WASSCE_GEOM.topMark.y + WASSCE_GEOM.topMark.h);
  // QR
  const qm = qrMatrix(wassceSheetCode(meta, n, optionCount, digits)), mod = M.qr.size / (qm.length + 2 * QR_QUIET);
  qm.forEach((row, r) => row.forEach((d, c) => { if (d) ink(M.qr.x + (c + QR_QUIET) * mod, M.qr.y + (r + QR_QUIET) * mod, M.qr.x + (c + QR_QUIET + 1) * mod, M.qr.y + (r + QR_QUIET + 1) * mod); }));
  // answers
  const ghost = new Set(ghosts.map(g => `${g.q}${g.opt}`));
  for (const a of M.answers) a.xs.forEach((x, k) => {
    const L = "ABCDE"[k], given = pupil.answers[a.q - 1];
    const on = given === L || given === "*" && (k === 0 || k === 1);
    ring(x, a.y, M.bubble.w, M.bubble.h, on ? pencil : ghost.has(`${a.q}${L}`) ? 0.22 : 0);
  });
  // index number
  M.index.forEach((col, i) => col.ys.forEach((y, d) => ring(col.x, y, M.digitBubble.w, M.digitBubble.h, Number(pupil.index[i]) === d ? pencil : 0)));
  // version (printed solid), sex, absent
  const ver = String(meta.examVersion || "A");
  M.version.forEach(p => ring(p.x, p.y, M.versionBubble.w, M.versionBubble.h, p.v === ver ? 0.95 : 0));
  M.sex.forEach(p => ring(p.x, p.y, M.versionBubble.w, M.versionBubble.h, p.v === sex ? pencil : 0));
  ring(M.absent.x, M.absent.y, M.absentBubble.w, M.absentBubble.h, absent ? pencil : 0, 0);
  return { img, W, H, ppm, M };
}

/** Put the sheet on a larger desk, turn it, shift it, add noise: returns RGBA like canvas ImageData. */
export function scan({ img, W, H, ppm }, { outPpm = 6.5, angle = 0, flip180 = false, pad = 14, noise = 0.03, seed = 3, dx = 0, dy = 0 } = {}) {
  const r = rng(seed), w = Math.round((W / ppm + 2 * pad) * outPpm), h = Math.round((H / ppm + 2 * pad) * outPpm);
  const cx = w / 2, cy = h / 2, ca = Math.cos(angle), sa = Math.sin(angle), k = ppm / outPpm;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let u = x - cx - dx * outPpm, v = y - cy - dy * outPpm;
    const a = ca * u + sa * v, b = -sa * u + ca * v;           // undo rotation
    let sx = (flip180 ? -a : a) * k + W / 2, sy = (flip180 ? -b : b) * k + H / 2;
    let ink = 0, onSheet = sx >= 0 && sy >= 0 && sx < W - 1 && sy < H - 1;
    if (onSheet) {                                              // bilinear
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      ink = img[y0 * W + x0] * (1 - fx) * (1 - fy) + img[y0 * W + x0 + 1] * fx * (1 - fy) + img[(y0 + 1) * W + x0] * (1 - fx) * fy + img[(y0 + 1) * W + x0 + 1] * fx * fy;
    }
    const paper = onSheet ? 246 : 205;
    // average over the shrink (box blur approximated by the bilinear above is enough at k < 2)
    const g = Math.max(0, Math.min(255, paper - ink * (paper - 28) + (r() - 0.5) * 255 * noise));
    const o = (y * w + x) * 4; data[o] = data[o + 1] = data[o + 2] = g; data[o + 3] = 255;
  }
  return { data, width: w, height: h };
}
