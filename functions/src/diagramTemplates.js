/**
 * diagramTemplates.js - exact, code-drawn exam diagrams.
 *
 * Language models are poor at hand-writing SVG coordinates (labels collide,
 * angles drift, scales are wrong). So the AI no longer draws: it picks a
 * template and supplies the NUMBERS and LABELS, and this file draws the
 * figure deterministically. A teacher can also build the same diagrams by
 * hand from a form (DiagramBuilder.jsx), using the same registry.
 *
 * Every template:
 *   - normalises untrusted params (clamps sizes, truncates text, rejects junk)
 *   - draws black-on-white line art that prints well on a school printer
 *   - escapes all text, so a hostile label can never inject markup
 *   - returns a complete <svg> string, or null when the params can't be drawn
 */

const FONT = "Arial, Helvetica, sans-serif";
const INK = "#000";

/* ── tiny param coercion ─────────────────────────────────────────── */
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r2 = (n) => Math.round(n * 100) / 100;
const fin = (n) => Number.isFinite(n);
export function num(v, def, min = -1e9, max = 1e9) {
  const n = typeof v === "string" ? parseFloat(v.replace(/,/g, "")) : Number(v);
  return fin(n) ? Math.min(max, Math.max(min, n)) : def;
}
export function str(v, max = 24) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, max);
}
function strList(v, maxN = 12, maxLen = 16) {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return arr.slice(0, maxN).map(x => str(x, maxLen));
}
function numList(v, maxN = 12) {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return arr.slice(0, maxN).map(x => num(x, NaN));
}
const bool = (v, def = false) => (v === undefined || v === null ? def : v === true || v === "true" || v === 1 || v === "1");
const pick = (v, options, def) => (options.includes(v) ? v : def);

/** Tidy number for a tick or label: 2.50 -> "2.5", 1e-7 -> "0". */
export function fmt(n) {
  if (!fin(n)) return "";
  const v = Math.abs(n) < 1e-9 ? 0 : n;
  return String(parseFloat(v.toFixed(2)));
}

/** "Nice" axis: rounds the range out to friendly steps (1, 2, 5 x 10^k). */
export function niceScale(min, max, target = 5) {
  if (!(max > min)) max = min + 1;
  const rough = (max - min) / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return { min: Math.floor(min / step + 1e-9) * step, max: Math.ceil(max / step - 1e-9) * step, step };
}

/* ── SVG building blocks ─────────────────────────────────────────── */
function svgWrap(w, h, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(w)} ${r2(h)}" width="${r2(w)}" height="${r2(h)}"><rect width="${r2(w)}" height="${r2(h)}" fill="#fff"/>${inner}</svg>`;
}
function text(x, y, s, o = {}) {
  const { size = 13, anchor = "middle", bold = false, italic = false, rotate = 0, halo = false } = o;
  if (s === "" || s === null || s === undefined) return "";
  const tr = rotate ? ` transform="rotate(${rotate} ${r2(x)} ${r2(y)})"` : "";
  return `<text x="${r2(x)}" y="${r2(y)}" dy="0.35em" font-family="${FONT}" font-size="${size}" text-anchor="${anchor}"${bold ? ' font-weight="bold"' : ""}${italic ? ' font-style="italic"' : ""} fill="${INK}"${halo ? ' stroke="#fff" stroke-width="3.5" paint-order="stroke"' : ""}${tr}>${esc(s)}</text>`;
}
function line(x1, y1, x2, y2, o = {}) {
  const { w = 1.4, dash = "", color = INK, cap = "round" } = o;
  return `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${color}" stroke-width="${w}" stroke-linecap="${cap}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}
function rect(x, y, w, h, o = {}) {
  const { fill = "none", stroke = INK, sw = 1.4, dash = "" } = o;
  return `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}
function circle(cx, cy, r, o = {}) {
  const { fill = "none", stroke = INK, sw = 1.4, dash = "" } = o;
  return `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}
function path(d, o = {}) {
  const { fill = "none", stroke = INK, sw = 1.4, dash = "" } = o;
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}
function poly(points, o = {}) {
  const { fill = "none", stroke = INK, sw = 1.4, close = false } = o;
  const pts = points.map(p => `${r2(p[0])},${r2(p[1])}`).join(" ");
  return `<${close ? "polygon" : "polyline"} points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
}
/** Small arrow head at (x,y) pointing along angle `a` (radians, SVG coords). */
function arrowHead(x, y, a, size = 8) {
  const p1 = [x - size * Math.cos(a - 0.4), y - size * Math.sin(a - 0.4)];
  const p2 = [x - size * Math.cos(a + 0.4), y - size * Math.sin(a + 0.4)];
  return `<polygon points="${r2(x)},${r2(y)} ${r2(p1[0])},${r2(p1[1])} ${r2(p2[0])},${r2(p2[1])}" fill="${INK}"/>`;
}
/** SVG arc path from angle a0 to a1 around (cx,cy), taking the SHORT way round. */
function shortArc(cx, cy, r, a0, a1) {
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a0 + d), y1 = cy + r * Math.sin(a0 + d);
  return { d: `M ${r2(x0)} ${r2(y0)} A ${r} ${r} 0 0 ${d > 0 ? 1 : 0} ${r2(x1)} ${r2(y1)}`, mid: a0 + d / 2, sweep: d };
}

/* ── field helpers for the teacher's form ────────────────────────── */
const linesField = (key, label, help, parse, format) => ({ key, label, type: "lines", help, parse, format });

/** Parse "a, b, c" lines into arrays of trimmed strings. */
const splitLines = (t, maxN = 20) => String(t || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, maxN).map(l => l.split(",").map(s => s.trim()));

/* ═══════════════════════════════════════════════════════════════════
   1. TRIANGLE (general, right-angled, with angle arcs)
   ═══════════════════════════════════════════════════════════════════ */
const triangle = {
  id: "triangle",
  label: "Triangle",
  subjects: "Mathematics (geometry, Pythagoras, trigonometry)",
  fields: [
    { key: "vertexLabels", label: "Corner labels", type: "list", help: "3 labels, e.g. A, B, C" },
    { key: "sideLengths", label: "Side lengths for BC, CA, AB (numbers, to draw it to scale)", type: "numlist", help: "e.g. 6, 5, 4. Leave empty for a default shape." },
    { key: "sideLabels", label: "Side labels for BC, CA, AB", type: "list", help: "e.g. 6 cm, 5 cm, x" },
    { key: "angleLabels", label: "Angle labels at A, B, C", type: "list", help: "e.g. 60°, , x  (leave blank to skip)" },
    { key: "rightAngleAt", label: "Right angle at", type: "select", options: ["", "A", "B", "C"], help: "Draws the right-angle square. Uses the two sides next to that corner as the legs." },
  ],
  defaults: { vertexLabels: ["A", "B", "C"], sideLengths: [], sideLabels: ["", "", ""], angleLabels: ["", "", ""], rightAngleAt: "" },
  example: { vertexLabels: ["A", "B", "C"], sideLengths: [4, 5, 3], sideLabels: ["4 cm", "", "3 cm"], angleLabels: ["", "", "x"], rightAngleAt: "B" },
  normalize(p) {
    let lens = numList(p.sideLengths, 3);
    const rightAt = pick(str(p.rightAngleAt, 1).toUpperCase(), ["A", "B", "C"], "");
    // For a right angle the side OPPOSITE that corner is the hypotenuse. If the
    // lengths given don't obey Pythagoras, drawing them would be misleading, so
    // fall back to a standard 3-4-5 shape instead of an inaccurate figure.
    if (rightAt && lens.length === 3 && lens.every(n => n > 0)) {
      const o = "ABC".indexOf(rightAt), hyp = lens[o], legs = lens.filter((_, i) => i !== o);
      if (Math.abs(hyp * hyp - (legs[0] * legs[0] + legs[1] * legs[1])) > 0.03 * hyp * hyp) lens = [];
    }
    const vl = strList(p.vertexLabels, 3, 3);
    const pad3 = (a, d) => [0, 1, 2].map(i => a[i] ?? d);
    return {
      vertexLabels: pad3(vl, "").map((v, i) => v || "ABC"[i]),
      sideLengths: lens.length === 3 && lens.every(n => n > 0) ? lens : [],
      sideLabels: pad3(strList(p.sideLabels, 3, 12), ""),
      angleLabels: pad3(strList(p.angleLabels, 3, 8), ""),
      rightAngleAt: rightAt,
    };
  },
  render(p) {
    const idx = { A: 0, B: 1, C: 2 };
    let pts; // vertex coordinates in a y-up maths frame: [A, B, C]
    if (p.rightAngleAt) {
      const v = idx[p.rightAngleAt];
      const next = (v + 1) % 3, prev = (v + 2) % 3;
      // sides: index i is OPPOSITE vertex i (BC opposite A, CA opposite B, AB opposite C)
      const o = idx[p.rightAngleAt];
      const sd = p.sideLengths.length === 3 ? p.sideLengths : [3, 3, 3].map((_, i) => (i === o ? 5 : i === (o + 1) % 3 ? 3 : 4)); // 3-4-5
      const legNext = sd[prev], legPrev = sd[next]; // side opposite `prev` joins v and next
      pts = [null, null, null];
      pts[v] = [0, 0];
      pts[next] = [legNext, 0];
      pts[prev] = [0, legPrev];
    } else {
      const sd = p.sideLengths.length === 3 ? p.sideLengths : [6, 5, 4];
      const [a, b, c] = sd; // a=BC, b=CA, c=AB
      if (a + b <= c || a + c <= b || b + c <= a) return null; // not a triangle
      const Bp = [0, 0], Cp = [a, 0];
      const ax = (a * a + c * c - b * b) / (2 * a);
      const ay2 = c * c - ax * ax;
      if (ay2 <= 0) return null;
      pts = [[ax, Math.sqrt(ay2)], Bp, Cp];
    }
    // fit into a 400 x 270 canvas
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const bw = maxX - minX || 1, bh = maxY - minY || 1;
    const W = 400, H = 270, mx = 62, my = 52;
    const s = Math.min((W - 2 * mx) / bw, (H - 2 * my) / bh);
    const ox = (W - bw * s) / 2, oy = (H + bh * s) / 2;
    const P = pts.map(q => [ox + (q[0] - minX) * s, oy - (q[1] - minY) * s]);
    const cen = [(P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][1] + P[1][1] + P[2][1]) / 3];
    const away = (pt, d, label = "") => { const dx = pt[0] - cen[0], dy = pt[1] - cen[1], L = Math.hypot(dx, dy) || 1; const pad = d + 3.4 * String(label).length * Math.abs(dx / L); return [pt[0] + dx / L * pad, pt[1] + dy / L * d]; };

    let out = poly(P, { close: true, sw: 1.8 });
    // right-angle square
    if (p.rightAngleAt) {
      const v = idx[p.rightAngleAt], a = P[v], b = P[(v + 1) % 3], c = P[(v + 2) % 3];
      const u1 = [(b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]), (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1])];
      const u2 = [(c[0] - a[0]) / Math.hypot(c[0] - a[0], c[1] - a[1]), (c[1] - a[1]) / Math.hypot(c[0] - a[0], c[1] - a[1])];
      const k = 13;
      out += poly([[a[0] + u1[0] * k, a[1] + u1[1] * k], [a[0] + (u1[0] + u2[0]) * k, a[1] + (u1[1] + u2[1]) * k], [a[0] + u2[0] * k, a[1] + u2[1] * k]], { sw: 1.2 });
    }
    // angle arcs + labels
    for (let i = 0; i < 3; i++) {
      if (!p.angleLabels[i] || p.rightAngleAt === "ABC"[i]) continue;
      const v = P[i], a = P[(i + 1) % 3], b = P[(i + 2) % 3];
      const a0 = Math.atan2(a[1] - v[1], a[0] - v[0]), a1 = Math.atan2(b[1] - v[1], b[0] - v[0]);
      const arc = shortArc(v[0], v[1], 24, a0, a1);
      out += path(arc.d, { sw: 1.1 });
      out += text(v[0] + 40 * Math.cos(arc.mid), v[1] + 40 * Math.sin(arc.mid), p.angleLabels[i], { size: 12 });
    }
    // vertex labels
    for (let i = 0; i < 3; i++) { const q = away(P[i], 15); out += text(q[0], q[1], p.vertexLabels[i], { size: 15, bold: true }); }
    // side labels (side i is opposite vertex i, i.e. joins the other two)
    for (let i = 0; i < 3; i++) {
      if (!p.sideLabels[i]) continue;
      const a = P[(i + 1) % 3], b = P[(i + 2) % 3];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const q = away(mid, 15, p.sideLabels[i]);
      out += text(q[0], q[1], p.sideLabels[i], { size: 13 });
    }
    return svgWrap(W, H, out);
  },
};

/* ═══════════════════════════════════════════════════════════════════
   2. BAR CHART
   ═══════════════════════════════════════════════════════════════════ */
function chartFrame({ W, H, left, right, top, bottom, yScale, title, xLabel, yLabel, grid = true }) {
  const plotW = W - left - right, plotH = H - top - bottom;
  const yOf = (v) => top + plotH - ((v - yScale.min) / (yScale.max - yScale.min)) * plotH;
  let out = "";
  if (title) out += text(W / 2, 16, title, { size: 14, bold: true });
  for (let v = yScale.min; v <= yScale.max + yScale.step * 0.001; v += yScale.step) {
    const y = yOf(v);
    if (grid) out += line(left, y, left + plotW, y, { w: 0.6, color: "#bdbdbd" });
    out += line(left - 4, y, left, y, { w: 1.2 });
    out += text(left - 8, y, fmt(v), { size: 11, anchor: "end" });
  }
  out += line(left, top, left, top + plotH, { w: 1.6 });
  out += line(left, top + plotH, left + plotW, top + plotH, { w: 1.6 });
  if (xLabel) out += text(left + plotW / 2, H - 10, xLabel, { size: 12, italic: true });
  if (yLabel) out += text(13, top + plotH / 2, yLabel, { size: 12, italic: true, rotate: -90 });
  return { out, plotW, plotH, yOf, left, top };
}

const barChart = {
  id: "bar_chart",
  label: "Bar chart",
  subjects: "Mathematics, Social Studies, Science, ICT (data handling)",
  fields: [
    { key: "title", label: "Title", type: "text" },
    { key: "categories", label: "Bar labels", type: "list", help: "e.g. Mon, Tue, Wed" },
    { key: "values", label: "Bar values", type: "numlist", help: "same count as the labels, e.g. 12, 18, 9" },
    { key: "xLabel", label: "Horizontal axis title", type: "text" },
    { key: "yLabel", label: "Vertical axis title", type: "text" },
    { key: "showValues", label: "Write the value above each bar", type: "bool" },
    { key: "yMax", label: "Top of the vertical axis (optional)", type: "number" },
  ],
  defaults: { title: "", categories: ["A", "B", "C", "D"], values: [10, 15, 8, 12], xLabel: "", yLabel: "", showValues: false, yMax: null },
  example: { title: "Pupils absent each day", categories: ["Mon", "Tue", "Wed", "Thu", "Fri"], values: [4, 7, 3, 6, 9], xLabel: "Day", yLabel: "Number of pupils", showValues: false },
  normalize(p) {
    const cats = strList(p.categories, 10, 12), vals = numList(p.values, 10);
    const n = Math.min(cats.length, vals.length);
    if (n < 1 || vals.slice(0, n).some(v => !fin(v) || v < 0)) return null;
    return { title: str(p.title, 48), categories: cats.slice(0, n), values: vals.slice(0, n), xLabel: str(p.xLabel, 30), yLabel: str(p.yLabel, 30), showValues: bool(p.showValues), yMax: p.yMax === null || p.yMax === undefined || p.yMax === "" ? null : num(p.yMax, null, 1, 1e6) };
  },
  render(p) {
    const W = 400, H = 280;
    const maxV = Math.max(...p.values, 1);
    const yScale = niceScale(0, p.yMax && p.yMax >= maxV ? p.yMax : maxV, 5);
    const fr = chartFrame({ W, H, left: 52, right: 14, top: p.title ? 34 : 16, bottom: p.xLabel ? 56 : 40, yScale, title: p.title, xLabel: p.xLabel, yLabel: p.yLabel });
    let out = fr.out;
    const n = p.values.length, slot = fr.plotW / n, bw = Math.min(46, slot * 0.6);
    p.values.forEach((v, i) => {
      const cx = fr.left + slot * (i + 0.5), y = fr.yOf(v), base = fr.yOf(0);
      out += rect(cx - bw / 2, y, bw, Math.max(0, base - y), { fill: "#cfcfcf", sw: 1.4 });
      out += text(cx, base + 14, p.categories[i], { size: n > 6 ? 10 : 11.5 });
      if (p.showValues) out += text(cx, y - 8, fmt(v), { size: 11 });
    });
    return svgWrap(W, H, out);
  },
};

/* ═══════════════════════════════════════════════════════════════════
   3. LINE GRAPH (1-3 series)
   ═══════════════════════════════════════════════════════════════════ */
const lineGraph = {
  id: "line_graph",
  label: "Line graph",
  subjects: "Mathematics, Science, Social Studies (trends over time)",
  fields: [
    { key: "title", label: "Title", type: "text" },
    { key: "categories", label: "Horizontal labels", type: "list", help: "e.g. Jan, Feb, Mar" },
    { key: "values", label: "Values (one line)", type: "numlist", help: "e.g. 5, 8, 6, 12" },
    { key: "xLabel", label: "Horizontal axis title", type: "text" },
    { key: "yLabel", label: "Vertical axis title", type: "text" },
  ],
  defaults: { title: "", categories: ["1", "2", "3", "4"], values: [3, 6, 5, 9], xLabel: "", yLabel: "" },
  example: { title: "Rainfall", categories: ["Jan", "Feb", "Mar", "Apr", "May"], series: [{ name: "Town A", values: [20, 35, 50, 80, 95] }], xLabel: "Month", yLabel: "Rainfall (mm)" },
  normalize(p) {
    const cats = strList(p.categories, 12, 10);
    let series = [];
    if (Array.isArray(p.series)) series = p.series.slice(0, 3).filter(isObj).map(s => ({ name: str(s.name, 14), values: numList(s.values, 12) }));
    else series = [{ name: "", values: numList(p.values, 12) }];
    const n = Math.min(cats.length, ...series.map(s => s.values.length));
    if (!fin(n) || n < 2 || series.length < 1 || series.some(s => s.values.slice(0, n).some(v => !fin(v)))) return null;
    return { title: str(p.title, 48), categories: cats.slice(0, n), series: series.map(s => ({ name: s.name, values: s.values.slice(0, n) })), xLabel: str(p.xLabel, 30), yLabel: str(p.yLabel, 30) };
  },
  render(p) {
    const W = 400, H = 280;
    const all = p.series.flatMap(s => s.values);
    const lo = Math.min(0, ...all), hi = Math.max(...all, lo + 1);
    const yScale = niceScale(lo, hi, 5);
    const legend = p.series.length > 1 || p.series[0].name;
    const fr = chartFrame({ W, H, left: 52, right: 16, top: p.title ? 34 : 18, bottom: (p.xLabel ? 56 : 40) + (legend ? 6 : 0), yScale, title: p.title, xLabel: p.xLabel, yLabel: p.yLabel });
    let out = fr.out;
    const n = p.categories.length, xOf = (i) => fr.left + (fr.plotW * (i + 0.5)) / n;
    const dashes = ["", "7 4", "2 3"];
    p.series.forEach((s, si) => {
      const pts = s.values.map((v, i) => [xOf(i), fr.yOf(v)]);
      out += poly(pts, { sw: 2 }).replace("/>", dashes[si] ? ` stroke-dasharray="${dashes[si]}"/>` : "/>");
      pts.forEach(q => { out += circle(q[0], q[1], 3.2, { fill: si === 0 ? INK : "#fff", sw: 1.5 }); });
    });
    p.categories.forEach((c, i) => { out += line(xOf(i), fr.top + fr.plotH, xOf(i), fr.top + fr.plotH + 4, { w: 1.2 }); out += text(xOf(i), fr.top + fr.plotH + 15, c, { size: n > 7 ? 10 : 11.5 }); });
    if (legend) {
      let lx = fr.left;
      p.series.forEach((s, si) => {
        out += line(lx, H - 26, lx + 22, H - 26, { w: 2, dash: dashes[si] });
        out += text(lx + 27, H - 26, s.name || `Series ${si + 1}`, { size: 11, anchor: "start" });
        lx += 40 + (s.name.length || 8) * 6.2;
      });
    }
    return svgWrap(W, H, out);
  },
};

/* ═══════════════════════════════════════════════════════════════════
   4. PIE CHART
   ═══════════════════════════════════════════════════════════════════ */
const PIE_GREYS = ["#f2f2f2", "#b5b5b5", "#8c8c8c", "#d9d9d9", "#666666", "#e6e6e6", "#a0a0a0", "#7a7a7a"];
const pieChart = {
  id: "pie_chart",
  label: "Pie chart",
  subjects: "Mathematics, Social Studies, Science (data handling)",
  fields: [
    { key: "title", label: "Title", type: "text" },
    { key: "labels", label: "Slice labels", type: "list", help: "e.g. Maize, Rice, Yam" },
    { key: "values", label: "Slice values", type: "numlist", help: "e.g. 40, 25, 35" },
    { key: "show", label: "Show beside each slice", type: "select", options: ["none", "value", "percent", "angle"], help: "Choose 'none' when pupils must work the values out themselves." },
  ],
  defaults: { title: "", labels: ["A", "B", "C"], values: [50, 30, 20], show: "none" },
  example: { title: "Crops grown on a farm", labels: ["Maize", "Cassava", "Yam", "Cocoa"], values: [40, 30, 20, 10], show: "percent" },
  normalize(p) {
    const labels = strList(p.labels, 8, 14), vals = numList(p.values, 8);
    const n = Math.min(labels.length, vals.length);
    if (n < 1 || vals.slice(0, n).some(v => !(v > 0))) return null;
    return { title: str(p.title, 48), labels: labels.slice(0, n), values: vals.slice(0, n), show: pick(p.show, ["none", "value", "percent", "angle"], "none") };
  },
  render(p) {
    const W = 400, H = 290, cx = 200, cy = p.title ? 158 : 148, R = 88;
    const total = p.values.reduce((a, b) => a + b, 0);
    let out = p.title ? text(W / 2, 18, p.title, { size: 14, bold: true }) : "";
    if (p.values.length === 1) out += circle(cx, cy, R, { fill: PIE_GREYS[0], sw: 1.6 });
    let a = -Math.PI / 2;
    p.values.forEach((v, i) => {
      const frac = v / total, a1 = a + frac * 2 * Math.PI, mid = (a + a1) / 2;
      if (p.values.length > 1) {
        const x0 = cx + R * Math.cos(a), y0 = cy + R * Math.sin(a), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
        out += path(`M ${cx} ${cy} L ${r2(x0)} ${r2(y0)} A ${R} ${R} 0 ${frac > 0.5 ? 1 : 0} 1 ${r2(x1)} ${r2(y1)} Z`, { fill: PIE_GREYS[i % PIE_GREYS.length], sw: 1.6 });
      }
      const lx = cx + (R + 22) * Math.cos(mid), ly = cy + (R + 22) * Math.sin(mid);
      const anchor = Math.cos(mid) > 0.25 ? "start" : Math.cos(mid) < -0.25 ? "end" : "middle";
      const extra = p.show === "value" ? fmt(v) : p.show === "percent" ? `${fmt((v / total) * 100)}%` : p.show === "angle" ? `${fmt((v / total) * 360)}°` : "";
      out += text(lx, extra ? ly - 7 : ly, p.labels[i], { size: 12, anchor, bold: true });
      if (extra) out += text(lx, ly + 7, extra, { size: 11.5, anchor });
      a = a1;
    });
    return svgWrap(W, H, out);
  },
};

/* ═══════════════════════════════════════════════════════════════════
   5. NUMBER LINE (points, shaded intervals for inequalities)
   ═══════════════════════════════════════════════════════════════════ */
const numberLine = {
  id: "number_line",
  label: "Number line",
  subjects: "Mathematics (integers, fractions, inequalities)",
  fields: [
    { key: "min", label: "Smallest number shown", type: "number" },
    { key: "max", label: "Largest number shown", type: "number" },
    { key: "step", label: "Gap between tick marks", type: "number" },
    linesField("points", "Marked points", "one per line: value, label, open?  e.g.  3, A   or   -2, B, open",
      (t) => splitLines(t).map(([value, label, style]) => ({ value: num(value, NaN), label: str(label, 6), open: /^open/i.test(style || "") })).filter(p => fin(p.value)),
      (v) => (v || []).map(p => (p.open ? `${p.value}, ${p.label || ""}, open` : p.label ? `${p.value}, ${p.label}` : `${p.value}`)).join("\n")),
    { key: "shadeFrom", label: "Shade from (blank = from the left arrow)", type: "number" },
    { key: "shadeTo", label: "Shade to (blank = to the right arrow)", type: "number" },
    { key: "shade", label: "Shade an interval", type: "bool" },
    { key: "fromOpen", label: "Left end is open (circle not filled)", type: "bool" },
    { key: "toOpen", label: "Right end is open (circle not filled)", type: "bool" },
  ],
  defaults: { min: -5, max: 5, step: 1, points: [], shade: false, shadeFrom: null, shadeTo: null, fromOpen: false, toOpen: false },
  example: { min: -4, max: 6, step: 1, points: [{ value: -2, label: "A" }, { value: 3, label: "B" }], shade: false },
  normalize(p) {
    let min = num(p.min, -5, -1e4, 1e4), max = num(p.max, 5, -1e4, 1e4), step = num(p.step, 1, 1e-4, 1e4);
    if (!(max > min)) return null;
    while ((max - min) / step > 40) step *= 2;
    const points = (Array.isArray(p.points) ? p.points : []).slice(0, 10).filter(isObj).map(q => ({ value: num(q.value, NaN), label: str(q.label, 6), open: bool(q.open) })).filter(q => fin(q.value) && q.value >= min && q.value <= max);
    const maybe = (v) => (v === null || v === undefined || v === "" ? null : num(v, null, min, max));
    return { min, max, step, points, shade: bool(p.shade), shadeFrom: maybe(p.shadeFrom), shadeTo: maybe(p.shadeTo), fromOpen: bool(p.fromOpen), toOpen: bool(p.toOpen) };
  },
  render(p) {
    const W = 400, H = 110, L = 28, R = 372, y = 62;
    const xOf = (v) => L + 8 + ((v - p.min) / (p.max - p.min)) * (R - L - 16);
    let out = "";
    if (p.shade) {
      const a = p.shadeFrom === null ? L - 4 : xOf(p.shadeFrom), b = p.shadeTo === null ? R + 4 : xOf(p.shadeTo);
      out += line(Math.min(a, b), y, Math.max(a, b), y, { w: 5.5, color: "#7a7a7a", cap: "butt" });
      if (p.shadeFrom !== null) out += circle(a, y, 5, { fill: p.fromOpen ? "#fff" : INK, sw: 1.6 });
      if (p.shadeTo !== null) out += circle(b, y, 5, { fill: p.toOpen ? "#fff" : INK, sw: 1.6 });
    }
    out += line(L - 4, y, R, y, { w: 1.8 }) + arrowHead(R + 6, y, 0, 9) + arrowHead(L - 10, y, Math.PI, 9);
    for (let v = p.min; v <= p.max + p.step * 0.001; v += p.step) {
      const x = xOf(v);
      out += line(x, y - 6, x, y + 6, { w: 1.4 }) + text(x, y + 20, fmt(v), { size: 11.5 });
    }
    p.points.forEach(q => {
      const x = xOf(q.value);
      out += circle(x, y, 4.6, { fill: q.open ? "#fff" : INK, sw: 1.6 });
      out += text(x, y - 18, q.label, { size: 14, bold: true });
    });
    return svgWrap(W, H, out);
  },
};

export const _internals = { text, line, rect, circle, path, poly, arrowHead, shortArc, svgWrap, esc, r2, fin, strList, numList, bool, pick, isObj, linesField, splitLines, INK, FONT };
export const _templatesPart1 = [triangle, barChart, lineGraph, pieChart, numberLine];
