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
