// Which tab shows (kept in the address bar's #hash so Back/refresh/share work) and the small responsive stylesheet of the generator screen.
// Moved out of QuestionsGenerator.jsx unchanged.

export const TAB_HASH = { generate: "", shading: "#shading", booklet: "#booklet", saved: "#saved" };
export const TAB_TITLE = { generate: "Eduformium Assessment Studio: Tests, Quizzes & Exams", shading: "Shading Sheet · Eduformium Assessment Studio", booklet: "Answer Booklet · Eduformium Assessment Studio", saved: "My Assessments · Eduformium Assessment Studio" };
export function viewFromHash() {
  if (typeof window === "undefined") return "generate";
  const h = window.location.hash;
  return h === "#shading" ? "shading" : h === "#booklet" ? "booklet" : h === "#saved" ? "saved" : "generate";
}


/**
 * A small, scoped responsive stylesheet for the couple of fixed 2-column
 * grids used across this wizard (Basic Info, Curriculum, Exam Structure
 * Builder). Inline React styles can't express media queries, and these
 * grids not stacking on a narrow phone - squishing two inputs into ~150px
 * each - is a real usability regression against the "smooth on low-end
 * Android" requirement, not a cosmetic nitpick.
 */
export const RESPONSIVE_CSS = `
  @keyframes eduq-rise { from { transform: translateY(100%); opacity: 0; } to { transform: none; opacity: 1; } }
  .eduq-bar { animation: eduq-rise .22s ease-out backwards; }
  @keyframes eduq-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .eduq-live-sec { animation: eduq-in .3s ease-out both; }
  @media (prefers-reduced-motion: reduce) { .eduq-bar, .eduq-live-sec { animation: none; } }
  .eduq-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .eduq-grid-2 > * { min-width: 0; }
  @media (max-width: 480px) {
    .eduq-grid-2:not(.is-pair) { grid-template-columns: 1fr; }
  }
`;
