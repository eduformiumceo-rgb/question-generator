/**
 * bookletSheet.js - the ANSWER BOOKLET for theory / essay papers (WASSCE Paper 2 style).
 *
 * Two paper formats:
 *   "a4"  - A4 PORTRAIT pages (210 x 297), one per printed page. Print double-sided (flip on the long edge), stack in
 *           order with the cover on top and staple at the left.
 *   "a3"  - A3 LANDSCAPE sheets (420 x 297). Each sheet is two A4 pages side by side, IMPOSED as a saddle-stitch booklet
 *           (pages P,1 / 2,P-1 / P-2,3 ...). Print double-sided (flip on the SHORT edge), nest the sheets, fold in half
 *           and staple on the fold. Every half of the sheet becomes one A4 page.
 *
 * Page 1 is the COVER. It carries everything the question paper's cover carries (notice box, paper-code box, big subject block,
 * details table, candidate block, examiner's table, instructions) but has an identity of its own: a full-width masthead in the
 * school colour with the logo on a white disc, and a ruled ANSWER BOOKLET title plate.
 * Pages 2..P are ruled answer pages: question-number margin, lines every 8 mm, running header with the index number.
 *
 * One printing colour (the school colour, or black) on white paper, applied to every rule, label and box; the only solid
 * areas are the cover masthead and the examiner's title bar. Mirrored binding gutter: odd pages (right-hand) leave extra room on the
 * left, even pages on the right, so no writing is lost in the staples.
 * Only the school's own name and logo are printed, never an examining body's name or crest.
 */
import { fitSchoolName, formalExamType } from "./beceSheet.js";

export const BOOKLET_PAGE = { w: 210, h: 297 };
export const BOOKLET_SHEET = { a4: { w: 210, h: 297, orientation: "portrait" }, a3: { w: 420, h: 297, orientation: "landscape" } };
export const BOOKLET_PAPERS = [
  { id: "a4", label: "A4 portrait", desc: "One A4 page per printed page. Staple at the left." },
  { id: "a3", label: "A3 landscape", desc: "Each A3 sheet folds in half: every half is one A4 page." },
];
export const BOOKLET_PAGE_OPTIONS = [4, 8, 12, 16, 20, 24, 32];
export const BOOKLET_MIN_PAGES = 2;
export const BOOKLET_MAX_PAGES = 40;
export const BOOKLET_DEFAULT_PAGES = 12;
export const BOOKLET_MAX_QUESTIONS = 40;

export const BOOKLET_GEOM = {
  W: 210, H: 297, L: 12, CW: 186, gutter: 4,     // gutter: extra inner margin on the stapled side
  head: { top: 10, h: 24, logo: 22 },
  inner: { headTop: 9, ruleTop: 19, linesTop: 30, pitch: 8, linesBottom: 277, marginW: 22, footTop: 283 },
};

const PX = 25.4 / 96;
const LINE = 3 * PX, MID = 2 * PX, THIN = 1 * PX;

export const clampBookletPages = (n) => {
  const v = Math.round(Number(n) || BOOKLET_DEFAULT_PAGES);
  return Math.max(BOOKLET_MIN_PAGES, Math.min(BOOKLET_MAX_PAGES, v));
};
export const clampBookletQuestions = (n) => Math.max(1, Math.min(BOOKLET_MAX_QUESTIONS, Math.round(Number(n) || 0)));
export const clampBookletPaper = (p) => (p === "a3" ? "a3" : "a4");

/** A folded A3 booklet needs a multiple of 4 pages (each sheet carries four). */
export const a3Pages = (n) => Math.max(4, Math.ceil(clampBookletPages(n) / 4) * 4);
/** Pages actually printed for a paper format. */
export const bookletPageCount = (pages, paper = "a4") => (clampBookletPaper(paper) === "a3" ? a3Pages(pages) : clampBookletPages(pages));

/** Number of printed A3 sheets (or A4 pages) for a booklet. */
export const bookletSheetCount = (pages, paper = "a4") => (clampBookletPaper(paper) === "a3" ? a3Pages(pages) / 4 : clampBookletPages(pages));

/**
 * Saddle-stitch imposition: for a booklet of P pages (P a multiple of 4) the printed faces, in print order.
 * Each face is [leftPage, rightPage]. Sheet k (1-based): front = [P-2k+2, 2k-1], back = [2k, P-2k+1].
 */
export function a3Imposition(pages) {
  const P = a3Pages(pages), out = [];
  for (let k = 1; k <= P / 4; k++) {
    out.push({ sheet: k, side: "front", pages: [P - 2 * k + 2, 2 * k - 1] });
    out.push({ sheet: k, side: "back", pages: [2 * k, P - 2 * k + 1] });
  }
  return out;
}

/** Number of hand-written (structured / essay) questions: real counts from a generated paper, or the section set-up. */
export function theoryCount(sections = [], { generated = false } = {}) {
  let n = 0;
  for (const s of sections || []) {
    if (!s || s.type === "objective") continue;
    if (!generated && s.enabled === false) continue;
    n += generated && Array.isArray(s.questions) ? s.questions.length : Math.max(0, Number(s.questionCount) || 0);
  }
  return n;
}

/**
 * Suggested page count for the answer booklet. A cover, then room for the answers: about 1.25 pages for each
 * structured question and 2.5 for each essay, plus one spare page. Kept even (a double-sided sheet carries two pages),
 * and a multiple of 4 for an A3 booklet.
 */
export function suggestBookletPages({ structured = 0, essay = 0, paper = "a4" } = {}) {
  const inner = Math.ceil(Math.max(0, structured) * 1.25 + Math.max(0, essay) * 2.5) + 1;
  const raw = Math.max(BOOKLET_MIN_PAGES, 1 + inner);
  const even = raw % 2 ? raw + 1 : raw;
  return clampBookletPaper(paper) === "a3" ? a3Pages(even) : clampBookletPages(even);
}

/** Hand-written questions split into structured and essay (real counts from a generated paper, or the section set-up). */
export function theoryProfile(sections = [], { generated = false } = {}) {
  const out = { structured: 0, essay: 0 };
  for (const s of sections || []) {
    if (!s || s.type === "objective") continue;
    if (!generated && s.enabled === false) continue;
    const n = generated && Array.isArray(s.questions) ? s.questions.length : Math.max(0, Number(s.questionCount) || 0);
    if (s.type === "essay") out.essay += n; else out.structured += n;
  }
  return out;
}

/** Number of ruled lines on an inner page (so tests and the UI can read it). */
export function bookletLineCount() {
  const i = BOOKLET_GEOM.inner;
  return Math.floor((i.linesBottom - i.linesTop) / i.pitch) + 1;
}

/** The examiner's table is laid out in columns of at most 10 rows; returns { cols, rows }. */
export function examinerGrid(nq) {
  const n = clampBookletQuestions(nq || 8);
  const cols = Math.ceil(n / 10);
  return { cols, rows: Math.ceil(n / cols) };
}

/** @param h helpers from shadingSheet.js: { pal, esc, mm, logoMarkup, meta, pages, questions, ruling, paper, preview, softInk } */
export function renderBookletHTML(h) {
  const { pal, esc, mm, logoMarkup, meta, preview } = h;
  const mixFn = h.mix || ((a) => a);
  const g = BOOKLET_GEOM, I = g.inner;
  const paper = clampBookletPaper(h.paper);
  const pages = bookletPageCount(h.pages, paper);
  const nq = clampBookletQuestions(h.questions || 8);
  const ruling = h.ruling === "plain" ? "plain" : h.ruling === "graph" ? "graph" : "lined";
  const showPN = h.pageNumbers !== false;                  // page numbers can be switched off
  const ink = pal.ink;
  const rule2 = pal.ink;
  const lineCol = h.softInk || "#8a8f98";
  const name = String(meta.schoolName || "").trim();
  const digits = Math.max(4, Math.min(12, Math.round(Number(meta.idDigits) || 10)));
  const idMode = ["line", "boxes", "none"].includes(meta.idMode) ? meta.idMode : "boxes";
  // SUBJECT and CLASS are never printed: they are blank write-in fields, so one printed booklet serves any subject or class.
  const termLine = formalExamType(meta.examType) || "";
  const version = String(meta.examVersion || "").toUpperCase();
  const mastSide = 28 + 4;                                   // logo disc on the left, balanced by empty space on the right
  const fit = fitSchoolName(name, g.CW - 2 * mastSide);
  const cc = meta.coverCode || null;                       // { code, subject, kind, duration } - same box as the question paper's cover
  const noticeText = meta.notice ? "Do not open this booklet until you are told to do so" : "";

  /* ---------- cover (mirrors the question paper's cover page) ---------- */
  const idLabel = String(meta.idLabel || "").trim() || (idMode === "boxes" ? "Index Number" : "Index No.");
  const metaCell = (label, value) => `<td><div class="ml">${esc(label)}</div><div class="mv">${esc(value) || "&nbsp;"}</div></td>`;
  const candidate = idMode === "boxes" ? `
      <div class="cand">
        <div class="cr"><div class="cf grow"><span>Candidate's Name:</span><i></i></div><div class="cf wd"><span>Date:</span><i></i></div></div>
        <div class="cr idr"><span class="idl">${esc(idLabel)}</span><span class="idc">${"<i></i>".repeat(digits)}</span></div>
      </div>` : `
      <div class="cand">
        <div class="cr"><div class="cf grow"><span>Name:</span><i></i></div>${idMode === "line" ? `<div class="cf wi"><span>${esc(idLabel)}:</span><i></i></div>` : ""}<div class="cf wd"><span>Date:</span><i></i></div></div>
      </div>`;

  const { cols: exCols, rows: exRows } = examinerGrid(nq);
  const examiner = (() => {
    let tables = "";
    for (let c = 0; c < exCols; c++) {
      let rows = "";
      for (let r = 0; r < exRows; r++) {
        const q = c * exRows + r + 1;
        rows += q <= nq ? `<tr><td class="qq">${q}</td><td></td><td></td></tr>` : `<tr class="void"><td></td><td></td><td></td></tr>`;
      }
      tables += `<table class="et"><thead><tr><th>Question</th><th>Mark</th><th>Initials</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    return `<div class="exam-box">
      <div class="exam-t">FOR EXAMINER'S USE ONLY</div>
      <div class="ets">${tables}</div>
      <div class="total"><span>TOTAL</span><i></i><span class="chk">Checked by</span><i class="w"></i></div>
    </div>`;
  })();

  const instrAnswer = meta.paperNote ? esc(meta.paperNote) : "Answer the questions in the order set, or as the paper directs.";
  const cover = `<section class="page cover">
    <div class="mast">
      <div class="mast-logo">${logoMarkup || ""}</div>
      <div class="mast-text">
        <div class="school" style="font-size:${mm(fit.size)}">${fit.lines.map(l => `<div>${esc(l)}</div>`).join("") || "&nbsp;"}</div>
        ${meta.schoolMotto ? `<div class="motto">${esc(meta.schoolMotto)}</div>` : ""}
      </div>
      <div class="mast-side"></div>
    </div>
    <div class="mast-line"></div>
    <div class="etitle"><i class="er"></i><span class="ttl">ANSWER BOOKLET</span><i class="er"></i>${version ? `<span class="ver">VERSION ${esc(version)}</span>` : ""}</div>
    ${noticeText ? `<div class="notice">${esc(noticeText)}</div>` : ""}
    ${cc ? `<div class="codebox"><div class="cl"><div>${esc(cc.kind)}</div><div>${esc(cc.duration)}</div></div><div class="cb">${esc(cc.code)}</div></div>` : ""}
    <div class="csub">
      <div class="crule"></div>
      <div class="wrow"><span>SUBJECT</span><i></i></div>
      <div class="wrow"><span>CLASS</span><i></i></div>
      ${termLine ? `<div class="cline">${esc(termLine)}</div>` : ""}
      ${meta.paperNames ? `<div class="cpap">${esc(meta.paperNames)}</div>` : ""}
      <div class="crule"></div>
    </div>
    ${(meta.term || meta.durationMinutes || meta.totalMarks) ? `<table class="meta">
      <tr>${meta.term ? metaCell("Term", meta.term) : ""}${meta.durationMinutes ? metaCell("Duration", `${meta.durationMinutes} mins`) : ""}${meta.totalMarks ? metaCell("Total Marks", meta.totalMarks) : ""}</tr>
    </table>` : ""}
    ${candidate}
    ${examiner}
    <div class="ins">
      <div class="ins-t">Instructions to Candidates</div>
      <ol>
        <li>Write your name, subject, class and index number in the spaces above, and your index number at the top of every page.</li>
        <li>Write with a blue or black pen. Write the number of each question in the left margin. ${instrAnswer}</li>
        <li>Do not write in the margin. Rule off neatly after each question, and cross out rough work with a single line.</li>
        <li>Do not tear out any page. For more paper ask the supervisor for an extra sheet, write your index number on it and tie it inside this booklet.</li>
        <li>Hand in this booklet, with all extra sheets, before you leave the examination room.</li>
      </ol>
    </div>
    ${showPN ? `<div class="pg">Page 1 of ${pages}</div>` : ""}
  </section>`;

  /* ---------- inner pages ---------- */
  const lineN = bookletLineCount();
  const GRID = 5;                                          // graph paper: 5 mm squares, a heavier line every 25 mm
  const gridW = Math.floor((g.CW - g.gutter - I.marginW) / GRID) * GRID, gridH = Math.floor((I.linesBottom - I.linesTop) / GRID) * GRID;
  const graphSVG = () => {
    let v = "", hz = "";
    for (let x = 0; x <= gridW; x += GRID) v += `<line x1="${x}" x2="${x}" y1="0" y2="${gridH}"${x % (GRID * 5) === 0 ? ' stroke-width="0.32"' : ""}/>`;
    for (let y = 0; y <= gridH; y += GRID) hz += `<line x1="0" x2="${gridW}" y1="${y}" y2="${y}"${y % (GRID * 5) === 0 ? ' stroke-width="0.32"' : ""}/>`;
    return `<svg class="ruled graph" style="left:calc(var(--L) + ${mm(I.marginW)});top:${mm(I.linesTop)};width:${mm(gridW)};height:${mm(gridH)}" viewBox="0 0 ${gridW} ${gridH}"><g stroke="${lineCol}" stroke-width="0.16" fill="none">${v}${hz}</g></svg>`;
  };
  const linesSVG = () => {
    if (ruling === "plain") return "";
    if (ruling === "graph") return graphSVG();
    let out = "";
    for (let k = 0; k < lineN; k++) out += `<line x1="0" x2="${g.CW}" y1="${k * I.pitch}" y2="${k * I.pitch}"/>`;
    return `<svg class="ruled" style="left:var(--L);top:${mm(I.linesTop)};width:var(--CW);height:${mm((lineN - 1) * I.pitch + 0.4)}" viewBox="0 0 ${g.CW} ${(lineN - 1) * I.pitch + 0.4}" preserveAspectRatio="none"><g stroke="${lineCol}" stroke-width="0.22" fill="none">${out}</g></svg>`;
  };
  const shortName = name.length > 30 ? name.slice(0, 28).trim() + "…" : name;
  const miniId = Array.from({ length: digits }, () => `<i class="ib"></i>`).join("");
  const innerPage = (p) => `<section class="page inner">
    <div class="ih">
      <span class="ih-l">${esc(shortName)}</span>
      <span class="ih-c"><b>ANSWER BOOKLET</b></span>
      <span class="ih-r">Index No. <span class="ibs mini">${miniId}</span></span>
    </div>
    <div class="irule1"></div><div class="irule2"></div>
    <div class="mg-label">Question<br>No.</div>
    <div class="mg" style="left:var(--L);top:${mm(I.linesTop - 6)};height:${mm(I.linesBottom - I.linesTop + 6 + 0.2)};width:${mm(I.marginW)}"></div>
    <div class="mg-note" style="top:${mm(I.linesTop - 5.4)}">Do not write in the margin</div>
    ${linesSVG()}
    <div class="ifoot"><span class="ifm">${p === pages ? "END OF BOOKLET" : "Turn over"}</span>${showPN ? `<span class="ipn">${p}</span>` : ""}</div>
  </section>`;

  const pageHTML = (p) => (p === 1 ? cover : innerPage(p));
  const parity = (p) => (p % 2 === 1 ? "rt" : "vs");      // odd = right-hand (recto) page, even = left-hand (verso)

  let body = "";
  let sheetsNote = "";
  if (paper === "a3") {
    const faces = a3Imposition(pages);
    for (const f of faces) {
      const [lp, rp] = f.pages;
      body += `<section class="sheet" data-sheet="${f.sheet}" data-side="${f.side}">
        <div class="slot l" data-page="${lp}">${pageHTML(lp).replace('class="page ', `class="page ${parity(lp)} `)}</div>
        <div class="slot r" data-page="${rp}">${pageHTML(rp).replace('class="page ', `class="page ${parity(rp)} `)}</div>
        <i class="fold t"></i><i class="fold m"></i><i class="fold b"></i><i class="stp s1"></i><i class="stp s2"></i>
        <div class="flabel">Sheet ${f.sheet} of ${pages / 4} &middot; ${f.side === "front" ? "FRONT" : "BACK"}</div>
      </section>`;
    }
    sheetsNote = `${pages / 4} A3 sheets`;
  } else {
    for (let p = 1; p <= pages; p++) body += pageHTML(p).replace('class="page ', `class="page ${parity(p)} `);
    sheetsNote = `${pages} A4 pages`;
  }
  const sh = BOOKLET_SHEET[paper];

  const css = `
  @page{size:${mm(sh.w)} ${mm(sh.h)};margin:0}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:"Helvetica Neue",Arial,"Liberation Sans",sans-serif;color:${ink}}
  .page{--L:${mm(g.L)};--CW:${mm(g.CW)};position:relative;width:${mm(g.W)};height:${mm(g.H)};overflow:hidden;background:#fff;color:${ink}}
  .page.rt{--L:${mm(g.L + g.gutter)};--CW:${mm(g.CW - g.gutter)}}          /* right-hand page: staples on its left */
  .page.vs{--L:${mm(g.L)};--CW:${mm(g.CW - g.gutter)}}                      /* left-hand page: staples on its right */
  ${paper === "a3"
    ? `.sheet{position:relative;width:${mm(sh.w)};height:${mm(sh.h)};overflow:hidden;background:#fff;page-break-after:always;break-after:page}
  .sheet:last-child{page-break-after:auto;break-after:auto}
  .slot{position:absolute;top:0;width:${mm(g.W)};height:${mm(g.H)}}.slot.l{left:0}.slot.r{left:${mm(g.W)}}
  .fold{position:absolute;left:${mm(g.W - 0.25)};width:${mm(0.5)};height:${mm(7)};background:#000;display:block;z-index:5;box-shadow:0 0 0 ${mm(0.45)} #fff}
  .fold.t{top:${mm(2)}}.fold.b{bottom:${mm(2)}}.fold.m{top:${mm(g.H / 2 - 3.5)}}
  .stp{position:absolute;left:${mm(g.W - 1.2)};width:${mm(2.4)};height:${mm(2.4)};border:${mm(MID)} solid #000;background:#fff;border-radius:50%;display:block;z-index:5}
  .stp.s1{top:${mm(g.H * 0.28)}}.stp.s2{top:${mm(g.H * 0.72 - 2.4)}}
  .flabel{position:absolute;left:${mm(g.W - 30)};width:${mm(60)};bottom:${mm(10.5)};background:#fff;padding:${mm(0.4)} 0;text-align:center;font-size:${mm(1.9)};font-weight:700;letter-spacing:.08em;color:${ink};opacity:.7}`
    : `.page{page-break-after:always;break-after:page}.page:last-child{page-break-after:auto;break-after:auto}`}

  /* ---- cover: the same parts and look as the question paper's cover page (flowing column, so it adapts) ---- */
  .cover{display:flex;flex-direction:column;padding:${mm(50)} calc(${mm(g.W)} - var(--L) - var(--CW)) ${mm(11)} var(--L)}
  .mast{position:absolute;left:0;top:0;width:${mm(g.W)};height:${mm(42)};background:${pal.band};color:${pal.onBand};display:flex;align-items:center;padding:0 calc(${mm(g.W)} - var(--L) - var(--CW)) 0 var(--L)}
  .mast-logo{width:${mm(28)};height:${mm(28)};border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;flex:none;overflow:hidden}
  .mast-logo .logo{max-width:${mm(23)};max-height:${mm(23)};object-fit:contain;display:block}
  .mast-logo .crest,.mast-logo .crest svg{width:${mm(24)};height:${mm(24)};display:block}
  .mast-side{width:${mm(28)};flex:none}
  .mast-text{flex:1;text-align:center;padding:0 ${mm(4)}}
  .school div{white-space:nowrap}
  .school{font-weight:800;line-height:1.14;text-transform:uppercase;letter-spacing:.05em;color:${pal.onBand}}
  .motto{margin-top:${mm(1.2)};font-size:${mm(2.7)};font-style:italic;opacity:.88;color:${pal.onBand}}
  .mast-line{position:absolute;left:0;top:${mm(42)};width:${mm(g.W)};height:${mm(1.3)};background:${mixFn(pal.band, "#FFFFFF", 0.55)}}
  .etitle{flex:none;display:flex;align-items:center;justify-content:center;gap:${mm(4)};margin:${mm(1)} 0 ${mm(3.4)}}
  .ttl{font-size:${mm(5.8)};font-weight:800;letter-spacing:.16em;white-space:nowrap}
  .er{flex:1;display:block;height:${mm(1.4)};border-top:${mm(MID)} solid ${ink};border-bottom:${mm(THIN)} solid ${ink}}
  .ver{font-size:${mm(3)};font-weight:700;letter-spacing:.06em;border:${mm(THIN)} solid ${ink};padding:${mm(0.3)} ${mm(2)};white-space:nowrap}
  .notice{flex:none;margin-bottom:${mm(3)};border:${mm(MID)} solid ${ink};text-align:center;font-weight:800;text-transform:uppercase;letter-spacing:.09em;font-size:${mm(3.1)};padding:${mm(1.4)} ${mm(3)}}
  .codebox{flex:none;width:${mm(76)};display:flex;align-items:center;justify-content:space-between;border:${mm(MID)} solid ${ink};padding:${mm(1.4)} ${mm(3.4)};font-size:${mm(2.5)};font-weight:700;line-height:1.35;text-transform:uppercase}
  .cb{font-size:${mm(9)};font-weight:800;font-family:Georgia,"Times New Roman",serif;color:${ink}}
  .csub{flex:1;min-height:${mm(30)};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:${mm(2.2)};padding:${mm(2)} 0}
  .crule{width:55%;height:${mm(1.4)};border-top:${mm(MID)} solid ${ink};border-bottom:${mm(THIN)} solid ${rule2}}
  .wrow{width:78%;display:flex;align-items:flex-end;gap:${mm(3)};font-size:${mm(5.2)};font-weight:800;letter-spacing:.1em}
  .wrow span{white-space:nowrap;width:${mm(32)};text-align:left}.wrow i{flex:1;display:block;height:${mm(7)};border-bottom:${mm(MID)} solid ${ink}}
  .cname{font-size:${mm(8)};font-weight:800;text-transform:uppercase;letter-spacing:.07em;line-height:1.15}
  .cline{font-size:${mm(3.6)};letter-spacing:.06em;text-transform:uppercase;font-weight:600}
  .cpap{font-size:${mm(3.2)};font-style:italic}
  .meta{flex:none;width:100%;border-collapse:collapse;border:${mm(MID)} solid ${ink};table-layout:fixed}
  .meta td{border-right:${mm(THIN)} solid ${ink};padding:${mm(1)} ${mm(2.2)} ${mm(1.2)};vertical-align:top}
  .meta td:last-child{border-right:none}
  .ml{font-size:${mm(2.1)};font-weight:700;text-transform:uppercase;letter-spacing:.1em;opacity:.8}
  .mv{font-size:${mm(3.4)};font-weight:800;line-height:1.3}
  .cand{flex:none;margin-top:${mm(5)};font-size:${mm(3.5)}}
  .cr{display:flex;align-items:flex-end;gap:${mm(5)}}.cr + .cr{margin-top:${mm(4)}}
  .cf{display:flex;align-items:flex-end;gap:${mm(1.6)}}.cf.grow{flex:1}.cf.wd{width:28%}.cf.wi{width:30%}
  .cf span{white-space:nowrap;font-weight:700}.cf i{flex:1;border-bottom:${mm(THIN)} solid ${ink};height:${mm(4.4)}}
  .idr{align-items:center;gap:${mm(3.4)}}.idl{font-weight:700;white-space:nowrap}
  .idc{display:inline-flex}.idc i{display:block;width:${mm(8.4)};height:${mm(9.4)};border:${mm(MID)} solid ${ink};margin-left:${mm(-MID)};background:#fff}.idc i:first-child{margin-left:0}
  .exam-box{flex:none;margin-top:${mm(5)};border:${mm(LINE)} solid ${ink};background:#fff}
  .exam-t{background:${pal.band};color:${pal.onBand};font-size:${mm(2.7)};font-weight:800;letter-spacing:.14em;padding:${mm(1.1)} ${mm(3)}}
  .ets{display:flex}
  .et{flex:1;border-collapse:collapse;font-size:${mm(2.4)}}
  .et + .et{border-left:${mm(THIN)} solid ${ink}}
  .et th{font-weight:800;letter-spacing:.03em;padding:${mm(0.7)} ${mm(0.8)};border-bottom:${mm(THIN)} solid ${ink};border-right:${mm(THIN)} solid ${ink};font-size:${mm(2.2)}}
  .et th:last-child,.et td:last-child{border-right:none}
  .et td{height:${mm(4.7)};border-bottom:${mm(THIN)} solid ${ink};border-right:${mm(THIN)} solid ${ink};text-align:center;font-weight:700}
  .et tr:last-child td{border-bottom:none}
  .et td.qq{width:${mm(14)}}
  .total{display:flex;align-items:flex-end;gap:${mm(2)};padding:${mm(1.6)} ${mm(3)} ${mm(1.3)};border-top:${mm(LINE)} solid ${ink};font-size:${mm(2.6)};font-weight:800;letter-spacing:.06em}
  .total i{display:block;width:${mm(26)};border-bottom:${mm(THIN)} solid ${ink};height:${mm(3.2)}}.total i.w{width:${mm(44)}}.total .chk{margin-left:auto}
  .ins{flex:none;margin-top:${mm(5)};border:${mm(THIN)} solid ${ink};padding:${mm(1.6)} ${mm(3.4)} ${mm(1.4)};font-size:${mm(2.5)};line-height:1.32}
  .ins-t{font-weight:800;text-transform:uppercase;letter-spacing:.1em;font-size:${mm(2.5)};border-bottom:${mm(THIN)} solid ${ink};padding-bottom:${mm(0.7)};margin-bottom:${mm(0.8)}}
  .ins ol{margin:0 0 0 ${mm(4)}}.ins li{margin:${mm(0.2)} 0}
  .pg{position:absolute;left:0;right:0;bottom:${mm(5)};text-align:center;font-size:${mm(2.4)};font-weight:700}

  /* ---- inner pages ---- */
  .ih{position:absolute;left:var(--L);top:${mm(I.headTop)};width:var(--CW);display:flex;align-items:center;justify-content:space-between;gap:${mm(4)};font-size:${mm(2.5)};font-weight:700}
  .ih-l{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase;letter-spacing:.04em}
  .ih-c{flex:none;display:flex;flex-direction:column;align-items:center;line-height:1.25;letter-spacing:.08em}.ih-c b{font-weight:800}.ih-c small{font-size:${mm(2.1)};font-weight:700;opacity:.8;text-transform:uppercase;letter-spacing:.05em;max-width:${mm(70)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ih-r{flex:1;text-align:right;white-space:nowrap}
  .ibs{display:inline-flex;border:${mm(LINE)} solid ${ink};background:#fff}
  .ibs.mini{border-width:${mm(THIN)};vertical-align:middle}
  .ib{display:block;width:${mm(4.4)};height:${mm(4.8)};border-right:${mm(THIN)} solid ${ink}}.ib:last-child{border-right:none}
  .irule1{position:absolute;left:var(--L);top:${mm(I.ruleTop)};width:var(--CW);border-top:${mm(LINE)} solid ${ink}}
  .irule2{position:absolute;left:var(--L);top:${mm(I.ruleTop + 1.3)};width:var(--CW);border-top:${mm(THIN)} solid ${rule2}}
  .mg{position:absolute;border-left:${mm(MID)} solid ${ink};border-right:${mm(MID)} solid ${ink}}
  .mg-label{position:absolute;left:var(--L);top:${mm(I.ruleTop + 2.2)};width:${mm(I.marginW)};text-align:center;font-size:${mm(2.2)};font-weight:700;line-height:1.2}
  .mg-note{position:absolute;left:calc(var(--L) + ${mm(I.marginW + 1.5)});font-size:${mm(2.1)};font-style:italic;opacity:.8}
  .ruled{position:absolute;display:block;overflow:visible}
  .ifoot{position:absolute;left:var(--L);top:${mm(I.footTop)};width:var(--CW);display:flex;justify-content:space-between;align-items:center;font-size:${mm(2.5)}}
  .ifm{font-style:italic;font-weight:700;letter-spacing:.04em}
  .ipn{position:absolute;left:0;right:0;text-align:center;font-weight:800;font-size:${mm(3)}}
  @media screen{
    body{background:#d9dce1;padding:${mm(preview ? 6 : 14)} 0}
    .${paper === "a3" ? "sheet" : "page"}{margin:0 auto ${mm(10)};box-shadow:0 1mm 4mm rgba(0,0,0,.25)}
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

  const hint = paper === "a3"
    ? "Print on A3 LANDSCAPE at 100% (Actual size), margins None. Print double-sided, flip on the SHORT edge. Nest the sheets in order, fold in half and staple on the fold."
    : "Print on A4 PORTRAIT at 100% (Actual size), margins None. Print double-sided (flip on long edge) and staple at the left.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(name || "School")} - Answer Booklet</title><style>${css}</style></head><body data-sheet-style="booklet" data-paper="${paper}" data-pages="${pages}" data-sheets="${paper === "a3" ? pages / 4 : pages}" data-questions="${nq}">
${preview ? "" : `<div class="bar">${hint}</div>`}
${body}
<script>${script}</script></body></html>`;
}
