/**
 * omrReader.js - reads a scanned or photographed WASSCE-type answer sheet (see wassceSheet.js).
 *
 * Input is an image { data: RGBA Uint8ClampedArray, width, height } (a canvas ImageData works as it is).
 * How it reads:
 *   1. finds the four corner squares (adaptive threshold + connected components) and fits a perspective transform from
 *      sheet millimetres to image pixels, so skewed, rotated, shrunk or photographed sheets still line up;
 *      a sheet fed upside down OR turned on its side is detected (the timing strip is on the wrong edge) and turned round;
 *   2. reads the QR SHEET ID (questions, options, index length, paper version, reference); with no code it falls back to
 *      the settings given in `opts`;
 *   3. re-aligns every row and column on its own timing mark (right edge: rows, top edge: option columns), which absorbs
 *      printer / scanner stretch;
 *   4. measures how dark the inside of each bubble is, relative to the blank paper right around that bubble (so a shadow or a
 *      curled page does not read as a mark) and to printed ink, and decides per row:
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
  const ratio = dx / dy, portrait = Math.abs(ratio - want) <= 0.18 * want, landscape = Math.abs(ratio - 1 / want) <= 0.18 / want;   // upright, or on its side
  if (!portrait && !landscape) return null;
  return { tl, tr, bl, br, landscape };
}

/* ---------- reading ---------- */
const BIAS_CAP = 0.05;                         // the most a per-position printing bias may be taken off a bubble's strength
const SNAP = 1.3;                              // mm: how far a bubble may be nudged onto its printed outline
const LOBE_OUTER = 0.8, LOBE_INNER = 0.4;      // sampled part of a bubble, as fractions of its half-width: from 0.4 to 0.8 either side of the centre
/* A mark counts when it is clearly above the blanks of its own row (see rowStrengths), by at least MARK_MIN. Low on purpose: a light,
 * hatched pencil mark averages out to a pale grey over the bubble. Marks that clear the line by less than REVIEW_MARGIN are flagged
 * for the teacher to check. */
const MARK_MIN = 0.045, SMALL_MARK = 0.1, REVIEW_MARGIN = 0.05;
function makeSampler(gray, H) {
  const { g, w, h } = gray;
  const at = (mx, my) => { const p = project(H, mx, my), x = Math.round(p.x), y = Math.round(p.y); return x < 0 || y < 0 || x >= w || y >= h ? 255 : g[y * w + x]; };
  // The two side lobes of a bubble: the middle strip holds the faint printed letter, which only adds noise, whereas a pencil mark covers
  // the whole bubble. Measuring left and right of the letter gives blank bubbles a flat, low reading and a light mark a clear one.
  const ellipse = (cx, cy, bw, bh) => {
    let sum = 0, n = 0; const sx = 8, sy = 4, rx = bw / 2 * LOBE_OUTER, ry = bh / 2 * LOBE_OUTER, hole = LOBE_INNER / LOBE_OUTER;
    for (let j = -sy; j <= sy; j++) for (let i = -sx; i <= sx; i++) { if ((i / sx) ** 2 + (j / sy) ** 2 > 1.001 || Math.abs(i / sx) < hole) continue; sum += at(cx + i / sx * rx, cy + j / sy * ry); n++; }
    return sum / n;
  };
  // blank paper just outside a bubble's ring: the median of points on two thin rings (robust to a neighbour's ink touching a few of them)
  const around = (cx, cy, bw, bh) => {
    const v = [];
    for (const f of [1.22, 1.42]) for (let k = 0; k < 14; k++) { const t = (k / 14) * Math.PI * 2; v.push(at(cx + Math.cos(t) * bw / 2 * f, cy + Math.sin(t) * bh / 2 * f)); }
    v.sort((a, b) => a - b);
    return v[v.length >> 1];
  };
  /* Snap a bubble's expected position onto its printed outline. The corner-based transform is exact only for a flat sheet; a curled page or a
   * small tilt leaves bubbles up to a couple of millimetres off, which matters for the small index digits. The printed ring is dark against the
   * paper just outside it, whatever is shaded inside, so look for the offset (within +-SNAP mm) where that contrast is greatest. */
  const outline = (cx, cy, bw, bh) => {
    let ring = 0; const out = [];
    for (let k = 0; k < 16; k++) { const t = (k / 16) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t); ring += at(cx + c * bw / 2 * 0.93, cy + sn * bh / 2 * 0.93); out.push(at(cx + c * bw / 2 * 1.3, cy + sn * bh / 2 * 1.3)); }
    out.sort((x, y) => x - y);
    const oval = out[8] - ring / 16;            // the MEDIAN outside, so a thick box border or a neighbouring ring on one side cannot fool it
    // The sheet's boxes are square brackets [ A ]: two upright strokes joined to short ticks at the top and bottom. Their contrast is read
    // along those strokes (the darkest of three pixels across each, so a 0.1 mm misalignment still finds the line). Oval sheets printed
    // earlier still lock on through the ring above; the better of the two readings is used.
    const hx = bw / 2, hy = bh / 2, edge = 0.13, away = 0.7, tick = Math.min(0.5, bw * 0.11), d = 0.1;
    let inkSum = 0, count = 0; const outB = [];
    for (const sx of [-1, 1]) {
      for (const f of [-0.5, -0.17, 0.17, 0.5]) {
        const x = cx + sx * (hx - edge), y = cy + f * bh;
        inkSum += Math.min(at(x - d, y), at(x, y), at(x + d, y)); outB.push(at(cx + sx * (hx + away), y)); count++;
      }
      for (const sy of [-1, 1]) {
        const x = cx + sx * (hx - tick), y = cy + sy * (hy - edge);
        inkSum += Math.min(at(x, y - d), at(x, y), at(x, y + d)); outB.push(at(x, cy + sy * (hy + away))); count++;
      }
    }
    outB.sort((x, y) => x - y);
    const bracket = outB[outB.length >> 1] - inkSum / count;
    return Math.max(oval, bracket);
  };
  // One shift for a whole row (or index column): the offset where the outlines of ALL its bubbles line up best. Judging the group, not one bubble,
  // means a neighbouring ring (bubbles in a five-option row nearly touch) cannot pull a bubble onto the wrong ring.
  const snapGroup = (pts, bw, bh) => {
    let best = -Infinity, bx = 0, by = 0;
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
      const dx = i * SNAP / 4, dy = j * SNAP / 4; let sc = 0;
      for (const p of pts) sc += outline(p.x + dx, p.y + dy, bw, bh);
      sc = sc / pts.length - 0.12 * (Math.abs(dx) + Math.abs(dy));            // a slight pull towards the expected spot
      if (sc > best) { best = sc; bx = dx; by = dy; }
    }
    return { x: bx, y: by };
  };
  return { at, ellipse, around, snapGroup };
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

/**
 * Decide one row of bubble darkness values.
 * `base` is what a blank bubble reads on this sheet (the faint printed letter makes it more than 0); a mark's strength is its
 * value above that, and a rubbed-out ghost is judged against a firm mark by strength, not by raw value.
 * A mark that clears the threshold by less than `margin` is flagged for the teacher to check.
 */
export function decideRow(values, markThr, base = 0, margin = 0.1) {
  const idx = values.map((v, i) => [v, i]).filter(([v]) => v >= markThr).sort((a, b) => b[0] - a[0]);
  if (!idx.length) return { pick: -1, state: "blank", review: values.some(v => v >= markThr - (markThr - base) * 0.25) };
  if (idx.length === 1) return { pick: idx[0][1], state: "ok", review: idx[0][0] < markThr + margin };
  if (idx[0][0] - base >= 2.2 * Math.max(1e-6, idx[1][0] - base)) return { pick: idx[0][1], state: "ok", review: true };   // a rubbed-out ghost beside a firm mark
  return { pick: -1, state: "multiple", review: true };
}

/**
 * Strength of each bubble in a row: its darkness above the blanks of THE SAME ROW.
 * Blanks in one row share the same paper, lighting and printed letter, so they agree with each other far better than with
 * the rest of the sheet; a light pencil mark that is invisible to a sheet-wide threshold stands out clearly here.
 * The baseline is the second-lightest bubble of a short row (so one wiped or over-bright bubble cannot drag it down, and two
 * marks in a row do not lift it) and the 30th percentile of a long one (an index column).
 */
export function rowStrengths(values) {
  const a = Array.from(values).sort((x, y) => x - y), base = a[a.length >= 8 ? Math.floor((a.length - 1) * 0.3) : a.length >= 4 ? 1 : 0];
  return { base, s: values.map(v => Math.max(0, v - base)) };
}

/**
 * How strong a bubble must be to count as marked: clear of the strengths blank bubbles show on this sheet (most bubbles are blank, so
 * the 65th percentile of all strengths is a blank one), and never below MARK_MIN. A noisy photo has noisier blanks and so a higher line.
 */
export function markThreshold(strengthRows) {
  const a = strengthRows.flat().sort((x, y) => x - y), blank = a[Math.floor((a.length - 1) * 0.65)] || 0;
  return Math.max(MARK_MIN, 2.5 * blank + 0.01);
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
  // Which image corner is the sheet's top-left, top-right, bottom-left, bottom-right? That depends on how the sheet lies:
  // upright (0), turned a quarter clockwise (90), upside down (180), or a quarter anticlockwise (270).
  const order = { 0: [quad.tl, quad.tr, quad.bl, quad.br], 90: [quad.tr, quad.br, quad.tl, quad.bl], 180: [quad.br, quad.bl, quad.tr, quad.tl], 270: [quad.bl, quad.tl, quad.br, quad.tr] };
  const build = (turn) => homography([cs.tl, cs.tr, cs.bl, cs.br], order[turn].map(c => ({ x: c.cx, y: c.cy })));
  const probe = (Hx, mirror) => {          // local contrast: timing strip versus the blank paper right beside it (immune to shadows)
    const S = makeSampler(gray, Hx), y0 = m0.strip[0] - 2, y1 = m0.strip[m0.strip.length - 1] + 2;
    const band = (xa, xb) => { let sum = 0, k = 0; for (let y = y0; y <= y1; y += 0.4) for (let x = xa; x <= xb; x += 0.4) { sum += S.at(x, y); k++; } return sum / k; };
    const sx = WASSCE_GEOM.strip.x, sw = WASSCE_GEOM.strip.w;
    const a = mirror ? [WASSCE_GEOM.W - sx - sw, WASSCE_GEOM.W - sx] : [sx, sx + sw];
    const b = mirror ? [WASSCE_GEOM.W - sx - sw - 2.2, WASSCE_GEOM.W - sx - sw - 0.6] : [sx - 2.2, sx - 0.6];
    return band(b[0], b[1]) - band(a[0], a[1]);
  };
  // the corner shape says upright or on its side; the timing strip (down the right edge) says which way up
  const turns = quad.landscape ? [90, 270] : [0, 180];
  const scored = turns.map(t => { const Ht = build(t); return { t, H: Ht, score: Ht ? probe(Ht, false) - probe(Ht, true) : -Infinity }; });
  scored.sort((x, y) => y.score - x.score);
  const turn = scored[0].t, H = scored[0].H;
  if (!H) return { ok: false, error: "The corner marks do not form a sheet shape." };
  const rotated = turn === 180, sideways = turn === 90 || turn === 270;

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
  if (!(n >= 1 && n <= 100)) return { ok: false, error: "The sheet ID (QR code) could not be read and the number of questions was not given.", rotated, sideways, turn };
  const M = wassceSheetModel(n, optionCount, digits), S = makeSampler(gray, H), lv = levels(gray, quad);
  const span = Math.max(30, lv.paper - lv.ink);
  const norm = (mean) => Math.max(0, Math.min(1, (lv.paper - mean) / span));

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

  // darkness 0 = the paper around the bubble, 1 = printed ink. Measured against the LOCAL paper, so a shadow or a curled page is not a mark.
  const bubble = (x0, y0, b, o = { x: 0, y: 0 }) => { const x = x0 + o.x, y = y0 + o.y; const local = Math.min(255, Math.max(S.around(x, y, b.w, b.h), lv.paper * 0.6)); return Math.max(0, Math.min(1, (local - S.ellipse(x, y, b.w, b.h)) / span)); };

  // answers
  const rows = M.answers.map(a => {
    const dy = rowDy(a.y);
    const pts = a.xs.map((x, k) => ({ x: x + (topDx.get(a.col * optionCount + k) || 0), y: a.y + dy })), o = S.snapGroup(pts, M.bubble.w, M.bubble.h);
    return { a, dy, values: pts.map(p => bubble(p.x, p.y, M.bubble, o)) };
  });
  const rowS = rows.map(r => rowStrengths(r.values)), markThr = markThreshold(rowS.map(x => x.s)), noise = percentile(rowS.map(x => x.base), 0.5);
  const answers = rows.map((r, i) => {
    const d = decideRow(rowS[i].s, markThr, 0, REVIEW_MARGIN);
    return { q: r.a.q, answer: d.pick >= 0 ? LETTERS[d.pick] : d.state === "multiple" ? "*" : "", state: d.state, review: d.review, values: r.values, strengths: rowS[i].s };
  });

  // index number
  const idRowDy = M.index[0].ys.map(y => rowDy(y));
  const idVals = M.index.map(col => { const pts = col.ys.map((y, d) => ({ x: col.x, y: y + idRowDy[d] })), o = S.snapGroup(pts, M.digitBubble.w, M.digitBubble.h); return pts.map(p => bubble(p.x, p.y, M.digitBubble, o)); });
  // Every column prints the same ten digits in the same places, so a digit that reads a little dark in every column is a printing/shape bias,
  // not a mark. Estimate it across the columns and take it off (capped, so a real mark in every column could never be removed).
  const idRaw = idVals.map(rowStrengths), digitBias = Array.from({ length: 10 }, (_, d) => { const c = idRaw.map(x => x.s[d]).sort((a, b) => a - b); return Math.min(BIAS_CAP, c[Math.floor((c.length - 1) * 0.3)] || 0); });
  const idS = idRaw.map(x => ({ base: x.base, s: x.s.map((v, d) => Math.max(0, v - digitBias[d])) })), idThr = markThreshold(idS.map(x => x.s));
  const idDecided = idS.map(x => decideRow(x.s, idThr, 0, REVIEW_MARGIN));
  const indexNumber = idDecided.map(d => (d.pick >= 0 ? String(d.pick) : d.state === "multiple" ? "*" : "_")).join("");

  // version, sex, absent
  // paper version (printed solid on the right one) and sex (shaded): both use the same bubble shape, so the blank ones give the baseline
  const vVals = M.version.map(p => bubble(p.x, p.y, M.versionBubble)), vBase = rowStrengths(vVals).base;
  const one = (list, b) => { const v = list.map(p => Math.max(0, bubble(p.x, p.y, b) - vBase)); const d = decideRow(v, SMALL_MARK, 0, REVIEW_MARGIN); return d.pick >= 0 ? list[d.pick].v : (d.state === "multiple" ? "*" : ""); };
  const shadedVersion = one(M.version, M.versionBubble), sex = one(M.sex, M.versionBubble);
  const absent = bubble(M.absent.x, M.absent.y, M.absentBubble) >= SMALL_MARK;         // the supervisor's oval has no letter: blank reads about 0
  const version = (shadedVersion && shadedVersion !== "*") ? shadedVersion : (code ? code.version : "");

  const review = answers.filter(a => a.review).map(a => a.q);
  return {
    ok: true, rotated, sideways, turn, qr: !!code, ref: code ? code.ref : "", n, optionCount, digits,
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
  const r2 = (x) => Math.round(x * 100) / 100;                       // half marks and the like: no 0.30000000000000004
  return { score: r2(right * marksEach), total: r2(keyed.length * marksEach), right, wrong: keyed.filter(p => p.given && p.given !== "*" && !p.ok).length, blank: keyed.filter(p => !p.given).length, multiple: keyed.filter(p => p.given === "*").length, perQ };
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
