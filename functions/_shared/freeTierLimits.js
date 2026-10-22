/**
 * freeTierLimits.js
 * ─────────────────────────────────────────────────────────────────
 * Single source of truth for the Free Quiz tier's caps, so the client
 * (form validation, UI copy, ExamStructureBuilder's locked-section
 * display) and the server (functions/api/generate-exam.js's actual
 * enforcement) can never silently drift apart — which is exactly the
 * kind of bug that's invisible until a teacher hits a confusing
 * rejection the UI never warned them about.
 *
 * Duplicated (not imported) into functions/_shared/freeTierLimits.js
 * for the same cross-boundary-bundler reason as moderation.js and
 * examPrompt.js — keep both copies identical if you change either.
 * ─────────────────────────────────────────────────────────────────
 */

export const FREE_TIER_MAX_SECTIONS = 2;
export const FREE_TIER_MAX_TOTAL_QUESTIONS = 15;
export const FREE_TIER_ALLOWED_TYPES = ["objective", "structured"]; // no essay on free tier
export const FREE_TIER_DAILY_LIMIT = 3; // generations per user per day
