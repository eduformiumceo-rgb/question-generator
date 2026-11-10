import { describe, it, expect } from "vitest";
import {
  IMAGE_SIZES, isSafeImageDataUrl, imageSizeKey, examImageChars, clipboardImageFile,
  MAX_EXAM_IMAGE_CHARS, TARGET_IMAGE_CHARS,
} from "../src/imageUtils.js";

describe("imageUtils", () => {
  it("accepts only raster data URLs", () => {
    expect(isSafeImageDataUrl("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
    expect(isSafeImageDataUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    for (const bad of ["", null, undefined, "https://x/y.png", "javascript:1", "data:image/svg+xml;base64,AAAA", 'data:image/png;base64,AA"onload="x', "data:text/html;base64,AAAA"]) {
      expect(isSafeImageDataUrl(bad)).toBe(false);
    }
  });

  it("falls back to medium for an unknown size", () => {
    expect(imageSizeKey({ size: "large" })).toBe("large");
    expect(imageSizeKey({ size: "huge" })).toBe("medium");
    expect(imageSizeKey(undefined)).toBe("medium");
  });

  it("small < medium < large in both width and height", () => {
    const { small, medium, large } = IMAGE_SIZES;
    expect(small.maxW).toBeLessThan(medium.maxW); expect(medium.maxW).toBeLessThan(large.maxW);
    expect(small.maxH).toBeLessThan(medium.maxH); expect(medium.maxH).toBeLessThan(large.maxH);
  });

  it("totals image data across every section", () => {
    const exam = { sections: [
      { questions: [{ image: { src: "aaaa" } }, {}] },
      { questions: [{ image: { src: "bb" } }] },
    ] };
    expect(examImageChars(exam)).toBe(6);
    expect(examImageChars(null)).toBe(0);
  });

  it("keeps the per-image target comfortably inside the per-exam budget", () => {
    expect(TARGET_IMAGE_CHARS * 4).toBeLessThanOrEqual(MAX_EXAM_IMAGE_CHARS);
  });

  it("finds an image on a paste event and ignores plain text", () => {
    const file = { type: "image/png" };
    expect(clipboardImageFile({ clipboardData: { items: [{ kind: "string", type: "text/plain" }, { kind: "file", type: "image/png", getAsFile: () => file }] } })).toBe(file);
    expect(clipboardImageFile({ clipboardData: { items: [{ kind: "string", type: "text/plain" }] } })).toBeNull();
    expect(clipboardImageFile({})).toBeNull();
  });
});

import { looksLikeLineArt, stretchLevels, cropFractions, rotatedSize } from "../src/imageUtils.js";

const rgba = (px) => Uint8ClampedArray.from(px.flatMap(([r, g, b]) => [r, g, b, 255]));
const fill = (n, c) => Array.from({ length: n }, () => c);

describe("looksLikeLineArt", () => {
  it("recognises black-on-white drawings and scanned text", () => {
    expect(looksLikeLineArt(rgba([...fill(90, [255, 255, 255]), ...fill(10, [0, 0, 0])]), 1)).toBe(true);
  });
  it("rejects colourful or mid-tone photos", () => {
    expect(looksLikeLineArt(rgba(fill(100, [200, 90, 40])), 1)).toBe(false);
    expect(looksLikeLineArt(rgba(fill(100, [128, 128, 128])), 1)).toBe(false);
  });
  it("handles empty data", () => { expect(looksLikeLineArt(new Uint8ClampedArray(0))).toBe(false); });
});

describe("stretchLevels (clean up scan)", () => {
  it("turns a grey page with dark ink into white paper and black ink", () => {
    const data = rgba([...fill(80, [170, 170, 165]), ...fill(20, [60, 60, 58])]);
    stretchLevels(data);
    const first = data[0], last = data[data.length - 4];
    expect(first).toBeGreaterThanOrEqual(250); // paper -> white
    expect(last).toBeLessThanOrEqual(5);       // ink -> black
    expect(data[0]).toBe(data[1]); expect(data[1]).toBe(data[2]); // greyscale
  });
  it("leaves a flat, low-contrast image alone", () => {
    const data = rgba(fill(50, [120, 120, 120]));
    const copy = Uint8ClampedArray.from(data);
    stretchLevels(data);
    expect([...data]).toEqual([...copy]);
  });
});

describe("cropFractions", () => {
  it("converts a drag to fractions regardless of drag direction", () => {
    expect(cropFractions(50, 20, 150, 120, 200, 200)).toEqual({ x: 0.25, y: 0.1, w: 0.5, h: 0.5 });
    expect(cropFractions(150, 120, 50, 20, 200, 200)).toEqual({ x: 0.25, y: 0.1, w: 0.5, h: 0.5 });
  });
  it("clamps a drag that leaves the picture", () => {
    const c = cropFractions(-50, -50, 500, 500, 200, 100);
    expect(c).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
  it("treats a tap or a sliver as no crop", () => {
    expect(cropFractions(10, 10, 10, 10, 200, 200)).toBeNull();
    expect(cropFractions(10, 10, 12, 190, 200, 200)).toBeNull();
    expect(cropFractions(0, 0, 10, 10, 0, 0)).toBeNull();
  });
});

describe("rotatedSize", () => {
  it("swaps width and height for quarter turns only", () => {
    expect(rotatedSize(300, 100, 90)).toEqual({ w: 100, h: 300 });
    expect(rotatedSize(300, 100, -90)).toEqual({ w: 100, h: 300 });
    expect(rotatedSize(300, 100, 180)).toEqual({ w: 300, h: 100 });
    expect(rotatedSize(300, 100, 0)).toEqual({ w: 300, h: 100 });
  });
});
