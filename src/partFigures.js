/**
 * partFigures.js - pure helpers for ONE-FIGURE-AT-A-TIME handling.
 *
 * A BECE question such as 1 has parts (a) to (d), and each part carries its own
 * line "[FIGURE 1(a): what the figure shows]". Each of those is a separate
 * figure, so each one gets its own slot, its own picture or drawing, and its
 * own "Change image" button. A school-exam question with a diagram request
 * (q.diagram.needed) is a single question-level slot.
 *
 * Where a figure lives:
 *   part slot      -> part.image / part.diagram
 *   question slot  -> question.image / question.diagram
 * Both use the same shapes the print layout and Word export already know.
 *
 * No imports from examTemplate.js on purpose (it imports this file).
 */
import { isSafeImageDataUrl } from "./imageUtils.js";

export const FIGURE_LINE = /^\s*\[FIGURE[^\]]*\]\s*$/i;

/** Every "[FIGURE ...]" line of a piece of text, trimmed. */
export function figureLines(text) {
  return String(text ?? "").split("\n").filter(l => FIGURE_LINE.test(l)).map(l => l.trim());
}

/** "[FIGURE 1(a): a plant cell]" -> { ref: "1(a)", desc: "a plant cell" } */
export function figureInfo(line) {
  const t = String(line || "").trim();
  const m = /^\[FIGURE\s*([^:\]]*?)\s*:\s*([\s\S]*?)\]$/i.exec(t);
  return m ? { ref: m[1], desc: m[2].trim() } : { ref: "", desc: t.replace(/^\[FIGURE\s*/i, "").replace(/\]$/, "").trim() };
}

/** The text without its first "[FIGURE ...]" line (used when a real figure replaces the placeholder). */
export function removeFirstFigureLine(text) {
  const lines = String(text ?? "").split("\n");
  const i = lines.findIndex(l => FIGURE_LINE.test(l));
  if (i < 0) return String(text ?? "");
  lines.splice(i, 1);
  return lines.join("\n");
}

const subFigureLines = (p) => (p?.subparts || []).some(sp => figureLines(sp.text).length > 0);

/** True when any part of the question has its own "[FIGURE ...]" line. */
export function hasPartFigureLines(q) {
  return (Array.isArray(q?.parts) ? q.parts : []).some(p => figureLines(p.text).length > 0 || subFigureLines(p));
}

export const ownerImageOk = (o) => !!(o?.image && isSafeImageDataUrl(o.image.src));
/** The drawing (SVG text) set on a part or question, unless the teacher switched it off. */
export const ownerDrawing = (o) => (o?.diagram?.svg && o.diagram.useDrawing !== false ? o.diagram.svg : null);

/**
 * Every figure of the paper, in paper order.
 * @returns {Array<{kind:"part"|"question", key:string, sIdx:number, qIdx:number, pIdx?:number, label:string, sectionLabel:string, description:string, owner:object, question:object}>}
 */
export function extractFigureSlots(examData) {
  const out = [];
  (examData?.sections || []).forEach((s, sIdx) => (s.questions || []).forEach((q, qIdx) => {
    const parts = Array.isArray(q.parts) ? q.parts : [];
    let partSlots = 0;
    parts.forEach((p, pIdx) => {
      const lines = figureLines(p.text);
      const sub = (p.subparts || []).flatMap(sp => figureLines(sp.text));
      if (lines.length || sub.length || ownerImageOk(p) || p.diagram?.needed) {
        partSlots++;
        out.push({
          kind: "part", key: `${s.id}:${q.number}:${p.label}`, sIdx, qIdx, pIdx,
          label: `Q${q.number}(${p.label})`, sectionLabel: s.heading || s.label || "",
          description: lines.length ? figureInfo(lines[0]).desc : sub.length ? figureInfo(sub[0]).desc : (p.diagram?.description || ""),
          owner: p, question: q,
        });
      }
    });
    const qLines = figureLines(q.text);
    if (!partSlots && (q.diagram?.needed || qLines.length)) {
      out.push({
        kind: "question", key: `${s.id}:${q.number}`, sIdx, qIdx,
        label: `Q${q.number}`, sectionLabel: s.heading || s.label || "",
        description: q.diagram?.description || (qLines.length ? figureInfo(qLines[0]).desc : ""),
        owner: q, question: q,
      });
    }
  }));
  return out;
}

/** "picture" (teacher's own), "drawn" (AI or template drawing), "textbox" (drawing switched off) or "empty". */
export function slotState(slot) {
  const o = slot.owner;
  if (ownerImageOk(o)) return "picture";
  const d = o?.diagram;
  if (d?.svg && (slot.kind === "part" || d.generatable)) return d.useDrawing === false ? "textbox" : "drawn";
  return "empty";
}

/** Immutably change one slot's owner (the part, or the question) inside the exam. */
export function patchSlotOwner(setExamData, slot, fn) {
  setExamData(prev => ({
    ...prev,
    sections: prev.sections.map((s, si) => (si !== slot.sIdx ? s : {
      ...s,
      questions: s.questions.map((q, qi) => {
        if (qi !== slot.qIdx) return q;
        if (slot.kind === "question") return fn(q);
        return { ...q, parts: q.parts.map((p, pi) => (pi === slot.pIdx ? fn(p) : p)) };
      }),
    })),
  }));
}

export function setSlotImage(setExamData, slot, image) {
  patchSlotOwner(setExamData, slot, o => {
    if (image) return { ...o, image };
    const { image: _drop, ...rest } = o; // eslint-disable-line no-unused-vars
    return rest;
  });
}

export function setSlotDiagram(setExamData, slot, diagram) {
  patchSlotOwner(setExamData, slot, o => ({ ...o, diagram: diagram || null }));
}

/** The diagram object stored for a figure the AI drew. */
export function aiDiagram(description, svg) {
  return { needed: true, description: description || "Figure", generatable: true, template: null, params: null, svg, useDrawing: true, source: "ai" };
}
