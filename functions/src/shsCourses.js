/**
 * shsCourses.js - Senior High School programme -> subject map for the exam
 * wizard. Identical to the Lesson Planner's SHS_COURSES, so a teacher sees the
 * same programmes and subjects in both apps, and a subject's `key` is the exact
 * key used in curriculumIndex.js's ALL_SUBJECTS.
 *
 * Flow (same as the Lesson Planner):
 *   Class (SHS 1/2/3) -> Programme / Course -> Subject -> Strands -> Topics
 *
 * Keys carry an internal programme suffix ("Biology (GS)") only to keep
 * ALL_SUBJECTS unique. Teachers, the AI prompt, saved exams and printed
 * papers always use the clean display name ("Biology").
 */
import { shsSubjectInDB } from "./curriculumIndex.js";

// Level helpers live in shsLevel.js (no curriculum data); re-exported so callers have one import.
export * from "./shsLevel.js";

export const SHS_COURSES = {
  "Core Subjects": [
    { label: "English Language", key: "English Language" },
    { label: "Mathematics", key: "Mathematics" },
    { label: "Social Studies", key: "Social Studies" },
    { label: "Religious and Moral Education", key: "Religious and Moral Education" },
    { label: "Physical Education & Health", key: "Physical Education & Health" },
    { label: "General Science", key: "General Science" },
  ],
  "General Science": [
    { label: "Physics", key: "Physics (GS)" },
    { label: "Chemistry", key: "Chemistry (GS)" },
    { label: "Biology", key: "Biology (GS)" },
    { label: "Additional Mathematics", key: "Additional Mathematics (GS)" },
    { label: "Physical Education & Health (Elective)", key: "PE & Health Elective (GS)" },
    { label: "Information Communication Technology", key: "ICT (GS)" },
  ],
  "Business": [
    { label: "Accounting", key: "Accounting" },
    { label: "Business Management", key: "Business Management" },
    { label: "Economics", key: "Economics (BUS)" },
    { label: "Additional Mathematics", key: "Additional Mathematics (BUS)" },
    { label: "Information Communication Technology", key: "ICT (BUS)" },
  ],
  "General Arts": [
    { label: "History", key: "History (GA)" },
    { label: "Government", key: "Government" },
    { label: "Geography", key: "Geography" },
    { label: "Literature in English", key: "Literature in English" },
    { label: "French", key: "French (GA)" },
    { label: "Spanish", key: "Spanish" },
    { label: "Islamic Religious Studies", key: "Islamic Religious Studies" },
    { label: "Economics", key: "Economics (GA)" },
    { label: "Christian Religious Studies", key: "Christian Religious Studies" },
    { label: "Additional Mathematics", key: "Additional Mathematics (GA)" },
    { label: "Information Communication Technology", key: "ICT (GA)" },
    { label: "Music", key: "Music (GA)" },
    { label: "Physical Education & Health (Elective)", key: "PE & Health Elective (GA)" },
  ],
  "Visual Arts": [
    { label: "Art and Design Foundation", key: "Art and Design Foundation (VA)" },
    { label: "Art and Design Studio", key: "Art and Design Studio" },
    { label: "Basketry", key: "Basketry" },
    { label: "Design and Communication Technology", key: "Design and Communication Technology (VA)" },
    { label: "Music", key: "Music (VA)" },
    { label: "Performing Arts", key: "Performing Arts" },
    { label: "Physical Education & Health (Elective)", key: "PE & Health Elective (VA)" },
    { label: "Picture Making", key: "Picture Making" },
  ],
  "Home Economics": [
    { label: "Food and Nutrition", key: "Food and Nutrition" },
    { label: "Management in Living", key: "Management in Living" },
    { label: "Clothing and Textiles", key: "Clothing and Textiles" },
    { label: "Art and Design Foundation", key: "Art and Design Foundation (HE)" },
    { label: "Biology", key: "Biology (HE)" },
    { label: "Physical Education & Health (Elective)", key: "PE & Health Elective (HE)" },
  ],
  "Agricultural Science": [
    { label: "Agriculture", key: "Agriculture" },
    { label: "Biology", key: "Biology (Agric)" },
    { label: "Chemistry", key: "Chemistry (Agric)" },
    { label: "Physics", key: "Physics (Agric)" },
    { label: "Physical Education & Health (Elective)", key: "PE & Health Elective (Agric)" },
  ],
  "Technical": [
    { label: "Applied Electricity", key: "Applied Electricity" },
    { label: "Design and Communication Technology", key: "Design and Communication Technology" },
    { label: "Engineering", key: "Engineering" },
    { label: "Auto Mechanics", key: "Auto Mechanics" },
    { label: "Building Construction", key: "Building Construction" },
    { label: "Electronics", key: "Electronics" },
    { label: "Metalwork", key: "Metalwork" },
    { label: "Physical Education & Health (Elective)", key: "PE & Health Elective (Tech)" },
    { label: "Technical Drawing", key: "Technical Drawing" },
    { label: "Woodwork", key: "Woodwork" },
  ],
  "STEM / TVET": [
    { label: "Computing", key: "Computing (STEM)" },
    { label: "Robotics", key: "Robotics" },
    { label: "Biomedical Science", key: "Biomedical Science" },
    { label: "Aviation and Aerospace Engineering", key: "Aviation and Aerospace Engineering" },
    { label: "Information Communication Technology", key: "ICT (STEM)" },
    { label: "Physics", key: "Physics (STEM)" },
    { label: "Additional Mathematics", key: "Additional Mathematics (STEM)" },
    { label: "Agriculture", key: "Agriculture (STEM)" },
    { label: "Agricultural Science", key: "Agricultural Science (STEM)" },
    { label: "Applied Technology", key: "Applied Technology" },
    { label: "Arabic", key: "Arabic (STEM)" },
    { label: "Art and Design Studio", key: "Art and Design Studio" },
    { label: "Art and Design Foundation", key: "Art and Design Foundation (STEM)" },
    { label: "Automotive and Metal Technology", key: "Automotive and Metal Technology" },
    { label: "Electrical and Electron Technology", key: "Electrical and Electron Technology" },
    { label: "Engineering", key: "Engineering (STEM)" },
    { label: "Manufacturing Engineering", key: "Manufacturing Engineering" },
    { label: "Music", key: "Music (STEM)" },
    { label: "Physical Education & Health (Elective)", key: "PE & Health Elective (STEM)" },
    { label: "Spanish", key: "Spanish (STEM)" },
  ],
};

/** "Biology (GS)" -> "Biology". Same rule as the Lesson Planner. */
export const displaySubject = (key = "") =>
  String(key).replace(/\s*\((GA|GS|Agric|STEM|VA|Tech|AS|HE|BUS)\)$/i, "").trim();

export const OTHER_SUBJECT_KEY = "__other__";

/**
 * The subjects offered under a programme, each flagged with whether NaCCA
 * strands are loaded for it. Subjects without data stay selectable: an exam
 * only needs a pasted syllabus, unlike a lesson plan, which needs indicators.
 */
export function shsSubjectsForCourse(course) {
  return (SHS_COURSES[course] || []).map(s => ({ ...s, hasCurriculum: shsSubjectInDB(s.key) }));
}

/** Programme + subject key -> the subject entry, or null. */
export function findShsSubject(course, key) {
  return (SHS_COURSES[course] || []).find(s => s.key === key) || null;
}
