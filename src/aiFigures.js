/**
 * aiFigures.js - the AI draws the paper's figures for you, one by one, right after generation.
 *
 * For every figure slot (see partFigures.js) that has no picture and no drawing yet,
 * the server is asked for a small line drawing (mode "draw-figure"). The reply is
 * UNTRUSTED text: it is only kept if it passes the same SVG allowlist that guards
 * printing (isSafeGeneratedSVG). A failure never blocks the paper: the figure just
 * keeps its dashed placeholder box and the teacher can retry or add a picture.
 */
import { isSafeGeneratedSVG } from "./examTemplate.js";
import { extractFigureSlots, slotState, setSlotDiagram, aiDiagram } from "./partFigures.js";

export const MAX_AUTO_FIGURES = 12;   // one paper never triggers more than this many drawing calls at once
const CONCURRENCY = 3;

/** Asks the server for one drawing. Resolves to a safe SVG string, or throws an Error with a teacher-readable message. */
export async function requestFigureSVG({ api, token, description, subject = "", className = "", signal }) {
  let res;
  try {
    res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ mode: "draw-figure", description, subject, className }),
      signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new Error("Couldn't reach the server to draw this figure.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't draw this figure.");
  const svg = String(data.svg || "").trim();
  if (!isSafeGeneratedSVG(svg)) throw new Error("The drawing wasn't usable. Try again or add your own picture.");
  return svg;
}

/**
 * Draws every figure that is still empty. Calls onSlot(key, "drawing" | "done" | "failed") as it goes
 * so the panel can show progress. Returns how many were drawn.
 */
export async function autoDrawFigures({ examData, setExamData, api, token, subject, className, onSlot = () => {}, signal }) {
  const todo = extractFigureSlots(examData).filter(s => slotState(s) === "empty" && s.description).slice(0, MAX_AUTO_FIGURES);
  let drawn = 0, next = 0;
  const worker = async () => {
    while (next < todo.length) {
      if (signal?.aborted) return;
      const slot = todo[next++];
      onSlot(slot.key, "drawing");
      try {
        const svg = await requestFigureSVG({ api, token, description: slot.description, subject, className, signal });
        setSlotDiagram(setExamData, slot, aiDiagram(slot.description, svg));
        drawn++;
        onSlot(slot.key, "done");
      } catch (e) {
        if (e?.name === "AbortError") return;
        onSlot(slot.key, "failed");
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  return drawn;
}
