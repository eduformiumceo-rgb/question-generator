/**
 * shadingSheet.js
 * ─────────────────────────────────────────────────────────────────
 * The objective-test SHADING SHEET (answer sheet) for a paper, in two styles:
 *
 *   "bece"   - BECE-type sheet. Follows the Ghana Education Service objective answer sheet (see beceSheet.js):
 *              60 questions as [A]-[E] boxes, candidate-number grid, timing marks. School name and logo, school colours.
 *   "wassce" - WASSCE-type sheet (see wassceSheet.js): ONE full A4 portrait sheet per candidate, with the index-number grid,
 *              paper version and sex, instructions, and exactly as many numbered bracket-box questions as the paper has.
 *
 * PRINT LAYOUT
 * WASSCE-type: one full A4 PORTRAIT page per sheet (210 x 297 mm), up to 100 questions on the one page.
 * BECE-type: TWO PER A4. Each sheet is half of A4: A5 portrait, 148.5 x 210 mm. The printout is one A4
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

import { renderBeceSheet, BECE_GEOM, BECE_PER_SHEET, fitSchoolName } from "./beceSheet.js";
import { renderWassceSheet, WASSCE_SHEET, wassceLayout } from "./wassceSheet.js";
import { renderBookletHTML } from "./bookletSheet.js";

/** The printed A4 page (landscape) that carries two BECE sheets. The WASSCE sheet is the A4 design scaled to A5, so it prints two per page as well. */
export const PRINT_PAGE = { w: 297, h: 210 };

/** Physical specification of each style, all in millimetres. */
export const SHEET_SPECS = {
  bece: {
    id: "bece",
    page: { w: 297, h: 210, orientation: "landscape", perPage: 2 },
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
    card: { w: 148.5, h: 210 },          // one sheet = half of A4 (A5 portrait): the A4 design printed at 70.7%
    page: { w: 297, h: 210, orientation: "landscape", perPage: 2 },
    defaultColour: "school",             // one printing colour, the school's main colour (black & white is one tap away)
    showMotto: true,
    versionRow: true,
  },
};

/** Corner alignment marks: black squares kept 4.5 mm inside the sheet edge, which every office printer can reach. */
export const ALIGN_MARK = { size: 1.7, inset: 4.5 };

export const MAX_QUESTIONS = 100;

/** The ready-made size of each sheet: the BECE sheet holds 60 questions, the WASSCE-type sheet 100 (its maximum). */
export const STANDARD_QUESTIONS = { bece: 60, wassce: 100 };
export const standardQuestions = (style) => STANDARD_QUESTIONS[style] || STANDARD_QUESTIONS.bece;

/** The style a level normally uses: BECE for Primary and JHS, WASSCE for SHS. */
export const defaultSheetStyle = (isSHS) => (isSHS ? "wassce" : "bece");

/** One-line size summary shown in the UI, read from the spec so it can never disagree with the print. */
export function sheetSizeSummary(style, questions = 40, optionCount = 4) {
  if (style === "bece") return `Each sheet is half of A4 (${BECE_GEOM.W} × ${BECE_GEOM.H} mm), two per A4 landscape, cut along the dashed line · ${BECE_PER_SHEET} questions per sheet in 3 columns, [A] to [E] boxes`;
  const p = wassceLayout(clampQuestions(questions), optionCount);
  return `Each sheet is half of A4 (148.5 × 210 mm), two per A4 landscape, cut along the dashed line · exactly ${clampQuestions(questions)} questions in ${p.cols} column${p.cols === 1 ? "" : "s"} of ${p.per}, bracket boxes [A] to [${optionCount === 5 ? "E" : "D"}]`;
}

/** What to choose in the print dialog for a style. */
export const printNote = () => "Print on A4 landscape at 100% (Actual size), then cut along the dashed line.";

/** The printed page of a style (for the preview window). */
export const pageFor = (style) => (SHEET_SPECS[style] || SHEET_SPECS.bece).page;

/** Ready-made school colours. ONE colour per school: it prints the title bars, rules, boxes, letters and bubbles. */
export const SCHOOL_COLOUR_PRESETS = [
  { id: "navy", label: "Navy", main: "#12285C" },
  { id: "maroon", label: "Maroon", main: "#7A1020" },
  { id: "green", label: "Forest Green", main: "#0F5C32" },
  { id: "blue", label: "Royal Blue", main: "#1747A6" },
  { id: "sky", label: "Sky Blue", main: "#1F7ACB" },
  { id: "purple", label: "Purple", main: "#4B2A7B" },
  { id: "black", label: "Black", main: "#1A1A1A" },
  { id: "bece-red", label: "BECE Red (best for pencil)", main: "#B3151F" },
].map(c => ({ ...c, accent: c.main }));
export const DEFAULT_SCHOOL_COLOURS = { main: SCHOOL_COLOUR_PRESETS[0].main, accent: SCHOOL_COLOUR_PRESETS[0].main };

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
  const acc = band;                                     // one school colour: the second colour was only ever a hairline
  return { band, onBand: textOn(band), ink: inkOf(band), accent: acc, accentInk: inkOf(acc), tint: mix(band, "#FFFFFF", 0.92), tintDeep: mix(band, "#FFFFFF", 0.82), mono: false };
}


const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mm = (n) => `${Math.round(n * 1000) / 1000}mm`;

const crestFor = (meta, crestSVG) =>
  meta.schoolLogo ? `<img class="logo" src="${esc(meta.schoolLogo)}" alt="School logo"/>`
  : crestSVG ? `<div class="logo crest">${crestSVG}</div>` : "";

/**
 * @param {object} o
 *   style        "bece" | "wassce"
 *   questions    number of questions (1-100)
 *   optionCount  4 (A-D) or 5 (A-E)  (WASSCE-type only; the BECE sheet always prints A-E)
 *   colourMode   "school" | "mono"
 *   colours      { main } (one school colour; an old `accent` value is ignored)
 *   meta         { schoolName, schoolMotto, schoolLogo, subject, className, programme, term, examType, examVersion, idDigits }
 *   crestSVG     optional inline SVG used when no logo is uploaded
 * @returns a complete HTML document: BECE = A4 landscape, two A5 sheets per page; WASSCE = one A4 portrait sheet
 */
export function renderShadingSheetHTML(o = {}) {
  const spec = SHEET_SPECS[o.style] || SHEET_SPECS.bece;
  const n = clampQuestions(o.questions || 40);
  const meta = o.meta || {};
  const pal = sheetPalette({ colourMode: o.colourMode || spec.defaultColour, ...(o.colours || {}) });
  const logoMarkup = crestFor(meta, o.crestSVG);
  if (spec.id === "wassce") {
    return renderWassceSheet({ pal, esc, mm, mix, logoMarkup, meta, n, optionCount: Number(o.optionCount) === 5 ? 5 : 4, preview: !!o.preview, fitSchoolName });
  }
  // BECE-type sheets follow the Ghana Education Service objective answer sheet and have their own renderer.
  return renderBeceSheet({ PRINT_PAGE, pal, esc, mm, logoMarkup, meta, n, preview: !!o.preview });
}

/**
 * The ANSWER BOOKLET for hand-written (structured / essay) questions. See bookletSheet.js.
 * @param {object} o  { pages, paper "a4" | "a3", questions (rows in the examiner's table), ruling "lined" | "graph" | "plain", colourMode, colours, meta, crestSVG, preview }
 */
export function renderAnswerBookletHTML(o = {}) {
  const meta = o.meta || {};
  const pal = sheetPalette({ colourMode: o.colourMode || "school", ...(o.colours || {}) });
  return renderBookletHTML({
    pal, esc, mm, logoMarkup: crestFor(meta, o.crestSVG), meta, mix, pages: o.pages, questions: o.questions, ruling: o.ruling, paper: o.paper,
    preview: !!o.preview, softInk: pal.mono ? "#8a8a8a" : mix(pal.ink, "#FFFFFF", 0.55),
  });
}
