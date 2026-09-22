/**
 * ═══════════════════════════════════════════════════════════════════
 * Cloudflare Pages Function — EDUFORMIUM Questions Generator
 * FILE: functions/api/generate-exam.js   (v3 — Gemini, streaming, hardened)
 *
 * v3 correction: earlier versions of this file called the Anthropic API.
 * That was wrong — this codebase's actual AI provider is Google Gemini
 * (gemini-3.6-flash for the paid/premium tier, per generate-premium.js;
 * gemini-2.5-flash + Groq fallback for the free tier, per generate.js).
 * This file now calls the same gemini-3.6-flash endpoint, the same
 * request shape (system_instruction/contents/generationConfig), and the
 * same GEMINI_API_KEY env var as your existing generate-premium.js —
 * genuinely the same provider your Lesson Planner uses, not a
 * lookalike.
 *
 * Changes from v1, and why:
 *   - SECTION-BY-SECTION generation (via examTemplate.js's buildSectionPrompt)
 *     instead of one giant AI call. A 40-question single-shot paper risks
 *     truncating mid-JSON near the token limit; each section here is small
 *     enough that truncation is effectively eliminated, and a failed
 *     section can be retried without redoing the whole paper.
 *   - STREAMED response (newline-delimited JSON) so the client can show
 *     real per-section progress instead of one 30-45s blocking spinner —
 *     directly addresses the "no lag on low-end Android" requirement,
 *     since perceived responsiveness matters as much as raw speed there.
 *   - RATE LIMITING off `exam_generations` timestamps — no new table needed.
 *   - INPUT SCREENING via the shared moderation module before any credit
 *     is reserved or any AI call is made.
 *   - RETRY: each section gets up to 2 attempts before the whole
 *     generation is aborted and refunded.
 *
 * Same shared-Supabase-project / shared-JWT-secret pattern as before —
 * see README_INTEGRATION.md for the full env var list.
 * ═══════════════════════════════════════════════════════════════════
 */

import { screenExamInput } from "../_shared/moderation.js";
import { buildSectionPrompt } from "../_shared/examPrompt.js";
import { callFreeAI } from "../_shared/freeGeneration.js";
import { FREE_TIER_MAX_SECTIONS, FREE_TIER_MAX_TOTAL_QUESTIONS, FREE_TIER_ALLOWED_TYPES, FREE_TIER_DAILY_LIMIT } from "../_shared/freeTierLimits.js";

const AI_MODEL_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";
// Priced consistently with the Lesson Planner's real precedent, not an
// arbitrary guess: COINS_PER_LESSON = 0.5 in generate-premium.js, one
// premium lesson = one AI call. This app makes one AI call per SECTION
// (that's the whole point of the section-by-section reliability fix), so
// at the same 0.5-per-call rate, a typical 2-3 section exam costs 1-1.5
// units — matching real Ghana market economics: at COIN_PACKAGES' actual
// GHS/coin rates (see functions/api/exam-payment), that's roughly
// GHS 0.50-1.50 for a WHOLE CLASS's exam, versus GHS 25-55 PER STUDENT
// from an external mock-exam vendor.
const CREDIT_COST_PER_SECTION_WITH_MARKING = 0.5;
const CREDIT_COST_PER_SECTION_QUESTIONS_ONLY = 0.35; // shorter output (no marking-guide prose) — genuinely cheaper to generate, priced accordingly

// Free tier is deliberately a smaller "quiz" product, not a stripped-down
// exam: capped section count/size, objective+structured only (no essay —
// that's the most "premium"-feeling deliverable), and always Questions
// Only (no marking scheme) regardless of what the client requests. This
// keeps free-tier quota burn predictable (each section = 1 AI call against
// a shared free-key pool) and gives free→paid a clear, honest value story.
// Limits imported from freeTierLimits.js — single source of truth shared
// with the client, so the two can't silently drift apart.
const MAX_TOKENS_PER_SECTION = 4000; // small on purpose — see file header
const SECTION_TIMEOUT_MS = 30000;
const MAX_SECTION_ATTEMPTS = 2;

const RATE_LIMIT_SHORT = { windowSeconds: 120, max: 3 };   // 3 generations / 2 min
const RATE_LIMIT_DAILY = { windowSeconds: 86400, max: 30 }; // 30 generations / day

function resolveEnv(raw, request) {
  const isDev = new URL(request.url).hostname.startsWith("dev.");
  return {
    ...raw,
    SUPABASE_URL:         isDev ? raw.DEV_SUPABASE_URL         : (raw.PROD_SUPABASE_URL         || raw.SUPABASE_URL),
    SUPABASE_SERVICE_KEY: isDev ? raw.DEV_SUPABASE_SERVICE_KEY : (raw.PROD_SUPABASE_SERVICE_KEY || raw.SUPABASE_SERVICE_KEY),
    JWT_SECRET:           isDev ? raw.DEV_JWT_SECRET           : (raw.PROD_JWT_SECRET           || raw.JWT_SECRET),
    ALLOWED_ORIGIN:       isDev ? raw.DEV_ALLOWED_ORIGIN       : (raw.PROD_ALLOWED_ORIGIN       || raw.ALLOWED_ORIGIN),
  };
}
function corsHeaders(env) {
  return { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
}
function jsonResp(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }

async function verifyJWT(token, secret) {
  try {
    const [header, body, sig] = token.split(".");
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(`${header}.${body}`));
    if (!valid) return null;
    const payload = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}
async function sb(env, path, opts = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error("Server misconfigured: Supabase env vars not set for this environment.");
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "apikey": env.SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Prefer": "return=representation", ...(opts.headers || {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || data?.error || `Supabase ${res.status}`);
  return data;
}
async function requireUser(request, env) {
  const token = (request.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!token) return null;
  return verifyJWT(token, env.JWT_SECRET);
}

/* ── exam_credits wallet ── */
async function getExamCreditBalance(env, userId) {
  const rows = await sb(env, `/exam_credits?user_id=eq.${userId}&select=balance`);
  if (rows?.length) return rows[0].balance;
  await sb(env, "/exam_credits", { method: "POST", body: JSON.stringify({ user_id: userId, balance: 0 }) }).catch(() => {});
  return 0;
}
async function reserveExamCredits(env, userId, amount) {
  const balance = await getExamCreditBalance(env, userId);
  if (balance < amount) return { ok: false, balance };
  await sb(env, `/exam_credits?user_id=eq.${userId}`, { method: "PATCH", body: JSON.stringify({ balance: balance - amount, updated_at: new Date().toISOString() }) });
  return { ok: true, balance: balance - amount, refundAmount: amount };
}
async function refundExamCredits(env, userId, amount) {
  const balance = await getExamCreditBalance(env, userId);
  await sb(env, `/exam_credits?user_id=eq.${userId}`, { method: "PATCH", body: JSON.stringify({ balance: balance + amount, updated_at: new Date().toISOString() }) }).catch(() => {});
}

/* ── Rate limiting, off exam_generations timestamps — no new table ── */
async function checkRateLimit(env, userId) {
  const now = Date.now();
  const shortSince = new Date(now - RATE_LIMIT_SHORT.windowSeconds * 1000).toISOString();
  const dailySince = new Date(now - RATE_LIMIT_DAILY.windowSeconds * 1000).toISOString();

  const [shortRows, dailyRows] = await Promise.all([
    sb(env, `/exam_generations?user_id=eq.${userId}&created_at=gte.${shortSince}&select=id`),
    sb(env, `/exam_generations?user_id=eq.${userId}&created_at=gte.${dailySince}&select=id`),
  ]);

  if ((shortRows || []).length >= RATE_LIMIT_SHORT.max) {
    return { ok: false, message: "You're generating exams too quickly. Please wait a couple of minutes and try again." };
  }
  if ((dailyRows || []).length >= RATE_LIMIT_DAILY.max) {
    return { ok: false, message: "You've reached today's exam-generation limit. Please try again tomorrow, or contact support if you need a higher limit." };
  }
  return { ok: true };
}

/** Free tier's own, stricter daily cap — separate from the general rate limit above. */
async function checkFreeTierLimit(env, userId) {
  const todaySince = new Date(Date.now() - 86400 * 1000).toISOString();
  const rows = await sb(env, `/exam_generations?user_id=eq.${userId}&tier=eq.free&created_at=gte.${todaySince}&select=id`);
  if ((rows || []).length >= FREE_TIER_DAILY_LIMIT) {
    return { ok: false, message: `You've used your ${FREE_TIER_DAILY_LIMIT} free quizzes for today. Try again tomorrow, or use Premium for unlimited generations.` };
  }
  return { ok: true };
}

async function logExamGeneration(env, userId, meta, creditCost, tier) {
  await sb(env, "/exam_generations", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      subject: String(meta.subject || "").slice(0, 200),
      class: String(meta.className || "").slice(0, 100),
      exam_type: String(meta.examType || "").slice(0, 100),
      curriculum: "GES",
      credits_used: creditCost,
      question_count: meta.questionCount || null,
      total_marks: meta.totalMarks || null,
      tier,
    }),
  }).catch(() => {});
}

/* ── Extract text from Gemini response — Gemini 2.5+/3.x Flash may return
      thinking tokens as separate parts with thought:true; collect only the
      non-thought parts. Identical logic to generate-premium.js's helper. ── */
function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  if (parts.length === 0) return "";
  const text = parts.filter(p => !p.thought).map(p => p.text || "").join("").trim();
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function extractJSON(raw) {
  let cleaned = raw.replace(/```json[\s\S]*?```/g, m => m.slice(7, -3)).replace(/```[\s\S]*?```/g, m => m.slice(3, -3)).trim();
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) cleaned = objMatch[0];
  return JSON.parse(cleaned);
}
async function callAI(env, systemPrompt, userPrompt, maxTokens, timeoutMs, expectJSON = true) {
  if (!env.GEMINI_API_KEY) throw new Error("Server misconfigured: GEMINI_API_KEY not set for this environment.");
  const res = await fetch(`${AI_MODEL_URL}?key=${env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // AbortSignal cancels the network connection at the OS level when the timeout
    // fires — matches generate-premium.js's withTimeout()/AbortSignal.timeout() pattern,
    // so a timed-out request doesn't keep consuming the Worker's CPU slot.
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: maxTokens,
        topP: 0.9,
        // JSON mode — this app's prompts require strict structured output
        // (exam schema), so unlike generate-premium.js's free-text lesson
        // plans, constraining Gemini's own output format here meaningfully
        // reduces malformed/truncated-JSON risk on top of the section-by-
        // section splitting already in place.
        ...(expectJSON ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`AI provider returned HTTP ${res.status}`);
  const data = await res.json();
  const text = extractGeminiText(data);
  if (!text) throw new Error("AI provider returned empty text");
  return text;
}

/** Generates ONE section, retrying up to MAX_SECTION_ATTEMPTS on parse/shape failure. */
async function generateSection(env, cfg, section, isFirstSection, aiStrategy) {
  const expectedSectionMarks = Number(section.questionCount) * Number(section.marksPerQuestion);
  let lastErr;
  for (let attempt = 1; attempt <= MAX_SECTION_ATTEMPTS; attempt++) {
    try {
      const prompt = buildSectionPrompt(cfg, section, isFirstSection);
      const raw = await aiStrategy(env, prompt, "Generate this section now, following every rule exactly. Return only the JSON object.", MAX_TOKENS_PER_SECTION, SECTION_TIMEOUT_MS);
      const parsed = extractJSON(raw);
      const questions = parsed.section?.questions;
      if (!parsed.section || !Array.isArray(questions) || questions.length !== Number(section.questionCount)) {
        throw new Error(`Section ${section.id} returned ${questions?.length ?? 0} question(s), expected ${section.questionCount}.`);
      }
      // Marks-integrity check — same rule the client re-verifies with
      // validateExamData(), but checked HERE, before the section is
      // accepted, so a bad total triggers a retry instead of surfacing an
      // error to the teacher after credits have already been committed.
      const actualSectionMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
      if (actualSectionMarks !== expectedSectionMarks) {
        throw new Error(`Section ${section.id} marks don't add up: expected ${expectedSectionMarks}, got ${actualSectionMarks}.`);
      }
      const badParts = questions.find(q => Array.isArray(q.parts) && q.parts.length &&
        q.parts.reduce((sum, p) => sum + (Number(p.marks) || 0), 0) !== Number(q.marks));
      if (badParts) {
        throw new Error(`Section ${section.id}, Question ${badParts.number}: part marks don't sum to the question total.`);
      }
      return parsed;
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_SECTION_ATTEMPTS) continue;
    }
  }
  throw lastErr || new Error(`Section ${section.id} failed to generate.`);
}

export async function onRequest(context) {
  const { request } = context;
  const env = resolveEnv(context.env, request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env) });
  if (request.method !== "POST") return withCORS(jsonResp({ error: "Method not allowed." }, 405), env);

  let body;
  try { body = await request.json(); } catch { return withCORS(jsonResp({ error: "Invalid request." }, 400), env); }
  const mode = body.mode || "generate-exam";

  const user = await requireUser(request, env);
  if (!user) return withCORS(jsonResp({ error: "Please sign in to generate exams." }, 401), env);

  if (mode === "suggest-topics") return withCORS(await handleSuggestTopics(body, env), env);
  if (mode !== "generate-exam") return withCORS(jsonResp({ error: "Unknown mode." }, 400), env);

  return withCORS(await handleGenerateExamStreaming(body, env, user), env);
}
function withCORS(response, env) {
  const r = new Response(response.body, response);
  Object.entries(corsHeaders(env)).forEach(([k, v]) => r.headers.set(k, v));
  return r;
}

async function handleSuggestTopics(body, env) {
  const { subject, className, strand } = body;
  if (!subject || !className) return jsonResp({ error: "Subject and class are required." }, 400);
  try {
    const prompt = `List 6-10 exam-worthy topic names for GES ${subject}, class "${className}"${strand ? `, within the strand "${strand}"` : ""}. Return ONLY a JSON array of short topic-name strings, nothing else.`;
    const raw = await callAI(env, "You output only valid JSON arrays of strings, nothing else.", prompt, 500, 15000);
    const topics = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || "[]");
    return jsonResp({ topics });
  } catch {
    return jsonResp({ topics: [] });
  }
}

async function handleGenerateExamStreaming(body, env, user) {
  const { subject, className, sections, schoolName = "", pastedSyllabus = "", topics = [] } = body;
  const tier = body.tier === "free" ? "free" : "premium";
  // Free tier always generates Questions Only — see FREE_TIER_* constants' comment for why.
  const includeMarkingScheme = tier === "free" ? false : (body.includeMarkingScheme !== false);

  // ── Validation ──
  if (!subject || !className) return jsonResp({ error: "Subject and class are required." }, 400);
  if (!Array.isArray(sections) || !sections.length) return jsonResp({ error: "At least one exam section is required." }, 400);
  const excessive = sections.find(s => Number(s.questionCount) > 60);
  if (excessive) return jsonResp({ error: `Section ${excessive.id} requests too many questions.` }, 400);

  // ── Free-tier caps: a smaller quiz product, not a stripped exam ──
  if (tier === "free") {
    if (sections.length > FREE_TIER_MAX_SECTIONS) {
      return jsonResp({ error: `Free quizzes are limited to ${FREE_TIER_MAX_SECTIONS} sections. Use Premium for full exams.` }, 400);
    }
    const disallowedType = sections.find(s => !FREE_TIER_ALLOWED_TYPES.includes(s.type));
    if (disallowedType) {
      return jsonResp({ error: `Free quizzes don't support ${disallowedType.type} (essay) sections yet. Use Premium for full exams.` }, 400);
    }
    const totalQuestions = sections.reduce((sum, s) => sum + (Number(s.questionCount) || 0), 0);
    if (totalQuestions > FREE_TIER_MAX_TOTAL_QUESTIONS) {
      return jsonResp({ error: `Free quizzes are limited to ${FREE_TIER_MAX_TOTAL_QUESTIONS} questions total. Use Premium for full exams.` }, 400);
    }
  }

  // ── Input screening (before any credit reservation or AI call) ──
  const screen = screenExamInput({ schoolName, pastedSyllabus, topics });
  if (!screen.ok) return jsonResp({ error: screen.error }, 400);

  // ── Rate limit (general, both tiers) + free tier's own stricter daily cap ──
  const rl = await checkRateLimit(env, user.sub);
  if (!rl.ok) return jsonResp({ error: rl.message }, 429);
  if (tier === "free") {
    const freeLimit = await checkFreeTierLimit(env, user.sub);
    if (!freeLimit.ok) return jsonResp({ error: freeLimit.message }, 429);
  }

  // ── Reserve credits — free tier costs 0, nothing to reserve/refund ──
  // Scales with section count = actual AI call count, matching how coins
  // scale with actual generations in the Lesson Planner (see cost comment
  // above). Rounded to 2 decimals — this app's wallet supports fractional
  // credits, same as the Lesson Planner's 0.5-coin lessons.
  const perSectionRate = includeMarkingScheme ? CREDIT_COST_PER_SECTION_WITH_MARKING : CREDIT_COST_PER_SECTION_QUESTIONS_ONLY;
  const creditCost = tier === "free" ? 0 : Math.round(sections.length * perSectionRate * 100) / 100;
  let reservation = { ok: true, balance: null, refundAmount: 0 };
  if (tier !== "free") {
    reservation = await reserveExamCredits(env, user.sub, creditCost);
    if (!reservation.ok) return jsonResp({ error: "Not enough credits. Please top up to continue.", balance: reservation.balance }, 402);
  }

  const aiStrategy = tier === "free" ? callFreeAI : callAI;
  const bodyWithTierDefaults = { ...body, includeMarkingScheme };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const examData = { title: "", instructions: [], sections: [], answerKey: [] };
      try {
        for (let i = 0; i < sections.length; i++) {
          const section = sections[i];
          send({ type: "progress", sectionId: section.id, sectionLabel: section.label, index: i + 1, total: sections.length });

          const result = await generateSection(env, bodyWithTierDefaults, section, i === 0, aiStrategy);
          if (i === 0) { examData.title = result.title || ""; examData.instructions = result.instructions || []; }
          examData.sections.push(result.section);
          if (section.type === "objective") {
            (result.section.questions || []).forEach(q => {
              if (q.correctOption) examData.answerKey.push({ number: q.number, answer: q.correctOption });
            });
          }
          send({ type: "section-done", sectionId: section.id, questionCount: result.section.questions.length });
        }

        const totalMarks = examData.sections.reduce((sum, s) => sum + (s.questions || []).reduce((qs, q) => qs + (Number(q.marks) || 0), 0), 0);
        const questionCount = examData.sections.reduce((sum, s) => sum + (s.questions || []).length, 0);
        await logExamGeneration(env, user.sub, { ...body, totalMarks, questionCount }, creditCost, tier);

        send({ type: "done", examData, creditsRemaining: reservation.balance, includeMarkingScheme, tier });
      } catch (err) {
        if (tier !== "free" && reservation.refundAmount > 0) {
          await refundExamCredits(env, user.sub, reservation.refundAmount);
        }
        console.error("generate-exam (streaming) failed:", err?.stack || err?.message || err);
        send({
          type: "error",
          message: tier === "free"
            ? (err.message?.includes("temporarily at capacity") ? err.message : "Free generation failed. Please try again, or use Premium.")
            : "Couldn't generate the exam. Please try again — you have not been charged.",
          creditsRemaining: tier === "free" ? null : reservation.balance + reservation.refundAmount,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
