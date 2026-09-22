/**
 * ═══════════════════════════════════════════════════════════════════
 * functions/_shared/freeGeneration.js
 *
 * Free-tier AI calling strategy — mirrors functions/api/generate.js's
 * proven rotation pattern (sequential key rotation, not parallel racing,
 * to spread the ~10 req/day per-key limit across the whole pool instead
 * of exhausting every key simultaneously; Groq fallback only once every
 * Gemini key is exhausted).
 *
 * Deliberately does NOT force Gemini's responseMimeType:"application/json"
 * here, matching generate.js's own choice — free-tier Groq fallback uses
 * plain OpenAI-style chat completions with no JSON-mode guarantee, so
 * forcing strict JSON only on the Gemini leg would make behavior
 * inconsistent between the two legs of the same fallback chain. The
 * caller's own extractJSON() (markdown-fence stripping + brace extraction)
 * already handles both cases.
 *
 * ENV VARS (shared across branches, same as generate.js):
 *   GEMINI_FREE_KEY_1 … GEMINI_FREE_KEY_N   (only as many as you've set)
 *   GROQ_API_KEY_1 … GROQ_API_KEY_N
 * ═══════════════════════════════════════════════════════════════════
 */

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const TEMPERATURE = 0.2;
const MAX_KEY_SLOTS = 100; // matches generate.js — loop just skips any that aren't set

const GROQ_MODEL_CHAIN = [
  "llama-3.3-70b-versatile",
  "deepseek-r1-distill-llama-70b",
  "qwen-qwq-32b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "mistral-saba-24b",
  "gemma2-9b-it",
  "llama-3.1-8b-instant",
];

function isQuotaError(status, data) {
  if (status === 429 || status === 503) return true;
  const msg = (data?.error?.message || data?.error?.status || "").toLowerCase();
  return ["quota", "resource_exhausted", "rate limit", "rate_limit", "tokens per day", "requests per day", "per day", "capacity", "overloaded"]
    .some(s => msg.includes(s));
}
function stripThinkBlock(text) { return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(); }
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms))]);
}
function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  if (!parts.length) return "";
  return stripThinkBlock(parts.filter(p => !p.thought).map(p => p.text || "").join(""));
}

function collectKeys(env, prefix) {
  const keys = [];
  for (let i = 1; i <= MAX_KEY_SLOTS; i++) {
    const k = env[`${prefix}_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  return keys;
}

async function tryGemini(apiKey, systemPrompt, userMessage, maxTokens, timeoutMs) {
  const res = await withTimeout(
    fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: { temperature: TEMPERATURE, maxOutputTokens: Math.min(maxTokens, 8192), topP: 0.9 },
      }),
    }),
    timeoutMs
  );
  const data = await res.json();
  if (res.ok) {
    const text = extractGeminiText(data);
    if (!text) throw new Error("Gemini returned empty text");
    return text;
  }
  if (isQuotaError(res.status, data)) { const e = new Error(`Gemini quota: HTTP ${res.status}`); e.quota = true; throw e; }
  throw new Error(`Gemini error: ${data?.error?.message || `HTTP ${res.status}`}`);
}

async function tryGroqKey(apiKey, messages, maxTokens) {
  const attempts = GROQ_MODEL_CHAIN.map(async (model) => {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: TEMPERATURE }),
    });
    const data = await res.json();
    if (res.ok) {
      const text = stripThinkBlock(data?.choices?.[0]?.message?.content || "");
      if (!text) throw new Error("empty");
      return text;
    }
    if (isQuotaError(res.status, data)) { const e = new Error(`Groq quota on ${model}`); e.quota = true; throw e; }
    throw new Error(`Groq ${model} HTTP ${res.status}`);
  });
  return Promise.any(attempts);
}

/**
 * Free-tier entry point: rotate Gemini free keys sequentially, fall back to
 * rotated Groq keys if every Gemini key is exhausted/failing. Throws if
 * every key on both tiers fails.
 */
export async function callFreeAI(env, systemPrompt, userPrompt, maxTokens, timeoutMs) {
  const geminiKeys = collectKeys(env, "GEMINI_FREE_KEY");
  if (geminiKeys.length) {
    const shuffled = [...geminiKeys].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      try {
        if (i > 0) await new Promise(r => setTimeout(r, 300)); // stagger — avoid tripping per-key RPM
        return await tryGemini(shuffled[i], systemPrompt, userPrompt, maxTokens, timeoutMs);
      } catch (err) {
        if (err.quota) continue; // try next key
        continue; // other errors also just move on — free tier has no one key worth waiting on
      }
    }
  }

  const groqKeys = collectKeys(env, "GROQ_API_KEY");
  if (groqKeys.length) {
    const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }];
    const shuffled = [...groqKeys].sort(() => Math.random() - 0.5);
    for (const key of shuffled) {
      try {
        return await tryGroqKey(key, messages, maxTokens);
      } catch {
        continue;
      }
    }
  }

  throw new Error("Free generation is temporarily at capacity — please try again in a few minutes, or use Premium.");
}
