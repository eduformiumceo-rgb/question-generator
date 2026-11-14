// Builds REAL .docx and .pdf files for the scheme-upload tests (no mocks of the parsers).
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun } from "docx";

const cell = (t) => new TableCell({ children: [new Paragraph({ children: [new TextRun(t)] })] });

/** A Scheme-of-Learning-style .docx: title paragraphs + a table (header row + one row per entry). */
export async function makeDocx(rows, { title = "SCHEME OF LEARNING - TERM 1" } = {}) {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun(title)] }),
        new Paragraph({ children: [new TextRun("Subject: Mathematics    Class: Basic 7")] }),
        new Table({ rows: rows.map(r => new TableRow({ children: r.map(cell) })) }),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

/** A minimal but valid text PDF. `rows` = array of rows, each an array of column strings. */
export function makePdf(rows, { columnX = [40, 110, 300] } = {}) {
  let y = 740;
  let content = "";
  for (const row of rows) {
    row.forEach((txt, i) => {
      content += `BT /F1 10 Tf ${columnX[i] ?? 40} ${y} Td (${txt.replace(/[()\\]/g, "\\$&")}) Tj ET\n`;
    });
    y -= 18;
  }
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(o => { pdf += `${String(o).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export const SCHEME_ROWS = [
  ["Week", "Strand", "Sub-strand", "Content Standard"],
  ["1", "Number", "Number and Numeration Systems", "B7.1.1.1"],
  ["2", "Number", "Number Operations", "B7.1.2.1"],
  ["3", "Algebra", "Algebraic Expressions", "B7.2.2.1"],
];
