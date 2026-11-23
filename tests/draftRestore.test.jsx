// @vitest-environment jsdom
// End to end on the REAL generator screen: what a teacher sees after a refresh, a sign-in redirect or a sign-out.
import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";

const auth = vi.hoisted(() => ({ user: null }));
vi.mock("../src/auth.js", () => ({
  getUser: () => auth.user, getToken: () => (auth.user ? "tok" : null), completePendingGoogleSignIn: async () => null, signOut: () => {},
  onAuthChange: () => () => {},
}));
vi.mock("../src/pwaInstall.js", () => ({ usePwaInstall: () => ({ canInstall: false, install: async () => {}, isIOS: false, installed: false, dismissed: true, dismiss: () => {} }) }));
vi.mock("../src/hubSignIn.js", async (orig) => ({ ...(await orig()), goToHubSignIn: () => {} }));

import QuestionsGenerator from "../src/QuestionsGenerator.jsx";
import { saveWizardDraft, loadWizardDraft, saveJob, loadJob, savePaperSnapshot, loadPaperSnapshot, __resetDraftStoreForTests, WIZARD_KEY } from "../src/draftStore.js";
import { SAMPLE_EXAM } from "./helpers/sampleExam.js";
import { beceSections, getBeceProfile } from "../src/beceStyle.js";

beforeEach(() => {
  auth.user = null;
  localStorage.clear();
  globalThis.indexedDB = new IDBFactory(); __resetDraftStoreForTests();
  window.scrollTo = () => {};
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
});
afterEach(() => { cleanup(); });

const selectFor = (labelText) => {
  const cands = [...document.querySelectorAll("label, span")]
    .filter(el => new RegExp("^" + labelText + "(\\b|\\s|\\*|$)", "i").test(el.textContent.trim()) && !el.querySelector("select"))
    .sort((a, b) => a.textContent.length - b.textContent.length);
  for (const el of cands) {
    let n = el.parentElement;
    for (let i = 0; i < 4 && n; i++, n = n.parentElement) { const s = n.querySelector("select"); if (s) return s; }
  }
  return null;
};
const TOPICS = ["Fractions", "Decimals"];
const seedDraft = (uid = null, extra = {}) => saveWizardDraft({ className: "Basic 7", term: "Term 2", subject: "Mathematics", selectedTopics: TOPICS, difficulty: "Hard", ...extra }, uid);
const paperSnap = (extra = {}) => ({ examData: structuredClone(SAMPLE_EXAM), examTier: "premium", examHasMarkingScheme: true, savedId: "abc", dirty: false, examVersion: "A", openedMeta: null, landscape: false, figuresPending: false, ...extra });

describe("paper setup restored after a refresh", () => {
  it("opens already filled in: class, term, subject and topics survive (the topic picker must not wipe them)", async () => {
    seedDraft();
    render(<QuestionsGenerator />);
    expect(selectFor("Class").value).toBe("Basic 7");
    expect(selectFor("Term").value).toBe("Term 2");
    await waitFor(() => expect(selectFor("Subject")?.value).toBe("Mathematics"));
    await waitFor(() => expect(screen.getByText(/2 selected/)).toBeTruthy());
    expect(screen.getByTestId("recovery-draft").textContent).toMatch(/Basic 7 · Mathematics · 2 topics/);
    // ...and it is still all there a moment later, after every effect has had its turn
    await new Promise(r => setTimeout(r, 150));
    expect(selectFor("Subject").value).toBe("Mathematics");
    expect(screen.getByText(/2 selected/)).toBeTruthy();
  });

  it("'Start fresh' empties the form and removes the stored draft", async () => {
    seedDraft();
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await u.click(screen.getByRole("button", { name: "Start fresh" }));
    expect(selectFor("Class").value).toBe("");
    expect(screen.queryByTestId("recovery-draft")).toBeNull();
    await waitFor(() => expect(localStorage.getItem(WIZARD_KEY)).toBeNull(), { timeout: 3000 });
  });

  it("a teacher with nothing saved sees no banner", () => {
    render(<QuestionsGenerator />);
    expect(screen.queryByTestId("recovery-draft")).toBeNull();
    expect(selectFor("Class").value).toBe("");
  });

  it("changes are saved by themselves, without pressing anything", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await u.selectOptions(selectFor("Class"), "Basic 7");
    await waitFor(() => expect(loadWizardDraft(null)?.fields.className).toBe("Basic 7"), { timeout: 3000 });
  });

  it("a draft from another account is not shown to this one", () => {
    seedDraft("u1");
    auth.user = { id: "u2", email: "b@x.com", name: "Kofi" };
    render(<QuestionsGenerator />);
    expect(selectFor("Class").value).toBe("");
    expect(screen.queryByTestId("recovery-draft")).toBeNull();
  });

  it("a draft made before signing in is picked up after the sign-in redirect", () => {
    seedDraft(null);
    auth.user = { id: "u1", email: "a@x.com", name: "Ama" };
    render(<QuestionsGenerator />);
    expect(selectFor("Class").value).toBe("Basic 7");
  });

  it("an edited section structure is restored as the teacher left it", () => {
    seedDraft(null, { sections: [{ id: "A", label: "Section A: Objective (Multiple Choice)", type: "objective", questionCount: 12, marksPerQuestion: 2, enabled: true }] });
    render(<QuestionsGenerator />);
    expect(document.body.textContent).toMatch(/12/);
    expect(screen.getByDisplayValue("12")).toBeTruthy();
  });
});

describe("restoring must not fight the page\'s own rules", () => {
  it("a BECE-style draft keeps the teacher's edited duration and question counts (the exam-board loader must not overwrite them)", async () => {
    const edited = beceSections(getBeceProfile("Mathematics")).map((sc, i) => ({ ...sc, enabled: true, ...(i === 0 ? { questionCount: 7 } : {}) }));
    saveWizardDraft({ className: "Basic 9", subject: "Mathematics", selectedTopics: ["Algebra"], examStyle: "public", styleChosen: true, durationMinutes: 77, sections: edited }, null);
    render(<QuestionsGenerator />);
    await new Promise(r => setTimeout(r, 300));
    expect(screen.getByDisplayValue("77")).toBeTruthy();
    expect(screen.getByDisplayValue("7")).toBeTruthy();
  });

  it("changing the class after a restore still clears the old subject and topics, as it always did", async () => {
    seedDraft();
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await waitFor(() => expect(selectFor("Subject")?.value).toBe("Mathematics"));
    await u.selectOptions(selectFor("Class"), "Basic 8");
    await waitFor(() => expect(selectFor("Subject").value).toBe(""));
    expect(screen.queryByText(/2 selected/)).toBeNull();
  });
});

describe("the paper itself", () => {
  it("comes back after a refresh, with a notice that it is also in My Exams", async () => {
    auth.user = { id: "u1", email: "a@x.com", name: "Ama" };
    await savePaperSnapshot(paperSnap(), "u1");
    render(<QuestionsGenerator />);
    await waitFor(() => expect(screen.getByTestId("recovery-paper")).toBeTruthy());
    expect(screen.getByTestId("recovery-paper").textContent).toMatch(/safely stored in My Exams/);
    expect(screen.getByText(/CLASS TEST: Ready/)).toBeTruthy();
  });

  it("offers to save a paper that never reached My Exams", async () => {
    auth.user = { id: "u1", email: "a@x.com", name: "Ama" };
    await savePaperSnapshot(paperSnap({ savedId: null, dirty: true }), "u1");
    render(<QuestionsGenerator />);
    await waitFor(() => expect(screen.getByTestId("recovery-paper")).toBeTruthy());
    expect(screen.getByTestId("recovery-paper").textContent).toMatch(/isn't in My Exams yet/);
    expect(screen.getByRole("button", { name: "Save to My Exams" })).toBeTruthy();
  });

  it("flags edits that had not been saved yet", async () => {
    auth.user = { id: "u1", email: "a@x.com", name: "Ama" };
    await savePaperSnapshot(paperSnap({ dirty: true }), "u1");
    render(<QuestionsGenerator />);
    await waitFor(() => expect(screen.getByTestId("recovery-paper")).toBeTruthy());
    expect(screen.getByTestId("recovery-paper").textContent).toMatch(/edits you hadn't saved/);
    expect(screen.getAllByRole("button", { name: "Save changes" }).length).toBeGreaterThan(0);
  });

  it("is never shown to a different account", async () => {
    await savePaperSnapshot(paperSnap(), "u1");
    auth.user = { id: "u2", email: "b@x.com", name: "Kofi" };
    render(<QuestionsGenerator />);
    await new Promise(r => setTimeout(r, 150));
    expect(screen.queryByTestId("recovery-paper")).toBeNull();
    expect(screen.queryByText(/CLASS TEST: Ready/)).toBeNull();
  });

  it("a freshly opened page with no paper does not erase a stored copy that is still being read", async () => {
    auth.user = { id: "u1", email: "a@x.com", name: "Ama" };
    await savePaperSnapshot(paperSnap(), "u1");
    render(<QuestionsGenerator />);
    await new Promise(r => setTimeout(r, 1500)); // longer than the paper autosave delay
    expect((await loadPaperSnapshot("u1"))?.snap.examData.title).toBe("CLASS TEST");
  });
});

describe("an interrupted generation", () => {
  it("is explained, with how far it got and a one-tap way to try again", async () => {
    auth.user = { id: "u1", email: "a@x.com", name: "Ama" };
    seedDraft("u1");
    saveJob({ tier: "premium", total: 5, done: 2 }, "u1");
    render(<QuestionsGenerator />);
    const b = await screen.findByTestId("recovery-interrupted");
    expect(b.textContent).toMatch(/2 of 5 sections/);
    expect(b.textContent).toMatch(/credit balance/);
    expect(screen.getByRole("button", { name: "Generate again" })).toBeTruthy();
  });

  it("says a Free AI run costs nothing", async () => {
    auth.user = { id: "u1", email: "a@x.com", name: "Ama" };
    saveJob({ tier: "free", total: 2, done: 1 }, "u1");
    render(<QuestionsGenerator />);
    expect((await screen.findByTestId("recovery-interrupted")).textContent).toMatch(/Free AI is not charged/);
  });

  it("dismissing it removes the marker for good", async () => {
    auth.user = { id: "u1", email: "a@x.com", name: "Ama" };
    saveJob({ tier: "premium", total: 5, done: 2 }, "u1");
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await screen.findByTestId("recovery-interrupted");
    await u.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("recovery-interrupted")).toBeNull();
    expect(loadJob("u1")).toBeNull();
  });
});

describe("signing out", () => {
  it("wipes this browser's copy and leaves a blank page for the next person", async () => {
    auth.user = { id: "u1", email: "a@x.com", name: "Ama" };
    seedDraft("u1");
    await savePaperSnapshot(paperSnap(), "u1");
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await waitFor(() => expect(screen.getByText(/CLASS TEST: Ready/)).toBeTruthy());
    await u.click(screen.getByRole("button", { name: "Menu" }));
    await u.click(screen.getByRole("menuitem", { name: /Sign out/ }));
    expect(selectFor("Class").value).toBe("");
    expect(screen.queryByText(/CLASS TEST: Ready/)).toBeNull();
    await waitFor(() => expect(localStorage.getItem(WIZARD_KEY)).toBeNull(), { timeout: 3000 });
    expect(await loadPaperSnapshot("u1")).toBeNull();
  });
});


// ── Continuing an interrupted generation, against a fake streaming server ────────────────────────────────────
function fakeStream() {
  const enc = new TextEncoder(); const queue = []; let waiter = null; let ended = false;
  const wake = () => { if (!waiter) return; if (queue.length) { const w = waiter; waiter = null; w({ done: false, value: queue.shift() }); } else if (ended) { const w = waiter; waiter = null; w({ done: true }); } };
  const reader = { read: () => (queue.length ? Promise.resolve({ done: false, value: queue.shift() }) : ended ? Promise.resolve({ done: true }) : new Promise((r) => { waiter = r; })) };
  return { response: { ok: true, status: 200, body: { getReader: () => reader } }, push: (o) => { queue.push(enc.encode(JSON.stringify(o) + "\n")); wake(); }, end: () => { ended = true; wake(); } };
}
const SECTIONS = [
  { id: "A", label: "Section A: Objective", type: "objective", questionCount: 5, marksPerQuestion: 1, enabled: true },
  { id: "B", label: "Section B: Structured", type: "structured", questionCount: 2, marksPerQuestion: 10, enabled: true },
];
const secA = () => structuredClone(SAMPLE_EXAM.sections[0]);
const secB = () => structuredClone(SAMPLE_EXAM.sections[1]);

describe("continuing an interrupted generation", () => {
  let streams, genBodies, saves;
  beforeEach(() => {
    streams = []; genBodies = []; saves = [];
    auth.user = { id: "u1", email: "a@x.com", name: "Ama" };
    saveWizardDraft({ className: "Basic 7", subject: "Mathematics", selectedTopics: ["Fractions"], sections: SECTIONS }, "u1");
    globalThis.fetch = vi.fn(async (url, init) => {
      if (String(url) === "/api/generate-exam") { genBodies.push(JSON.parse(init.body)); return streams.shift().response; }
      if (init?.method === "POST" && String(init.body || "").includes("exam_json")) { saves.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ id: "saved1", deletedCount: 0, max: 10 }) }; }
      return { ok: false, status: 401, json: async () => ({}) };
    });
  });

  it("a refresh after Section A: the page offers to continue, and sends ONLY what is missing", async () => {
    const u = userEvent.setup();
    const s1 = fakeStream(); streams.push(s1);
    const first = render(<QuestionsGenerator />);
    await u.click(screen.getByRole("button", { name: /Premium AI/ }));
    await waitFor(() => expect(genBodies.length).toBe(1));
    s1.push({ type: "progress", sectionId: "A", sectionLabel: "Section A: Objective", index: 1, total: 2 });
    s1.push({ type: "section-done", sectionId: "A", questionCount: 5, section: secA(), title: "CLASS TEST", instructions: ["Answer all questions."] });
    await waitFor(() => expect(loadJob("u1")?.sections?.length).toBe(1));   // Section A is safely kept
    first.unmount();                                                         // the page is refreshed mid-run (the stream never finishes)

    const s2 = fakeStream(); streams.push(s2);
    render(<QuestionsGenerator />);
    const banner = await screen.findByTestId("recovery-interrupted");
    expect(banner.textContent).toMatch(/1 of 2 sections were written and kept/);
    expect(banner.textContent).toMatch(/charges credits for those alone/);

    s2.push({ type: "progress", sectionId: "B", sectionLabel: "Section B: Structured", index: 2, total: 2 });
    s2.push({ type: "section-done", sectionId: "B", questionCount: 2, section: secB() });
    s2.push({ type: "done", examData: { title: "", instructions: [], sections: [secB()], answerKey: [] }, creditsRemaining: 10, includeMarkingScheme: true, tier: "premium", continued: true });
    s2.end();
    await u.click(screen.getByRole("button", { name: /Continue \(1 section left\)/ }));

    await waitFor(() => expect(genBodies.length).toBe(2));
    expect(genBodies[1].skipSectionIds).toEqual(["A"]);
    const { skipSectionIds, ...rest } = genBodies[1];
    expect(rest).toEqual(genBodies[0]);                                      // identical settings: only the continuation differs

    await waitFor(() => expect(screen.getByText(/CLASS TEST: Ready/)).toBeTruthy());   // title kept from the first run
    await waitFor(() => expect(saves.length).toBe(1));
    expect(saves[0].exam_json.sections.map((x) => x.id)).toEqual(["A", "B"]);          // the paper is whole again, in order
    expect(saves[0].exam_json.answerKey).toEqual([1, 2, 3, 4, 5].map((n) => ({ number: n, answer: "A" })));
    expect(loadJob("u1")).toBeNull();                                        // nothing left to continue
  });

  it("if the settings changed since, continuing is not offered (the kept sections would not match)", async () => {
    saveJob({ tier: "premium", total: 2, done: 1, key: "not-the-current-settings", title: "T", instructions: [], sections: [secA()] }, "u1");
    render(<QuestionsGenerator />);
    const banner = await screen.findByTestId("recovery-interrupted");
    expect(banner.textContent).toMatch(/settings have changed/);
    expect(screen.queryByRole("button", { name: /Continue/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Generate again" })).toBeTruthy();
  });

  it("a run that stops part-way (no refresh) keeps the finished sections and offers Continue", async () => {
    const u = userEvent.setup();
    const s1 = fakeStream(); streams.push(s1);
    render(<QuestionsGenerator />);
    await u.click(screen.getByRole("button", { name: /Premium AI/ }));
    await waitFor(() => expect(genBodies.length).toBe(1));
    s1.push({ type: "section-done", sectionId: "A", questionCount: 5, section: secA(), title: "CLASS TEST", instructions: [] });
    s1.push({ type: "error", message: "The AI had a hiccup.", creditsRemaining: 10 });
    s1.end();
    const banner = await screen.findByTestId("recovery-interrupted");
    expect(banner.textContent).toMatch(/1 of 2 sections were written and kept/);
    expect(screen.getByText(/stopped part-way/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue \(1 section left\)/ })).toBeTruthy();
    expect(loadJob("u1")?.sections?.length).toBe(1);
  });

  it("a run that fails before writing anything just offers 'Generate again'", async () => {
    const u = userEvent.setup();
    const s1 = fakeStream(); streams.push(s1);
    render(<QuestionsGenerator />);
    await u.click(screen.getByRole("button", { name: /Premium AI/ }));
    await waitFor(() => expect(genBodies.length).toBe(1));
    s1.push({ type: "error", message: "Down.", creditsRemaining: 10 }); s1.end();
    await waitFor(() => expect(screen.getByText(/Down\./)).toBeTruthy());
    expect(screen.queryByTestId("recovery-interrupted")).toBeNull();
    expect(loadJob("u1")).toBeNull();
  });
});

describe("the 'welcome back' note", () => {
  it("fades by itself after a few seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      seedDraft();
      render(<QuestionsGenerator />);
      expect(screen.getByTestId("recovery-draft")).toBeTruthy();
      await act(async () => { vi.advanceTimersByTime(12500); });
      expect(screen.queryByTestId("recovery-draft")).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});


describe("the banner's own buttons", () => {
  let saves, updates;
  beforeEach(() => {
    saves = []; updates = [];
    auth.user = { id: "u1", email: "a@x.com", name: "Ama" };
    globalThis.fetch = vi.fn(async (url, init) => {
      if (init?.method === "POST" && String(init.body || "").includes("exam_json")) { saves.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ id: "saved9", deletedCount: 0, max: 10 }) }; }
      if (init?.method === "PUT") { updates.push({ url: String(url), body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
      return { ok: false, status: 401, json: async () => ({}) };
    });
  });

  it("'Save to My Exams' files a recovered, never-saved paper, then the notice goes away", async () => {
    await savePaperSnapshot(paperSnap({ savedId: null, dirty: true }), "u1");
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    const banner = await screen.findByTestId("recovery-paper");
    await u.click(within(banner).getByRole("button", { name: "Save to My Exams" }));
    await waitFor(() => expect(saves.length).toBe(1));
    expect(saves[0].exam_json.title).toBe("CLASS TEST");
    await waitFor(() => expect(screen.queryByTestId("recovery-paper")).toBeNull());
  });

  it("'Save changes' updates the copy in My Exams for a recovered paper with unsaved edits", async () => {
    await savePaperSnapshot(paperSnap({ savedId: "abc", dirty: true }), "u1");
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    const banner = await screen.findByTestId("recovery-paper");
    await u.click(within(banner).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updates.length).toBe(1));
    expect(updates[0].url).toMatch(/abc/);
    expect(updates[0].body.exam_json.title).toBe("CLASS TEST");
    await waitFor(() => expect(screen.queryByTestId("recovery-paper")).toBeNull());
  });
});

describe("leaving the page", () => {
  const leave = () => { const ev = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(ev); return ev.defaultPrevented; };

  it("asks first while a generation is running (it cannot be recovered), and not otherwise", async () => {
    auth.user = { id: "u1", email: "a@x.com", name: "Ama" };
    saveWizardDraft({ className: "Basic 7", subject: "Mathematics", selectedTopics: ["Fractions"], sections: [{ id: "A", label: "Section A: Objective", type: "objective", questionCount: 5, marksPerQuestion: 1, enabled: true }] }, "u1");
    const never = new Promise(() => {});   // a generation that never answers
    globalThis.fetch = vi.fn(async (url) => (String(url) === "/api/generate-exam" ? never : { ok: false, status: 401, json: async () => ({}) }));
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    expect(leave()).toBe(false);                                           // idle: leave freely
    await u.click(screen.getByRole("button", { name: /Premium AI/ }));
    await waitFor(() => expect(leave()).toBe(true));                        // running: ask first
  });

  it("does not nag about a recovered paper that is safely stored", async () => {
    auth.user = { id: "u1", email: "a@x.com", name: "Ama" };
    await savePaperSnapshot(paperSnap(), "u1");
    render(<QuestionsGenerator />);
    await screen.findByTestId("recovery-paper");
    expect(leave()).toBe(false);
  });
});

describe("a paper refreshed while the AI was still drawing its figures", () => {
  it("picks the drawing up again instead of leaving the figures blank", async () => {
    auth.user = { id: "u1", email: "a@x.com", name: "Ama" };
    const exam = structuredClone(SAMPLE_EXAM);
    exam.sections[0].questions[0].diagram = { needed: true, description: "A triangle ABC with a right angle at B" };
    const drawRequests = [];
    globalThis.fetch = vi.fn(async (url, init) => {
      if (String(url) === "/api/generate-exam") {
        const body = JSON.parse(init.body);
        if (body.mode === "draw-figure") { drawRequests.push(body); return { ok: true, status: 200, json: async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3" fill="none" stroke="#000"/></svg>' }) }; }
      }
      return { ok: false, status: 401, json: async () => ({}) };
    });
    saveWizardDraft({ className: "Basic 7", subject: "Mathematics", selectedTopics: ["Geometry"] }, "u1");
    await savePaperSnapshot(paperSnap({ examData: exam, figuresPending: true }), "u1");
    render(<QuestionsGenerator />);
    await waitFor(() => expect(drawRequests.length).toBe(1), { timeout: 3000 });
    expect(drawRequests[0]).toMatchObject({ mode: "draw-figure", subject: "Mathematics", className: "Basic 7" });
    expect(drawRequests[0].description).toMatch(/triangle ABC/);
  });

  it("does NOT redraw anything for an ordinary recovered paper", async () => {
    auth.user = { id: "u1", email: "a@x.com", name: "Ama" };
    const exam = structuredClone(SAMPLE_EXAM);
    exam.sections[0].questions[0].diagram = { needed: true, description: "A triangle ABC" };
    const calls = [];
    globalThis.fetch = vi.fn(async (url, init) => { if (String(url) === "/api/generate-exam") calls.push(JSON.parse(init.body)); return { ok: false, status: 401, json: async () => ({}) }; });
    await savePaperSnapshot(paperSnap({ examData: exam, figuresPending: false }), "u1");
    render(<QuestionsGenerator />);
    await screen.findByTestId("recovery-paper");
    await new Promise(r => setTimeout(r, 300));
    expect(calls.filter(c => c.mode === "draw-figure")).toHaveLength(0);
  });
});
