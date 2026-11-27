/**
 * shsLevel.js - the small, data-free helpers that depend on whether a class is
 * Senior High School: semesters vs terms, exam-type wording, and how the class
 * and term read in a paper's header. No curriculum import, so the paper
 * renderers can use it without pulling in the curriculum data.
 */
export const SHS_CLASSES = ["SHS 1", "SHS 2", "SHS 3"];
export const isSHSClass = (cls) => SHS_CLASSES.includes(String(cls || "").trim());

/* ── Terms vs semesters: SHS runs two semesters, Basic schools three terms ── */
export const TERMS = ["Term 1", "Term 2", "Term 3"];
export const SEMESTERS = ["Semester 1", "Semester 2"];
export const termOptionsFor = (cls) => (isSHSClass(cls) ? SEMESTERS : TERMS);

/** Keep the chosen term meaningful when the class level changes ("Term 3" has no SHS equivalent). */
export function mapTermForLevel(term, cls) {
  const opts = termOptionsFor(cls);
  if (opts.includes(term)) return term;
  const n = parseInt(String(term).replace(/\D/g, ""), 10);
  return opts[Math.min(Math.max(n || 1, 1), opts.length) - 1];
}

const BASIC_EXAM_TYPES = ["Class Test", "Quiz", "Mid-Term Exam", "End of Term Exam", "Mock Exam"];
const SHS_EXAM_TYPES = ["Class Test", "Quiz", "Mid-Semester Exam", "End of Semester Exam", "Mock Exam"];
export const examTypesFor = (cls) => (isSHSClass(cls) ? SHS_EXAM_TYPES : BASIC_EXAM_TYPES);

/** "Mid-Term Exam" <-> "Mid-Semester Exam" when the teacher switches between Basic and SHS. */
export function mapExamTypeForLevel(type, cls) {
  const opts = examTypesFor(cls);
  if (opts.includes(type)) return type;
  const i = (isSHSClass(cls) ? BASIC_EXAM_TYPES : SHS_EXAM_TYPES).indexOf(type);
  return i >= 0 ? opts[i] : opts[0];
}

/** Shown beside the class on the paper, e.g. "SHS 2 (General Science)". Core-only papers show just the class. */
export function classWithProgramme(cls, programme) {
  const p = String(programme || "").trim();
  return p && p !== "Core Subjects" && isSHSClass(cls) ? `${cls} (${p})` : String(cls || "");
}

/** The academic year a Ghanaian school year is normally in: it starts in September, so Nov 2026 is "2026/2027" and Mar 2027 is too. */
export function currentAcademicYear(date = new Date()) {
  const y = date.getFullYear(), start = date.getMonth() >= 8 ? y : y - 1;
  return `${start}/${start + 1}`;
}

/** Keep what a teacher types to the shape "2026/2027" (digits and one slash, at most 9 characters). */
export const cleanAcademicYear = (v) => String(v || "").replace(/[^\d/]/g, "").slice(0, 9);

/** Header cell for the term: "Term: Term 1" stays as before; SHS prints "Semester: 1". */
export function termCell(term) {
  const t = String(term || "");
  const m = /^semester\s*(.*)$/i.exec(t);
  return m ? ["Semester", m[1] || t] : ["Term", t];
}

/** Header cell for the academic year, or null when none was given (so no empty cell is printed). */
export function yearCell(academicYear) {
  const y = String(academicYear || "").trim();
  return y ? ["Year", y] : null;
}
