/**
 * examDocx.js
 * ─────────────────────────────────────────────────────────────────
 * Generates a real, valid .docx (Microsoft Word 2007+) file from the same
 * examData shape examTemplate.js's renderExamHTML() consumes. This is a
 * PARALLEL implementation, not a conversion of the HTML — Word's object
 * model (paragraphs, runs, tables) doesn't map cleanly from print CSS, so
 * building it natively against the `docx` library is more reliable than
 * trying to convert HTML→Word after the fact.
 *
 * Uses the `docx` npm package (MIT licensed, works via any bundler in the
 * browser, producing a Blob instead of a Node Buffer). Verified against the
 * real library before writing this — including the tab-stop mark-alignment
 * and borderless-table MCQ-option-grid APIs used below — not assumed.
 *
 * Runs entirely client-side: no server round-trip, no extra AI call, no
 * extra credit cost. Same "your edits flow straight through to every
 * export" property as the print/PDF path, since both read from the same
 * (possibly teacher-edited) examData object.
 * ─────────────────────────────────────────────────────────────────
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, TabStopType,
} from "docx";

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};
const OPT_LETTERS = ["A", "B", "C", "D", "E", "F"];
const RIGHT_MARGIN_TWIPS = 9350; // ~6.5in usable width at 1440 twips/in with 1in margins

function marksRun(marks) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_MARGIN_TWIPS }],
    children: [new TextRun({ text: `\t[${marks}]`, bold: true })],
  });
}

function optionsTable(options) {
  // Two-column borderless table — same layout intent as the HTML's .opt-grid.
  const rows = [];
  for (let i = 0; i < options.length; i += 2) {
    rows.push(new TableRow({
      children: [0, 1].map(offset => {
        const idx = i + offset;
        const text = idx < options.length ? `${OPT_LETTERS[idx]}. ${options[idx]}` : "";
        return new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, children: [new Paragraph({ children: [new TextRun(text)] })] });
      }),
    }));
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows });
}

function partParagraphs(parts) {
  const out = [];
  (parts || []).forEach(p => {
    out.push(new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_MARGIN_TWIPS }],
      indent: { left: 360 },
      children: [new TextRun({ text: `(${p.label}) `, bold: true }), new TextRun(p.text), new TextRun({ text: `\t[${p.marks}]`, bold: true })],
    }));
    (p.subparts || []).forEach(sp => {
      out.push(new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_MARGIN_TWIPS }],
        indent: { left: 720 },
        children: [new TextRun({ text: `${sp.label}. `, bold: true }), new TextRun(sp.text), new TextRun({ text: `\t[${sp.marks}]`, bold: true })],
      }));
    });
  });
  return out;
}

function questionParagraphs(q) {
  const out = [];
  const hasParts = Array.isArray(q.parts) && q.parts.length;
  out.push(new Paragraph({
    spacing: { before: 200 },
    tabStops: hasParts ? [] : [{ type: TabStopType.RIGHT, position: RIGHT_MARGIN_TWIPS }],
    children: [
      new TextRun({ text: `${q.number}. `, bold: true }),
      new TextRun(q.text),
      ...(hasParts ? [] : [new TextRun({ text: `\t[${q.marks}]`, bold: true })]),
    ],
  }));
  if (q.diagram?.needed && !(q.diagram.generatable && q.diagram.svg)) {
    out.push(new Paragraph({ children: [new TextRun({ text: `[ DIAGRAM: ${q.diagram.description || "see description"} ]`, italics: true })] }));
  }
  if (Array.isArray(q.options) && q.options.length) out.push(optionsTable(q.options));
  if (hasParts) out.push(...partParagraphs(q.parts));
  return out;
}

function sectionParagraphs(section) {
  const out = [
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 100 }, children: [new TextRun({ text: section.label, bold: true })] }),
  ];
  if (section.instructions) out.push(new Paragraph({ children: [new TextRun({ text: section.instructions, italics: true })] }));
  (section.questions || []).forEach(q => out.push(...questionParagraphs(q)));
  return out;
}

function headerParagraphs(examData, meta) {
  const { schoolName = "", className = "", subject = "", term = "", examType = "Exam", durationMinutes = 60, examVersion = "" } = meta;
  return [
    new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children: [new TextRun({ text: schoolName || "________________________________", bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: `${examData.title || examType.toUpperCase()}${examVersion ? ` — VERSION ${examVersion}` : ""}`, bold: true })] }),
    new Paragraph({ children: [new TextRun(`Subject: ${subject}    Class: ${className}    Term: ${term}    Duration: ${durationMinutes} mins`)] }),
    new Paragraph({ spacing: { before: 150 }, children: [new TextRun({ text: "Instructions:", bold: true })] }),
    ...(examData.instructions || []).map((ins, i) => new Paragraph({ text: `${i + 1}. ${ins}`, indent: { left: 360 } })),
    new Paragraph({ spacing: { before: 200, after: 200 }, children: [new TextRun("Name: _____________________________________    Index No: ______________    Class: ____________")] }),
  ];
}

function answerKeyParagraphs(examData) {
  const out = [];
  const key = examData.answerKey || [];
  const hasAnyGuide = (examData.sections || []).some(s => (s.questions || []).some(q => q.markingGuide?.trim()));
  if (!key.length && !hasAnyGuide) {
    out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("MARKING SCHEME")] }));
    out.push(new Paragraph("This paper was generated in Questions Only mode — no answer key or marking scheme was requested."));
    return out;
  }
  if (key.length) {
    out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("SECTION A — ANSWER KEY")] }));
    out.push(new Paragraph(key.map(k => `${k.number}. ${k.answer}`).join("    ")));
  }
  out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300 }, children: [new TextRun("MARKING SCHEME — SECTIONS B & C")] }));
  (examData.sections || []).filter(s => s.type !== "objective").forEach(s => {
    out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(s.label)] }));
    (s.questions || []).forEach(q => {
      out.push(new Paragraph({ spacing: { before: 150 }, children: [new TextRun({ text: `Question ${q.number} [${q.marks}]`, bold: true })] }));
      out.push(new Paragraph(q.markingGuide || ""));
    });
  });
  return out;
}

/**
 * @param {Object} examData
 * @param {Object} meta — same shape as renderExamHTML's meta
 * @param {"paper"|"answerKey"} mode
 * @returns {Promise<Blob>} a real .docx file, ready to download
 */
export async function generateExamDocx(examData, meta = {}, mode = "paper") {
  const children = mode === "answerKey"
    ? answerKeyParagraphs(examData)
    : [
        ...headerParagraphs(examData, meta),
        ...(examData.sections || []).flatMap(sectionParagraphs),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [new TextRun({ text: "— END OF PAPER —", bold: true })] }),
      ];

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
      children,
    }],
  });

  return Packer.toBlob(doc);
}
