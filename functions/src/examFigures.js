/**
 * examFigures.js - pure helpers shared by the print layout, the Word export
 * and the editor, so a figure behaves identically everywhere.
 */
import { isSafeImageDataUrl } from "./imageUtils.js";

export const IMAGE_ALIGNS = ["left", "center", "right"];
export const imageAlign = (image) => (IMAGE_ALIGNS.includes(image?.align) ? image.align : "center");

/** A picture can sit under the question text (default) or under one of its parts. */
export function imagePlacement(q) {
  const parts = Array.isArray(q?.parts) ? q.parts.length : 0;
  const a = q?.image?.afterPart;
  return Number.isInteger(a) && a >= 0 && a < parts ? a : -1;
}

/** The AI/teacher-built drawing for a question, unless the teacher switched it off. */
export function diagramDrawing(q) {
  const d = q?.diagram;
  return d?.needed && d.generatable && d.svg && d.useDrawing !== false ? d.svg : null;
}

/**
 * "Figure 1", "Figure 2"... numbered in the order figures appear on the paper.
 * Computed at render time, so a shuffled Version B is numbered correctly too.
 * @returns {Map<object, string>} keyed by the question object itself
 */
export function figureLabels(examData) {
  const labels = new Map();
  let n = 0;
  for (const s of examData?.sections || []) {
    for (const q of s.questions || []) {
      if (q.image && isSafeImageDataUrl(q.image.src) && q.image.autoNumber) labels.set(q, `Figure ${++n}`);
    }
  }
  return labels;
}

/** Caption line: "Figure 2: A cell", "Figure 2", "A cell" or "". */
export function captionText(image, label) {
  const c = String(image?.caption || "").trim();
  if (label && c) return `${label}: ${c}`;
  return label || c;
}
