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
 * Only small, re-creatable settings go in meta_json. The school logo is a
 * base64 data URL - keeping it out of the database protects the storage cap,
 * and it is already remembered in this browser, so reopened papers pick it up
 * again from there. Question pictures are different: they are compressed to
 * ~150 KB each, capped per exam (MAX_EXAM_IMAGE_CHARS) and saved inside
 * exam_json on the question they belong to, so a reopened paper keeps them.
 */
export function metaForSave(meta, extras = {}) {
  const { schoolLogo, svgPngs, examVersion, noticeText, ...rest } = meta || {}; // eslint-disable-line no-unused-vars
  return { ...rest, ...extras };
}

export const ExamHistory = {
  list: async () => (await call())?.exams || [],
  get: (id) => call(`/${encodeURIComponent(id)}`),
  save: (entry) => call("", { method: "POST", body: JSON.stringify(entry) }), // → { id, deletedCount, max }
  update: (id, patch) => call(`/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(patch) }),
  del: (id) => call(`/${encodeURIComponent(id)}`, { method: "DELETE" }),
  clear: () => call("", { method: "DELETE" }),
};
