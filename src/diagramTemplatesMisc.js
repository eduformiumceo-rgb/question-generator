/**
 * Science and primary-maths diagram templates: electric circuits, clock
 * faces and fraction shapes. See diagramTemplates.js.
 */
import { num, str, _internals as u } from "./diagramTemplates.js";
const { text, line, rect, circle, path, poly, svgWrap, r2, fin, strList, bool, pick, isObj, INK } = u;

/* ═══════════════════════════════════════════════════════════════════
   ELECTRIC CIRCUIT (series or parallel)
   ═══════════════════════════════════════════════════════════════════ */
const PARTS = ["cell", "battery", "bulb", "resistor", "switch", "switch_closed", "ammeter", "voltmeter", "fuse"];
const PART_HELP = "cell, battery, bulb, resistor, switch, switch_closed, ammeter, voltmeter, fuse. Add a label after a colon, e.g. bulb:L1 or resistor:4 Ω";

/** "bulb:L1" -> { type: "bulb", label: "L1" }; unknown parts are dropped. */
function parseParts(v, maxN) {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return arr.slice(0, maxN).map(x => {
    if (isObj(x)) return { type: String(x.type || "").toLowerCase().replace(/[\s-]+/g, "_"), label: str(x.label, 10) };
    const s = String(x ?? ""); const i = s.indexOf(":");
    return { type: (i < 0 ? s : s.slice(0, i)).trim().toLowerCase().replace(/[\s-]+/g, "_"), label: str(i < 0 ? "" : s.slice(i + 1), 10) };
  }).filter(x => PARTS.includes(x.type));
}
const partsToText = (v) => (v || []).map(x => (x.label ? `${x.type}:${x.label}` : x.type)).join(", ");

/** One component drawn horizontally around the origin, on a white patch that hides the wire behind it. */
function symbol(type, label) {
  let g = `<rect x="-24" y="-17" width="48" height="34" fill="#fff"/>`;
  const L = (x1, y1, x2, y2, w = 1.7) => line(x1, y1, x2, y2, { w });
  switch (type) {
    case "cell": g += L(-24, 0, -4, 0) + L(4, 0, 24, 0) + L(-4, -15, -4, 15, 2.6) + L(4, -8, 4, 8, 2.6); break;
    case "battery": g += L(-24, 0, -11, 0) + L(11, 0, 24, 0) + L(-11, -15, -11, 15, 2.6) + L(-4, -8, -4, 8, 2.6) + L(3, -15, 3, 15, 2.6) + L(10, -8, 10, 8, 2.6) + L(-4, 0, 3, 0, 1); break;
    case "bulb": g += L(-24, 0, -13, 0) + L(13, 0, 24, 0) + circle(0, 0, 13, { sw: 1.7 }) + L(-9, -9, 9, 9, 1.5) + L(-9, 9, 9, -9, 1.5); break;
    case "resistor": g += L(-24, 0, -18, 0) + L(18, 0, 24, 0) + rect(-18, -7, 36, 14, { sw: 1.7 }); break;
    case "switch": g += L(-24, 0, -17, 0) + L(17, 0, 24, 0) + circle(-17, 0, 2.4, { fill: INK }) + circle(17, 0, 2.4, { fill: INK }) + L(-17, 0, 13, -15, 1.7); break;
    case "switch_closed": g += L(-24, 0, -17, 0) + L(17, 0, 24, 0) + circle(-17, 0, 2.4, { fill: INK }) + circle(17, 0, 2.4, { fill: INK }) + L(-17, 0, 17, 0, 1.7); break;
    case "ammeter": case "voltmeter": g += L(-24, 0, -13, 0) + L(13, 0, 24, 0) + circle(0, 0, 13, { sw: 1.7 }) + `<text x="0" y="0" dy="0.35em" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="bold" text-anchor="middle" fill="#000">${type === "ammeter" ? "A" : "V"}</text>`; break;
    case "fuse": g += L(-24, 0, -16, 0) + L(16, 0, 24, 0) + rect(-16, -5, 32, 10, { sw: 1.6 }) + L(-16, 0, 16, 0, 1.2); break;
    default: break;
  }
  return g;
}
const place = (type, x, y, deg) => `<g transform="translate(${r2(x)} ${r2(y)})${deg ? ` rotate(${deg})` : ""}">${symbol(type)}</g>`;

export const circuit = {
  id: "circuit",
  label: "Electric circuit",
  subjects: "Science, Creative Arts & Design / Technology (series and parallel circuits)",
  fields: [
    { key: "source", label: "Power source", type: "select", options: ["cell", "battery"] },
    { key: "sourceLabel", label: "Source label", type: "text", help: "e.g. 6 V" },
    { key: "series", label: "Parts on the top wire", type: "list", help: PART_HELP },
    { key: "branches", label: "Parallel branches (leave empty for a series circuit)", type: "branches", help: "One branch per line, parts separated by commas, e.g.  bulb:L1   then   bulb:L2, switch" },
    { key: "bottom", label: "Parts on the bottom wire (series circuit only)", type: "list", help: PART_HELP },
  ],
  defaults: { source: "battery", sourceLabel: "", series: [{ type: "switch", label: "" }, { type: "bulb", label: "" }], branches: [], bottom: [] },
  example: { source: "battery", sourceLabel: "6 V", series: [{ type: "switch", label: "S" }], branches: [[{ type: "bulb", label: "L1" }], [{ type: "bulb", label: "L2" }]] },
  normalize(p) {
    const series = parseParts(p.series, 4);
    const branchesRaw = Array.isArray(p.branches) ? p.branches : typeof p.branches === "string" ? p.branches.split("\n") : [];
    const branches = branchesRaw.slice(0, 3).map(b => parseParts(b, 2)).filter(b => b.length);
    return { source: pick(p.source, ["cell", "battery"], "battery"), sourceLabel: str(p.sourceLabel, 10), series, branches: branches.length >= 2 ? branches : [], bottom: parseParts(p.bottom, 3) };
  },
  render(p) {
    const W = 400, xL = 50, top = 50, B = p.branches.length ? 220 : 175;
    let out = "";
    const labelAt = (lab, x, y, anchor = "middle") => (lab ? text(x, y, lab, { size: 12.5, anchor }) : "");
    if (!p.branches.length) {
      const xR = 350;
      out += poly([[xL, B], [xL, top], [xR, top], [xR, B], [xL, B]], { sw: 1.8 });
      out += place(p.source, xL, (top + B) / 2, 90) + labelAt(p.sourceLabel, xL - 22, (top + B) / 2, "end");
      const spread = (items, y, lblY) => items.forEach((it, i) => { const x = xL + ((xR - xL) * (i + 1)) / (items.length + 1); out += place(it.type, x, y, 0) + labelAt(it.label, x, y + lblY); });
      spread(p.series, top, -26); spread(p.bottom, B, 28);
    } else {
      const k = p.branches.length, xs = k === 2 ? [190, 320] : [160, 240, 320];
      const xR = xs[k - 1];
      out += poly([[xL, B], [xL, top], [xR, top], [xR, B], [xL, B]], { sw: 1.8 });
      xs.slice(0, -1).forEach(x => { out += line(x, top, x, B, { w: 1.8 }); out += circle(x, top, 2.6, { fill: INK }) + circle(x, B, 2.6, { fill: INK }); });
      out += place(p.source, xL, (top + B) / 2, 90) + labelAt(p.sourceLabel, xL - 22, (top + B) / 2, "end");
      const topSpan = xs[0] - xL;
      p.series.slice(0, 2).forEach((it, i, a) => { const x = xL + (topSpan * (i + 1)) / (a.length + 1); out += place(it.type, x, top, 0) + labelAt(it.label, x, top - 26); });
      p.branches.forEach((br, bi) => br.forEach((it, i) => { const y = top + ((B - top) * (i + 1)) / (br.length + 1); out += place(it.type, xs[bi], y, 90) + labelAt(it.label, xs[bi] + 20, y, "start"); }));
    }
    return svgWrap(W, B + 40, out);
  },
};

/* ═══════════════════════════════════════════════════════════════════
   CLOCK FACE
   ═══════════════════════════════════════════════════════════════════ */
export const clock = {
  id: "clock",
  label: "Clock face",
  subjects: "Mathematics (telling the time), primary classes",
  fields: [
    { key: "hour", label: "Hour (1 to 12)", type: "number" },
    { key: "minute", label: "Minutes (0 to 59)", type: "number" },
    { key: "showNumbers", label: "Show the numbers 1 to 12", type: "bool" },
  ],
  defaults: { hour: 3, minute: 15, showNumbers: true },
  example: { hour: 4, minute: 30, showNumbers: true },
  normalize(p) { return { hour: Math.round(num(p.hour, 12, 0, 12)), minute: Math.round(num(p.minute, 0, 0, 59)), showNumbers: bool(p.showNumbers, true) }; },
  render(p) {
    const S = 250, c = S / 2, R = 102;
    let out = circle(c, c, R, { sw: 3 }) + circle(c, c, R - 6, { sw: 0.8 });
    for (let i = 0; i < 60; i++) {
      const a = (i * 6 - 90) * Math.PI / 180, big = i % 5 === 0, r1 = R - (big ? 15 : 10), r0 = R - 6;
      out += line(c + r1 * Math.cos(a), c + r1 * Math.sin(a), c + r0 * Math.cos(a), c + r0 * Math.sin(a), { w: big ? 2.2 : 0.9, cap: "butt" });
    }
    if (p.showNumbers) for (let h = 1; h <= 12; h++) { const a = (h * 30 - 90) * Math.PI / 180; out += text(c + 70 * Math.cos(a), c + 70 * Math.sin(a), String(h), { size: 18, bold: true }); }
    const ah = ((p.hour % 12) + p.minute / 60) * 30, am = p.minute * 6, pt = (deg, len) => [c + len * Math.sin((deg * Math.PI) / 180), c - len * Math.cos((deg * Math.PI) / 180)];
    const h = pt(ah, 46), m = pt(am, 84);
    out += line(c, c, h[0], h[1], { w: 6 }) + line(c, c, m[0], m[1], { w: 3.4 }) + circle(c, c, 5, { fill: INK });
    return svgWrap(S, S, out);
  },
};

/* ═══════════════════════════════════════════════════════════════════
   FRACTION SHAPES
   ═══════════════════════════════════════════════════════════════════ */
const SHADE = "#9c9c9c";
export const fractionShape = {
  id: "fraction_shape",
  label: "Fraction shape (shaded parts)",
  subjects: "Mathematics (fractions, primary and JHS)",
  fields: [
    { key: "shape", label: "Shape", type: "select", options: ["circle", "bar", "grid"] },
    { key: "parts", label: "Number of equal parts (circle, bar) or columns (grid)", type: "number" },
    { key: "rows", label: "Rows (grid only)", type: "number" },
    { key: "shaded", label: "How many parts are shaded", type: "number" },
    { key: "caption", label: "Text under the shape (optional)", type: "text" },
  ],
  defaults: { shape: "circle", parts: 8, rows: 2, shaded: 3, caption: "" },
  example: { shape: "bar", parts: 5, rows: 1, shaded: 2, caption: "" },
  normalize(p) {
    const shape = pick(p.shape, ["circle", "bar", "grid"], "circle");
    const parts = Math.round(num(p.parts, 4, 1, shape === "grid" ? 12 : 24)), rows = shape === "grid" ? Math.round(num(p.rows, 2, 1, 8)) : 1;
    return { shape, parts, rows, shaded: Math.round(num(p.shaded, 0, 0, parts * rows)), caption: str(p.caption, 40) };
  },
  render(p) {
    const W = 360, H = p.caption ? 230 : 210;
    let out = "";
    if (p.shape === "circle") {
      const cx = 180, cy = 105, R = 88, n = p.parts;
      if (n === 1) out += circle(cx, cy, R, { fill: p.shaded ? SHADE : "#fff", sw: 2 });
      else for (let i = 0; i < n; i++) {
        const a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
        out += path(`M ${cx} ${cy} L ${r2(cx + R * Math.cos(a0))} ${r2(cy + R * Math.sin(a0))} A ${R} ${R} 0 ${n === 2 ? 0 : 0} 1 ${r2(cx + R * Math.cos(a1))} ${r2(cy + R * Math.sin(a1))} Z`, { fill: i < p.shaded ? SHADE : "#fff", sw: 2 });
      }
    } else {
      const cols = p.parts, rows = p.rows, cw = Math.min(70, 300 / cols), ch = p.shape === "bar" ? 70 : Math.min(60, 190 / rows);
      const x0 = (W - cols * cw) / 2, y0 = (190 - rows * ch) / 2 + 8;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out += rect(x0 + c * cw, y0 + r * ch, cw, ch, { fill: r * cols + c < p.shaded ? SHADE : "#fff", sw: 2 });
    }
    if (p.caption) out += text(W / 2, 214, p.caption, { size: 14 });
    return svgWrap(W, H, out);
  },
};

export const _templatesMisc = [circuit, clock, fractionShape];
