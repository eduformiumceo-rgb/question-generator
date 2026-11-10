/**
 * Geometry-heavy diagram templates: coordinate plane, Venn diagram, circle,
 * parallel lines + transversal, and 3-D solids. See diagramTemplates.js.
 */
import { num, str, fmt, _internals as u } from "./diagramTemplates.js";
const { text, line, rect, circle, path, poly, arrowHead, shortArc, svgWrap, r2, fin, strList, bool, pick, isObj, linesField, splitLines, INK } = u;

/* ═══════════════════════════════════════════════════════════════════
   COORDINATE PLANE (points, segments, polygons, y = mx + c, parabolas)
   ═══════════════════════════════════════════════════════════════════ */
const parsePoints = (t) => splitLines(t).map(([x, y, label]) => ({ x: num(x, NaN), y: num(y, NaN), label: str(label, 4) })).filter(p => fin(p.x) && fin(p.y));
const fmtPoints = (v) => (v || []).map(p => [p.x, p.y, p.label || ""].join(", ").replace(/,\s*$/, "")).join("\n");

export const coordinatePlane = {
  id: "coordinate_plane",
  label: "Coordinate plane / graph",
  subjects: "Mathematics (plotting, straight lines, parabolas, transformations)",
  fields: [
    { key: "xMin", label: "Smallest x", type: "number" }, { key: "xMax", label: "Largest x", type: "number" },
    { key: "yMin", label: "Smallest y", type: "number" }, { key: "yMax", label: "Largest y", type: "number" },
    linesField("points", "Points", "one per line: x, y, label   e.g.  2, 3, A", parsePoints, fmtPoints),
    linesField("polygon", "Join these points into a closed shape", "one per line: x, y   (e.g. a triangle or quadrilateral)", parsePoints, fmtPoints),
    linesField("segments", "Straight segments", "one per line: x1, y1, x2, y2",
      (t) => splitLines(t).map(([x1, y1, x2, y2]) => ({ x1: num(x1, NaN), y1: num(y1, NaN), x2: num(x2, NaN), y2: num(y2, NaN) })).filter(s => [s.x1, s.y1, s.x2, s.y2].every(fin)),
      (v) => (v || []).map(s => [s.x1, s.y1, s.x2, s.y2].join(", ")).join("\n")),
    linesField("graphs", "Graphs to draw", "one per line:  line, m, c, label   (y = mx + c)   or   curve, a, b, c, label   (y = ax² + bx + c)",
      (t) => splitLines(t).map(([kind, a, b, c, d]) => /^c/i.test(kind) ? { type: "quadratic", a: num(a, NaN), b: num(b, NaN), c: num(c, NaN), label: str(d, 10) } : { type: "linear", m: num(a, NaN), c: num(b, NaN), label: str(c, 10) }),
      (v) => (v || []).map(g => g.type === "quadratic" ? `curve, ${g.a}, ${g.b}, ${g.c}, ${g.label || ""}` : `line, ${g.m}, ${g.c}, ${g.label || ""}`).join("\n")),
    { key: "showGrid", label: "Show grid squares", type: "bool" },
  ],
  defaults: { xMin: -5, xMax: 5, yMin: -5, yMax: 5, points: [], polygon: [], segments: [], graphs: [], showGrid: true },
  example: { xMin: -2, xMax: 6, yMin: -2, yMax: 6, points: [{ x: 1, y: 2, label: "A" }, { x: 4, y: 5, label: "B" }], graphs: [{ type: "linear", m: 1, c: 1, label: "y = x + 1" }], showGrid: true },
  normalize(p) {
    let xMin = Math.round(num(p.xMin, -5, -20, 0)), xMax = Math.round(num(p.xMax, 5, 0, 20));
    let yMin = Math.round(num(p.yMin, -5, -20, 0)), yMax = Math.round(num(p.yMax, 5, 0, 20));
    if (xMax - xMin < 2) { xMin = Math.min(xMin, -1); xMax = Math.max(xMax, 1); }
    if (yMax - yMin < 2) { yMin = Math.min(yMin, -1); yMax = Math.max(yMax, 1); }
    const pts = (a, n) => (Array.isArray(a) ? a : []).slice(0, n).filter(isObj).map(q => ({ x: num(q.x, NaN), y: num(q.y, NaN), label: str(q.label, 4) })).filter(q => fin(q.x) && fin(q.y));
    const graphs = (Array.isArray(p.graphs) ? p.graphs : []).slice(0, 3).filter(isObj).map(g => g.type === "quadratic"
      ? { type: "quadratic", a: num(g.a, NaN), b: num(g.b, NaN), c: num(g.c, NaN), label: str(g.label, 10) }
      : { type: "linear", m: num(g.m, NaN), c: num(g.c, NaN), label: str(g.label, 10) })
      .filter(g => (g.type === "linear" ? fin(g.m) && fin(g.c) : fin(g.a) && fin(g.b) && fin(g.c)));
    const segments = (Array.isArray(p.segments) ? p.segments : []).slice(0, 10).filter(isObj).map(s => ({ x1: num(s.x1, NaN), y1: num(s.y1, NaN), x2: num(s.x2, NaN), y2: num(s.y2, NaN) })).filter(s => [s.x1, s.y1, s.x2, s.y2].every(fin));
    return { xMin, xMax, yMin, yMax, points: pts(p.points, 16), polygon: pts(p.polygon, 12), segments, graphs, showGrid: bool(p.showGrid, true) };
  },
  render(p) {
    const xr = p.xMax - p.xMin, yr = p.yMax - p.yMin;
    const unit = Math.min(26, 330 / xr, 250 / yr);
    const padL = 34, padR = 26, padT = 24, padB = 30;
    const pw = xr * unit, ph = yr * unit, W = pw + padL + padR, H = ph + padT + padB;
    const X = (x) => padL + (x - p.xMin) * unit, Y = (y) => padT + (p.yMax - y) * unit;
    const lbl = unit < 14 ? 2 : 1; // label every nth tick on a crowded axis
    let out = "";
    if (p.showGrid) {
      for (let x = p.xMin; x <= p.xMax; x++) out += line(X(x), Y(p.yMax), X(x), Y(p.yMin), { w: 0.6, color: "#c8c8c8" });
      for (let y = p.yMin; y <= p.yMax; y++) out += line(X(p.xMin), Y(y), X(p.xMax), Y(y), { w: 0.6, color: "#c8c8c8" });
    }
    const ax = p.xMin <= 0 && p.xMax >= 0 ? X(0) : X(p.xMin), ay = p.yMin <= 0 && p.yMax >= 0 ? Y(0) : Y(p.yMin);
    out += line(X(p.xMin) - 4, ay, X(p.xMax) + 6, ay, { w: 1.7 }) + arrowHead(X(p.xMax) + 12, ay, 0, 9);
    out += line(ax, Y(p.yMin) + 4, ax, Y(p.yMax) - 6, { w: 1.7 }) + arrowHead(ax, Y(p.yMax) - 12, -Math.PI / 2, 9);
    out += text(X(p.xMax) + 14, ay + 12, "x", { size: 13, italic: true }) + text(ax - 12, Y(p.yMax) - 12, "y", { size: 13, italic: true });
    for (let x = p.xMin; x <= p.xMax; x++) {
      if (x === 0) continue;
      out += line(X(x), ay - 3, X(x), ay + 3, { w: 1.2 });
      if (x % lbl === 0) out += text(X(x), ay + 14, fmt(x), { size: 10.5 });
    }
    for (let y = p.yMin; y <= p.yMax; y++) {
      if (y === 0) continue;
      out += line(ax - 3, Y(y), ax + 3, Y(y), { w: 1.2 });
      if (y % lbl === 0) out += text(ax - 9, Y(y), fmt(y), { size: 10.5, anchor: "end" });
    }
    out += text(ax - 8, ay + 12, p.xMin <= 0 && p.xMax >= 0 && p.yMin <= 0 && p.yMax >= 0 ? "0" : "", { size: 10.5, anchor: "end" });
    // graphs, clipped by splitting where they leave the window
    p.graphs.forEach((g, gi) => {
      const f = g.type === "linear" ? (x) => g.m * x + g.c : (x) => g.a * x * x + g.b * x + g.c;
      let seg = [], segs = [];
      const N = 240;
      for (let i = 0; i <= N; i++) {
        const x = p.xMin + (xr * i) / N, y = f(x);
        if (y >= p.yMin - 1e-9 && y <= p.yMax + 1e-9) seg.push([X(x), Y(y)]);
        else if (seg.length) { segs.push(seg); seg = []; }
      }
      if (seg.length) segs.push(seg);
      segs.forEach(s => { if (s.length > 1) out += poly(s, { sw: 2 }); });
      if (g.label) {
        const best = segs.flat();
        if (best.length) {
          const q = best[Math.floor((best.length - 1) * (gi % 2 ? 0.3 : 0.88))];
          const w = g.label.length * 6.4;
          out += text(Math.max(4, Math.min(W - 4 - w, q[0] - w - 8)), Math.max(12, q[1] + (g.type === "linear" ? 14 : -4)), g.label, { size: 12, anchor: "start", italic: true, halo: true });
        }
      }
    });
    p.segments.forEach(s => { out += line(X(s.x1), Y(s.y1), X(s.x2), Y(s.y2), { w: 1.9 }); });
    if (p.polygon.length >= 3) out += poly(p.polygon.map(q => [X(q.x), Y(q.y)]), { close: true, sw: 1.9, fill: "rgba(0,0,0,0.06)" });
    [...p.polygon, ...p.points].forEach(q => {
      out += circle(X(q.x), Y(q.y), 3.6, { fill: INK });
      if (q.label) out += text(X(q.x) + 9, Y(q.y) - 9, q.label, { size: 13, bold: true, anchor: "start" });
    });
    return svgWrap(W, H, out);
  },
};

/* ═══════════════════════════════════════════════════════════════════
   VENN DIAGRAM (2 or 3 sets)
   ═══════════════════════════════════════════════════════════════════ */
export const vennDiagram = {
  id: "venn_diagram",
  label: "Venn diagram",
  subjects: "Mathematics (sets), ICT",
  fields: [
    { key: "setNames", label: "Set names (2 or 3)", type: "list", help: "e.g. A, B   or   M, S, T" },
    { key: "universal", label: "Name of the universal set", type: "text", help: "e.g. ξ  (leave blank for ξ)" },
    { key: "regions", label: "What to write in each region (leave blank to leave empty)", type: "regions" },
  ],
  defaults: { setNames: ["A", "B"], universal: "ξ", regions: {} },
  example: { setNames: ["Maths", "Science"], universal: "ξ", regions: { A: "12", B: "9", AB: "5", outside: "4" } },
  normalize(p) {
    const names = strList(p.setNames, 3, 10).filter(Boolean);
    const n = names.length >= 3 ? 3 : 2;
    const setNames = n === 3 ? names.slice(0, 3) : [names[0] || "A", names[1] || "B"];
    const keys = n === 3 ? ["A", "B", "C", "AB", "AC", "BC", "ABC", "outside"] : ["A", "B", "AB", "outside"];
    const regions = {};
    keys.forEach(k => { regions[k] = str(isObj(p.regions) ? p.regions[k] : "", 14); });
    return { setNames, universal: str(p.universal, 4) || "ξ", regions };
  },
  render(p) {
    const three = p.setNames.length === 3, W = 400, H = three ? 275 : 250;
    let out = rect(14, 14, W - 28, H - 28, { sw: 1.8 }) + text(30, 32, p.universal, { size: 15, italic: true, anchor: "start" });
    const rg = p.regions;
    if (!three) {
      out += circle(155, 128, 72, { sw: 1.8 }) + circle(245, 128, 72, { sw: 1.8 });
      out += text(112, 52, p.setNames[0], { size: 15, bold: true }) + text(288, 52, p.setNames[1], { size: 15, bold: true });
      out += text(116, 128, rg.A, { size: 14 }) + text(284, 128, rg.B, { size: 14 }) + text(200, 128, rg.AB, { size: 14 }) + text(352, 224, rg.outside, { size: 14 });
    } else {
      out += circle(163, 108, 62, { sw: 1.8 }) + circle(237, 108, 62, { sw: 1.8 }) + circle(200, 172, 62, { sw: 1.8 });
      out += text(120, 40, p.setNames[0], { size: 15, bold: true }) + text(280, 40, p.setNames[1], { size: 15, bold: true }) + text(200, 248, p.setNames[2], { size: 15, bold: true });
      out += text(138, 90, rg.A, { size: 14 }) + text(262, 90, rg.B, { size: 14 }) + text(200, 206, rg.C, { size: 14 });
      out += text(200, 82, rg.AB, { size: 14 }) + text(168, 142, rg.AC, { size: 14 }) + text(232, 142, rg.BC, { size: 14 }) + text(200, 120, rg.ABC, { size: 14 });
      out += text(352, 238, rg.outside, { size: 14 });
    }
    return svgWrap(W, H, out);
  },
};

/* ═══════════════════════════════════════════════════════════════════
   CIRCLE (points, chords, radii, tangents, angle labels)
   ═══════════════════════════════════════════════════════════════════ */
export const circleDiagram = {
  id: "circle",
  label: "Circle (chords, radii, tangents)",
  subjects: "Mathematics (circle theorems, mensuration)",
  fields: [
    { key: "centerLabel", label: "Centre label", type: "text", help: "e.g. O. Leave blank to hide the centre." },
    linesField("points", "Points on the circle", "one per line: label, angle in degrees (0 = right, 90 = top)   e.g.  A, 30",
      (t) => splitLines(t).map(([label, angle]) => ({ label: str(label, 3), angle: num(angle, NaN) })).filter(q => q.label && fin(q.angle)),
      (v) => (v || []).map(q => `${q.label}, ${q.angle}`).join("\n")),
    { key: "lines", label: "Lines to draw", type: "list", help: "pairs joined by a dash, e.g. O-A, A-B, B-C  (O means the centre)" },
    { key: "tangents", label: "Tangent at these points", type: "list", help: "e.g. A" },
    linesField("angleLabels", "Angle labels", "one per line: point, text   e.g.  B, 40°   (written inside the circle next to that point)",
      (t) => splitLines(t).map(([at, label]) => ({ at: str(at, 3), text: str(label, 8) })).filter(q => q.at && q.text),
      (v) => (v || []).map(q => `${q.at}, ${q.text}`).join("\n")),
    { key: "radiusLabel", label: "Radius label", type: "text", help: "e.g. 5 cm (written along the first radius)" },
  ],
  defaults: { centerLabel: "O", points: [{ label: "A", angle: 150 }, { label: "B", angle: 30 }, { label: "C", angle: 270 }], lines: ["O-A", "O-B"], tangents: [], angleLabels: [], radiusLabel: "" },
  example: { centerLabel: "O", points: [{ label: "A", angle: 200 }, { label: "B", angle: 340 }, { label: "C", angle: 90 }], lines: ["A-C", "B-C", "A-B"], tangents: [], angleLabels: [{ at: "C", text: "40°" }] },
  normalize(p) {
    const points = (Array.isArray(p.points) ? p.points : []).slice(0, 8).filter(isObj).map(q => ({ label: str(q.label, 3), angle: num(q.angle, NaN) })).filter(q => q.label && fin(q.angle));
    const labelSet = new Set(points.map(q => q.label));
    const centerLabel = str(p.centerLabel, 3);
    const okRef = (l) => labelSet.has(l) || (centerLabel && l === centerLabel);
    const lines = strList(p.lines, 10, 9).map(s => s.split(/[-–]/).map(x => x.trim())).filter(a => a.length === 2 && okRef(a[0]) && okRef(a[1]));
    return {
      centerLabel, points, lines,
      tangents: strList(p.tangents, 4, 3).filter(l => labelSet.has(l)),
      angleLabels: (Array.isArray(p.angleLabels) ? p.angleLabels : []).slice(0, 6).filter(isObj).map(q => ({ at: str(q.at, 3), text: str(q.text, 8) })).filter(q => labelSet.has(q.at) && q.text),
      radiusLabel: str(p.radiusLabel, 10),
    };
  },
  render(p) {
    const W = 400, H = 290, cx = 200, cy = 145, R = 100;
    const at = (deg, r = R) => [cx + r * Math.cos((-deg * Math.PI) / 180), cy + r * Math.sin((-deg * Math.PI) / 180)];
    const pos = {};
    p.points.forEach(q => { pos[q.label] = { xy: at(q.angle), deg: q.angle }; });
    if (p.centerLabel) pos[p.centerLabel] = { xy: [cx, cy], deg: null };
    let out = circle(cx, cy, R, { sw: 1.9 });
    p.lines.forEach(([a, b]) => { out += line(pos[a].xy[0], pos[a].xy[1], pos[b].xy[0], pos[b].xy[1], { w: 1.8 }); });
    p.tangents.forEach(l => {
      const q = pos[l], d = (q.deg + 90) * Math.PI / 180, L = 62;
      out += line(q.xy[0] - L * Math.cos(-d), q.xy[1] - L * Math.sin(-d), q.xy[0] + L * Math.cos(-d), q.xy[1] + L * Math.sin(-d), { w: 1.8 });
    });
    if (p.radiusLabel && p.lines.length) {
      const rl = p.lines.find(([a, b]) => a === p.centerLabel || b === p.centerLabel);
      if (rl) { const o = rl[0] === p.centerLabel ? rl[1] : rl[0]; const q = pos[o].xy; out += text((q[0] + cx) / 2 + (q[1] > cy ? -14 : 14), (q[1] + cy) / 2 - 10, p.radiusLabel, { size: 12 }); }
    }
    p.angleLabels.forEach(a => {
      const q = pos[a.at]; const inward = Math.atan2(cy - q.xy[1], cx - q.xy[0]);
      out += text(q.xy[0] + 30 * Math.cos(inward), q.xy[1] + 30 * Math.sin(inward), a.text, { size: 12 });
    });
    p.points.forEach(q => {
      const pt = pos[q.label].xy; out += circle(pt[0], pt[1], 3.3, { fill: INK });
      const lp = at(q.angle, R + 17); out += text(lp[0], lp[1], q.label, { size: 15, bold: true });
    });
    if (p.centerLabel) { out += circle(cx, cy, 3.3, { fill: INK }) + text(cx + 12, cy + 12, p.centerLabel, { size: 15, bold: true }); }
    return svgWrap(W, H, out);
  },
};

/* ═══════════════════════════════════════════════════════════════════
   PARALLEL LINES + TRANSVERSAL
   ═══════════════════════════════════════════════════════════════════ */
export const parallelLines = {
  id: "parallel_lines",
  label: "Parallel lines and a transversal",
  subjects: "Mathematics (angles: corresponding, alternate, co-interior)",
  fields: [
    { key: "top", label: "Angles at the upper line (4 labels)", type: "list", help: "upper-left, upper-right, lower-left, lower-right of the crossing. Leave blank to skip. e.g. 65°, , , x" },
    { key: "bottom", label: "Angles at the lower line (4 labels)", type: "list", help: "same order" },
    { key: "lineNames", label: "Names of the two parallel lines", type: "list", help: "e.g. P, Q (optional)" },
  ],
  defaults: { top: ["", "", "", ""], bottom: ["", "", "", ""], lineNames: [] },
  example: { top: ["", "65°", "", ""], bottom: ["", "", "x", ""], lineNames: ["P", "Q"] },
  normalize(p) {
    const four = (v) => { const a = strList(v, 4, 8); while (a.length < 4) a.push(""); return a; };
    return { top: four(p.top), bottom: four(p.bottom), lineNames: strList(p.lineNames, 2, 3) };
  },
  render(p) {
    const W = 400, H = 260, y1 = 90, y2 = 175, xa = 175, xb = 225; // crossings at (xa,y1) and (xb,y2)
    let out = line(40, y1, 360, y1, { w: 1.9 }) + line(40, y2, 360, y2, { w: 1.9 });
    out += line(xa - (y1 - 25) * ((xb - xa) / (y2 - y1)), 25, xb + (240 - y2) * ((xb - xa) / (y2 - y1)), 240, { w: 1.9 });
    // direction chevrons showing the lines are parallel
    [y1, y2].forEach(y => { out += poly([[300, y - 6], [308, y], [300, y + 6]], { sw: 1.4 }); });
    if (p.lineNames[0]) out += text(372, y1, p.lineNames[0], { size: 14, bold: true });
    if (p.lineNames[1]) out += text(372, y2, p.lineNames[1], { size: 14, bold: true });
    const place = (x, y, labels) => {
      const off = [[-30, -17], [30, -17], [-30, 20], [30, 20]]; // UL, UR, LL, LR
      labels.forEach((l, i) => { if (l) out += text(x + off[i][0], y + off[i][1], l, { size: 13 }); });
    };
    place(xa, y1, p.top); place(xb, y2, p.bottom);
    return svgWrap(W, H, out);
  },
};

/* ═══════════════════════════════════════════════════════════════════
   3-D SOLIDS (cuboid, cylinder, cone, sphere)
   ═══════════════════════════════════════════════════════════════════ */
export const solid = {
  id: "solid",
  label: "3-D solid (cuboid, cylinder, cone, sphere)",
  subjects: "Mathematics (volume, surface area), Science",
  fields: [
    { key: "kind", label: "Shape", type: "select", options: ["cuboid", "cylinder", "cone", "sphere"] },
    { key: "dims", label: "Dimension labels", type: "list", help: "cuboid: length, width, height. cylinder: radius, height. cone: radius, height, slant. sphere: radius." },
  ],
  defaults: { kind: "cuboid", dims: ["", "", ""] },
  example: { kind: "cylinder", dims: ["7 cm", "20 cm"] },
  normalize(p) { return { kind: pick(p.kind, ["cuboid", "cylinder", "cone", "sphere"], "cuboid"), dims: strList(p.dims, 3, 10) }; },
  render(p) {
    const W = 400, H = 280, d = (i) => p.dims[i] || "";
    let out = "";
    if (p.kind === "cuboid") {
      const x = 110, y = 100, w = 150, h = 100, dx = 62, dy = -42;
      out += line(x + dx, y + dy, x + w + dx, y + dy, { dash: "5 4", w: 1.3 }) + line(x + dx, y + dy, x + dx, y + h + dy, { dash: "5 4", w: 1.3 }) + line(x, y + h, x + dx, y + h + dy, { dash: "5 4", w: 1.3 });
      out += rect(x, y, w, h, { sw: 1.9 }) + poly([[x, y], [x + dx, y + dy], [x + w + dx, y + dy], [x + w, y]], { sw: 1.9 }) + poly([[x + w, y], [x + w + dx, y + dy], [x + w + dx, y + h + dy], [x + w, y + h]], { sw: 1.9 });
      out += text(x + w / 2, y + h + 17, d(0), { size: 13 }) + text(x + w + dx / 2 + 22, y + h + dy / 2 + 14, d(1), { size: 13 }) + text(x - 10, y + h / 2, d(2), { size: 13, anchor: "end" });
    } else if (p.kind === "cylinder") {
      const cx = 200, rx = 62, ry = 20, top = 62, bot = 212;
      out += path(`M ${cx - rx} ${bot} A ${rx} ${ry} 0 0 0 ${cx + rx} ${bot}`, { sw: 1.9 }) + path(`M ${cx - rx} ${bot} A ${rx} ${ry} 0 0 1 ${cx + rx} ${bot}`, { sw: 1.3, dash: "5 4" });
      out += line(cx - rx, top, cx - rx, bot, { w: 1.9 }) + line(cx + rx, top, cx + rx, bot, { w: 1.9 });
      out += `<ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}" fill="none" stroke="${INK}" stroke-width="1.9"/>`;
      out += line(cx, top, cx + rx, top, { dash: "4 3", w: 1.3 }) + circle(cx, top, 2.2, { fill: INK });
      out += text(cx + rx / 2, top - 10, d(0), { size: 13 }) + line(cx + rx + 22, top, cx + rx + 22, bot, { w: 1.2 }) + arrowHead(cx + rx + 22, top, -Math.PI / 2, 6) + arrowHead(cx + rx + 22, bot, Math.PI / 2, 6) + text(cx + rx + 30, (top + bot) / 2, d(1), { size: 13, anchor: "start" });
    } else if (p.kind === "cone") {
      const cx = 200, rx = 80, ry = 24, apex = 52, base = 210;
      out += line(cx - rx, base, cx, apex, { w: 1.9 }) + line(cx + rx, base, cx, apex, { w: 1.9 });
      out += path(`M ${cx - rx} ${base} A ${rx} ${ry} 0 0 0 ${cx + rx} ${base}`, { sw: 1.9 }) + path(`M ${cx - rx} ${base} A ${rx} ${ry} 0 0 1 ${cx + rx} ${base}`, { sw: 1.3, dash: "5 4" });
      out += line(cx, apex, cx, base, { dash: "4 3", w: 1.3 }) + line(cx, base, cx + rx, base, { dash: "4 3", w: 1.3 }) + circle(cx, base, 2.2, { fill: INK });
      out += text(cx - 12, (apex + base) / 2, d(1), { size: 13, anchor: "end" }) + text(cx + rx / 2, base + 14, d(0), { size: 13 }) + text(cx + rx / 2 + 28, (apex + base) / 2 - 8, d(2), { size: 13, anchor: "start" });
    } else {
      const cx = 200, cy = 140, R = 88, ry = 26;
      out += circle(cx, cy, R, { sw: 1.9 }) + path(`M ${cx - R} ${cy} A ${R} ${ry} 0 0 0 ${cx + R} ${cy}`, { sw: 1.5 }) + path(`M ${cx - R} ${cy} A ${R} ${ry} 0 0 1 ${cx + R} ${cy}`, { sw: 1.3, dash: "5 4" });
      out += line(cx, cy, cx + R, cy, { w: 1.6 }) + circle(cx, cy, 2.4, { fill: INK }) + text(cx + R / 2, cy - 11, d(0), { size: 13 });
    }
    return svgWrap(W, H, out);
  },
};

export const _templatesGeometry = [coordinatePlane, vennDiagram, circleDiagram, parallelLines, solid];
