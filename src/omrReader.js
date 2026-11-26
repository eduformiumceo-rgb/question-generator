/**
 * omrReader.js - reads a scanned or photographed WASSCE-type answer sheet (see wassceSheet.js).
 *
 * Input is an image { data: RGBA Uint8ClampedArray, width, height } (a canvas ImageData works as it is).
 * How it reads:
 *   1. finds the four corner squares (adaptive threshold + connected components) and fits a perspective transform from
 *      sheet millimetres to image pixels, so skewed, rotated, shrunk or photographed sheets still line up;
 *      a sheet fed upside down is detected (the timing strip is on the wrong edge) and turned round;
 *   2. reads the QR SHEET ID (questions, options, index length, paper version, reference); with no code it falls back to
 *      the settings given in `opts`;
 *   3. re-aligns every row and column on its own timing mark (right edge: rows, top edge: option columns), which absorbs
 *      printer / scanner stretch;
 *   4. measures how dark the inside of each bubble is, relative to blank paper and printed ink, and decides per row:
 *      blank, one answer, an erased answer that left a ghost (the strong mark wins, flagged for review) or a double mark.
 * Positions come from wassceSheetModel(), the same geometry the sheet is printed from.
 */
import jsQR from "jsqr";
import { wassceSheetModel, WASSCE_GEOM } from "./wassceSheet.js";
import { parseSheetPayload } from "./sheetCode.js";

const LETTERS = ["A", "B", "C", "D", "E"];

/* ---------- small image helpers ---------- */
function toGray(img) {
  const { data, width: w, height: h } = img, g = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (data[j] * 299 + data[j + 1] * 587 + data[j + 2] * 114) / 1000;
  return { g, w, h };
}

function darkMap({ g, w, h }) {
  const W = w + 1, I = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; } }
  const r = Math.max(8, Math.round(Math.min(w, h) / 24)), dark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const mean = (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
      const v = g[y * w + x];
      dark[y * w + x] = v < mean * 0.78 || v < 70 ? 1 : 0;
    }
  }
  return dark;
}

function components(dark, w, h) {
  const seen = new Uint8Array(w * h), out = [], stack = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!dark[s] || seen[s]) continue;
    let sp = 0, minx = w, maxx = 0, miny = h, maxy = 0, area = 0, sx = 0, sy = 0;
    stack[sp++] = s; seen[s] = 1;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p / w) | 0;
      area++; sx += x; sy += y;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (x > 0 && dark[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < w - 1 && dark[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && dark[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[sp++] = p - w; }
      if (y < h - 1 && dark[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[sp++] = p + w; }
    }
    out.push({ minx, maxx, miny, maxy, area, cx: sx / area, cy: sy / area, w: maxx - minx + 1, h: maxy - miny + 1 });
  }
  return out;
}

/** Perspective transform from 4 source points to 4 destination points (Gaussian elimination, 8 unknowns). */
export function homography(src, dst) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]; }
  }
  return [...Array.from({ length: 8 }, (_, i) => A[i][8] / A[i][i]), 1];
}
export const project = (H, x, y) => { const d = H[6] * x + H[7] * y + 1; return { x: (H[0] * x + H[1] * y + H[2]) / d, y: (H[3] * x + H[4] * y + H[5]) / d }; };

/* ---------- step 1: the four corner squares ---------- */
function findCorners(gray, dark) {
  const { w, h } = gray, exp = (WASSCE_GEOM.mark.size / WASSCE_GEOM.W) * w;       // expected square size in px if the sheet fills the width
  const cand = components(dark, w, h).filter(c => {
    const aspect = c.w / c.h, fill = c.area / (c.w * c.h);
    return aspect > 0.75 && aspect < 1.33 && fill > 0.78 && c.w > exp * 0.35 && c.w < exp * 3.2;
  });
  if (cand.length < 4) return null;
  const pick = (f) => cand.reduce((b, c) => (f(c) < f(b) ? c : b));
  const tl = pick(c => c.cx + c.cy), br = pick(c => -(c.cx + c.cy)), tr = pick(c => -(c.cx - c.cy)), bl = pick(c => c.cx - c.cy);
  const four = [tl, tr, bl, br];
  if (new Set(four).size < 4) return null;
  const sizes = four.map(c => (c.w + c.h) / 2);
  if (Math.max(...sizes) / Math.min(...sizes) > 1.6) return null;
  const dx = Math.hypot(tr.cx - tl.cx, tr.cy - tl.cy), dy = Math.hypot(bl.cx - tl.cx, bl.cy - tl.cy);
  const want = (WASSCE_GEOM.W - 2 * (WASSCE_GEOM.mark.inset + WASSCE_GEOM.mark.size / 2)) / (WASSCE_GEOM.H - 2 * (WASSCE_GEOM.mark.inset + WASSCE_GEOM.mark.size / 2));
  if (Math.abs(dx / dy - want) > 0.18 * want) return null;
  return { tl, tr, bl, br };
}

/* ---------- reading ---------- */
const OPT_FRAC = 0.58;
function makeSampler(gray, H) {
  const { g, w, h } = gray;
  const at = (mx, my) => { const p = project(H, mx, my), x = Math.round(p.x), y = Math.round(p.y); return x < 0 || y < 0 || x >= w || y >= h ? 255 : g[y * w + x]; };
  const ellipse = (cx, cy, bw, bh) => {
    let sum = 0, n = 0; const sx = 4, sy = 3, rx = bw / 2 * OPT_FRAC, ry = bh / 2 * OPT_FRAC;
    for (let j = -sy; j <= sy; j++) for (let i = -sx; i <= sx; i++) { if ((i / sx) ** 2 + (j / sy) ** 2 > 1.001) continue; sum += at(cx + i / sx * rx, cy + j / sy * ry); n++; }
    return sum / n;
  };
  return { at, ellipse };
}

function percentile(arr, p) { const a = Array.from(arr).sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * a.length)))]; }

function levels(gray, quad) {
  const { g, w, h } = gray, cs = [quad.tl, quad.tr, quad.bl, quad.br];
  const xs = cs.map(c => c.cx), ys = cs.map(c => c.cy);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(w - 1, Math.ceil(Math.max(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
  const step = Math.max(1, Math.round(Math.sqrt(((x1 - x0) * (y1 - y0)) / 60000))), s = [];
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) s.push(g[y * w + x]);
  // blank paper: the bright end of the sheet. Printed ink: the solid corner squares (a mostly blank sheet has almost no other ink to measure).
  const inks = cs.map(c => { const r = Math.max(1, Math.floor(Math.min(c.w, c.h) / 4)); let sum = 0, k = 0; for (let y = Math.round(c.cy) - r; y <= Math.round(c.cy) + r; y++) for (let x = Math.round(c.cx) - r; x <= Math.round(c.cx) + r; x++) { if (x >= 0 && y >= 0 && x < w && y < h) { sum += g[y * w + x]; k++; } } return k ? sum / k : 0; });
  inks.sort((a, b) => a - b);
  return { paper: percentile(s, 0.85), ink: (inks[1] + inks[2]) / 2 };
}

/** Decide one row of bubble darkness values (0 = paper, 1 = printed ink). */
export function decideRow(values, markThr) {
  const idx = values.map((v, i) => [v, i]).filter(([v]) => v >= markThr).sort((a, b) => b[0] - a[0]);
  if (!idx.length) return { pick: -1, state: "blank", review: values.some(v => v >= markThr * 0.75) };
  if (idx.length === 1) return { pick: idx[0][1], state: "ok", review: idx[0][0] < markThr + 0.1 };
  if (idx[0][0] >= 2.2 * idx[1][0]) return { pick: idx[0][1], state: "ok", review: true };   // a rubbed-out ghost beside a firm mark
  return { pick: -1, state: "multiple", review: true };
}

/**
 * @param img  { data, width, height }
 * @param opts { n, optionCount, digits }  used when the sheet has no readable QR code
 */
export function readWassceSheet(img, opts = {}) {
  const gray = toGray(img), dark = darkMap(gray);
  const quad = findCorners(gray, dark);
  if (!quad) return { ok: false, error: "Could not find the four corner marks. Scan the whole sheet flat, with all four corners and the right-hand edge in the picture." };

  const m0 = wassceSheetModel(1, 4, 10), cs = m0.corners;
  const build = (q) => homography([cs.tl, cs.tr, cs.bl, cs.br], [q.tl, q.tr, q.bl, q.br].map(c => ({ x: c.cx, y: c.cy })));
  let H = build(quad), rotated = false;
  if (!H) return { ok: false, error: "The corner marks do not form a sheet shape." };

  // orientation: the timing strip must be on the right edge
  const probe = (Hx, mirror) => {          // local contrast: timing strip versus the blank paper right beside it (immune to shadows)
    const S = makeSampler(gray, Hx), y0 = m0.strip[0] - 2, y1 = m0.strip[m0.strip.length - 1] + 2;
    const band = (xa, xb) => { let sum = 0, k = 0; for (let y = y0; y <= y1; y += 0.4) for (let x = xa; x <= xb; x += 0.4) { sum += S.at(x, y); k++; } return sum / k; };
    const sx = WASSCE_GEOM.strip.x, sw = WASSCE_GEOM.strip.w;
    const a = mirror ? [WASSCE_GEOM.W - sx - sw, WASSCE_GEOM.W - sx] : [sx, sx + sw];
    const b = mirror ? [WASSCE_GEOM.W - sx - sw - 2.2, WASSCE_GEOM.W - sx - sw - 0.6] : [sx - 2.2, sx - 0.6];
    return band(b[0], b[1]) - band(a[0], a[1]);
  };
  if (probe(H, true) > probe(H, false) + 8) {                 // strip is on the wrong edge: the sheet is upside down
    rotated = true;
    H = build({ tl: quad.br, tr: quad.bl, bl: quad.tr, br: quad.tl });
  }

  // sheet ID
  let code = null;
  try {
    const q0 = m0.qr, corners = [[q0.x - 2, q0.y - 2], [q0.x + q0.size + 2, q0.y - 2], [q0.x - 2, q0.y + q0.size + 2], [q0.x + q0.size + 2, q0.y + q0.size + 2]].map(([x, y]) => project(H, x, y));
    const x0 = Math.max(0, Math.floor(Math.min(...corners.map(c => c.x)))), x1 = Math.min(img.width, Math.ceil(Math.max(...corners.map(c => c.x))));
    const y0 = Math.max(0, Math.floor(Math.min(...corners.map(c => c.y)))), y1 = Math.min(img.height, Math.ceil(Math.max(...corners.map(c => c.y))));
    const cw = x1 - x0, ch = y1 - y0;
    if (cw > 20 && ch > 20) {
      const crop = new Uint8ClampedArray(cw * ch * 4);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const s = ((y0 + y) * img.width + x0 + x) * 4, d = (y * cw + x) * 4; crop[d] = img.data[s]; crop[d + 1] = img.data[s + 1]; crop[d + 2] = img.data[s + 2]; crop[d + 3] = 255; }
      const r = jsQR(crop, cw, ch, { inversionAttempts: "attemptBoth" });
      if (r) code = parseSheetPayload(r.data);
    }
  } catch { /* fall back to opts */ }

  const n = code ? code.n : Math.round(Number(opts.n) || 0), optionCount = code ? code.optionCount : (Number(opts.optionCount) === 5 ? 5 : 4), digits = code ? code.digits : Math.round(Number(opts.digits) || 10);
  if (!(n >= 1 && n <= 100)) return { ok: false, error: "The sheet ID (QR code) could not be read and the number of questions was not given.", rotated };
  const M = wassceSheetModel(n, optionCount, digits), S = makeSampler(gray, H), lv = levels(gray, quad);
  const norm = (mean) => Math.max(0, Math.min(1, (lv.paper - mean) / Math.max(30, lv.paper - lv.ink)));

  // timing marks -> per-row y and per-column x corrections (mm)
  const centroid = (axis, c0, c1, fixed0, fixed1, expect) => {
    let sw = 0, sc = 0; const step = 0.1;
    for (let t = c0; t <= c1; t += step) {
      let acc = 0, k = 0;
      for (let f = fixed0; f <= fixed1; f += 0.25) { acc += axis === "y" ? S.at(f, t) : S.at(t, f); k++; }
      const d = norm(acc / k); if (d > 0.35) { sw += d; sc += d * t; }
    }
    if (sw < 2) return 0; const off = sc / sw - expect; return Math.abs(off) <= 1.3 ? off : 0;
  };
  const rowDy = (y) => centroid("y", y - 1.4, y + 1.4, M.stripX - 1.6, M.stripX + 1.6, y);
  const topDx = new Map(M.top.map((x, i) => [i, centroid("x", x - 1.4, x + 1.4, WASSCE_GEOM.topMark.y + 0.3, WASSCE_GEOM.topMark.y + WASSCE_GEOM.topMark.h - 0.3, x)]));

  const bubble = (x, y, b) => norm(S.ellipse(x, y, b.w, b.h));

  // answers
  const rows = M.answers.map(a => {
    const dy = rowDy(a.y);
    return { a, dy, values: a.xs.map((x, k) => bubble(x + (topDx.get(a.col * optionCount + k) || 0), a.y + dy, M.bubble)) };
  });
  const noise = percentile(rows.flatMap(r => r.values), 0.5), markThr = Math.max(0.22, noise + 0.17);
  const answers = rows.map(r => {
    const d = decideRow(r.values, markThr);
    return { q: r.a.q, answer: d.pick >= 0 ? LETTERS[d.pick] : d.state === "multiple" ? "*" : "", state: d.state, review: d.review, values: r.values };
  });

  // index number
  const idRowDy = M.index[0].ys.map(y => rowDy(y));
  const idVals = M.index.map(col => col.ys.map((y, d) => bubble(col.x, y + idRowDy[d], M.digitBubble)));
  const idNoise = percentile(idVals.flat(), 0.5), idThr = Math.max(0.22, idNoise + 0.17);
  const idDecided = idVals.map(v => decideRow(v, idThr));
  const indexNumber = idDecided.map(d => (d.pick >= 0 ? String(d.pick) : d.state === "multiple" ? "*" : "_")).join("");

  // version, sex, absent
  const one = (list, b) => { const v = list.map(p => bubble(p.x, p.y, b)); const d = decideRow(v, 0.35); return d.pick >= 0 ? list[d.pick].v : (d.state === "multiple" ? "*" : ""); };
  const shadedVersion = one(M.version, M.versionBubble), sex = one(M.sex, M.versionBubble);
  const absent = bubble(M.absent.x, M.absent.y, M.absentBubble) >= 0.35;
  const version = (shadedVersion && shadedVersion !== "*") ? shadedVersion : (code ? code.version : "");

  const review = answers.filter(a => a.review).map(a => a.q);
  return {
    ok: true, rotated, qr: !!code, ref: code ? code.ref : "", n, optionCount, digits,
    indexNumber, indexOk: /^\d+$/.test(indexNumber), version, sex: sex === "*" ? "" : sex, absent,
    answers, answerString: answers.map(a => a.answer || "-").join(""), review,
    quality: { paper: Math.round(lv.paper), ink: Math.round(lv.ink), noise: Math.round(noise * 100) / 100, markThr: Math.round(markThr * 100) / 100 },
  };
}

/**
 * Mark a read sheet against an answer key.
 * @param read  result of readWassceSheet
 * @param key   { 1: "A", 2: "C", ... } or a string "ACBD..." (question 1 first)
 */
export function scoreSheet(read, key, marksEach = 1) {
  const k = typeof key === "string" ? Object.fromEntries([...key.toUpperCase().replace(/[^A-E]/g, "")].map((c, i) => [i + 1, c])) : Object.fromEntries(Object.entries(key || {}).map(([q, v]) => [q, String(v).toUpperCase()]));
  const perQ = read.answers.map(a => ({ q: a.q, given: a.answer, correct: k[a.q] || "", ok: !!k[a.q] && a.answer === k[a.q] }));
  const keyed = perQ.filter(p => p.correct);
  const right = keyed.filter(p => p.ok).length;
  return { score: right * marksEach, total: keyed.length * marksEach, right, wrong: keyed.filter(p => p.given && p.given !== "*" && !p.ok).length, blank: keyed.filter(p => !p.given).length, multiple: keyed.filter(p => p.given === "*").length, perQ };
}

/** Answer key for a generated paper: { question number: letter }. Uses the variant's own key when a version was shuffled. */
export function keyFromExam(examData) {
  const key = {};
  for (const k of (examData && examData.answerKey) || []) if (k && k.number != null && k.answer) key[k.number] = String(k.answer).trim().toUpperCase().charAt(0);
  return key;
}

/** CSV of a batch of results (one row per sheet). */
export function resultsCsv(rows, n) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["File", "Index number", "Version", "Sex", "Absent", "Score", "Out of", "Right", "Wrong", "Blank", "Double marks", "Needs checking", ...Array.from({ length: n }, (_, i) => `Q${i + 1}`)];
  const body = rows.map(r => [r.file, r.read.indexNumber, r.read.version, r.read.sex, r.read.absent ? "Yes" : "", r.score.score, r.score.total, r.score.right, r.score.wrong, r.score.blank, r.score.multiple, r.read.review.join(" "), ...r.read.answers.map(a => a.answer || "")]);
  return [head, ...body].map(l => l.map(esc).join(",")).join("\r\n");
}
