/**
 * moderation.js
 * ─────────────────────────────────────────────────────────────────
 * Lightweight, fast, PRE-FLIGHT input screening — this is not a
 * substitute for the AI's own judgement (Claude already declines to
 * generate genuinely harmful exam content), it's a cheap first line of
 * defence that:
 *   1. Rejects obviously abusive/hateful input before it ever reaches
 *      the AI call, saving the API cost and the credit reservation.
 *   2. Enforces hard length caps so a huge paste can't blow up prompt
 *      size/cost or be used to try to bury injected instructions.
 *
 * This file is intentionally duplicated (not imported across the
 * src/ ↔ functions/ boundary) because Cloudflare Pages Functions and
 * whatever bundler builds src/ may resolve module paths differently —
 * duplicating ~30 lines is safer than a fragile cross-boundary import
 * that silently breaks in one runtime but not the other. Keep both
 * copies (this one and src/moderation.js) in sync if you edit either.
 * ─────────────────────────────────────────────────────────────────
 */

export const MAX_SYLLABUS_CHARS = 6000;      // pasted syllabus / reference text
export const MAX_TOPIC_CHARS = 120;          // per individual topic string
export const MAX_TOPICS = 40;                // topic list length
export const MAX_SCHOOL_NAME_CHARS = 200;

// Deliberately narrow and high-precision — this exists to catch obvious
// abuse (hate speech, sexual content, requests to generate exam content
// about self-harm/violence framed as "questions"), not to police normal
// academic language. False positives on legitimate school topics are
// worse than the occasional miss here, since the AI itself is the real
// safety layer; this is just a cheap early filter.
const BLOCKED_PATTERNS = [
  /\bnigger|\bfaggot|\bkike\b|\bchink\b/i,
  /child\s*(porn|sexual)/i,
  /how to (make|build)\s+(a\s+)?(bomb|explosive|weapon)/i,
  /\bsuicide\s+method|\bhow to kill (myself|yourself)/i,
];

/**
 * @param {Object} fields — { schoolName, pastedSyllabus, topics: string[] }
 * @returns {{ ok: boolean, error?: string }}
 */
export function screenExamInput(fields = {}) {
  const { schoolName = "", pastedSyllabus = "", topics = [] } = fields;

  if (schoolName.length > MAX_SCHOOL_NAME_CHARS) {
    return { ok: false, error: `School name is too long (max ${MAX_SCHOOL_NAME_CHARS} characters).` };
  }
  if (pastedSyllabus.length > MAX_SYLLABUS_CHARS) {
    return { ok: false, error: `Pasted syllabus is too long (max ${MAX_SYLLABUS_CHARS.toLocaleString()} characters). Please paste just the relevant section.` };
  }
  if (topics.length > MAX_TOPICS) {
    return { ok: false, error: `Too many topics selected (max ${MAX_TOPICS}).` };
  }
  if (topics.some(t => String(t).length > MAX_TOPIC_CHARS)) {
    return { ok: false, error: "One of the topics is unusually long — please shorten it." };
  }

  const combined = [schoolName, pastedSyllabus, ...topics].join(" \n ");
  if (BLOCKED_PATTERNS.some(re => re.test(combined))) {
    return { ok: false, error: "This request contains content we can't generate an exam for. Please revise your input." };
  }

  return { ok: true };
}
