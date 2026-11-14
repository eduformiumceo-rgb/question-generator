/**
 * schemeReader.js
 * Reads an uploaded Scheme of Learning (Word .docx, PDF or plain text) in the
 * teacher's own browser and returns its text - nothing is uploaded anywhere.
 *
 * TABLES MATTER. Most schemes are a table (Week | Strand | Sub-strand |
 * Content standard | Indicators ...). Both readers keep that shape: each table
 * row becomes one line with its cells joined by " | ", so the AI (and the
 * matcher in schemeMatch.js) see which words belong together.
 *
 * The two parsers are big (mammoth ~0.5 MB, pdf.js ~1 MB), so they are loaded
 * on demand with dynamic import() - a teacher who never uploads a file never
 * downloads them, which keeps first load fast on low-end Android.
 *
 * File type is decided from the file's first bytes, not its name or MIME type -
 * phones routinely report blank or wrong types for files from WhatsApp/Drive.
 */

export const SCHEME_ACCEPT =
  ".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";
export const MAX_SCHEME_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_PDF_PAGES = 80;   // a term's scheme is a handful of pages; this just stops a huge book hanging a phone
const MIN_USEFUL_CHARS = 20;

/** An error whose message is already written for the teacher to read. */
export class SchemeReadError extends Error {
  constructor(message) { super(message); this.name = "SchemeReadError"; }
}

/** Blob.arrayBuffer() is missing on older Android WebViews (< Chrome 76) - fall back to FileReader. */
function toArrayBuffer(file) {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}

const startsWith = (bytes, sig) => sig.every((b, i) => bytes[i] === b);

function sniff(bytes) {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf";                           // %PDF
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return "doc";                           // legacy Word .doc
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) return "zip"; // .docx / .xlsx / .pptx
  return "other";
}

/**
 * @param {File} file
 * @returns {Promise<{ text: string, kind: "docx"|"pdf"|"txt", pages?: number, pagesSkipped?: boolean }>}
 * @throws {SchemeReadError} with a teacher-friendly message
 */
export async function readSchemeFile(file) {
  if (!file) throw new SchemeReadError("No file was selected.");
  if (file.size === 0) throw new SchemeReadError("That file is empty. Please choose your scheme again.");
  if (file.size > MAX_SCHEME_FILE_BYTES) {
    throw new SchemeReadError(`That file is too large (${(file.size / 1048576).toFixed(1)} MB). Please use a file under ${MAX_SCHEME_FILE_BYTES / 1048576} MB.`);
  }

  let buf;
  try { buf = await toArrayBuffer(file); }
  catch { throw new SchemeReadError("Couldn't open that file. Please try selecting it again."); }

  const type = sniff(new Uint8Array(buf, 0, Math.min(8, buf.byteLength)));
  const name = String(file.name || "").toLowerCase();

  if (type === "doc") {
    throw new SchemeReadError("This is an older Word (.doc) file. Open it in Word and choose Save As > Word Document (.docx), then upload that. A PDF also works.");
  }
  if (type === "pdf") return readPdf(buf);
  if (type === "zip") {
    if (name.endsWith(".docx") || name === "" || /wordprocessingml/.test(file.type || "")) return readDocx(buf);
    throw new SchemeReadError("That file type isn't supported. Please upload a Word (.docx) or PDF file.");
  }
  if (name.endsWith(".txt") || name.endsWith(".md") || /^text\//.test(file.type || "")) {
    const text = new TextDecoder("utf-8").decode(buf).trim();
    if (text.length < MIN_USEFUL_CHARS) throw new SchemeReadError("That text file has almost nothing in it. Please check you chose the right file.");
    return { text, kind: "txt" };
  }
  throw new SchemeReadError("That file type isn't supported. Please upload a Word (.docx) or PDF file.");
}

// ── Word ────────────────────────────────────────────────────────────────

async function readDocx(arrayBuffer) {
  let mammoth;
  try {
    const mod = await import("mammoth/mammoth.browser.js");
    mammoth = mod.default || mod;
  } catch {
    throw new SchemeReadError("Couldn't load the Word reader. Check your internet connection and try again, or upload a PDF instead.");
  }

  let html;
  try {
    ({ value: html } = await mammoth.convertToHtml({ arrayBuffer }));
  } catch {
    throw new SchemeReadError("Couldn't read that Word file - it may be damaged or password-protected. Try re-saving it as .docx or PDF.");
  }

  const text = docxHtmlToText(html);
  if (text.length < MIN_USEFUL_CHARS) {
    throw new SchemeReadError("No text was found in that Word file. If your scheme is a picture or scan, please paste the text instead.");
  }
  return { text, kind: "docx" };
}

/** Mammoth's HTML -> plain lines. Table rows become "cell | cell | cell". Exported for tests. */
export function docxHtmlToText(html) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const lines = [];

  const textOf = (el) => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("br").forEach(br => br.replaceWith(" "));
    return clone.textContent.replace(/\s+/g, " ").trim();
  };

  const walk = (parent) => {
    for (const el of parent.children) {
      const tag = el.tagName.toLowerCase();
      if (tag === "table") {
        for (const tr of el.querySelectorAll("tr")) {
          const cells = [...tr.children].filter(c => /^t[dh]$/i.test(c.tagName)).map(textOf).filter(Boolean);
          if (cells.length) lines.push(cells.join(" | "));
        }
      } else if (tag === "ul" || tag === "ol") {
        for (const li of el.children) { const t = textOf(li); if (t) lines.push("- " + t); }
      } else if (/^(p|h[1-6]|blockquote|pre)$/.test(tag)) {
        const t = textOf(el); if (t) lines.push(t);
      } else {
        walk(el);
      }
    }
  };
  walk(doc.body);
  return lines.join("\n");
}

// ── PDF ─────────────────────────────────────────────────────────────────

async function loadPdfJs() {
  // The "legacy" build runs on older Android WebViews too.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof Worker !== "undefined") {
    const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return pdfjs;
}

async function readPdf(arrayBuffer) {
  let pdfjs;
  try { pdfjs = await loadPdfJs(); }
  catch { throw new SchemeReadError("Couldn't load the PDF reader. Check your internet connection and try again, or upload a Word file instead."); }

  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), isEvalSupported: false, useSystemFonts: true }).promise;
  } catch (e) {
    if (e?.name === "PasswordException") throw new SchemeReadError("This PDF is password-protected. Remove the password and upload it again.");
    throw new SchemeReadError("Couldn't read that PDF - it may be damaged. Try saving it again or upload a Word file.");
  }

  try {
    const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const pageTexts = [];
    for (let p = 1; p <= pageCount; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      pageTexts.push(pdfItemsToLines(content.items).join("\n"));
    }
    const text = pageTexts.join("\n");
    if (text.replace(/\s/g, "").length < MIN_USEFUL_CHARS) {
      throw new SchemeReadError("This PDF has no selectable text - it looks like a scan or photo. Upload the Word version instead, or paste the text.");
    }
    return { text, kind: "pdf", pages: pdf.numPages, pagesSkipped: pdf.numPages > MAX_PDF_PAGES };
  } finally {
    pdf.destroy?.();
  }
}

/**
 * pdf.js gives loose text fragments with x/y positions. Rebuild reading-order
 * lines: fragments on the same baseline form a row; a wide horizontal gap
 * inside a row is a table-column boundary and becomes " | ". Exported for tests.
 */
export function pdfItemsToLines(items) {
  const rows = [];
  for (const it of items) {
    if (typeof it.str !== "string" || !it.str.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const h = it.height || Math.abs(it.transform[3]) || 10;
    const tol = Math.max(2, h * 0.4);
    let row = null;
    for (let i = rows.length - 1; i >= 0 && i >= rows.length - 12; i--) {
      if (Math.abs(rows[i].y - y) <= tol) { row = rows[i]; break; }
    }
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, w: it.width || 0, s: it.str });
  }

  rows.sort((a, b) => b.y - a.y); // PDF y grows upward: top of page first
  return rows.map(row => {
    row.parts.sort((a, b) => a.x - b.x);
    let line = "";
    row.parts.forEach((part, i) => {
      if (i === 0) { line = part.s.trim(); return; }
      const prev = row.parts[i - 1];
      const gap = part.x - (prev.x + prev.w);
      const charW = prev.w / Math.max(1, prev.s.length) || 4;
      if (gap > Math.max(charW * 3, 10)) line += " | ";
      else if (gap > charW * 0.25 || /\s$/.test(prev.s) || /^\s/.test(part.s)) line += " ";
      line += part.s.trim();
    });
    return line.replace(/\s+/g, " ").trim();
  }).filter(Boolean);
}
