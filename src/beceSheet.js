/**
 * beceSheet.js - the BECE-type objective answer sheet.
 *
 * Modelled on the Ghana Education Service (WAEC) objective answer sheet:
 *   - ONE printing colour for every line, label and box (the school's main colour, or black), on plain white paper.
 *     No fills, bands, tints or second colour, so the pencil shading is the only dark thing on the page.
 *   - Every answer / digit position is a square-bracket box  [A]  [B]  [C]  [D]  [E]  with the letter inside.
 *   - All 60 questions are printed identically; a paper with fewer questions simply leaves the rest unused.
 *   - Everything hangs off ONE left edge and ONE right edge, so the header, name box, instructions, candidate grid
 *     and the three answer columns line up exactly.
 *
 * Every size is a fixed millimetre value; nothing is scaled to fit.
 */

/** All measurements in mm on an A5 portrait sheet (148.5 x 210). Two sheets make one A4 landscape page. */
export const BECE_GEOM = {
  W: 148.5, H: 210,
  L: 7,                 // left margin
  CW: 129,              // content width (right edge of content = 136)
  strip: { x: 138.8, w: 4.4 },   // timing marks
  head: { top: 6, h: 21, logo: 19 },
  rule: { top: 27.4 },
  name: { top: 29.8, h: 9.4 },
  dashY: 40.4,
  ins: { top: 43.4, h: 25.8 },
  id: { top: 70.9, head: 6, box: 5, row: 3.4, pad: 0.6, pitch: 6.5, gap: 2 },
  ans: { top: 120.7, rowP: 3.7, grpGap: 1.2, pad: 0.8, colGap: 2.4, perCol: 20, cols: 3 },
  foot: { top: 202.5, h: 3 },  // 4.5 mm clear of the paper edge, inside common printers' safe margin
};
export const BECE_PER_SHEET = 60;
const LETTERS = ["A", "B", "C", "D", "E"];

// Border widths are exact whole CSS pixels (1 px = 0.2646 mm): browsers snap fractional borders DOWN to whole pixels,
// which would silently thin the frames and shift every row against its timing mark.
const PX = 25.4 / 96;
const LINE = 3 * PX;   // main section borders: 0.79 mm, bold like the real BECE sheet
const THIN = 1 * PX;   // inner dividers and bracket strokes: 0.26 mm
const MID = 2 * PX;    // column divider in the name box: 0.53 mm

/**
 * School name: one line when it fits at a good size; otherwise balanced over two or three lines (never a lone
 * orphan word). Every line is kept unbroken (nowrap), so the layout is exactly what is planned here.
 */
export function fitSchoolName(name, availMM) {
  const text = String(name || "").trim().replace(/\s+/g, " ");
  const CAP_W = 0.72;                       // average width of a bold capital, in em
  const size1 = Math.min(6.4, availMM / (Math.max(1, text.length) * CAP_W));
  const words = text.split(" ");
  if (size1 >= 4.3 || words.length < 2) return { lines: [text], size: Math.max(2.6, size1) };

  // best split of the words into k lines = the one whose longest line is shortest
  const split = (k) => {
    let best = null;
    const rec = (start, left, acc) => {
      if (left === 1) {
        const line = words.slice(start).join(" ");
        const lines = [...acc, line], m = Math.max(...lines.map(l => l.length));
        if (!best || m < best.m) best = { lines, m };
        return;
      }
      for (let i = start + 1; i <= words.length - (left - 1); i++) rec(i, left - 1, [...acc, words.slice(start, i).join(" ")]);
    };
    rec(0, k, []);
    return best;
  };
  const caps = { 2: 5.4, 3: 3.5 };
  for (const k of [2, 3]) {
    if (words.length < k) break;
    const best = split(k);
    const size = Math.min(caps[k], availMM / (best.m * CAP_W));
    if (size >= 3.6 || k === 3 || words.length <= k) return { lines: best.lines, size: Math.max(2.6, size) };
  }
  const best = split(Math.min(3, words.length));
  return { lines: best.lines, size: Math.max(2.6, Math.min(3.5, availMM / (best.m * CAP_W))) };
}

/** Vertical centre (mm) of every timing mark: ten ID rows, then the twenty answer rows. Same maths as the CSS below. */
export function timingMarkRows() {
  const g = BECE_GEOM, i = g.id, a = g.ans;
  const out = [];
  const gridTop = i.top + LINE + i.head + i.box + 0.3 + i.pad;
  for (let k = 0; k < 10; k++) out.push(gridTop + k * i.row + i.row / 2);
  for (let r = 0; r < 20; r++) {
    const grp = Math.floor(r / 5);
    out.push(a.top + LINE + a.pad + r * a.rowP + grp * a.grpGap + a.rowP / 2);
  }
  return out;
}

/** @param h  helpers from shadingSheet.js: { PRINT_PAGE, pal, esc, mm, logoMarkup, meta, n, optionCount, preview } */
export function renderBeceSheet(h) {
  const { PRINT_PAGE, pal, esc, mm, logoMarkup, meta, n, preview } = h;
  const g = BECE_GEOM;
  const name = String(meta.schoolName || "").trim();
  const sheetsTotal = Math.max(1, Math.ceil(n / BECE_PER_SHEET));
  const digits = Math.max(4, Math.min(10, Math.round(Number(meta.idDigits) || 10)));
  // SUBJECT and CLASS are left blank for the candidate to write (like the name); the class is never printed in the heading either.
  const subject = [meta.subject, meta.programme].filter(Boolean).join(" - ");
  const sideSpace = g.head.logo + 3.5;   // reserved on BOTH sides so the text is centred on the sheet
  const fit = fitSchoolName(name, g.CW - 2 * sideSpace);

  // ONE colour for the whole sheet.
  const ink = pal.ink;

  /* ---- pieces ---- */
  const k = (txt, cls = "") => `<i class="k ${cls}">${esc(txt)}${/\b(fill|half|dot)\b/.test(cls) ? `<b class="pc ${/\bfill\b/.test(cls) ? "pf" : /\bhalf\b/.test(cls) ? "ph" : "pd"}"></b>` : ""}</i>`;

  const header = `
    <div class="head ${fit.lines.length > 2 ? "l3" : ""}">
      <div class="head-logo">${logoMarkup || ""}</div>
      <div class="head-mid">
        <div class="school" style="font-size:${mm(fit.size)}">${fit.lines.map(l => `<div>${esc(l)}</div>`).join("") || "&nbsp;"}</div>
        <div class="title">OBJECTIVE ANSWER SHEET</div>
      </div>
    </div>
    <div class="rule"></div>`;

  const nameBox = `
    <div class="nm">
      <div class="nc a"><div class="nl">CANDIDATE NAME:</div></div>
      <div class="nc b"><div class="nl">SUBJECT:</div></div>
      <div class="nc c"><div class="nl">CLASS:</div></div>
    </div>
    <svg class="dash" viewBox="0 0 ${g.CW} 0.9" preserveAspectRatio="none"><line x1="0" y1="0.45" x2="${g.CW}" y2="0.45" stroke="${ink}" stroke-width="0.9" stroke-dasharray="4.2 2.4"/></svg>`;

  const eg = (cls, label) => `<span class="eg">${k("A", cls)}<span class="eg-t">${label}</span></span>`;
  const instructions = `
    <div class="ins">
      <div class="ins-tab">INSTRUCTIONS</div>
      <div class="ins-col l">
        <div class="it"><b>1.</b><span>Use <u>HB Pencil</u>. Press firmly.</span></div>
        <div class="it"><b>2.</b><span>Answer each question by choosing one letter and then, shade through the letter chosen like this <span class="ex">${LETTERS.map(l => k(l)).join("")}</span></span></div>
        <div class="it"><b>3.</b><span>If you want to change an answer, rub out your first mark completely.</span></div>
      </div>
      <div class="ins-col r">
        <div class="it"><b>4.</b><span>If only four alternative answers are given for each question, ignore the letter E.</span></div>
        <div class="it"><b>5.</b><span>Your question paper may have fewer than ${BECE_PER_SHEET} questions.</span></div>
        <div class="egs">${eg("fill", "Correct")}${eg("tick", "Wrong")}${eg("half", "Wrong")}${eg("dot", "Wrong")}</div>
      </div>
    </div>`;

  const group = (title, cols, widthMM, titleSize) => {
    const p = widthMM / cols;
    let boxes = "", digitsCols = "";
    for (let c = 0; c < cols; c++) {
      boxes += `<div class="gbc" style="width:${mm(p)}"></div>`;
      let col = "";
      for (let d = 0; d <= 9; d++) col += `<div class="dg">${k(d, "dgt")}</div>`;
      digitsCols += `<div class="gc" style="width:${mm(p)}">${col}</div>`;
    }
    return `<div class="grp" style="width:${mm(widthMM + 2 * LINE)}">
      <div class="gh" style="font-size:${mm(titleSize)}">${title}</div>
      <div class="gb">${boxes}</div>
      <div class="gd">${digitsCols}</div>
    </div>`;
  };
  const candW = g.id.pitch * 10;
  const version = String(meta.examVersion || "").toUpperCase();
  const idBlock = `
    <div class="idrow">
      ${group("CANDIDATE NUMBER", digits, candW, 3.1)}
      <div class="rcol">
        <div class="ver">
          <div class="vh">PAPER VERSION</div>
          <div class="vb">${["A", "B", "C"].map(v => k(v, "vk" + (version === v ? " fill" : ""))).join("")}</div>
        </div>
        <div class="sup">
          <div class="sup-t">For Supervisors Only</div>
          <div class="sup-row"><div class="sup-b">If candidate is absent, shade this space</div><i class="k abs"></i></div>
        </div>
      </div>
    </div>`;

  const marks = timingMarkRows().map(y => `<i class="tm" style="top:${mm(y - 0.475)}"></i>`).join("");

  const a = g.ans;
  const colW = (g.CW - a.colGap * (a.cols - 1)) / a.cols;
  const sheetHTML = (s) => {
    const base = s * BECE_PER_SHEET;
    const usedOnSheet = Math.max(0, Math.min(BECE_PER_SHEET, n - base));
    let cols = "";
    for (let c = 0; c < a.cols; c++) {
      let blocks = "";
      for (let b = 0; b < 4; b++) {
        let rows = "";
        for (let r = 0; r < 5; r++) {
          const q = base + c * a.perCol + b * 5 + r + 1;
          let opts = "";
          for (let i = 0; i < 5; i++) opts += k(LETTERS[i]);
          // every question is printed the same, whether or not this paper uses it
          rows += `<div class="ar"><span class="qn">${q}</span><span class="ob">${opts}</span></div>`;
        }
        blocks += `<div class="blk">${rows}</div>`;
      }
      cols += `<div class="acol" style="left:${mm(g.L + c * (colW + a.colGap))};width:${mm(colW)}">${blocks}</div>`;
    }
    const first = base + 1, last = Math.min(n, base + BECE_PER_SHEET);
    const foot = `<div class="foot"><span>Marker's use only &nbsp; Score <i class="sc"></i> / ${usedOnSheet}</span><span>${sheetsTotal > 1 ? `Questions ${first}&ndash;${last} &nbsp;|&nbsp; ` : ""}Sheet ${s + 1} of ${sheetsTotal}</span></div>`;
    return `<div class="card st-bece">${header}${nameBox}${instructions}${idBlock}${cols}<div class="strip">${marks}</div>${foot}</div>`;
  };

  const sheets = Array.from({ length: sheetsTotal }, (_, s) => `<section class="sheet">
      <div class="slot l">${sheetHTML(s)}</div>
      <div class="slot r">${sheetHTML(s)}</div>
      <div class="cut"><span class="scis">&#9986;</span><em>cut here</em></div>
    </section>`).join("");

  /* ---- styles ---- */
  const cutX = PRINT_PAGE.w / 2;
  const SERIF = 0.95;     // how far the top/bottom ticks of a [ bracket reach in
  const css = `
  @page{size:${mm(PRINT_PAGE.w)} ${mm(PRINT_PAGE.h)};margin:0}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:"Helvetica Neue",Arial,"Liberation Sans",sans-serif;color:${ink}}
  .sheet{position:relative;width:${mm(PRINT_PAGE.w)};height:${mm(PRINT_PAGE.h)};overflow:hidden;background:#fff;page-break-after:always;break-after:page}
  .sheet:last-child{page-break-after:auto;break-after:auto}
  .slot{position:absolute;top:0;width:${mm(g.W)};height:${mm(g.H)}}
  .slot.l{left:0}.slot.r{left:${mm(cutX)}}
  .cut{position:absolute;left:${mm(cutX)};top:0;bottom:0;width:0;border-left:${mm(0.3)} dashed #777;z-index:5}
  .cut .scis{position:absolute;top:${mm(2)};left:${mm(-2.6)};font-size:${mm(4.2)};background:#fff;line-height:1;color:#555;transform:rotate(90deg)}
  .cut em{position:absolute;bottom:${mm(1.4)};left:${mm(-6)};width:${mm(12)};text-align:center;font:italic ${mm(2)}/1 Arial,sans-serif;color:#777;background:#fff}
  .card{position:relative;width:${mm(g.W)};height:${mm(g.H)};overflow:hidden;background:#fff;color:${ink}}

  /* header */
  .head{position:absolute;left:${mm(g.L)};top:${mm(g.head.top)};width:${mm(g.CW)};height:${mm(g.head.h)};display:flex;align-items:center}
  .head-logo{position:absolute;left:0;top:50%;transform:translateY(-50%);width:${mm(g.head.logo)};height:${mm(g.head.logo)};display:flex;align-items:center;justify-content:center}
  .logo{max-width:${mm(g.head.logo)};max-height:${mm(g.head.logo)};object-fit:contain;display:block}
  .crest,.crest svg{width:${mm(g.head.logo)};height:${mm(g.head.logo)};display:block}
  .head-mid{width:100%;padding:0 ${mm(sideSpace)};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
  .school div{white-space:nowrap}
  .school{font-weight:800;line-height:1.1;color:${ink};text-transform:uppercase;letter-spacing:.01em}
  .title{margin-top:${mm(1.3)};font-size:${mm(3.7)};font-weight:600;letter-spacing:.07em;padding-left:.07em;color:${ink};padding-bottom:${mm(0.5)};border-bottom:${mm(MID)} solid ${ink}}
  .head.l3 .title{margin-top:${mm(0.8)}}
  .rule{position:absolute;left:${mm(g.L)};top:${mm(g.rule.top)};width:${mm(g.CW)};height:0;border-top:${mm(LINE)} solid ${ink}}

  /* name / subject */
  .nm{position:absolute;left:${mm(g.L)};top:${mm(g.name.top)};width:${mm(g.CW)};height:${mm(g.name.h)};display:flex;border:${mm(LINE)} solid ${ink};background:#fff}
  .nc{padding:${mm(0.9)} ${mm(2)}}
  .nc.a{flex:1.7;border-right:${mm(MID)} solid ${ink}}
  .nc.b{flex:1;min-width:0;border-right:${mm(MID)} solid ${ink}}
  .nc.c{flex:.62;min-width:0}
  .nl{font-size:${mm(2.15)};font-weight:700;letter-spacing:.05em;color:${ink}}
  .nv{margin-top:${mm(0.7)};font-size:${mm(3.1)};font-weight:700;color:${ink};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dash{position:absolute;left:${mm(g.L)};top:${mm(g.dashY)};width:${mm(g.CW)};height:${mm(0.9)};display:block;overflow:visible}

  /* instructions */
  .ins{position:absolute;left:${mm(g.L)};top:${mm(g.ins.top)};width:${mm(g.CW)};height:${mm(g.ins.h)};border:${mm(LINE)} solid ${ink};background:#fff;display:flex;gap:${mm(3)};padding:${mm(3)} ${mm(2.4)} ${mm(1.4)}}
  .ins-tab{position:absolute;top:${mm(-0.35)};left:${mm(2.4)};transform:translateY(-50%);background:#fff;color:${ink};font-size:${mm(2)};font-weight:800;letter-spacing:.12em;padding:0 ${mm(1.6)}}
  .ins-col{min-width:0;display:flex;flex-direction:column}
  .ins-col.l{flex:1.16}.ins-col.r{flex:1}
  .it{display:flex;gap:${mm(1.3)};font-size:${mm(2.35)};line-height:1.32;color:${ink};margin-bottom:${mm(0.7)}}
  .it span{text-wrap:balance}
  .it b{flex:none;width:${mm(2.6)}}
  .it u{font-weight:700;text-underline-offset:${mm(0.4)}}
  .ex{display:inline-flex;gap:${mm(0.8)};vertical-align:middle;margin-left:${mm(0.6)}}
  .egs{display:flex;justify-content:space-between;gap:${mm(0.8)};margin-top:auto}
  .eg{display:flex;align-items:center;gap:${mm(0.9)}}
  .eg-t{font-size:${mm(1.95)};font-weight:700;white-space:nowrap}

  /* THE BOX: a square-bracket pair  [ A ]  drawn with two borders, letter between */
  .k{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none;width:${mm(5)};height:${mm(2.85)};font-style:normal;font-size:${mm(2.5)};font-weight:700;line-height:1;color:${ink}}
  .k::before,.k::after{content:"";position:absolute;top:0;bottom:0;width:${mm(SERIF)};border:${mm(THIN)} solid ${ink}}
  .k::before{left:0;border-right:none}
  .k::after{right:0;border-left:none}
  .k.dgt{width:${mm(4.6)};height:${mm(2.6)};font-size:${mm(2.3)}}
  .k.vk{width:${mm(8)};height:${mm(4.2)};font-size:${mm(3)};font-weight:700}
  .k.vk::before,.k.vk::after{width:${mm(1.4)}}
  .k.abs{width:${mm(8)};height:${mm(4)}}
  .k.abs::before,.k.abs::after{width:${mm(1.4)}}

  /* how-to-shade examples: solid graphite shapes over the bracket (no gradients) */
  .k .pc{position:absolute;background:#222;display:block}
  .k .pf{left:${mm(0.9)};right:${mm(0.9)};top:22%;bottom:22%}
  .k .ph{left:${mm(0.9)};width:calc(50% - ${mm(0.9)});top:22%;bottom:22%}
  .k .pd{left:calc(50% - ${mm(0.5)});top:calc(50% - ${mm(0.5)});width:${mm(1)};height:${mm(1)};border-radius:50%}
  .k.fill{color:#fff}
  .k.vk.fill{color:#fff}
  .k.tick{background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'><path d='M1.2 3.2 L3.8 5.2 L8.8 0.8' fill='none' stroke='%23222' stroke-width='1.1' stroke-linecap='round' stroke-linejoin='round'/></svg>") center/${mm(3.4)} ${mm(2.1)} no-repeat}

  /* candidate number / paper version / supervisors */
  .idrow{position:absolute;left:${mm(g.L)};top:${mm(g.id.top)};width:${mm(g.CW)};display:flex;gap:${mm(g.id.gap)};align-items:stretch}
  .grp{flex:none;border:${mm(LINE)} solid ${ink};background:#fff}
  .gh{height:${mm(g.id.head)};display:flex;align-items:center;justify-content:center;color:${ink};font-weight:800;letter-spacing:.06em;white-space:nowrap;border-bottom:${mm(THIN)} solid ${ink}}
  .gb{display:flex;height:${mm(g.id.box + 0.3)};border-bottom:${mm(THIN)} solid ${ink}}
  .gbc{flex:none;height:100%;border-right:${mm(THIN)} solid ${ink}}
  .gbc:last-child{border-right:none}
  .gd{display:flex;padding:${mm(g.id.pad)} 0}
  .gc{flex:none}
  .dg{height:${mm(g.id.row)};display:flex;align-items:center;justify-content:center}
  .rcol{flex:1;min-width:0;display:flex;flex-direction:column;gap:${mm(g.id.gap)}}
  .ver{flex:none;border:${mm(LINE)} solid ${ink};background:#fff}
  .vh{height:${mm(g.id.head)};display:flex;align-items:center;justify-content:center;color:${ink};font-size:${mm(2.6)};font-weight:800;letter-spacing:.08em;border-bottom:${mm(THIN)} solid ${ink}}
  .vb{height:${mm(9.4)};display:flex;align-items:center;justify-content:center;gap:${mm(9)}}
  .sup{flex:1;min-width:0;border:${mm(LINE)} solid ${ink};background:#fff;padding:${mm(2)} ${mm(2.4)};display:flex;flex-direction:column}
  .sup-t{font-size:${mm(2.6)};font-weight:800;color:${ink};line-height:1.25;padding-bottom:${mm(1.4)};margin-bottom:${mm(1.6)};border-bottom:${mm(THIN)} solid ${ink}}
  .sup-row{display:flex;align-items:center;gap:${mm(3)};flex:1}
  .sup-b{flex:1;font-size:${mm(2.3)};line-height:1.32;color:${ink}}

  /* answer columns: plain white, one border, numbers then five bracket boxes */
  .acol{position:absolute;top:${mm(a.top)};border:${mm(LINE)} solid ${ink};background:#fff;padding:${mm(a.pad)} 0}
  .blk{height:${mm(5 * a.rowP)}}
  .blk + .blk{margin-top:${mm(a.grpGap)}}
  .ar{height:${mm(a.rowP)};display:flex;align-items:center}
  .qn{flex:none;width:${mm(6.6)};padding-right:${mm(1.4)};text-align:right;font-size:${mm(2.5)};font-weight:700;color:${ink}}
  .ob{flex:1;display:flex;justify-content:space-between;padding:0 ${mm(1.6)} 0 ${mm(1.2)}}

  /* timing marks and footer */
  .strip{position:absolute;left:0;top:0}
  .tm{position:absolute;left:${mm(g.strip.x)};width:${mm(g.strip.w)};height:${mm(0.95)};background:${ink};display:block}
  .foot{position:absolute;left:${mm(g.L)};top:${mm(g.foot.top)};width:${mm(g.CW)};height:${mm(g.foot.h)};display:flex;justify-content:space-between;align-items:center;font-size:${mm(1.9)};color:${ink};font-weight:600}
  .sc{display:inline-block;width:${mm(9)};border-bottom:${mm(THIN)} solid ${ink};height:${mm(1.8)};vertical-align:bottom;margin:0 ${mm(0.6)}}
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

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(name || "School")} - Objective Answer Sheet</title><style>${css}</style></head><body data-sheet-style="bece" data-questions="${n}" data-sheets="${sheetsTotal}">
${preview ? "" : `<div class="bar">Print on A4 LANDSCAPE at 100% (Actual size), margins None. Then cut along the dashed line: two sheets, each half of A4.</div>`}
${sheets}
<script>${script}</script></body></html>`;
}
