/**
 * shadingSheet.js
 * ─────────────────────────────────────────────────────────────────
 * The objective-test SHADING SHEET (answer sheet) for a paper, in two styles:
 *
 *   "bece"   - BECE-type sheet. Follows the Ghana Education Service objective answer sheet (see beceSheet.js):
 *              60 questions as [A]-[E] boxes, candidate-number grid, timing marks. School name and logo, school colours.
 *   "wassce" - WASSCE-type sheet. Formal double-ruled frame, school name, logo,
 *              motto/address line and school colours, a paper-version row,
 *              denser five-column answer grid.
 *
 * PRINT LAYOUT: TWO PER A4
 * Each sheet is half of A4: A5 portrait, 148.5 x 210 mm. The printout is one A4
 * page in LANDSCAPE (297 x 210 mm) carrying two identical sheets side by side,
 * with a dashed cut line down the middle. One straight cut gives two sheets
 * at exactly A5. If the paper has more questions than one sheet holds, the
 * extra questions continue on a second A4 (again two per page).
 *
 * EXACT SIZES
 * Every dimension below is a physical size in millimetres, laid out in CSS `mm`
 * with `@page { size: 297mm 210mm; margin: 0 }`. Nothing is scaled to fit:
 * bubble diameter, bubble pitch, row pitch, column pitch and index-grid pitch are
 * the same whatever the number of questions, the school name or the logo; only
 * the number of rows filled changes. Print at 100% / "Actual size".
 *
 * The numbers in SHEET_SPECS are the single source of truth for those sizes.
 * They follow standard OMR conventions and the half-A4 cut size; they have NOT
 * been measured from an official WAEC sheet (none is published). To match a real
 * sheet exactly, change the values here - nothing else in the app needs to move.
 *
 * Neither style reproduces WAEC's name, crest or any examining-body mark: only
 * the school's own name and logo (or the app's generic crest) are printed.
 * ─────────────────────────────────────────────────────────────────
 */

/** The printed A4 page (landscape) that carries two sheets. */
import { renderBeceSheet, BECE_GEOM, BECE_PER_SHEET } from "./beceSheet.js";

export const PRINT_PAGE = { w: 297, h: 210 };

/** Physical specification of each style, all in millimetres. */
export const SHEET_SPECS = {
  bece: {
    id: "bece",
    label: "BECE style",
    card: { w: 148.5, h: 210 },          // one sheet = half of A4 (A5 portrait)
    margin: 8,                           // blank border inside the sheet (clear of every printer's unprintable edge)
    columns: 4,                          // answer columns across the sheet
    bubble: 4.2,                         // bubble diameter
    optionPitch: 5.6,                    // centre-to-centre, option to option
    rowPitch: 6.2,                       // centre-to-centre, question to question
    numberW: 6.5,                        // width reserved for the question number
    colGap: 2.5,                         // gap between answer columns
    header: { h: 22, logo: 17 },         // letterhead block
    index: { bubble: 3.8, pitch: 5.6, rowPitch: 4.6, boxH: 6 }, // index-number grid
    guideH: 21.5,                          // "how to shade" panel
    ruleThick: 0.9,
    defaultColour: "school",             // BECE layout in the school's colours (black & white is one tap away)
    showMotto: false,                    // BECE style: school name and logo only
    versionRow: false,
  },
  wassce: {
    id: "wassce",
    label: "WASSCE style",
    card: { w: 148.5, h: 210 },
    margin: 9,                           // the double-ruled frame sits at margin - 1.8 mm
    columns: 5,
    bubble: 3.6,
    optionPitch: 4.8,
    rowPitch: 5.1,
    numberW: 4.9,
    colGap: 1.2,
    header: { h: 22.5, logo: 18 },
    index: { bubble: 3.4, pitch: 5.6, rowPitch: 4.4, boxH: 5.6 },
    guideH: 21.5,
    ruleThick: 1.1,
    defaultColour: "school",
    showMotto: true,
    versionRow: true,                    // paper-version A/B/C bubbles and a sex (M/F) bubble pair
  },
};

/** Corner alignment marks: black squares kept 4.5 mm inside the sheet edge, which every office printer can reach. */
export const ALIGN_MARK = { size: 1.7, inset: 4.5 };

export const MAX_QUESTIONS = 100;

/** The style a level normally uses: BECE for Primary and JHS, WASSCE for SHS. */
export const defaultSheetStyle = (isSHS) => (isSHS ? "wassce" : "bece");

/** One-line size summary shown in the UI, read from the spec so it can never disagree with the print. */
export function sheetSizeSummary(style, questions = 40, optionCount = 4) {
  if (style === "bece") return `Each sheet is half of A4 (${BECE_GEOM.W} × ${BECE_GEOM.H} mm), two per A4 landscape, cut along the dashed line · ${BECE_PER_SHEET} questions per sheet in 3 columns, [A] to [E] boxes`;
  const s = SHEET_SPECS[style] || SHEET_SPECS.bece;
  const p = layoutFor(s, questions, optionCount);
  return `Each sheet is half of A4 (${s.card.w} × ${s.card.h} mm), two per A4 landscape, cut along the dashed line · ${p.cols} columns · bubbles ${s.bubble} mm · row spacing ${s.rowPitch} mm`;
}

/** Ready-made school colour pairs (name, main, accent). */
export const SCHOOL_COLOUR_PRESETS = [
  { id: "navy-gold", label: "Navy & Gold", main: "#12285C", accent: "#C99A2E" },
  { id: "maroon-gold", label: "Maroon & Gold", main: "#7A1020", accent: "#C99A2E" },
  { id: "green-gold", label: "Green & Gold", main: "#0F5C32", accent: "#C99A2E" },
  { id: "blue-red", label: "Royal Blue & Red", main: "#1747A6", accent: "#C62828" },
  { id: "black-gold", label: "Black & Gold", main: "#1A1A1A", accent: "#C99A2E" },
  { id: "purple-gold", label: "Purple & Gold", main: "#4B2A7B", accent: "#C99A2E" },
  { id: "sky-navy", label: "Sky Blue & Navy", main: "#1F7ACB", accent: "#12285C" },
  { id: "green-red", label: "Green & Red", main: "#14753F", accent: "#C62828" },
  { id: "bece-red", label: "BECE Red (best for pencil)", main: "#B3151F", accent: "#B3151F" },
];
export const DEFAULT_SCHOOL_COLOURS = { main: SCHOOL_COLOUR_PRESETS[0].main, accent: SCHOOL_COLOUR_PRESETS[0].accent };

/** Number of objective questions: from a generated paper (real counts) or from the section set-up. */
export function objectiveCount(sections = [], { generated = false } = {}) {
  let n = 0;
  for (const s of sections || []) {
    if (!s || s.type !== "objective") continue;
    if (!generated && s.enabled === false) continue;
    n += generated && Array.isArray(s.questions) ? s.questions.length : Math.max(0, Number(s.questionCount) || 0);
  }
  return n;
}

export const clampQuestions = (n) => Math.max(1, Math.min(MAX_QUESTIONS, Math.round(Number(n) || 0)));

/* ── colour helpers ───────────────────────────────────────────── */
export function normHex(c, fallback = "#12285C") {
  let s = String(c || "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split("").map(ch => ch + ch).join("");
  return /^[0-9a-f]{6}$/i.test(s) ? `#${s.toUpperCase()}` : fallback;
}
const rgb = (h) => { const s = normHex(h).slice(1); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); };
const hex = (a) => `#${a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
export const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); };
export function luminance(h) {
  const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Text colour that stays readable on `bg`. */
export const textOn = (bg) => (luminance(bg) > 0.4 ? "#111111" : "#FFFFFF");
/** A colour dark enough to draw thin lines and small text with on white paper. */
export function inkOf(c) {
  let x = normHex(c);
  for (let i = 0; i < 12 && luminance(x) > 0.2; i++) x = mix(x, "#000000", 0.18);
  return x;
}

/** Final palette for a sheet. "mono" drops every school colour. */
export function sheetPalette({ colourMode = "school", main, accent } = {}) {
  if (colourMode === "mono") {
    return { band: "#1A1A1A", onBand: "#FFFFFF", ink: "#1A1A1A", accent: "#555555", accentInk: "#444444", tint: "#F0F0F0", tintDeep: "#DCDCDC", mono: true };
  }
  const band = normHex(main, DEFAULT_SCHOOL_COLOURS.main);
  const acc = normHex(accent, DEFAULT_SCHOOL_COLOURS.accent);
  return { band, onBand: textOn(band), ink: inkOf(band), accent: acc, accentInk: inkOf(acc), tint: mix(band, "#FFFFFF", 0.92), tintDeep: mix(band, "#FFFFFF", 0.82), mono: false };
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mm = (n) => `${Math.round(n * 1000) / 1000}mm`;
const LETTERS = ["A", "B", "C", "D", "E"];

/**
 * Columns, rows and pitch for `n` questions. Sizes never change; if five options cannot fit
 * a column without the bubbles touching, the sheet uses one column fewer instead of shrinking anything.
 */
export function layoutFor(spec, n, optionCount = 4) {
  let cols = spec.columns;
  const inner = spec.card.w - 2 * spec.margin;
  const geom = (c) => {
    const colW = (inner - spec.colGap * (c - 1)) / c;
    const maxPitch = (colW - spec.numberW - spec.bubble / 2 - 1) / optionCount;
    return { colW, maxPitch };
  };
  while (cols > 3 && geom(cols).maxPitch < spec.bubble + 0.7) cols--;
  const { colW, maxPitch } = geom(cols);
  const rows = Math.max(1, Math.ceil(n / cols));
  return { cols, rows, colW, pitch: Math.min(spec.optionPitch, maxPitch) };
}

/** Vertical plan of the first sheet, fixed per style (mm from the top of the sheet). */
function plan(spec, digits) {
  const isW = spec.id === "wassce";
  const headTop = spec.margin + (isW ? 1.5 : 0);
  const ixColH = 1.6 + spec.index.boxH + 1 + 10 * spec.index.rowPitch;   // one digit column, exact
  const indexH = 5 + ixColH + 0.6;                                      // header strip + column + border
  const candTop = headTop + spec.header.h + 3;
  const guideTop = candTop + indexH + 3;
  const gridTop1 = guideTop + spec.guideH + 4;
  return { headTop, ixColH, indexH, candTop, guideTop, gridTop1 };
}
const GRID_TITLE_H = 6.5;
const FOOT_H = 10;
const rowsFit = (spec, top) => Math.max(1, Math.floor((spec.card.h - spec.margin - FOOT_H - top - GRID_TITLE_H) / spec.rowPitch));

/* ── building blocks ──────────────────────────────────────────── */
const bubble = (letter, extra = "") => `<i class="b ${extra}">${letter ? esc(letter) : ""}</i>`;

function indexGrid(spec, digits) {
  const w = digits * spec.index.pitch;
  let cols = "";
  for (let c = 0; c < digits; c++) {
    let col = `<div class="ix-box"></div>`;
    for (let d = 0; d <= 9; d++) col += `<div class="ix-c"><i class="b ix-b">${d}</i></div>`;
    cols += `<div class="ix-col">${col}</div>`;
  }
  return `<div class="ix" style="width:${mm(w)}"><div class="ix-h">INDEX NUMBER</div><div class="ix-cols">${cols}</div></div>`;
}

function shadeGuide() {
  const mk = (cls, label, ok) =>
    `<span class="eg"><i class="b ${cls}">A</i><span class="eg-t ${ok ? "ok" : "bad"}">${label}</span></span>`;
  return `<div class="guide">
    <div class="guide-t">HOW TO SHADE</div>
    <div class="guide-body">
      <ul>
        <li>Write your index number in the boxes, then shade the matching bubbles.</li>
        <li>Use an <b>HB pencil</b> only, not a pen.</li>
        <li>Shade <b>one</b> bubble per question, fully and darkly.</li>
        <li>To change an answer, rub out the old mark <b>completely</b>.</li>
        <li>Do not fold, staple or write outside the boxes.</li>
      </ul>
      <div class="egs">${mk("fill", "Correct", true)}${mk("tick", "Wrong", false)}${mk("half", "Wrong", false)}${mk("dot", "Wrong", false)}</div>
    </div>
  </div>`;
}

function answerGrid(spec, from, to, rows, optionCount, lay) {
  const { cols, colW, pitch } = lay;
  let out = `<div class="grid" style="grid-template-columns:repeat(${cols},${mm(colW)});column-gap:${mm(spec.colGap)}">`;
  for (let c = 0; c < cols; c++) {
    let col = `<div class="gcol">`;
    for (let r = 0; r < rows; r++) {
      const q = from + c * rows + r;
      if (q > to) break;
      let opts = "";
      for (let k = 0; k < optionCount; k++) opts += bubble(LETTERS[k]);
      col += `<div class="row ${r % 2 ? "alt" : ""}"><span class="qn">${q}</span><span class="opts" style="gap:${mm(pitch - spec.bubble)}">${opts}</span></div>`;
    }
    out += col + `</div>`;
  }
  return out + `</div>`;
}

const crestFor = (meta, crestSVG) =>
  meta.schoolLogo ? `<img class="logo" src="${esc(meta.schoolLogo)}" alt="School logo"/>`
  : crestSVG ? `<div class="logo crest">${crestSVG}</div>` : "";

/* ── the printout ─────────────────────────────────────────────── */
/**
 * @param {object} o
 *   style        "bece" | "wassce"
 *   questions    number of questions (1-100)
 *   optionCount  4 (A-D) or 5 (A-E)
 *   colourMode   "school" | "mono"
 *   colours      { main, accent }
 *   meta         { schoolName, schoolMotto, schoolLogo, subject, className, programme, term, examType, examVersion, idDigits }
 *   crestSVG     optional inline SVG used when no logo is uploaded
 * @returns a complete HTML document: A4 landscape, two identical A5 sheets per page
 */
export function renderShadingSheetHTML(o = {}) {
  const spec = SHEET_SPECS[o.style] || SHEET_SPECS.bece;
  const n = clampQuestions(o.questions || 40);
  const optionCount = Number(o.optionCount) === 5 ? 5 : 4;
  const meta = o.meta || {};
  const pal = sheetPalette({ colourMode: o.colourMode || spec.defaultColour, ...(o.colours || {}) });
  const digits = Math.max(4, Math.min(15, Math.round(Number(meta.idDigits) || 10)));
  const isW = spec.id === "wassce";

  // BECE-type sheets follow the Ghana Education Service objective answer sheet and have their own renderer.
  if (spec.id === "bece") {
    return renderBeceSheet({ PRINT_PAGE, pal, esc, mm, logoMarkup: crestFor(meta, o.crestSVG), meta, n, preview: !!o.preview });
  }

  const name = String(meta.schoolName || "").trim();
  const nameLen = name.length;
  // Name size steps down in fixed jumps; the sheet's geometry never moves.
  const nameSize = nameLen > 46 ? 3.3 : nameLen > 34 ? 3.9 : nameLen > 24 ? 4.5 : 5.2;
  const sub = [meta.subject, meta.programme, meta.className].filter(Boolean).join("  |  ");
  const exam = [meta.examType, meta.term].filter(Boolean).join("  |  ");

  const P = plan(spec, digits);
  const indexW = digits * spec.index.pitch;
  const contentW = spec.card.w - 2 * spec.margin;
  const leftW = contentW - indexW - 4;

  const lay = layoutFor(spec, n, optionCount);
  const fit1 = rowsFit(spec, P.gridTop1);
  const miniTop = spec.margin + 16.5;
  const fitN = rowsFit(spec, miniTop);

  // Split the questions across sheets (a sheet only holds what fits at the fixed row pitch).
  const cards = [];
  let from = 1, first = true;
  while (from <= n) {
    const cap = (first ? fit1 : fitN) * lay.cols;
    const to = Math.min(n, from + cap - 1);
    cards.push({ from, to, rows: Math.min(first ? fit1 : fitN, Math.ceil((to - from + 1) / lay.cols)), first });
    from = to + 1; first = false;
  }

  const logoMarkup = crestFor(meta, o.crestSVG);
  const verRow = spec.versionRow
    ? `<div class="ver"><span class="lab">PAPER VERSION</span>${["A", "B", "C"].map(v => `<i class="b ${String(meta.examVersion || "") === v ? "fill" : ""}">${v}</i>`).join("")}<span class="lab gapL">SEX</span><i class="b">M</i><i class="b">F</i></div>`
    : "";

  const header = `
    <div class="head" style="top:${mm(P.headTop)}">
      <div class="head-logo">${logoMarkup}</div>
      <div class="head-mid">
        <div class="school" style="font-size:${mm(nameSize)}">${esc(name) || "&nbsp;"}</div>
        ${spec.showMotto && meta.schoolMotto ? `<div class="motto">${esc(meta.schoolMotto)}</div>` : ""}
        <div class="title">OBJECTIVE TEST &ndash; ANSWER SHEET</div>
        ${(sub || exam) ? `<div class="sub">${esc([sub, exam].filter(Boolean).join("   |   "))}</div>` : ""}
      </div>
      <div class="head-logo"></div>
    </div>`;

  const candidate = `
    <div class="cand" style="top:${mm(P.candTop)}">
      <div class="cand-left" style="width:${mm(leftW)}">
        <div class="fld"><span class="lab">CANDIDATE'S NAME</span><span class="ln"></span></div>
        <div class="fld"><span class="lab">CLASS</span><span class="ln"></span></div>
        <div class="fld"><span class="lab">DATE</span><span class="ln"></span></div>
        <div class="fld"><span class="lab">SIGNATURE</span><span class="ln"></span></div>
        ${verRow}
      </div>
      ${indexGrid(spec, digits)}
    </div>
    <div class="guide-wrap" style="top:${mm(P.guideTop)};height:${mm(spec.guideH)}">${shadeGuide()}</div>`;

  const official = `<div class="official"><span>FOR OFFICIAL USE ONLY</span><span class="score"><span>Score</span><i></i><span>/ ${n}</span></span></div>`;

  const cardHTML = (c, i) => {
    const top = c.first ? P.gridTop1 : miniTop;
    const mini = c.first ? "" : `<div class="mini" style="top:${mm(spec.margin + 0.5)}"><b>${esc(name)}</b><span>ANSWER SHEET (continued)</span></div>
      <div class="mini2" style="top:${mm(spec.margin + 7.5)}"><span class="fld"><span class="lab">CANDIDATE'S NAME</span><span class="ln"></span></span><span class="fld w"><span class="lab">INDEX No.</span><span class="ln"></span></span></div>`;
    return `<div class="card st-${spec.id}">
      ${isW ? `<div class="frame"></div>` : ""}
      <i class="reg tl"></i><i class="reg tr"></i><i class="reg bl"></i><i class="reg br"></i>
      ${c.first ? header + candidate : mini}
      <div class="gridwrap" style="top:${mm(top)}">
        <div class="grid-t">ANSWERS <span>(Questions ${c.from}&ndash;${c.to})</span></div>
        ${answerGrid(spec, c.from, c.to, c.rows, optionCount, lay)}
      </div>
      <div class="foot">${official}<span class="pg">Sheet ${i + 1} of ${cards.length}</span></div>
    </div>`;
  };

  // Two identical sheets side by side on every A4 landscape page, with a cut line down the middle.
  const sheets = cards.map((c, i) => `<section class="sheet">
      <div class="slot l">${cardHTML(c, i)}</div>
      <div class="slot r">${cardHTML(c, i)}</div>
      <div class="cut"><span class="scis">&#9986;</span><em>cut here</em></div>
    </section>`).join("");

  const b = spec.bubble, ib = spec.index.bubble;
  const cutX = PRINT_PAGE.w / 2;
  const regIn = ALIGN_MARK.inset;
  const css = `
  @page{size:${mm(PRINT_PAGE.w)} ${mm(PRINT_PAGE.h)};margin:0}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:"Helvetica Neue",Arial,"Liberation Sans",sans-serif;color:#111}
  .sheet{position:relative;width:${mm(PRINT_PAGE.w)};height:${mm(PRINT_PAGE.h)};overflow:hidden;background:#fff;page-break-after:always;break-after:page}
  .sheet:last-child{page-break-after:auto;break-after:auto}
  .slot{position:absolute;top:0;width:${mm(spec.card.w)};height:${mm(spec.card.h)}}
  .slot.l{left:0}.slot.r{left:${mm(cutX)}}
  .cut{position:absolute;left:${mm(cutX)};top:0;bottom:0;width:0;border-left:${mm(0.3)} dashed #666;z-index:5}
  .cut .scis{position:absolute;top:${mm(2)};left:${mm(-2.6)};font-size:${mm(4.2)};background:#fff;line-height:1;color:#444;transform:rotate(90deg)}
  .cut em{position:absolute;bottom:${mm(1.4)};left:${mm(-6)};width:${mm(12)};text-align:center;font:italic ${mm(2)}/1 Arial,sans-serif;color:#666;background:#fff}
  .card{position:relative;width:${mm(spec.card.w)};height:${mm(spec.card.h)};overflow:hidden;background:#fff}
  .reg{position:absolute;width:${mm(ALIGN_MARK.size)};height:${mm(ALIGN_MARK.size)};background:#000}
  .reg.tl{left:${mm(regIn)};top:${mm(regIn)}}.reg.tr{right:${mm(regIn)};top:${mm(regIn)}}
  .reg.bl{left:${mm(regIn)};bottom:${mm(regIn)}}.reg.br{right:${mm(regIn)};bottom:${mm(regIn)}}
  .frame{position:absolute;left:${mm(spec.margin - 1.8)};right:${mm(spec.margin - 1.8)};top:${mm(spec.margin - 1.8)};bottom:${mm(spec.margin - 1.8)};border:${mm(0.6)} solid ${pal.ink};outline:${mm(0.2)} solid ${pal.ink};outline-offset:${mm(0.6)};pointer-events:none}
  .head{position:absolute;left:${mm(spec.margin)};right:${mm(spec.margin)};height:${mm(spec.header.h)};display:flex;align-items:center;gap:${mm(3)};border-bottom:${mm(spec.ruleThick)} solid ${pal.ink};padding-bottom:${mm(1.4)}}
  .head::after{content:"";position:absolute;left:0;right:0;bottom:${mm(-spec.ruleThick - 0.9)};height:${mm(0.3)};background:${pal.mono ? pal.ink : pal.accent}}
  .head-logo{width:${mm(spec.header.logo)};height:${mm(spec.header.logo)};flex:none;display:flex;align-items:center;justify-content:center}
  .logo{max-width:${mm(spec.header.logo)};max-height:${mm(spec.header.logo)};object-fit:contain;display:block}
  .crest{width:${mm(spec.header.logo)};height:${mm(spec.header.logo)}}
  .crest svg{width:${mm(spec.header.logo)};height:${mm(spec.header.logo)};display:block}
  .head-mid{flex:1;min-width:0;text-align:center}
  .school{font-weight:800;letter-spacing:.02em;text-transform:uppercase;line-height:1.1;color:${pal.ink};overflow-wrap:anywhere}
  .motto{font-size:${mm(2.2)};font-style:italic;color:${pal.mono ? "#444" : pal.accentInk};margin-top:${mm(0.6)}}
  .title{display:inline-block;margin-top:${mm(1.4)};font-size:${mm(2.6)};font-weight:800;letter-spacing:.1em;padding:${mm(0.8)} ${mm(3)};background:${pal.band};color:${pal.onBand}}
  .sub{margin-top:${mm(1.2)};font-size:${mm(2.2)};font-weight:600;color:#222}
  .cand{position:absolute;left:${mm(spec.margin)};right:${mm(spec.margin)};display:flex;gap:${mm(4)};justify-content:space-between}
  .cand-left{display:flex;flex-direction:column;gap:${mm(3.4)};padding-top:${mm(0.6)}}
  .fld{display:flex;align-items:flex-end;gap:${mm(1.6)}}
  .lab{font-size:${mm(2)};font-weight:700;letter-spacing:.05em;color:${pal.ink};white-space:nowrap}
  .ln{flex:1;border-bottom:${mm(0.3)} solid #000;height:${mm(5)}}
  .ver{display:flex;align-items:center;gap:${mm(1.8)};margin-top:${mm(0.6)}}
  .ver .gapL{margin-left:${mm(3)}}
  .ix{flex:none}
  .ix-h{font-size:${mm(2.1)};font-weight:800;letter-spacing:.1em;text-align:center;background:${pal.band};color:${pal.onBand};height:${mm(5)};line-height:${mm(5)}}
  .ix-cols{display:flex;background:${pal.tint};border:${mm(0.25)} solid ${pal.ink};border-top:none}
  .ix-col{width:${mm(spec.index.pitch)};height:${mm(P.ixColH)};display:flex;flex-direction:column;align-items:center;padding-top:${mm(0.8)}}
  .ix-col:nth-child(even){background:${pal.tintDeep}}
  .ix-box{flex:none;width:${mm(spec.index.pitch - 1)};height:${mm(spec.index.boxH)};border:${mm(0.3)} solid #000;background:#fff;margin-bottom:${mm(1)}}
  .ix-c{flex:none;height:${mm(spec.index.rowPitch)};width:100%;display:flex;align-items:center;justify-content:center}
  .ix-b{width:${mm(ib)};height:${mm(ib)};font-size:${mm(ib * 0.55)};flex:none}
  .guide-wrap{position:absolute;left:${mm(spec.margin)};right:${mm(spec.margin)}}
  .guide{height:100%;border:${mm(0.25)} solid ${pal.ink};padding:${mm(1.4)} ${mm(2.4)};background:#fff;display:flex;flex-direction:column}
  .guide-t{font-size:${mm(2.1)};font-weight:800;letter-spacing:.1em;color:${pal.ink};margin-bottom:${mm(1)}}
  .guide-body{display:flex;gap:${mm(3)};flex:1}
  .guide ul{list-style:none;font-size:${mm(2.1)};line-height:1.4;color:#222;flex:1;min-width:0}
  .guide li::before{content:"\\25AA";color:${pal.mono ? "#000" : pal.accentInk};margin-right:${mm(1.1)}}
  .egs{flex:none;width:${mm(38)};display:flex;flex-wrap:wrap;align-content:center;gap:${mm(1.8)} 0}
  .eg{display:flex;align-items:center;gap:${mm(1.2)};width:${mm(19)}}
  .eg-t{font-size:${mm(2)};font-weight:700;white-space:nowrap}
  .eg-t.ok{color:#0a6b2d}.eg-t.bad{color:#a11}
  .gridwrap{position:absolute;left:${mm(spec.margin)};right:${mm(spec.margin)}}
  .grid-t{font-size:${mm(2.3)};font-weight:800;letter-spacing:.12em;color:${pal.onBand};background:${pal.band};height:${mm(5.2)};line-height:${mm(5.2)};padding:0 ${mm(2.4)};margin-bottom:${mm(1.3)}}
  .grid-t span{font-weight:600;letter-spacing:.04em;opacity:.9;margin-left:${mm(1.6)}}
  .grid{display:grid}
  .gcol{display:flex;flex-direction:column}
  .row{height:${mm(spec.rowPitch)};display:flex;align-items:center;padding-left:${mm(0.6)}}
  .row.alt{background:${pal.tint}}
  .qn{width:${mm(spec.numberW - 0.6)};font-size:${mm(2.4)};font-weight:800;color:${pal.ink};text-align:right;padding-right:${mm(1.1)};flex:none}
  .opts{display:flex}
  .b{display:inline-flex;align-items:center;justify-content:center;flex:none;width:${mm(b)};height:${mm(b)};border-radius:50%;border:${mm(0.3)} solid ${pal.ink};background:#fff;font-style:normal;font-size:${mm(b * 0.52)};font-weight:700;color:${pal.ink};line-height:1}
  .b.fill{background:#111;color:#fff;border-color:#111}
  .b.tick{color:#a11;border-color:#a11;position:relative}
  .b.tick::after{content:"\\2713";position:absolute;font-size:${mm(b * 0.9)};color:#a11}
  .b.half{background:linear-gradient(90deg,#111 50%,#fff 50%);color:#888}
  .b.dot{color:#fff;position:relative}
  .b.dot::after{content:"";position:absolute;width:${mm(0.9)};height:${mm(0.9)};border-radius:50%;background:#111}
  .foot{position:absolute;left:${mm(spec.margin)};right:${mm(spec.margin)};bottom:${mm(spec.margin - 0.5)};display:flex;justify-content:space-between;align-items:flex-end;font-size:${mm(1.9)};color:#333}
  .official{white-space:nowrap;display:inline-flex;gap:${mm(4)};align-items:flex-end;border:${mm(0.25)} dashed #777;padding:${mm(0.9)} ${mm(3)};font-weight:700;letter-spacing:.04em}
  .score{display:inline-flex;align-items:flex-end;gap:${mm(1)}}
  .score i{display:block;width:${mm(9)};height:${mm(2.2)};border-bottom:${mm(0.3)} solid #000}
  .mini{position:absolute;left:${mm(spec.margin)};right:${mm(spec.margin)};display:flex;justify-content:space-between;gap:${mm(3)};font-size:${mm(2.6)};color:${pal.ink}}
  .mini2{position:absolute;left:${mm(spec.margin)};right:${mm(spec.margin)};display:flex;gap:${mm(4)};border-bottom:${mm(spec.ruleThick)} solid ${pal.ink};padding-bottom:${mm(1.4)}}
  .mini2 .fld{flex:1}.mini2 .fld.w{flex:0 0 ${mm(46)}}
  @media screen{
    body{background:#d9dce1;padding:${mm(o.preview ? 6 : 14)} 0}
    .sheet{margin:0 auto ${mm(10)};box-shadow:0 1mm 4mm rgba(0,0,0,.25)}
    .bar{position:fixed;left:0;right:0;top:0;z-index:9;background:#111;color:#fff;font:600 13px/1.4 Arial,sans-serif;padding:8px 14px;text-align:center}
  }
  @media print{.bar{display:none}body{padding:0}}
  `;

  const script = `
    (function(){
      var done=false;function ok(){if(!done){done=true;window.__paperReady=true}}
      var imgs=[].slice.call(document.images),pend=imgs.filter(function(i){return !i.complete}).length;
      if(!pend)ok();
      imgs.forEach(function(i){if(!i.complete){i.addEventListener('load',function(){if(--pend<=0)ok()});i.addEventListener('error',function(){if(--pend<=0)ok()})}});
      setTimeout(ok,2500);
    })();`;

  const title = `${esc(name || "School")} - Shading Sheet`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title><style>${css}</style></head><body data-sheet-style="${spec.id}" data-questions="${n}" data-sheets="${cards.length}">
${o.preview ? "" : `<div class="bar">Print on A4 LANDSCAPE at 100% (Actual size), margins None. Then cut along the dashed line: two sheets, each half of A4.</div>`}
${sheets}
<script>${script}</script></body></html>`;
}
