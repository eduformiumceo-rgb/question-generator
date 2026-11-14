// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readSchemeFile, SchemeReadError, pdfItemsToLines, docxHtmlToText, MAX_SCHEME_FILE_BYTES } from "../src/schemeReader.js";
import { makeDocx, makePdf, SCHEME_ROWS } from "./helpers/schemeFixtures.js";

const file = (data, name, type = "") => new File([data], name, { type });
const rejects = async (p, re) => { const e = await p.then(() => null, x => x); expect(e).toBeInstanceOf(SchemeReadError); expect(e.message).toMatch(re); };

describe("readSchemeFile - Word", () => {
  it("reads a real .docx and keeps table rows as 'cell | cell | cell'", async () => {
    const buf = await makeDocx(SCHEME_ROWS);
    const r = await readSchemeFile(file(buf, "term1 scheme.docx"));
    expect(r.kind).toBe("docx");
    expect(r.text).toContain("SCHEME OF LEARNING - TERM 1");
    expect(r.text).toContain("2 | Number | Number Operations | B7.1.2.1");
    expect(r.text.split("\n")).toContain("Week | Strand | Sub-strand | Content Standard");
  });

  it("recognises a .docx even when the phone gives it no name/type", async () => {
    const buf = await makeDocx(SCHEME_ROWS);
    const r = await readSchemeFile(file(buf, "", ""));
    expect(r.kind).toBe("docx");
  });
});

describe("readSchemeFile - PDF", () => {
  it("reads a real PDF and rebuilds table rows with column separators", async () => {
    const pdf = makePdf([
      ["Week", "Strand", "Sub-strand"],
      ["1", "Number", "Number and Numeration Systems"],
      ["2", "Algebra", "Algebraic Expressions"],
    ]);
    const r = await readSchemeFile(file(pdf, "scheme.pdf", "application/pdf"));
    expect(r.kind).toBe("pdf");
    expect(r.pages).toBe(1);
    const lines = r.text.split("\n");
    expect(lines[0]).toBe("Week | Strand | Sub-strand");          // top of page first
    expect(lines).toContain("1 | Number | Number and Numeration Systems");
    expect(lines).toContain("2 | Algebra | Algebraic Expressions");
  });

  it("explains a PDF with no text layer (scan)", async () => {
    await rejects(readSchemeFile(file(makePdf([]), "scan.pdf")), /no selectable text|scan/i);
  });

  it("pdfItemsToLines orders top-to-bottom and splits columns on wide gaps only", () => {
    const it = (str, x, y, w) => ({ str, transform: [10, 0, 0, 10, x, y], width: w, height: 10 });
    const lines = pdfItemsToLines([
      it("Second", 50, 600, 30), it("First", 50, 700, 25), it("row", 78, 700, 15), it("Col2", 200, 700, 20),
    ]);
    expect(lines).toEqual(["First row | Col2", "Second"]);
  });
});

describe("readSchemeFile - other inputs and problems", () => {
  it("reads plain text", async () => {
    const r = await readSchemeFile(file("Week 1: Number operations and fractions", "topics.txt", "text/plain"));
    expect(r).toMatchObject({ kind: "txt" });
  });
  it("explains legacy .doc files", async () => {
    const doc = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    await rejects(readSchemeFile(file(doc, "old.doc")), /\.doc.*docx/i);
  });
  it("rejects unsupported types, empty files and oversized files", async () => {
    await rejects(readSchemeFile(file(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]), "photo.jpg", "image/jpeg")), /isn't supported/);
    await rejects(readSchemeFile(file(new Uint8Array(0), "empty.pdf")), /empty/i);
    const big = { size: MAX_SCHEME_FILE_BYTES + 1, name: "big.pdf", type: "application/pdf", arrayBuffer: async () => new ArrayBuffer(1) };
    await rejects(readSchemeFile(big), /too large/i);
  });
  it("rejects a zip that isn't Word (e.g. .xlsx) rather than crashing", async () => {
    const buf = await makeDocx(SCHEME_ROWS);
    await rejects(readSchemeFile(file(buf, "sheet.xlsx")), /isn't supported/);
  });
  it("gives a friendly error for a corrupt .docx", async () => {
    const bad = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9, 9, 9, 9, 9, 9]);
    await rejects(readSchemeFile(file(bad, "broken.docx")), /damaged|password|couldn't read/i);
  });
  it("works when Blob.arrayBuffer() is unavailable (old Android WebView)", async () => {
    const buf = await makeDocx(SCHEME_ROWS);
    const f = file(buf, "scheme.docx");
    Object.defineProperty(f, "arrayBuffer", { value: undefined });
    expect((await readSchemeFile(f)).text).toContain("Number Operations");
  });
});

describe("docxHtmlToText", () => {
  it("handles lists, headings, <br> inside cells", () => {
    const t = docxHtmlToText("<h1>Title</h1><ul><li>one</li><li>two</li></ul><table><tr><td><p>a<br/>b</p></td><td>c</td></tr></table>");
    expect(t).toBe("Title\n- one\n- two\na b | c");
  });
});
