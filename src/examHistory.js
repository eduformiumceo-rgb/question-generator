/**
 * examHistory.js - client for the saved-exams ("My Exams") endpoints.
 * Mirrors the Lesson Planner's DB module: the server keeps at most
 * MAX_SAVED_EXAMS per teacher and silently evicts the oldest on the next
 * save, so Supabase storage can't grow without bound.
 */
import { getToken } from "./auth.js";

const API = "/api/exam-account/history";
export const MAX_SAVED_EXAMS = 10; // keep in sync with MAX_EXAM_HISTORY_PER_USER in functions/api/exam-account/[[path]].js

async function call(path = "", opts = {}) {
  const token = getToken ? getToken() : null;
  if (!token) throw Object.assign(new Error("Please sign in."), { status: 401 });
  const res = await fetch(API + path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

/**
 * Only small, re-creatable settings are stored. The school logo and uploaded
 * diagram images are base64 data URLs (hundreds of KB each) - keeping them out
 * of the database is the whole point of the storage cap. The logo is already
 * remembered in this browser, so reopened papers pick it up again from there.
 */
export function metaForSave(meta, extras = {}) {
  const { schoolLogo, diagramImages, svgPngs, examVersion, noticeText, ...rest } = meta || {}; // eslint-disable-line no-unused-vars
  return { ...rest, ...extras };
}

export const ExamHistory = {
  list: async () => (await call())?.exams || [],
  get: (id) => call(`/${encodeURIComponent(id)}`),
  save: (entry) => call("", { method: "POST", body: JSON.stringify(entry) }), // → { id, deletedCount, max }
  del: (id) => call(`/${encodeURIComponent(id)}`, { method: "DELETE" }),
  clear: () => call("", { method: "DELETE" }),
};
