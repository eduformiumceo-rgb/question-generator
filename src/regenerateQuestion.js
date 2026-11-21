/**
 * regenerateQuestion.js - replace ONE question on a finished paper.
 *
 * The reply comes from the server (mode "regenerate-question") and is still
 * checked here before it touches the paper: the right shape, the right marks,
 * four options for objective questions. Old pictures and drawings belong to
 * the old question, so the replacement starts without them.
 */
const LETTERS = ["A", "B", "C", "D"];

/** Teacher-readable reason the reply can't be used, or "" if it is fine. */
export function checkReplacement(q, { type, marks }) {
  if (!q || typeof q !== "object") return "The new question was empty.";
  if (!String(q.text ?? "").trim() && !(Array.isArray(q.parts) && q.parts.length)) return "The new question had no text.";
  if (Number(q.marks) !== Number(marks)) return "The new question had the wrong marks.";
  if (type === "objective") {
    if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => !String(o ?? "").trim())) return "The new question didn't have four options.";
    if (!LETTERS.includes(String(q.correctOption || "").toUpperCase())) return "The new question had no correct answer.";
  }
  if (Array.isArray(q.parts) && q.parts.length && q.parts.reduce((a, p) => a + (Number(p.marks) || 0), 0) !== Number(q.marks)) return "The new question's parts didn't add up.";
  return "";
}

/** Builds the replacement for the old question (same number and marks, nothing carried over from the old content). */
export function cleanReplacement(raw, old) {
  const q = { ...raw, number: old.number, marks: old.marks };
  delete q.image;
  if (q.correctOption) q.correctOption = String(q.correctOption).toUpperCase();
  if (!Array.isArray(q.parts)) q.parts = [];
  if (!q.diagram || !q.diagram.needed) q.diagram = null;
  return q;
}

/** Resolves { question, creditsRemaining } or throws an Error with a teacher-readable message. */
export async function requestQuestionReplacement({ api, token, settings, section, question, avoid = [], note = "", signal }) {
  let res;
  try {
    res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        ...settings, mode: "regenerate-question",
        section: { id: section.id, label: section.label, type: section.type },
        number: question.number, marks: question.marks,
        avoidQuestions: avoid, revisionNote: note,
      }),
      signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || "Couldn't write a replacement question."); err.creditsRemaining = data.creditsRemaining; throw err; }
  const problem = checkReplacement(data.question, { type: section.type, marks: question.marks });
  if (problem) throw new Error(`${problem} Please try again.`);
  return { question: cleanReplacement(data.question, question), creditsRemaining: data.creditsRemaining };
}
