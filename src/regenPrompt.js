/**
 * regenPrompt.js
 * ─────────────────────────────────────────────────────────────────
 * Extra prompt rules used only when ONE question is being replaced:
 * the other questions already on the paper (so the new one does not repeat
 * them) and an optional note from the teacher ("make it harder").
 *
 * Duplicated into functions/_shared/regenPrompt.js; tests/regenerate.test.js
 * fails if the two copies differ.
 * ─────────────────────────────────────────────────────────────────
 */
const oneLine = (s, n) => String(s ?? "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

export function regenRulesBlock(cfg = {}) {
  const avoid = (Array.isArray(cfg.avoidQuestions) ? cfg.avoidQuestions : []).map(t => oneLine(t, 180)).filter(Boolean).slice(0, 30);
  const note = oneLine(cfg.revisionNote, 200);
  if (!avoid.length && !note) return "";
  return `
REPLACEMENT QUESTION (the teacher is replacing one question on a finished paper)
${avoid.length ? `- The new question must test a DIFFERENT point from every question already on the paper. Do not repeat or rephrase any of these:\n${avoid.map(t => `  * ${t}`).join("\n")}\n` : ""}${note ? `- Teacher's request for the new question (follow it only if it fits the rules above): ${note}\n` : ""}`;
}
