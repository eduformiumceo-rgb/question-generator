/**
 * examDocx.js
 * ─────────────────────────────────────────────────────────────────
 * Generates a real, valid .docx (Microsoft Word 2007+) file from the same
 * examData shape examTemplate.js's renderExamHTML() consumes. This is a
 * PARALLEL implementation, not a conversion of the HTML - Word's object
 * model (paragraphs, runs, tables) doesn't map cleanly from print CSS, so
 * building it natively against the `docx` library is more reliable than
 * trying to convert HTML→Word after the fact.
 *
 * The look deliberately mirrors the print/PDF paper: school letterhead with
 * logo, double rule, boxed details grid, candidate line with score box,
 * boxed instructions, shaded section bands, hanging-indent questions with
 * right-aligned marks, and "Page X of Y" in the footer.
 *
 * Runs entirely client-side: no server round-trip, no extra AI call, no
 * extra credit cost. Same "your edits flow straight through to every
 * export" property as the print/PDF path, since both read from the same
 * (possibly teacher-edited) examData object.
 * ─────────────────────────────────────────────────────────────────
 */
import {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, TabStopType, LeaderType,
  ShadingType, VerticalAlign, PageOrientation, Footer, PageNumber, TableLayoutType, LineRuleType,
} from "docx";
import { ACCENTS, FONT_STYLES, parseMarkingRows } from "./examTemplate.js";

// Theme for the document being built. generateExamDocx() sets this before any
// builder runs (all builders are synchronous), so the helpers can read it.
const THEME = { font: "Times New Roman", acc: "111111", tint: "EDEEF1" };
const OPT_LETTERS = ["A", "B", "C", "D", "E", "F"];
const INK = "111111"; // body text
const GREY = "444444";

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
const line = (size = 8, color) => ({ style: BorderStyle.SINGLE, size, color: color || THEME.acc });
const box = () => ({ top: line(10), bottom: line(10), left: line(10), right: line(10) });

// A4, 2 cm margins.
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1134;
const NUM_INDENT = 567;   // question number column (1 cm)

/* ── helpers ─────────────────────────────────────────────────── */

/** Text -> runs, turning "\n" into real line breaks (Word ignores raw \n). */
function textRuns(text, opts = {}) {
  const lines = String(text ?? "").split(/\r?\n/);
  return lines.map((ln, i) => new TextRun({ text: ln, break: i === 0 ? undefined : 1, ...opts }));
}

function dataUrlToBytes(dataUrl) {
  const m = /^data:(image\/[a-z+.-]+);base64,(.*)$/i.exec(dataUrl || "");
  if (!m) return null;
  const bin = atob(m[2]);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  const mime = m[1].toLowerCase();
  const type = mime.includes("png") ? "png" : (mime.includes("jpeg") || mime.includes("jpg")) ? "jpg" : mime.includes("gif") ? "gif" : null;
  return type ? { data, type } : null;
}

function imageSize({ data, type }) {
  try {
    if (type === "png") return { w: (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19], h: (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23] };
    if (type === "gif") return { w: data[6] | (data[7] << 8), h: data[8] | (data[9] << 8) };
    // jpeg: walk the markers to the first SOFn frame header
    let i = 2;
    while (i < data.length) {
      if (data[i] !== 0xff) { i++; continue; }
      const marker = data[i + 1];
      const len = (data[i + 2] << 8) | data[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: (data[i + 5] << 8) | data[i + 6], w: (data[i + 7] << 8) | data[i + 8] };
      }
      i += 2 + len;
    }
  } catch { /* fall through */ }
  return { w: 1, h: 1 };
}

/** Image run scaled to fit inside maxW x maxH pixels, aspect ratio kept. */
function imageRun(dataUrl, maxW, maxH) {
  const img = dataUrlToBytes(dataUrl);
  if (!img) return null;
  const { w, h } = imageSize(img);
  const s = Math.min(maxW / (w || 1), maxH / (h || 1), 1e6);
  const width = Math.max(1, Math.round((w || maxW) * s));
  const height = Math.max(1, Math.round((h || maxH) * s));
  return new ImageRun({ type: img.type, data: img.data, transformation: { width, height }, altText: { title: "Image", description: "Image", name: "Image" } });
}

function sumMarks(qs) {
  return (qs || []).reduce((s, q) => s + (Number(q.marks) || 0), 0);
}

function cell(width, children, extra = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: extra.borders || { top: NONE, bottom: NONE, left: NONE, right: NONE },
    verticalAlign: extra.verticalAlign || VerticalAlign.TOP,
    margins: extra.margins || { top: 40, bottom: 40, left: 100, right: 100 },
    shading: extra.shading,
    children,
  });
}

function table(widths, rows, extra = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: extra.borders || NO_BORDERS,
    indent: extra.indent,
    rows,
  });
}

/* ── letterhead & header ─────────────────────────────────────── */

function letterhead(meta, titleText, W) {
  const { schoolName = "", schoolLogo = null, examVersion = "", schoolMotto = "", schoolAddress = "", headerStyle = "classic" } = meta;
  const centered = headerStyle === "centered";
  const logo = schoolLogo ? imageRun(schoolLogo, centered ? 92 : 78, centered ? 92 : 78) : null;
  const identity = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: (schoolName || "________________________________").toUpperCase(), bold: true, size: 36, characterSpacing: 24, color: THEME.acc })],
    }),
    ...(schoolMotto ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 30 }, children: [new TextRun({ text: `\u201C${schoolMotto}\u201D`, italics: true, size: 23 })] })] : []),
    ...(schoolAddress ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [new TextRun({ text: schoolAddress, size: 19, color: "333333" })] })] : []),
  ];

  const out = [];
  if (logo && centered) {
    out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 240, lineRule: LineRuleType.AUTO, after: 80 }, children: [logo] }));
    out.push(...identity);
  } else if (logo) {
    const side = 1500;
    out.push(table([side, W - 2 * side, side], [new TableRow({
      children: [
        cell(side, [new Paragraph({ spacing: { line: 240, lineRule: LineRuleType.AUTO }, children: [logo] })], { verticalAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: 0, right: 0 } }),
        cell(W - 2 * side, identity, { verticalAlign: VerticalAlign.CENTER }),
        cell(side, [new Paragraph("")]),
      ],
    })]));
  } else {
    out.push(...identity);
  }
  // Heavy-over-light double rule under the letterhead (two explicit rules render identically in every Word version).
  out.push(new Paragraph({ spacing: { before: 120, after: 0, line: 20, lineRule: LineRuleType.EXACT }, border: { bottom: line(24) }, children: [] }));
  out.push(new Paragraph({ spacing: { before: 0, after: 160, line: 60, lineRule: LineRuleType.EXACT }, border: { bottom: line(6) }, children: [] }));
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    children: [
      new TextRun({ text: titleText.toUpperCase(), bold: true, size: 28, characterSpacing: 40, color: THEME.acc }),
      ...(examVersion ? [new TextRun({ text: `     VERSION ${examVersion}`, bold: true, size: 20, color: GREY })] : []),
    ],
  }));
  return out;
}

function metaGrid(items, W) {
  const cw = Math.floor(W / items.length);
  const widths = items.map((_, i) => (i === items.length - 1 ? W - cw * (items.length - 1) : cw));
  return table(widths, [new TableRow({
    cantSplit: true,
    children: items.map(([label, value], i) => cell(widths[i], [
      new Paragraph({ children: [new TextRun({ text: label.toUpperCase(), bold: true, size: 15, color: GREY, characterSpacing: 20 })] }),
      new Paragraph({ spacing: { before: 20 }, children: [new TextRun({ text: String(value || " "), bold: true, size: 22 })] }),
    ], {
      margins: { top: 70, bottom: 80, left: 140, right: 100 },
      borders: { top: line(12), bottom: line(12), left: i === 0 ? line(12) : NONE, right: line(i === items.length - 1 ? 12 : 6) },
    })),
  })], { borders: NO_BORDERS });
}

function candidateBlock(style, totalMarks, W) {
  const scoreW = 1500;
  const rest = W - scoreW;
  const field = (label, w) => cell(w, [new Paragraph({
    tabStops: [{ type: TabStopType.LEFT, position: w - 260, leader: LeaderType.UNDERSCORE }],
    children: [new TextRun({ text: `${label} `, bold: true, size: 22 }), new TextRun({ text: "\t", size: 22 })],
  })], { verticalAlign: VerticalAlign.BOTTOM, margins: { top: 40, bottom: 40, left: 0, right: 160 } });
  const score = (w) => cell(w, [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "SCORE", bold: true, size: 15, color: GREY, characterSpacing: 20 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `/ ${totalMarks || ""}`, bold: true, size: 22 })] }),
  ], { borders: box(), margins: { top: 50, bottom: 60, left: 80, right: 80 } });

  let widths, cells;
  if (style === "lines") {
    widths = [Math.round(rest * 0.46), Math.round(rest * 0.28), 0, scoreW];
    widths[2] = rest - widths[0] - widths[1];
    cells = [field("Name:", widths[0]), field("Index No.:", widths[1]), field("Date:", widths[2]), score(widths[3])];
  } else {
    widths = [Math.round(rest * 0.68), 0, scoreW];
    widths[1] = rest - widths[0];
    cells = [field("Name:", widths[0]), field("Date:", widths[1]), score(widths[2])];
  }
  const out = [table(widths, [new TableRow({ cantSplit: true, children: cells })])];

  if (style === "boxes") {
    const labelW = 1700, boxW = 440, n = 10;
    const tw = [labelW, ...Array(n).fill(boxW), W - labelW - boxW * n];
    out.push(new Paragraph({ spacing: { before: 120 }, children: [] }));
    out.push(table(tw, [new TableRow({
      cantSplit: true,
      children: [
        cell(labelW, [new Paragraph({ children: [new TextRun({ text: "Index Number:", bold: true, size: 22 })] })], { verticalAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: 0, right: 100 } }),
        ...Array.from({ length: n }, () => cell(boxW, [new Paragraph({ spacing: { line: 440, lineRule: LineRuleType.EXACT }, children: [] })], { borders: box(), margins: { top: 0, bottom: 0, left: 0, right: 0 } })),
        cell(tw[tw.length - 1], [new Paragraph("")]),
      ],
    })], { borders: NO_BORDERS }));
  }
  return out;
}

function instructionsBox(instructions, W) {
  const kids = [
    new Paragraph({
      spacing: { after: 60 },
      border: { bottom: line(4, "999999") },
      children: [new TextRun({ text: "INSTRUCTIONS TO CANDIDATES", bold: true, size: 19, characterSpacing: 30, color: THEME.acc })],
    }),
    ...instructions.map((ins, i) => new Paragraph({
      spacing: { before: 20, after: 20 },
      indent: { left: 360, hanging: 360 },
      tabStops: [{ type: TabStopType.LEFT, position: 360 }],
      children: [new TextRun({ text: `${i + 1}.\t${ins}`, size: 21 })],
    })),
  ];
  return table([W], [new TableRow({ children: [cell(W, kids, { borders: box(), margins: { top: 90, bottom: 90, left: 200, right: 200 } })] })]);
}

function headerBlock(examData, meta, totalMarks, W) {
  const { className = "", subject = "", term = "", examType = "Exam", durationMinutes = 60 } = meta;
  const items = [["Subject", subject], ["Class", className], ["Term", term]];
  if (meta.academicYear) items.push(["Academic Year", meta.academicYear]);
  items.push(["Duration", `${durationMinutes} mins`]);
  if (totalMarks) items.push(["Total Marks", totalMarks]);
  const out = [
    ...letterhead(meta, examData.title || examType, W),
    metaGrid(items, W),
    new Paragraph({ spacing: { before: 200 }, children: [] }),
    ...candidateBlock(meta.candidateStyle || "lines", totalMarks, W),
  ];
  if ((examData.instructions || []).length) {
    out.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
    out.push(instructionsBox(examData.instructions, W));
  }
  return out;
}

/* ── questions ───────────────────────────────────────────────── */

function marksTab(W) {
  return { type: TabStopType.RIGHT, position: W };
}

function sectionBand(section, W) {
  const secMarks = sumMarks(section.questions);
  return new Paragraph({
    keepNext: true, keepLines: true,
    spacing: { before: 360, after: 200 },
    tabStops: [marksTab(W)],
    shading: { type: ShadingType.CLEAR, fill: THEME.tint, color: "auto" },
    border: { top: line(12), bottom: line(12) },
    children: [
      new TextRun({ text: String(section.label || "").toUpperCase(), bold: true, size: 24, characterSpacing: 20, color: THEME.acc }),
      ...(secMarks ? [new TextRun({ text: `\t${secMarks} marks`, bold: true, size: 20 })] : []),
      ...(section.instructions ? [new TextRun({ text: String(section.instructions), italics: true, size: 21, break: 1 })] : []),
    ],
  });
}

function optionParagraphs(options, layout, W) {
  const startIndent = NUM_INDENT;
  if (layout === "vertical") {
    return options.map((o, i) => new Paragraph({
      keepNext: i < options.length - 1, keepLines: true,
      spacing: { before: 30, after: 30 },
      indent: { left: startIndent + 500, hanging: 500 },
      tabStops: [{ type: TabStopType.LEFT, position: startIndent + 500 }],
      children: [new TextRun({ text: `${OPT_LETTERS[i]}.`, bold: true }), new TextRun({ text: "\t" }), ...textRuns(o)],
    }));
  }
  const cols = layout === "row" ? Math.min(options.length, 4) : 2;
  const tw = W - startIndent;
  const base = Math.floor(tw / cols);
  const widths = Array.from({ length: cols }, (_, i) => (i === cols - 1 ? tw - base * (cols - 1) : base));
  const rows = [];
  for (let i = 0; i < options.length; i += cols) {
    rows.push(new TableRow({
      cantSplit: true,
      children: widths.map((w, c) => {
        const idx = i + c;
        const kids = idx < options.length
          ? [new Paragraph({
              indent: { left: 400, hanging: 400 },
              tabStops: [{ type: TabStopType.LEFT, position: 400 }],
              children: [new TextRun({ text: `${OPT_LETTERS[idx]}.`, bold: true }), new TextRun({ text: "\t" }), ...textRuns(options[idx])],
            })]
          : [new Paragraph("")];
        return cell(w, kids, { margins: { top: 30, bottom: 30, left: 0, right: 140 } });
      }),
    }));
  }
  return [table(widths, rows, { indent: { size: startIndent, type: WidthType.DXA } })];
}

function diagramParagraphs(q, meta, sectionId) {
  if (!q.diagram?.needed) return [];
  const raw = (meta.diagramImages || {})[q.number] || (meta.svgPngs || {})[`${sectionId}:${q.number}`];
  const run = raw ? imageRun(raw, 400, 250) : null;
  if (run) {
    return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 }, keepNext: false, children: [run] })];
  }
  return [new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 100 },
    indent: { left: NUM_INDENT, right: 100 },
    shading: { type: ShadingType.CLEAR, fill: "F5F5F6", color: "auto" },
    border: { top: line(6, "888888"), bottom: line(6, "888888"), left: line(6, "888888"), right: line(6, "888888") },
    children: [new TextRun({ text: `[ DIAGRAM: ${q.diagram.description || "see description"} ]`, italics: true, color: GREY, size: 21 })],
  })];
}

function answerLines(marks, indentLeft, W, meta, secType) {
  if (!meta.answerLines || secType === "objective") return [];
  const n = Math.max(1, Math.min(12, Math.round(Number(marks) || 1)));
  return Array.from({ length: n }, (_, i) => new Paragraph({
    keepNext: i < n - 1, keepLines: true,
    spacing: { before: 200, after: 0 },
    indent: { left: indentLeft },
    tabStops: [{ type: TabStopType.RIGHT, position: W, leader: LeaderType.DOT }],
    children: [new TextRun({ text: "\t", color: "777777" })],
  }));
}

function partParagraphs(parts, W, meta, secType) {
  const out = [];
  (parts || []).forEach(p => {
    out.push(new Paragraph({
      keepLines: true, spacing: { before: 80 },
      tabStops: [marksTab(W)],
      indent: { left: NUM_INDENT + 567, hanging: 567 },
      children: [new TextRun({ text: `(${p.label})`, bold: true }), new TextRun({ text: "\t" }), ...textRuns(p.text), new TextRun({ text: `\t[${p.marks}]`, bold: true })],
    }));
    (p.subparts || []).forEach(sp => {
      out.push(new Paragraph({
        keepLines: true, spacing: { before: 40 },
        tabStops: [marksTab(W)],
        indent: { left: NUM_INDENT + 567 * 2, hanging: 567 },
        children: [new TextRun({ text: `(${sp.label})`, bold: true }), new TextRun({ text: "\t" }), ...textRuns(sp.text), new TextRun({ text: `\t[${sp.marks}]`, bold: true })],
      }));
      out.push(...answerLines(sp.marks, NUM_INDENT, W, meta, secType));
    });
    if (!(p.subparts || []).length) out.push(...answerLines(p.marks, NUM_INDENT, W, meta, secType));
  });
  return out;
}

function questionParagraphs(q, section, meta, layout, W) {
  const hasParts = Array.isArray(q.parts) && q.parts.length > 0;
  const hasOptions = Array.isArray(q.options) && q.options.length > 0;
  const out = [new Paragraph({
    keepNext: hasOptions || hasParts || !!q.diagram?.needed || (!!meta.answerLines && section.type !== "objective"), keepLines: true,
    spacing: { before: 220, after: 40 },
    tabStops: [marksTab(W)],
    indent: { left: NUM_INDENT, hanging: NUM_INDENT },
    children: [
      new TextRun({ text: `${q.number}.`, bold: true }),
      new TextRun({ text: "\t" }),
      ...textRuns(q.text),
      ...(hasParts ? [] : [new TextRun({ text: `\t[${q.marks}]`, bold: true })]),
    ],
  })];
  out.push(...diagramParagraphs(q, meta, section.id));
  if (hasOptions) out.push(...optionParagraphs(q.options, layout, W));
  if (hasParts) out.push(...partParagraphs(q.parts, W, meta, section.type));
  else if (!hasOptions) out.push(...answerLines(q.marks, NUM_INDENT, W, meta, section.type));
  return out;
}

function sectionParagraphs(section, meta, layout, W) {
  return [
    sectionBand(section, W),
    ...(section.questions || []).flatMap(q => questionParagraphs(q, section, meta, layout, W)),
  ];
}

/* ── marking scheme ──────────────────────────────────────────── */

function answerKeyParagraphs(examData, meta, totalMarks, W) {
  const { className = "", subject = "", term = "" } = meta;
  const items = [["Subject", subject], ["Class", className], ["Term", term]];
  if (meta.academicYear) items.push(["Academic Year", meta.academicYear]);
  if (totalMarks) items.push(["Total Marks", totalMarks]);
  const out = [
    ...letterhead(meta, "Marking Scheme", W).slice(0, -1),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 160 },
      children: [
        new TextRun({ text: "MARKING SCHEME", bold: true, size: 28, characterSpacing: 40, color: THEME.acc }),
        ...(meta.examVersion ? [new TextRun({ text: `     VERSION ${meta.examVersion}`, bold: true, size: 20, color: GREY })] : []),
      ],
    }),
    metaGrid(items, W),
  ];
  const band = (text) => new Paragraph({
    keepNext: true, spacing: { before: 360, after: 160 },
    shading: { type: ShadingType.CLEAR, fill: THEME.tint, color: "auto" },
    border: { top: line(12), bottom: line(12) },
    children: [new TextRun({ text, bold: true, size: 24, characterSpacing: 20, color: THEME.acc })],
  });

  const key = examData.answerKey || [];
  const hasAnyGuide = (examData.sections || []).some(s => (s.questions || []).some(q => q.markingGuide?.trim()));
  if (!key.length && !hasAnyGuide) {
    out.push(band("MARKING SCHEME"));
    out.push(new Paragraph("This paper was generated in Questions Only mode, so no answer key or marking scheme was requested."));
    return out;
  }
  if (key.length) {
    out.push(band("SECTION A: ANSWER KEY"));
    const perRow = 10;
    const cw = Math.floor(W / perRow);
    const widths = Array.from({ length: perRow }, (_, i) => (i === perRow - 1 ? W - cw * (perRow - 1) : cw));
    const rows = [];
    for (let i = 0; i < key.length; i += perRow) {
      rows.push(new TableRow({
        cantSplit: true,
        children: widths.map((w, c) => {
          const k = key[i + c];
          return cell(w, [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: k ? [new TextRun({ text: `${k.number}. `, bold: true }), new TextRun(String(k.answer))] : [],
          })], { borders: k ? box() : { top: NONE, bottom: NONE, left: NONE, right: NONE }, margins: { top: 60, bottom: 60, left: 40, right: 40 } });
        }),
      }));
    }
    out.push(table(widths, rows, { borders: NO_BORDERS }));
  }
  out.push(band("MARKING SCHEME: SECTIONS B & C"));
  (examData.sections || []).filter(s => s.type !== "objective").forEach(s => {
    out.push(new Paragraph({ keepNext: true, spacing: { before: 240, after: 60 }, children: [new TextRun({ text: s.label, bold: true, underline: {} })] }));
    (s.questions || []).forEach(q => {
      out.push(new Paragraph({
        keepNext: true, spacing: { before: 180, after: 40 },
        tabStops: [marksTab(W)],
        border: { bottom: line(4, "BBBBBB") },
        children: [new TextRun({ text: `Question ${q.number}`, bold: true }), new TextRun({ text: `\t[${q.marks}]`, bold: true })],
      }));
      const rows = parseMarkingRows(q.markingGuide);
      if (rows) {
        const mw = 1100;
        const w = [W - mw, mw];
        const hdr = (t, al) => cell(t === "Marks" ? w[1] : w[0], [new Paragraph({ alignment: al, children: [new TextRun({ text: t.toUpperCase(), bold: true, size: 17, characterSpacing: 20 })] })],
          { borders: box(), shading: { type: ShadingType.CLEAR, fill: THEME.tint, color: "auto" }, margins: { top: 50, bottom: 50, left: 110, right: 110 } });
        const grid = { top: line(4, "999999"), bottom: line(4, "999999"), left: line(4, "999999"), right: line(4, "999999") };
        const body = rows.map(r => new TableRow({ cantSplit: true, children: [
          cell(w[0], [new Paragraph({ children: [new TextRun({ text: r.text, size: 22 })] })], { borders: grid, margins: { top: 50, bottom: 50, left: 110, right: 110 } }),
          cell(w[1], [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r.marks ?? "", size: 22 })] })], { borders: grid, margins: { top: 50, bottom: 50, left: 60, right: 60 } }),
        ] }));
        const tot = new TableRow({ cantSplit: true, children: [
          cell(w[0], [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Total", bold: true, size: 22 })] })], { borders: box(), shading: { type: ShadingType.CLEAR, fill: THEME.tint, color: "auto" }, margins: { top: 50, bottom: 50, left: 110, right: 110 } }),
          cell(w[1], [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(q.marks ?? ""), bold: true, size: 22 })] })], { borders: box(), shading: { type: ShadingType.CLEAR, fill: THEME.tint, color: "auto" }, margins: { top: 50, bottom: 50, left: 60, right: 60 } }),
        ] });
        out.push(table(w, [new TableRow({ tableHeader: true, cantSplit: true, children: [hdr("Marking point", AlignmentType.LEFT), hdr("Marks", AlignmentType.CENTER)] }), ...body, tot], { borders: NO_BORDERS }));
        out.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
      } else {
        String(q.markingGuide || "").split(/\r?\n/).filter(l => l.trim()).forEach(l => {
          out.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun(l)] }));
        });
      }
    });
  });
  return out;
}

/* ── entry point ─────────────────────────────────────────────── */

/**
 * @param {Object} examData
 * @param {Object} meta - same shape as renderExamHTML's meta, plus optional
 *   `svgPngs` ({ "<sectionId>:<questionNumber>": pngDataUrl }) so AI-drawn
 *   SVG diagrams (which Word can't embed directly) appear in the document.
 * @param {"paper"|"answerKey"} mode
 * @returns {Promise<Blob>} a real .docx file, ready to download
 */
export async function generateExamDocx(examData, meta = {}, mode = "paper") {
  const layout = ["vertical", "two", "row"].includes(meta.optionsLayout) ? meta.optionsLayout : "vertical";
  const acc = ACCENTS[meta.accent] || ACCENTS.black;
  THEME.acc = acc.ink; THEME.tint = acc.tint;
  THEME.font = (FONT_STYLES[meta.fontStyle] || FONT_STYLES.serif).docx;
  const landscape = !!meta.landscape;
  const W = (landscape ? PAGE_H : PAGE_W) - 2 * MARGIN; // usable text width in twips
  const sections = examData.sections || [];
  const computed = sections.reduce((s, sec) => s + sumMarks(sec.questions), 0);
  const totalMarks = computed || Number(examData.totalMarks) || 0;

  const children = mode === "answerKey"
    ? answerKeyParagraphs(examData, meta, totalMarks, W)
    : [
        ...headerBlock(examData, meta, totalMarks, W),
        ...sections.flatMap(s => sectionParagraphs(s, meta, layout, W)),
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { before: 400 },
          children: [new TextRun({ text: "END OF PAPER", bold: true, characterSpacing: 60 })],
        }),
      ];

  const footerLeft = [meta.schoolName, meta.subject].filter(Boolean).join("  |  ");
  const footer = new Footer({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: W }],
      border: { top: line(4, "999999"), },
      spacing: { before: 80 },
      children: [
        new TextRun({ text: footerLeft, size: 17, color: GREY }),
        new TextRun({ children: ["\tPage ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 17, color: GREY }),
      ],
    })],
  });

  const doc = new Document({
    creator: meta.schoolName || "Eduformium",
    title: examData.title || meta.examType || "Exam",
    styles: {
      default: {
        document: {
          run: { font: THEME.font, size: 23, color: INK },
          paragraph: { spacing: { line: 288, lineRule: LineRuleType.AUTO, after: 0 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H, orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: { top: MARGIN, bottom: MARGIN + 100, left: MARGIN, right: MARGIN, footer: 567 },
        },
      },
      footers: { default: footer },
      children,
    }],
  });

  return Packer.toBlob(doc);
}
