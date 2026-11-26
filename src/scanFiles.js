/**
 * scanFiles.js - turns a scanned / photographed file into the pixel data omrReader.js reads.
 * Images (JPG, PNG, WebP, HEIC where the browser supports it) give one sheet; a PDF gives one sheet per page.
 * Large pictures are scaled down to about 2200 px on the long side, which is plenty (about 190 dpi on A4) and keeps reading fast.
 */
export const SCAN_ACCEPT = "image/*,.pdf,application/pdf";
export const MAX_SCAN_BYTES = 25 * 1024 * 1024;
export const MAX_SCAN_PX = 2200;

const canvasData = (draw, w, h) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); draw(ctx, w, h);
  return ctx.getImageData(0, 0, w, h);
};

async function imageFile(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SCAN_PX / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const data = canvasData((ctx) => ctx.drawImage(bmp, 0, 0, w, h), w, h);
  if (bmp.close) bmp.close();
  return [{ name: file.name, image: data }];
}

async function pdfFile(file) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof Worker !== "undefined") pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const out = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 300); p++) {
    const page = await pdf.getPage(p), base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: MAX_SCAN_PX / Math.max(base.width, base.height) });
    const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push({ name: `${file.name} - page ${p}`, image: ctx.getImageData(0, 0, c.width, c.height) });
  }
  return out;
}

/** @returns Promise<Array<{ name, image: ImageData }>> */
export async function loadScanFile(file) {
  if (!file) return [];
  if (file.size > MAX_SCAN_BYTES) throw new Error(`${file.name} is larger than 25 MB.`);
  if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) return pdfFile(file);
  if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i.test(file.name)) return imageFile(file);
  throw new Error(`${file.name}: only pictures and PDFs can be read.`);
}
