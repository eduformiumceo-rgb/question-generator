/**
 * wassceSheet.js - the WASSCE-type objective answer sheet (the "shading sheet" for SHS).
 *
 * Modelled on the way the real WASSCE objective answer sheet is built, not on the BECE half-sheet:
 *   - ONE FULL A4 PORTRAIT SHEET per candidate (210 x 297 mm), not two half sheets to cut.
 *   - ONE printing colour for every line, label and bubble (the school's main colour, or black), on plain white paper.
 *     The only solid areas are the small reversed section titles, so the pencil shading is the darkest thing on the page.
 *   - Top: school letterhead, then candidate's name, subject, date, paper version, sex, signature on the left and the
 *     INDEX NUMBER grid (write the digits in the boxes, shade the matching digit below each) on the right.
 *   - INSTRUCTIONS TO CANDIDATES with the correct / wrong shading examples.
 *   - ANSWERS: numbered bracket boxes  [A] [B] [C] [D] [E], grouped in fives so the eye never loses its row. The sheet
 *     prints EXACTLY the number of questions on the paper (1 up to MAX), laid out in columns of 10, 15 or 20.
 *   - Timing marks down the right edge (one per row), corner alignment marks, a "for official use" score box.
 *
 * SCANNING (OMR): every bubble sits at a fixed, published position (see wassceSheetModel), the letters inside the bubbles are
 * printed in a light tint so a pencil mark is the only dark thing in a bubble, there are corner squares, a timing mark
 * for every answer row down the right edge, a timing mark for every option column along the top edge, and a QR SHEET ID
 * (questions, options, index length, paper version, paper reference) in the corner. omrReader.js reads such a sheet.
 *
 * Every size is a fixed millimetre value; nothing is scaled to fit. Only the row spacing relaxes a little on short papers.
 * The sizes follow standard OMR conventions; they are not measured from an official WAEC sheet (none is published).
 * Neither WAEC's name nor crest is printed: only the school's own name and logo (or the app's generic crest).
 */

import { sheetPayload, qrSvg, paperRef } from "./sheetCode.js";

/** The full-size sheet is an A4 portrait design (210 x 297). It is printed at 70.7%, which is exactly A5, two per A4 landscape (like the BECE sheet). */
export const WASSCE_SHEET = { w: 210, h: 297 };
export const WASSCE_PAGE = { w: 297, h: 210 };
export const WASSCE_SCALE = 148.5 / 210;

export const WASSCE_GEOM = {
  W: 210, H: 297,
  L: 11, CW: 186,                              // content runs from 11 to 197 mm
  strip: { x: 200.9, w: 4.4 },                 // timing marks: 4.6 mm clear of the paper edge
  mark: { size: 1.7, inset: 4.5 },             // corner alignment squares
  head: { top: 9, h: 25, logo: 22 },
  ruleTop: 35.2,
  info: { top: 40, gap: 3 },
  id: { head: 6, box: 6.4, row: 5, pad: 0.7, maxPitch: 6.4, maxW: 78 },
  ins: { h: 29, gap: 3.2 },
  ans: { titleH: 5.6, colGap: 2.4, cols: 5, groupGap: 1.7, pad: 0.8, minPitch: 5.4, maxPitch: 11.5, numW: 7.2,
         bub: { w: 4.6, h: 3.7 }, maxOptPitch: 6.6, bottom: 276.5 },
  foot: { top: 281, h: 6.5 },
  qr: { size: 21, top: 9.5 },                  // sheet-ID QR code (quiet zone included), top right of the letterhead
  topMark: { y: 4.5, w: 0.95, h: 1.7 },        // timing marks along the top edge: one per option column
  left: { gap: 1.8, units: [2.1, 1.05, 1.05, 1.05, 1.2], ver: { w: 7, h: 4.8, gap: 2.4, right: 2.4 }, absent: { w: 8, h: 4.8, right: 2.4 }, split: [1.7, 1] },
  letterTint: 0.5,                             // how far the printed letters fade towards white
};
export const WASSCE_MAX = 100;

const LETTERS = ["A", "B", "C", "D", "E"];
const PX = 25.4 / 96;           // browsers snap fractional borders down to whole pixels, so use exact px multiples
const LINE = 3 * PX, MID = 2 * PX, THIN = 1 * PX;

/** Rows per column for `n` questions: the smallest of 10 / 15 / 20 that fits in five columns. */
export function wassceRowsPerColumn(n) {
  for (const r of [10, 15, 20]) if (Math.ceil(n / r) <= WASSCE_GEOM.ans.cols) return r;
  return 20;
}

/** Everything about where the answer block sits: columns, rows, pitch, option spacing. */
export function wassceLayout(n, optionCount = 4, digits = 10) {
  const g = WASSCE_GEOM, a = g.ans;
  const per = wassceRowsPerColumn(n);
  const cols = Math.max(1, Math.ceil(n / per));
  const colW = (g.CW - a.colGap * (a.cols - 1)) / a.cols;
  const groups = Math.ceil(per / 5);

  const idPitch = Math.min(g.id.maxPitch, g.id.maxW / digits);
  const idW = idPitch * digits + 2 * LINE;
  const idH = g.id.head + g.id.box + 0.3 + g.id.pad * 2 + 10 * g.id.row + 2 * LINE + 0.3;
  const infoTop = g.info.top;
  const insTop = infoTop + idH + g.info.gap;
  const titleTop = insTop + g.ins.h + g.ins.gap;
  const colsTop = titleTop + a.titleH + 1.2;
  const room = a.bottom - colsTop - 2 * a.pad - 2 * LINE - (groups - 1) * a.groupGap;
  const pitch = Math.max(a.minPitch, Math.min(a.maxPitch, room / per));
  const colH = 2 * LINE + 2 * a.pad + per * pitch + (groups - 1) * a.groupGap;
  const optPitch = Math.min(a.maxOptPitch, (colW - a.numW - 1.6 - a.bub.w) / (optionCount - 1));
  const footTop = Math.min(g.foot.top, colsTop + colH + 4);   // the score box follows the answers; on a full sheet it sits at the foot
  // the left-hand candidate block: fixed row heights, so the version / sex / absent bubbles have exact positions
  const lf = g.left, leftW = g.CW - idW - 3;
  const avail = idH - 4 * lf.gap, usum = lf.units.reduce((p, c) => p + c, 0);
  const rowH = lf.units.map(u => avail * u / usum);
  const rowTop = []; { let y = infoTop; for (const h of rowH) { rowTop.push(y); y += h + lf.gap; } }
  const c1W = (leftW - lf.gap) * lf.split[0] / (lf.split[0] + lf.split[1]), c2W = leftW - lf.gap - c1W;
  return { per, cols, colW, pitch, colH, optPitch, idPitch, idW, idH, infoTop, insTop, titleTop, colsTop, footTop, optionCount, leftW, rowH, rowTop, c1W, c2W };
}

/** Vertical centre (mm) of every timing mark: the ten index-number digit rows, then every answer row. */
export function wassceTimingMarks(n, optionCount = 4, digits = 10) {
  const g = WASSCE_GEOM, a = g.ans, L = wassceLayout(n, optionCount, digits);
  const out = [];
  const gridTop = L.infoTop + LINE + g.id.head + g.id.box + 0.3 + g.id.pad;
  for (let k = 0; k < 10; k++) out.push(gridTop + k * g.id.row + g.id.row / 2);
  const rows = Math.min(L.per, n);
  for (let r = 0; r < rows; r++) out.push(L.colsTop + LINE + a.pad + r * L.pitch + Math.floor(r / 5) * a.groupGap + L.pitch / 2);
  return out;
}

/** x of every option column along the top edge (the horizontal timing marks): only columns that exist on the sheet. */
export function wassceTopMarks(n, optionCount = 4, digits = 10) {
  const g = WASSCE_GEOM, a = g.ans, L = wassceLayout(n, optionCount, digits), out = [];
  for (let c = 0; c < L.cols; c++) for (let k = 0; k < optionCount; k++) out.push(g.L + c * (L.colW + a.colGap) + LINE + (a.numW - 0.4) + a.bub.w / 2 + k * L.optPitch);
  return out;
}

/** The sheet ID payload and paper reference for a sheet. */
export function wassceSheetCode(meta = {}, n, optionCount = 4, digits = 10) {
  const ref = meta.sheetRef || paperRef([meta.schoolName, meta.subject, meta.programme, meta.className, meta.term, meta.examType, n]);
  return sheetPayload({ n, optionCount, digits, version: meta.examVersion || "A", ref });
}

/**
 * Where everything the reader needs sits on the page, in millimetres from the top-left corner of the sheet.
 * This is the SAME geometry the printed sheet is built from, so a scan can be read without any template files.
 */
export function wassceSheetModel(n, optionCount = 4, digits = 10) {
  const g = WASSCE_GEOM, a = g.ans, lf = g.left, L = wassceLayout(n, optionCount, digits);
  const c = g.mark.inset + g.mark.size / 2;
  const corners = { tl: { x: c, y: c }, tr: { x: g.W - c, y: c }, bl: { x: c, y: g.H - c }, br: { x: g.W - c, y: g.H - c } };
  const answers = [];
  for (let q = 1; q <= n; q++) {
    const col = Math.floor((q - 1) / L.per), r = (q - 1) % L.per;
    const x0 = g.L + col * (L.colW + a.colGap) + LINE + (a.numW - 0.4) + a.bub.w / 2;
    const y = L.colsTop + LINE + a.pad + r * L.pitch + Math.floor(r / 5) * a.groupGap + L.pitch / 2;
    answers.push({ q, y, col, row: r, xs: Array.from({ length: optionCount }, (_, k) => x0 + k * L.optPitch) });
  }
  const idLeft = g.L + g.CW - L.idW;
  const gridTop = L.infoTop + LINE + g.id.head + g.id.box + 0.3 + g.id.pad;
  const index = Array.from({ length: digits }, (_, i) => ({ x: idLeft + LINE + (i + 0.5) * L.idPitch, ys: Array.from({ length: 10 }, (_, d) => gridTop + d * g.id.row + g.id.row / 2) }));
  const row = (i) => L.rowTop[i] + L.rowH[i] / 2;
  const rightOf = (boxLeft, boxW, count) => { const inner = boxLeft + boxW - LINE - lf.ver.right; return Array.from({ length: count }, (_, k) => inner - lf.ver.w / 2 - (count - 1 - k) * (lf.ver.w + lf.ver.gap)); };
  const version = rightOf(g.L, L.c1W, 4).map((x, k) => ({ v: "ABCD"[k], x, y: row(2) }));
  const sex = rightOf(g.L + L.c1W + lf.gap, L.c2W, 2).map((x, k) => ({ v: "MF"[k], x, y: row(2) }));
  const absent = { x: g.L + L.leftW - LINE - lf.absent.right - lf.absent.w / 2, y: row(4) };
  const qrX = g.L + g.CW - g.qr.size;
  return {
    page: { w: g.W, h: g.H }, n, optionCount, digits, layout: L, corners,
    stripX: g.strip.x + g.strip.w / 2, strip: wassceTimingMarks(n, optionCount, digits), topY: g.topMark.y + g.topMark.h / 2, top: wassceTopMarks(n, optionCount, digits),
    bubble: { w: a.bub.w, h: a.bub.h }, digitBubble: { w: 3.7, h: 3.1 }, versionBubble: { w: lf.ver.w, h: lf.ver.h }, absentBubble: { w: lf.absent.w, h: lf.absent.h },
    answers, index, version, sex, absent, qr: { x: qrX, y: g.qr.top, size: g.qr.size },
  };
}

/** @param h helpers from shadingSheet.js: { pal, esc, mm, mix, logoMarkup, meta, n, optionCount, preview, fitSchoolName } */
export function renderWassceSheet(h) {
  const { pal, esc, mm, logoMarkup, meta, n, preview, fitSchoolName } = h;
  const mixFn = h.mix || ((a) => a);
  const g = WASSCE_GEOM, a = g.ans;
  const optionCount = Number(h.optionCount) === 5 ? 5 : 4;
  const digits = Math.max(4, Math.min(15, Math.round(Number(meta.idDigits) || 10)));
  const L = wassceLayout(n, optionCount, digits);
  const ink = pal.ink;
  const faint = mixFn(ink, "#FFFFFF", g.letterTint);
  const rule2 = pal.mono ? pal.ink : pal.accent;
  const name = String(meta.schoolName || "").trim();
  const sideSpace = g.head.logo + 4;
  const fit = fitSchoolName(name, g.CW - 2 * sideSpace);
  const subject = [meta.subject, meta.programme].filter(Boolean).join(" - ");
  const version = String(meta.examVersion || "").toUpperCase();

  /* ---- pieces ---- */
  const o = (txt, cls = "") => `<i class="o ${cls}">${esc(txt)}${/\b(fill|half|dot)\b/.test(cls) ? `<b class="pc ${/\bfill\b/.test(cls) ? "pf" : /\bhalf\b/.test(cls) ? "ph" : "pd"}"></b>` : ""}</i>`;

  const header = `
    <div class="head">
      <div class="head-logo">${logoMarkup || ""}</div>
      <div class="head-mid">
        <div class="school" style="font-size:${mm(fit.size)}">${fit.lines.map(l => `<div>${esc(l)}</div>`).join("") || "&nbsp;"}</div>
        ${meta.schoolMotto ? `<div class="motto">${esc(meta.schoolMotto)}</div>` : ""}
        <div class="title">OBJECTIVE TEST ANSWER SHEET</div>
      </div>
    </div>
    <div class="rule1"></div><div class="rule2"></div>
    <div class="qrbox" style="left:${mm(g.L + g.CW - g.qr.size)};top:${mm(g.qr.top)};width:${mm(g.qr.size)};height:${mm(g.qr.size)}">${qrSvg(wassceSheetCode(meta, n, optionCount, digits), g.qr.size, ink)}</div>`;

  const idCols = (() => {
    let boxes = "", dg = "";
    for (let c = 0; c < digits; c++) {
      boxes += `<div class="gbc" style="width:${mm(L.idPitch)}"></div>`;
      let col = "";
      for (let d = 0; d <= 9; d++) col += `<div class="dg">${o(d, "dgt")}</div>`;
      dg += `<div class="gc" style="width:${mm(L.idPitch)}">${col}</div>`;
    }
    return { boxes, dg };
  })();
  const idBlock = `
    <div class="idg" style="left:${mm(g.L + g.CW - L.idW)};top:${mm(L.infoTop)};width:${mm(L.idW)};height:${mm(L.idH)}">
      <div class="gh">INDEX NUMBER</div>
      <div class="gb">${idCols.boxes}</div>
      <div class="gd">${idCols.dg}</div>
    </div>`;

  const leftW = L.leftW, lg = g.left;
  const rowStyle = (i, extra = "") => `style="height:${mm(L.rowH[i])};${extra}"`;
  const leftBlock = `
    <div class="left" style="left:${mm(g.L)};top:${mm(L.infoTop)};width:${mm(leftW)};height:${mm(L.idH)}">
      <div class="box nmb" ${rowStyle(0)}>
        <div class="nrow"><span class="nl">SURNAME</span></div>
        <div class="nrow"><span class="nl">OTHER NAMES</span></div>
      </div>
      <div class="two" ${rowStyle(1)}>
        <div class="two" style="width:${mm(L.c1W)}">
          <div class="box" style="flex:1.55;min-width:0"><span class="nl">SUBJECT</span></div>
          <div class="box" style="flex:1;min-width:0"><span class="nl">CLASS</span></div>
        </div>
        <div class="box" style="width:${mm(L.c2W)}"><span class="nl">DATE</span></div>
      </div>
      <div class="two" ${rowStyle(2)}>
        <div class="box vs" style="width:${mm(L.c1W)}">
          <span class="nl">PAPER VERSION</span>
          <span class="vb">${["A", "B", "C", "D"].map(v => o(v, "vo" + (version === v ? " fill" : ""))).join("")}</span>
        </div>
        <div class="box vs" style="width:${mm(L.c2W)}">
          <span class="nl">SEX</span>
          <span class="vb">${o("M", "vo")}${o("F", "vo")}</span>
        </div>
      </div>
      <div class="box sg" ${rowStyle(3)}><span class="nl">CANDIDATE'S SIGNATURE</span></div>
      <div class="box sup" ${rowStyle(4)}>
        <span class="sup-t">FOR SUPERVISOR ONLY</span>
        <span class="sup-b">If the candidate is absent, shade this box</span>
        <span class="vb ab">${o("", "abs")}</span>
      </div>
    </div>`;

  const eg = (cls, label) => `<span class="eg">${o("A", cls)}<span class="eg-t">${label}</span></span>`;
  const fourOnly = optionCount === 4;
  const instructions = `
    <div class="ins" style="top:${mm(L.insTop)};height:${mm(g.ins.h)}">
      <div class="ins-tab">INSTRUCTIONS TO CANDIDATES</div>
      <div class="ins-col l">
        <div class="it"><b>1.</b><span>Use an <u>HB pencil</u> only. Do not use a pen.</span></div>
        <div class="it"><b>2.</b><span>Write your name, subject and class in the spaces provided. Write your index number in the boxes, then shade the matching digit under each box.</span></div>
        <div class="it"><b>3.</b><span>${fourOnly ? "Each question has four options, A to D." : "Each question has five options, A to E."} Choose <u>one</u> answer and shade through the letter, like this: <span class="ex">${LETTERS.slice(0, optionCount).map(l => o(l)).join("")}</span></span></div>
      </div>
      <div class="ins-col r">
        <div class="it"><b>4.</b><span>To change an answer, rub out your first mark completely.</span></div>
        <div class="it"><b>5.</b><span>Do not fold, staple or tear this sheet, and make no stray marks on it.</span></div>
        <div class="egs">${eg("fill", "Correct")}${eg("tick", "Wrong")}${eg("half", "Wrong")}${eg("dot", "Wrong")}</div>
      </div>
    </div>`;

  const answerTitle = `<div class="atitle" style="top:${mm(L.titleTop)};height:${mm(a.titleH)}">ANSWERS<span>Questions 1 &ndash; ${n}</span></div>`;

  let cols = "";
  for (let c = 0; c < L.cols; c++) {
    const first = c * L.per + 1, last = Math.min(n, first + L.per - 1);
    const rowsInCol = last - first + 1;
    let blocks = "";
    for (let b = 0; b * 5 < rowsInCol; b++) {
      let rows = "";
      for (let r = 0; r < 5 && b * 5 + r < rowsInCol; r++) {
        const q = first + b * 5 + r;
        let opts = "";
        for (let i = 0; i < optionCount; i++) opts += o(LETTERS[i]);
        rows += `<div class="ar"><span class="qn">${q}</span><span class="ob">${opts}</span></div>`;
      }
      blocks += `<div class="blk">${rows}</div>`;
    }
    cols += `<div class="acol" style="left:${mm(g.L + c * (L.colW + a.colGap))};width:${mm(L.colW)};top:${mm(L.colsTop)};height:${mm(L.colH)}">${blocks}</div>`;
  }

  const marks = wassceTimingMarks(n, optionCount, digits).map(y => `<i class="tm" style="top:${mm(y - 0.475)}"></i>`).join("")
    + wassceTopMarks(n, optionCount, digits).map(x => `<i class="tt" style="left:${mm(x - g.topMark.w / 2)}"></i>`).join("");
  const foot = `<div class="foot"><span class="official">FOR OFFICIAL USE ONLY &nbsp; Score <i class="sc"></i> / ${n} &nbsp;&nbsp; Checked by <i class="sc w"></i></span><span>${esc(name)}</span></div>`;

  const card = `<div class="card st-wassce">
    <i class="reg tl"></i><i class="reg tr"></i><i class="reg bl"></i><i class="reg br"></i>
    ${header}${leftBlock}${idBlock}${instructions}${answerTitle}${cols}
    <div class="strip">${marks}</div>${foot}
  </div>`;
  const slot = (side) => `<div class="slot ${side}"><div class="scaler">${card}</div></div>`;
  const sheets = `<section class="sheet">${slot("l")}${slot("r")}<i class="cut"></i></section>`;

  const css = `
  @page{size:${mm(WASSCE_PAGE.w)} ${mm(WASSCE_PAGE.h)};margin:0}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:"Helvetica Neue",Arial,"Liberation Sans",sans-serif;color:${ink}}
  .sheet{position:relative;width:${mm(WASSCE_PAGE.w)};height:${mm(WASSCE_PAGE.h)};overflow:hidden;background:#fff;page-break-after:always;break-after:page}
  .slot{position:absolute;top:0;width:${mm(WASSCE_PAGE.w / 2)};height:${mm(WASSCE_PAGE.h)};overflow:hidden}.slot.l{left:0}.slot.r{left:${mm(WASSCE_PAGE.w / 2)}}
  .scaler{width:${mm(g.W)};height:${mm(g.H)};transform:scale(${WASSCE_SCALE});transform-origin:0 0}
  .cut{position:absolute;left:${mm(WASSCE_PAGE.w / 2 - 0.15)};top:0;height:${mm(WASSCE_PAGE.h)};border-left:${mm(0.3)} dashed #000;display:block;z-index:5}
  .sheet:last-child{page-break-after:auto;break-after:auto}
  .card{position:relative;width:${mm(g.W)};height:${mm(g.H)};overflow:hidden;background:#fff;color:${ink}}
  .reg{position:absolute;width:${mm(g.mark.size)};height:${mm(g.mark.size)};background:#000}
  .reg.tl{left:${mm(g.mark.inset)};top:${mm(g.mark.inset)}}.reg.tr{right:${mm(g.mark.inset)};top:${mm(g.mark.inset)}}
  .reg.bl{left:${mm(g.mark.inset)};bottom:${mm(g.mark.inset)}}.reg.br{right:${mm(g.mark.inset)};bottom:${mm(g.mark.inset)}}

  /* letterhead */
  .head{position:absolute;left:${mm(g.L)};top:${mm(g.head.top)};width:${mm(g.CW)};height:${mm(g.head.h)};display:flex;align-items:center}
  .head-logo{position:absolute;left:0;top:50%;transform:translateY(-50%);width:${mm(g.head.logo)};height:${mm(g.head.logo)};display:flex;align-items:center;justify-content:center}
  .logo{max-width:${mm(g.head.logo)};max-height:${mm(g.head.logo)};object-fit:contain;display:block}
  .crest,.crest svg{width:${mm(g.head.logo)};height:${mm(g.head.logo)};display:block}
  .head-mid{width:100%;padding:0 ${mm(sideSpace)};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
  .school div{white-space:nowrap}
  .school{font-weight:800;line-height:1.1;color:${ink};text-transform:uppercase;letter-spacing:.01em}
  .motto{margin-top:${mm(0.7)};font-size:${mm(2.4)};font-style:italic;color:${ink}}
  .title{margin-top:${mm(1.4)};font-size:${mm(3.8)};font-weight:700;letter-spacing:.09em;padding-left:.09em;color:${ink}}
  .rule1{position:absolute;left:${mm(g.L)};top:${mm(g.ruleTop)};width:${mm(g.CW)};border-top:${mm(LINE)} solid ${ink}}
  .rule2{position:absolute;left:${mm(g.L)};top:${mm(g.ruleTop + 1.5)};width:${mm(g.CW)};border-top:${mm(THIN)} solid ${rule2}}

  /* candidate details */
  .left{position:absolute;display:flex;flex-direction:column;gap:${mm(lg.gap)}}
  .left > *{flex:none}
  .qrbox{position:absolute;background:#fff}.qrbox .qr{display:block}
  .box{border:${mm(LINE)} solid ${ink};background:#fff;padding:${mm(0.9)} ${mm(2)};position:relative}
  .nl{font-size:${mm(2.1)};font-weight:700;letter-spacing:.05em;color:${ink};white-space:nowrap}
  .nv{margin-left:${mm(2)};font-size:${mm(3.1)};font-weight:700;color:${ink}}
  .nmb{padding:0;display:flex;flex-direction:column}
  .nrow{flex:1;padding:${mm(0.9)} ${mm(2)};border-bottom:${mm(THIN)} dashed ${ink}}
  .nrow:last-child{border-bottom:none}
  .two{display:flex;gap:${mm(lg.gap)}}
  .box.vs{display:flex;align-items:center;white-space:nowrap}
  .vb{position:absolute;right:${mm(lg.ver.right)};top:50%;transform:translateY(-50%);display:inline-flex;gap:${mm(lg.ver.gap)};align-items:center}
  .sup{display:flex;align-items:center;gap:${mm(2.4)}}
  .sup-b{padding-right:${mm(lg.absent.w + lg.absent.right + 2)}}
  .sup-t{font-size:${mm(2.1)};font-weight:800;letter-spacing:.05em;white-space:nowrap}
  .sup-b{flex:1;font-size:${mm(2.2)};line-height:1.25}

  /* index number grid */
  .idg{position:absolute;border:${mm(LINE)} solid ${ink};background:#fff}
  .gh{height:${mm(g.id.head)};display:flex;align-items:center;justify-content:center;background:${pal.band};color:${pal.onBand};font-size:${mm(2.8)};font-weight:800;letter-spacing:.14em}
  .gb{display:flex;height:${mm(g.id.box + 0.3)};border-bottom:${mm(THIN)} solid ${ink}}
  .gbc{flex:none;height:100%;border-right:${mm(THIN)} solid ${ink}}
  .gbc:last-child{border-right:none}
  .gd{display:flex;padding:${mm(g.id.pad)} 0}
  .gc{flex:none;border-right:${mm(THIN)} dotted ${ink}}
  .gc:last-child{border-right:none}
  .dg{height:${mm(g.id.row)};display:flex;align-items:center;justify-content:center}

  /* instructions */
  .ins{position:absolute;left:${mm(g.L)};width:${mm(g.CW)};border:${mm(LINE)} solid ${ink};background:#fff;display:flex;gap:${mm(4)};padding:${mm(3.4)} ${mm(2.6)} ${mm(1.4)}}
  .ins-tab{position:absolute;top:${mm(-0.35)};left:${mm(2.6)};transform:translateY(-50%);background:#fff;color:${ink};font-size:${mm(2.2)};font-weight:800;letter-spacing:.12em;padding:0 ${mm(1.8)}}
  .ins-col{min-width:0;display:flex;flex-direction:column}
  .ins-col.l{flex:1.3}.ins-col.r{flex:1}
  .it{display:flex;gap:${mm(1.4)};font-size:${mm(2.45)};line-height:1.35;color:${ink};margin-bottom:${mm(0.9)}}
  .it b{flex:none;width:${mm(2.8)}}
  .it u{font-weight:700;text-underline-offset:${mm(0.4)}}
  .ex{display:inline-flex;gap:${mm(0.9)};vertical-align:middle;margin-left:${mm(0.6)}}
  .egs{display:flex;justify-content:space-between;gap:${mm(0.8)};margin-top:auto}
  .eg{display:flex;align-items:center;gap:${mm(1)}}
  .eg-t{font-size:${mm(2.1)};font-weight:700;white-space:nowrap}

  /* THE BOX: a square-bracket pair  [ A ]  drawn with two borders, letter between - the same box as the BECE sheet.
     Each box keeps the footprint (width x height) and centre the scanner expects, so only its look changes. */
  .o{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none;width:${mm(a.bub.w)};height:${mm(a.bub.h)};background:#fff;font-style:normal;font-size:${mm(2.35)};font-weight:700;line-height:1;color:${faint}}
  .o::before,.o::after{content:"";position:absolute;top:0;bottom:0;width:${mm(0.95)};border:${mm(THIN)} solid ${ink}}
  .o::before{left:0;border-right:none}
  .o::after{right:0;border-left:none}
  .o.dgt{width:${mm(3.7)};height:${mm(3.1)};font-size:${mm(2.0)}}
  .o.dgt::before,.o.dgt::after{width:${mm(0.8)}}
  .o.vo{width:${mm(7)};height:${mm(4.8)};font-size:${mm(3)}}
  .o.abs{width:${mm(8)};height:${mm(4.8)}}
  .o.vo::before,.o.vo::after,.o.abs::before,.o.abs::after{width:${mm(1.4)}}
  .o .pc{position:absolute;background:#222;display:block}
  .o .pf{left:${mm(0.9)};right:${mm(0.9)};top:22%;bottom:22%}
  .o .ph{left:${mm(0.9)};width:calc(50% - ${mm(0.9)});top:22%;bottom:22%}
  .o.vo .pf,.o.abs .pf{left:${mm(1.5)};right:${mm(1.5)}}
  .o .pd{left:calc(50% - ${mm(0.5)});top:calc(50% - ${mm(0.5)});width:${mm(1)};height:${mm(1)};border-radius:50%}
  .o.fill{color:#fff}
  .o.tick{background:#fff url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'><path d='M1.2 3.2 L3.8 5.2 L8.8 0.8' fill='none' stroke='%23222' stroke-width='1.1' stroke-linecap='round' stroke-linejoin='round'/></svg>") center/${mm(3.2)} ${mm(2)} no-repeat}

  /* answers */
  .atitle{position:absolute;left:${mm(g.L)};width:${mm(g.CW)};background:${pal.band};color:${pal.onBand};font-size:${mm(2.8)};font-weight:800;letter-spacing:.14em;display:flex;align-items:center;padding:0 ${mm(3)}}
  .atitle span{font-weight:600;letter-spacing:.05em;margin-left:${mm(3)};opacity:.92}
  .acol{position:absolute;border:${mm(LINE)} solid ${ink};background:#fff;padding:${mm(a.pad)} 0}
  .blk + .blk{margin-top:${mm(a.groupGap)}}
  .ar{height:${mm(L.pitch)};display:flex;align-items:center}
  .qn{flex:none;width:${mm(a.numW - 0.4)};padding-right:${mm(1.6)};text-align:right;font-size:${mm(2.6)};font-weight:800;color:${ink}}
  .ob{display:flex;gap:${mm(L.optPitch - a.bub.w)}}

  /* timing marks and footer */
  .strip{position:absolute;left:0;top:0}
  .tt{position:absolute;top:${mm(g.topMark.y)};width:${mm(g.topMark.w)};height:${mm(g.topMark.h)};background:${ink};display:block}
  .tm{position:absolute;left:${mm(g.strip.x)};width:${mm(g.strip.w)};height:${mm(0.95)};background:${ink};display:block}
  .foot{position:absolute;left:${mm(g.L)};top:${mm(L.footTop)};width:${mm(g.CW)};height:${mm(g.foot.h)};display:flex;justify-content:space-between;align-items:center;font-size:${mm(2.1)};color:${ink};font-weight:600}
  .official{display:inline-flex;align-items:flex-end;white-space:nowrap;border:${mm(THIN)} dashed ${ink};padding:${mm(1)} ${mm(3)};font-weight:700;letter-spacing:.04em}
  .sc{display:inline-block;width:${mm(11)};border-bottom:${mm(THIN)} solid ${ink};height:${mm(2.2)};margin:0 ${mm(0.8)}}
  .sc.w{width:${mm(30)}}
  @media screen{
    body{background:#d9dce1;padding:${mm(preview ? 6 : 14)} 0}
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

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(name || "School")} - Objective Answer Sheet</title><style>${css}</style></head><body data-sheet-style="wassce" data-questions="${n}" data-sheets="1" data-per-page="2">
${preview ? "" : `<div class="bar">Print on A4 LANDSCAPE at 100% (Actual size), margins None. Then cut along the dashed line: two sheets, each half of A4.</div>`}
${sheets}
<script>${script}</script></body></html>`;
}
