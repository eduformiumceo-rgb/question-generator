/**
 * bookletSheet.js - the ANSWER BOOKLET for theory / essay papers (WASSCE Paper 2 style).
 *
 * The objective shading sheet only covers multiple choice. Structured and essay questions are written by hand, so a
 * WASSCE-style paper also needs an answer booklet. This prints one:
 *
 *   Page 1 (cover): school letterhead, "ANSWER BOOKLET", candidate's name, index-number boxes, subject, paper, date,
 *                   class, signature, instructions to candidates, and the EXAMINER'S TABLE (one row per question + total).
 *   Pages 2..N    : ruled answer pages. A question-number margin on the left ("do not write in this margin"), lines every
 *                   8 mm, a running header with the candidate's index number, page number and "Turn over" at the foot.
 *
 * Pages are full A4 PORTRAIT (210 x 297 mm), printed one per page in order (cover first). Print double-sided
 * (flip on the long edge) and staple at the left to make a booklet.
 * One printing colour (the school's main colour, or black) on white paper, same as the shading sheet.
 * Only the school's own name and logo are printed, never an examining body's name or crest.
 */
import { fitSchoolName, formalExamType } from "./beceSheet.js";

export const BOOKLET_PAGE = { w: 210, h: 297 };
export const BOOKLET_PAGE_OPTIONS = [8, 12, 16, 20, 24, 32];
export const BOOKLET_DEFAULT_PAGES = 12;
export const BOOKLET_MAX_QUESTIONS = 30;

export const BOOKLET_GEOM = {
  W: 210, H: 297, L: 12, CW: 186,
  head: { top: 10, h: 25, logo: 22 },
  ruleTop: 36,
  inner: { headTop: 9, ruleTop: 19, linesTop: 30, pitch: 8, linesBottom: 277, marginW: 22, footTop: 283 },
};

const PX = 25.4 / 96;
const LINE = 3 * PX, MID = 2 * PX, THIN = 1 * PX;

export const clampBookletPages = (n) => {
  const v = Math.round(Number(n) || BOOKLET_DEFAULT_PAGES);
  return Math.max(4, Math.min(40, v));
};
export const clampBookletQuestions = (n) => Math.max(1, Math.min(BOOKLET_MAX_QUESTIONS, Math.round(Number(n) || 0)));

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

/** Number of ruled lines on an inner page (so tests and the UI can read it). */
export function bookletLineCount() {
  const i = BOOKLET_GEOM.inner;
  return Math.floor((i.linesBottom - i.linesTop) / i.pitch) + 1;
}

/** @param h helpers from shadingSheet.js: { pal, esc, mm, logoMarkup, meta, pages, questions, ruling, preview, mix } */
export function renderBookletHTML(h) {
  const { pal, esc, mm, logoMarkup, meta, preview } = h;
  const g = BOOKLET_GEOM, I = g.inner;
  const pages = clampBookletPages(h.pages);
  const nq = clampBookletQuestions(h.questions || 8);
  const ruling = h.ruling === "plain" ? "plain" : "lined";
  const ink = pal.ink;
  const rule2 = pal.mono ? pal.ink : pal.accent;
  const lineCol = h.softInk || "#8a8f98";
  const name = String(meta.schoolName || "").trim();
  const digits = Math.max(4, Math.min(12, Math.round(Number(meta.idDigits) || 10)));
  const examLine = [meta.className, formalExamType(meta.examType), meta.term && String(meta.term).toUpperCase()].filter(Boolean).join("   |   ");
  const subject = [meta.subject, meta.programme].filter(Boolean).join(" - ");
  const sideSpace = g.head.logo + 4;
  const fit = fitSchoolName(name, g.CW - 2 * sideSpace);

  /* ---------- cover ---------- */
  const idBoxW = 8.2;
  const idBoxes = Array.from({ length: digits }, () => `<i class="ib"></i>`).join("");

  const examinerCols = Math.ceil(nq / 10);
  const examiner = (() => {
    let tables = "";
    for (let c = 0; c < examinerCols; c++) {
      let rows = "";
      for (let r = 0; r < 10; r++) {
        const q = c * 10 + r + 1;
        rows += q <= nq ? `<tr><td class="qq">${q}</td><td></td><td></td></tr>` : `<tr class="void"><td></td><td></td><td></td></tr>`;
      }
      tables += `<table class="et"><thead><tr><th>Question</th><th>Marks</th><th>Initials</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    return `<div class="exam-box">
      <div class="exam-t">FOR EXAMINER'S USE ONLY</div>
      <div class="ets">${tables}</div>
      <div class="total"><span>TOTAL MARKS</span><i></i><span class="chk">Checked by</span><i class="w"></i></div>
    </div>`;
  })();

  const cover = `<section class="page cover">
    <div class="head">
      <div class="head-logo">${logoMarkup || ""}</div>
      <div class="head-mid">
        <div class="school" style="font-size:${mm(fit.size)}">${fit.lines.map(l => `<div>${esc(l)}</div>`).join("") || "&nbsp;"}</div>
        ${meta.schoolMotto ? `<div class="motto">${esc(meta.schoolMotto)}</div>` : ""}
      </div>
    </div>
    <div class="rule1" style="top:${mm(g.ruleTop)}"></div><div class="rule2" style="top:${mm(g.ruleTop + 1.5)}"></div>

    <div class="ctitle">
      <div class="big">ANSWER BOOKLET</div>
      ${examLine ? `<div class="exam">${esc(examLine)}</div>` : ""}
    </div>

    <div class="form">
      <div class="fbox name"><div class="fr"><span class="nl">SURNAME</span></div><div class="fr"><span class="nl">OTHER NAMES</span></div></div>
      <div class="frow">
        <div class="fbox grow"><span class="nl">SUBJECT</span>${meta.prefillSubject && subject ? `<span class="nv">${esc(subject)}</span>` : (subject ? `<span class="nv soft">${esc(subject)}</span>` : "")}</div>
        <div class="fbox pap"><span class="nl">PAPER</span></div>
        <div class="fbox dat"><span class="nl">DATE</span></div>
      </div>
      <div class="fbox idf">
        <span class="nl">INDEX NUMBER</span>
        <span class="ibs" style="--w:${mm(idBoxW)}">${idBoxes}</span>
      </div>
      <div class="frow">
        <div class="fbox grow"><span class="nl">CANDIDATE'S SIGNATURE</span></div>
        <div class="fbox pap"><span class="nl">SEAT No.</span></div>
        <div class="fbox dat"><span class="nl">EXTRA SHEETS USED</span></div>
      </div>
    </div>

    <div class="ins">
      <div class="ins-tab">INSTRUCTIONS TO CANDIDATES</div>
      <div class="it"><b>1.</b><span>Write your name, subject and index number in the spaces above, and your index number at the top of every page.</span></div>
      <div class="it"><b>2.</b><span>Write with a blue or black pen. Write the number of each question in the left margin, and answer the questions in the order set, or as the paper directs.</span></div>
      <div class="it"><b>3.</b><span>Do not write in the margin. Rule off neatly after each question, and cross out any rough work with a single line.</span></div>
      <div class="it"><b>4.</b><span>Do not tear out any page. If you need more paper, ask the supervisor for an extra sheet, write your index number on it, and tie it inside this booklet.</span></div>
      <div class="it"><b>5.</b><span>Hand in this booklet, with all extra sheets, before you leave the examination room.</span></div>
    </div>

    ${examiner}
    <div class="pg">Page 1 of ${pages}</div>
  </section>`;

  /* ---------- inner pages ---------- */
  const lineN = bookletLineCount();
  const linesSVG = () => {
    if (ruling === "plain") return "";
    let out = "";
    for (let k = 0; k < lineN; k++) out += `<line x1="0" x2="${g.CW}" y1="${k * I.pitch}" y2="${k * I.pitch}"/>`;
    return `<svg class="ruled" style="left:${mm(g.L)};top:${mm(I.linesTop)};width:${mm(g.CW)};height:${mm((lineN - 1) * I.pitch + 0.4)}" viewBox="0 0 ${g.CW} ${(lineN - 1) * I.pitch + 0.4}" preserveAspectRatio="none"><g stroke="${lineCol}" stroke-width="0.22" fill="none">${out}</g></svg>`;
  };
  const shortName = name.length > 38 ? name.slice(0, 36).trim() + "…" : name;
  const innerPage = (p) => `<section class="page inner">
    <div class="ih">
      <span class="ih-l">${esc(shortName)}</span>
      <span class="ih-c">ANSWER BOOKLET${subject ? ` &middot; ${esc(subject)}` : ""}</span>
      <span class="ih-r">Index No. <span class="ibs mini" style="--w:${mm(4.4)}">${Array.from({ length: digits }, () => `<i class="ib"></i>`).join("")}</span></span>
    </div>
    <div class="irule1"></div><div class="irule2"></div>
    <div class="mg-label">Question<br>No.</div>
    <div class="mg" style="left:${mm(g.L)};top:${mm(I.linesTop - 6)};height:${mm(I.linesBottom - I.linesTop + 6 + 0.2)};width:${mm(I.marginW)}"></div>
    <div class="mg-note" style="left:${mm(g.L + I.marginW + 1.5)};top:${mm(I.linesTop - 5.4)}">Do not write in the margin</div>
    ${linesSVG()}
    <div class="ifoot"><span class="ifm">${p === pages ? "END OF BOOKLET" : "Turn over"}</span><span class="ipn">${p}</span></div>
  </section>`;

  let body = cover;
  for (let p = 2; p <= pages; p++) body += innerPage(p);

  const css = `
  @page{size:${mm(g.W)} ${mm(g.H)};margin:0}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:"Helvetica Neue",Arial,"Liberation Sans",sans-serif;color:${ink}}
  .page{position:relative;width:${mm(g.W)};height:${mm(g.H)};overflow:hidden;background:#fff;page-break-after:always;break-after:page;color:${ink}}
  .page:last-child{page-break-after:auto;break-after:auto}

  /* cover */
  .head{position:absolute;left:${mm(g.L)};top:${mm(g.head.top)};width:${mm(g.CW)};height:${mm(g.head.h)};display:flex;align-items:center}
  .head-logo{position:absolute;left:0;top:50%;transform:translateY(-50%);width:${mm(g.head.logo)};height:${mm(g.head.logo)};display:flex;align-items:center;justify-content:center}
  .logo{max-width:${mm(g.head.logo)};max-height:${mm(g.head.logo)};object-fit:contain;display:block}
  .crest,.crest svg{width:${mm(g.head.logo)};height:${mm(g.head.logo)};display:block}
  .head-mid{width:100%;padding:0 ${mm(sideSpace)};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
  .school div{white-space:nowrap}
  .school{font-weight:800;line-height:1.1;text-transform:uppercase;letter-spacing:.01em}
  .motto{margin-top:${mm(0.8)};font-size:${mm(2.5)};font-style:italic}
  .rule1{position:absolute;left:${mm(g.L)};width:${mm(g.CW)};border-top:${mm(LINE)} solid ${ink}}
  .rule2{position:absolute;left:${mm(g.L)};width:${mm(g.CW)};border-top:${mm(THIN)} solid ${rule2}}
  .ctitle{position:absolute;left:${mm(g.L)};top:${mm(43)};width:${mm(g.CW)};text-align:center}
  .big{display:inline-block;font-size:${mm(8.5)};font-weight:800;letter-spacing:.16em;padding:${mm(1.6)} ${mm(8)};background:${pal.band};color:${pal.onBand}}
  .exam{margin-top:${mm(2.6)};font-size:${mm(3)};font-weight:700;letter-spacing:.1em}
  .form{position:absolute;left:${mm(g.L)};top:${mm(64)};width:${mm(g.CW)};display:flex;flex-direction:column;gap:${mm(2.4)}}
  .fbox{border:${mm(LINE)} solid ${ink};padding:${mm(1.2)} ${mm(2.4)};position:relative;background:#fff;min-height:${mm(12)}}
  .nl{font-size:${mm(2.3)};font-weight:700;letter-spacing:.05em;white-space:nowrap}
  .nv{display:block;margin-top:${mm(1.4)};font-size:${mm(3.6)};font-weight:700}
  .nv.soft{font-weight:600;opacity:.0}
  .name{padding:0;min-height:${mm(26)};display:flex;flex-direction:column}
  .fr{flex:1;padding:${mm(1.2)} ${mm(2.4)};border-bottom:${mm(THIN)} dashed ${ink}}
  .fr:last-child{border-bottom:none}
  .frow{display:flex;gap:${mm(2.4)}}
  .grow{flex:1}.pap{width:${mm(34)}}.dat{width:${mm(42)}}
  .idf{display:flex;align-items:center;gap:${mm(5)};min-height:${mm(15)}}
  .ibs{display:inline-flex;border:${mm(LINE)} solid ${ink};background:#fff}
  .ib{display:block;width:var(--w);height:${mm(9)};border-right:${mm(THIN)} solid ${ink}}
  .ib:last-child{border-right:none}
  .ibs.mini{border-width:${mm(THIN)};vertical-align:middle}
  .ibs.mini .ib{height:${mm(4.8)}}
  .ins{position:absolute;left:${mm(g.L)};top:${mm(142)};width:${mm(g.CW)};border:${mm(LINE)} solid ${ink};padding:${mm(4.4)} ${mm(3)} ${mm(2)}}
  .ins-tab{position:absolute;top:${mm(-0.35)};left:${mm(3)};transform:translateY(-50%);background:#fff;font-size:${mm(2.4)};font-weight:800;letter-spacing:.12em;padding:0 ${mm(2)}}
  .it{display:flex;gap:${mm(1.6)};font-size:${mm(2.7)};line-height:1.4;margin-bottom:${mm(1.3)}}
  .it b{flex:none;width:${mm(3)}}
  .exam-box{position:absolute;left:${mm(g.L)};top:${mm(194)};width:${mm(g.CW)};border:${mm(LINE)} solid ${ink};background:#fff}
  .exam-t{background:${pal.band};color:${pal.onBand};font-size:${mm(2.8)};font-weight:800;letter-spacing:.14em;padding:${mm(1.3)} ${mm(3)}}
  .ets{display:flex;gap:0}
  .et{flex:1;border-collapse:collapse;font-size:${mm(2.4)}}
  .et + .et{border-left:${mm(THIN)} solid ${ink}}
  .et th{font-weight:800;letter-spacing:.04em;padding:${mm(0.8)} ${mm(1)};border-bottom:${mm(THIN)} solid ${ink};border-right:${mm(THIN)} solid ${ink}}
  .et th:last-child,.et td:last-child{border-right:none}
  .et td{height:${mm(6.1)};border-bottom:${mm(THIN)} solid ${ink};border-right:${mm(THIN)} solid ${ink};text-align:center;font-weight:700}
  .et tr:last-child td{border-bottom:none}
  .et td.qq{width:${mm(15)}}
  .et tr.void td{background:transparent}
  .total{display:flex;align-items:flex-end;gap:${mm(2)};padding:${mm(2)} ${mm(3)} ${mm(1.6)};border-top:${mm(LINE)} solid ${ink};font-size:${mm(2.6)};font-weight:800;letter-spacing:.06em}
  .total i{display:block;width:${mm(26)};border-bottom:${mm(THIN)} solid ${ink};height:${mm(3.4)}}
  .total i.w{width:${mm(44)}}
  .total .chk{margin-left:auto}
  .pg{position:absolute;left:0;right:0;top:${mm(g.inner.footTop)};text-align:center;font-size:${mm(2.4)};font-weight:700}

  /* inner pages */
  .ih{position:absolute;left:${mm(g.L)};top:${mm(I.headTop)};width:${mm(g.CW)};display:flex;align-items:center;justify-content:space-between;gap:${mm(4)};font-size:${mm(2.5)};font-weight:700}
  .ih-l{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase;letter-spacing:.04em}
  .ih-c{flex:none;letter-spacing:.08em;font-weight:800}
  .ih-r{flex:1;text-align:right;white-space:nowrap}
  .irule1{position:absolute;left:${mm(g.L)};top:${mm(I.ruleTop)};width:${mm(g.CW)};border-top:${mm(LINE)} solid ${ink}}
  .irule2{position:absolute;left:${mm(g.L)};top:${mm(I.ruleTop + 1.3)};width:${mm(g.CW)};border-top:${mm(THIN)} solid ${rule2}}
  .mg{position:absolute;border-left:${mm(MID)} solid ${ink};border-right:${mm(MID)} solid ${ink}}
  .mg-label{position:absolute;left:${mm(g.L)};top:${mm(I.ruleTop + 2.2)};width:${mm(I.marginW)};text-align:center;font-size:${mm(2.2)};font-weight:700;line-height:1.2}
  .mg-note{position:absolute;font-size:${mm(2.1)};font-style:italic;opacity:.8}
  .ruled{position:absolute;display:block;overflow:visible}
  .ifoot{position:absolute;left:${mm(g.L)};top:${mm(I.footTop)};width:${mm(g.CW)};display:flex;justify-content:space-between;align-items:center;font-size:${mm(2.5)}}
  .ifm{font-style:italic;font-weight:700;letter-spacing:.04em}
  .ipn{position:absolute;left:0;right:0;text-align:center;font-weight:800;font-size:${mm(3)}}
  @media screen{
    body{background:#d9dce1;padding:${mm(preview ? 6 : 14)} 0}
    .page{margin:0 auto ${mm(10)};box-shadow:0 1mm 4mm rgba(0,0,0,.25)}
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

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(name || "School")} - Answer Booklet</title><style>${css}</style></head><body data-sheet-style="booklet" data-pages="${pages}" data-questions="${nq}">
${preview ? "" : `<div class="bar">Print on A4 PORTRAIT at 100% (Actual size), margins None. Print double-sided (flip on long edge) and staple at the left.</div>`}
${body}
<script>${script}</script></body></html>`;
}
