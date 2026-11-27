/**
 * examApi - the generate-exam endpoints, the option lists the generator offers, and the streaming request.
 * Split out of QuestionsGenerator.jsx.
 */

export const EXAM_API = "/api/generate-exam";
export const ACCOUNT_API = "/api/exam-account";

export const DIFFICULTIES = ["Easy", "Moderate", "Hard"];
export const LANGUAGE_STYLES = [
  { value: "Simple", label: "Simple & Clear" },
  { value: "Balanced", label: "Balanced" },
  { value: "Advanced", label: "Advanced / Academic" },
];
export const COGNITIVE_LEVELS = ["Recall", "Application", "Critical Thinking"];

/**
 * Streams the generation endpoint's newline-delimited JSON response, calling
 * onProgress for each event as it arrives so the UI can show real
 * per-section progress instead of one long blocking spinner.
 * Returns the final { examData, creditsRemaining } from the "done" event.
 */
export async function streamExamAPI(payload, token, onProgress) {
  const controller = new AbortController();
  let watchdog;
  const arm = () => { clearTimeout(watchdog); watchdog = setTimeout(() => controller.abort(), 120000); };
  arm();
  let res;
  try {
    res = await fetch(EXAM_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(watchdog);
    throw new Error(e.name === "AbortError" ? "The server took too long to respond. Please try again. You have not been charged." : e.message);
  }

  if (!res.ok) {
    clearTimeout(watchdog);
    const errBody = await res.json().catch(() => ({}));
    const err = new Error(errBody.error || errBody.message || `Generation failed (HTTP ${res.status}).`);
    err.status = res.status;
    err.balance = errBody.balance;
    throw err;
  }
  if (!res.body) throw new Error("Streaming is not supported in this browser. Please update your browser and try again.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult = null;
  let streamError = null;

  while (true) {
    let chunk;
    try { chunk = await reader.read(); }
    catch (e) {
      clearTimeout(watchdog);
      throw new Error(e.name === "AbortError" ? "Generation stalled and was stopped. Please try again. You have not been charged." : "Connection lost while generating. Please try again.");
    }
    arm(); // any bytes (including server keep-alive pings) reset the stall timer
    const { done, value } = chunk;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // last (possibly incomplete) line stays in the buffer
    for (const line of lines) {
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      onProgress?.(event);
      if (event.type === "done") finalResult = event;
      if (event.type === "error") streamError = event;
    }
  }

  clearTimeout(watchdog);
  if (streamError) {
    const err = new Error(streamError.message);
    err.creditsRemaining = streamError.creditsRemaining;
    throw err;
  }
  if (!finalResult) throw new Error("The connection was interrupted before the exam finished generating. Please try again. You have not been charged for an incomplete generation, but do check your credit balance.");
  return finalResult;
}

