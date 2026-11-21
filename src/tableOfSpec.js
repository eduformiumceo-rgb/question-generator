/**
 * tableOfSpec.js
 * ─────────────────────────────────────────────────────────────────
 * The Table of Specification (test blueprint): which topics the paper
 * covers, at which cognitive level, for how many marks. Heads of department
 * and inspectors ask for this alongside the paper and marking scheme.
 *
 * Built from the finished paper (so it always matches what is printed, even
 * after the teacher edits it), using each question's `topic` and
 * `cognitiveLevel`. Pure and offline.
 * ─────────────────────────────────────────────────────────────────
 */

export const LEVELS = ["Recall", "Application", "Critical Thinking"];
export const GENERAL_TOPIC = "General";

/** Maps whatever wording the AI or a teacher used onto the three levels. */
export function normLevel(v) {
  const s = String(v ?? "").toLowerCase().trim();
  if (!s) return "Unclassified";
  for (const l of LEVELS) if (s === l.toLowerCase()) return l;                       // the three official names win outright
  if (/critical|analy|evaluat|creat|higher|reason|synthes|problem/.test(s)) return "Critical Thinking";
  if (/appl|understand|compre|\buse\b|solve|interpret|explain/.test(s)) return "Application";   // before recall, so "application of knowledge" is Application
  if (/recall|know|remember|define|\bstate\b|\blist\b/.test(s)) return "Recall";
  return "Unclassified";
}

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

/**
 * @param {Object} exam
 * @param {{targetLevels?: string[]}} opts  the cognitive levels the teacher asked to emphasise
 */
export function buildSpec(exam, { targetLevels = [] } = {}) {
  const sections = Array.isArray(exam?.sections) ? exam.sections : [];
  const rowsByTopic = new Map();
  let untagged = 0, totalQuestions = 0;
  const levelSet = new Set(LEVELS);
  const empty = () => Object.fromEntries([...LEVELS, "Unclassified"].map(l => [l, { n: 0, marks: 0 }]));

  sections.forEach(s => (s.questions || []).forEach(q => {
    const topic = String(q.topic ?? "").trim().replace(/\s+/g, " ") || GENERAL_TOPIC;
    if (topic === GENERAL_TOPIC) untagged++;
    const level = normLevel(q.cognitiveLevel);
    const marks = Number(q.marks) || 0;
    if (!rowsByTopic.has(topic)) rowsByTopic.set(topic, { topic, cells: empty(), n: 0, marks: 0 });
    const row = rowsByTopic.get(topic);
    row.cells[level].n++; row.cells[level].marks += marks;
    row.n++; row.marks += marks;
    totalQuestions++;
    levelSet.add(level);
  }));

  const rows = [...rowsByTopic.values()].sort((a, b) => b.marks - a.marks || a.topic.localeCompare(b.topic));
  const totalMarks = rows.reduce((a, r) => a + r.marks, 0);
  const levels = [...LEVELS, ...(levelSet.has("Unclassified") ? ["Unclassified"] : [])];
  const totals = Object.fromEntries(levels.map(l => [l, { n: rows.reduce((a, r) => a + r.cells[l].n, 0), marks: rows.reduce((a, r) => a + r.cells[l].marks, 0) }]));
  rows.forEach(r => { r.pct = pct(r.marks, totalMarks); });
  const levelPct = Object.fromEntries(levels.map(l => [l, pct(totals[l].marks, totalMarks)]));

  const advice = [];
  const real = rows.filter(r => r.topic !== GENERAL_TOPIC);
  if (totalQuestions && untagged === totalQuestions) advice.push("Questions are not tagged with topics, so everything is grouped under General. Regenerate with topics selected to get a topic breakdown.");
  else if (untagged) advice.push(`${untagged} question${untagged === 1 ? "" : "s"} have no topic and are grouped under General.`);
  if (real.length > 1 && real[0].pct > 50) advice.push(`The paper leans heavily on "${real[0].topic}" (${real[0].pct}% of the marks).`);
  (targetLevels || []).map(normLevel).filter(l => l !== "Unclassified").forEach(l => {
    if (totals[l] && totals[l].marks === 0) advice.push(`No marks test ${l}, though you asked for it.`);
  });
  if (totalMarks && levelPct.Recall > 70) advice.push(`${levelPct.Recall}% of the marks only test recall. Add some application questions.`);
  if (totalMarks && levelPct["Critical Thinking"] === 0 && levelPct.Application < 10) advice.push("There is almost no higher-order thinking in this paper.");
  if (totals.Unclassified?.n) advice.push(`${totals.Unclassified.n} question${totals.Unclassified.n === 1 ? "" : "s"} have no cognitive level.`);

  return { levels, rows, totals, totalMarks, totalQuestions, levelPct, advice, topicsCovered: real.length };
}
