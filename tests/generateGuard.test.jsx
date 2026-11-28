// @vitest-environment jsdom
// REGRESSION: a double-tap on "Premium AI" must start ONE paid run, not two. The button disables itself only after React re-renders,
// so two taps landing in the same tick used to both get through and both spend credits.
import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";

const auth = vi.hoisted(() => ({ user: null }));
vi.mock("../src/auth.js", () => ({
  getUser: () => auth.user, getToken: () => (auth.user ? "tok" : null), completePendingGoogleSignIn: async () => null, signOut: () => {},
  onAuthChange: () => () => {},
}));
vi.mock("../src/pwaInstall.js", () => ({ usePwaInstall: () => ({ canInstall: false, install: async () => {}, isIOS: false, installed: false, dismissed: true, dismiss: () => {} }) }));
vi.mock("../src/hubSignIn.js", async (orig) => ({ ...(await orig()), goToHubSignIn: () => {} }));

import QuestionsGenerator from "../src/QuestionsGenerator.jsx";
import { saveWizardDraft, __resetDraftStoreForTests } from "../src/draftStore.js";

function fakeStream() {
  const enc = new TextEncoder(); const queue = []; let waiter = null; let ended = false;
  const wake = () => { if (!waiter) return; if (queue.length) { const w = waiter; waiter = null; w({ done: false, value: queue.shift() }); } else if (ended) { const w = waiter; waiter = null; w({ done: true }); } };
  const reader = { read: () => (queue.length ? Promise.resolve({ done: false, value: queue.shift() }) : ended ? Promise.resolve({ done: true }) : new Promise((r) => { waiter = r; })) };
  return { response: { ok: true, status: 200, body: { getReader: () => reader } }, push: (o) => { queue.push(enc.encode(JSON.stringify(o) + "\n")); wake(); }, end: () => { ended = true; wake(); } };
}
const SECTIONS = [{ id: "A", label: "Section A: Objective", type: "objective", questionCount: 5, marksPerQuestion: 1, enabled: true }];

let calls, stream;
beforeEach(() => {
  calls = 0; stream = fakeStream();
  auth.user = { id: "u1", email: "a@x.com", name: "Ama" };
  localStorage.clear(); globalThis.indexedDB = new IDBFactory(); __resetDraftStoreForTests();
  window.scrollTo = () => {};
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  saveWizardDraft({ className: "Basic 7", subject: "Mathematics", selectedTopics: ["Fractions"], sections: SECTIONS }, "u1");
  globalThis.fetch = vi.fn(async (url) => {
    if (String(url) === "/api/generate-exam") { calls++; return stream.response; }
    return { ok: false, status: 401, json: async () => ({}) };
  });
});
afterEach(() => { cleanup(); });

describe("double-tap on Generate", () => {
  it("two clicks in the same tick start exactly one generation", async () => {
    render(<QuestionsGenerator />);
    const btn = screen.getByRole("button", { name: /Premium AI/ });
    act(() => { btn.click(); btn.click(); });      // both land before React has re-rendered the button as disabled
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(1));
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toBe(1);
  });

  it("after a run ends the guard is released: generating again works", async () => {
    render(<QuestionsGenerator />);
    act(() => { screen.getByRole("button", { name: /Premium AI/ }).click(); });
    await waitFor(() => expect(calls).toBe(1));
    stream.push({ type: "error", message: "Down.", creditsRemaining: 10 }); stream.end();
    await waitFor(() => expect(screen.getByText(/Down\./)).toBeTruthy());
    stream = fakeStream();
    act(() => { screen.getByRole("button", { name: /Premium AI/ }).click(); });
    await waitFor(() => expect(calls).toBe(2));
  });
});

/* ───────────── Replace question: same double-tap protection ───────────── */
import ReplaceQuestion from "../src/components/ReplaceQuestion.jsx";
import { F, S } from "../src/sharedStyles.jsx";
describe("double-tap on 'Write new question' (costs credit)", () => {
  it("sends one replacement request, and works again afterwards", async () => {
    let release; const onReplace = vi.fn(() => new Promise((r) => { release = () => r({ number: 1, text: "new" }); }));
    const onApply = vi.fn();
    render(<ReplaceQuestion question={{ number: 1, text: "old" }} onReplace={onReplace} onApply={onApply} S={S} F={F} />);
    act(() => { screen.getByRole("button", { name: "Replace question" }).click(); });
    const go = screen.getByRole("button", { name: "Write new question" });
    act(() => { go.click(); go.click(); });
    expect(onReplace).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    // panel closed after success; open it again and replace once more: the guard was released
    act(() => { screen.getByRole("button", { name: "Replace question" }).click(); });
    act(() => { screen.getByRole("button", { name: "Write new question" }).click(); });
    expect(onReplace).toHaveBeenCalledTimes(2);
    await act(async () => { release(); });
  });
});
