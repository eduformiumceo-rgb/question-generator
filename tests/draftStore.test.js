// @vitest-environment jsdom
// The storage layer behind refresh / crash recovery. These tests pin the promises that make it safe to ship:
// bad data can't crash the page, one account never sees another's work, old drafts expire, and every failure is silent.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  DRAFT_TTL_MS, JOB_TTL_MS, WIZARD_KEY, JOB_KEY, userKey, sanitizeWizard, isMeaningfulWizard,
  saveWizardDraft, loadWizardDraft, saveJob, loadJob, fingerprint, stableStringify,
  savePaperSnapshot, loadPaperSnapshot, clearPaperSnapshot, clearAllDrafts, markRestoreAttempt, clearRestoreAttempt,
  __resetDraftStoreForTests,
} from "../src/draftStore.js";
import { SAMPLE_EXAM } from "./helpers/sampleExam.js";
import { beceSections, getBeceProfile } from "../src/beceStyle.js";

const NOW = 1_800_000_000_000;
const snap = (extra = {}) => ({ examData: structuredClone(SAMPLE_EXAM), examTier: "premium", examHasMarkingScheme: true, savedId: "abc", dirty: false, examVersion: "A", openedMeta: null, landscape: false, figuresPending: false, ...extra });
const sections = () => [
  { id: "A", label: "Section A: Objective (Multiple Choice)", type: "objective", questionCount: 20, marksPerQuestion: 1, enabled: true },
  { id: "B", label: "Section B: Structured / Theory", type: "structured", questionCount: 5, marksPerQuestion: 10, enabled: true },
];

beforeEach(() => { localStorage.clear(); globalThis.indexedDB = new IDBFactory(); __resetDraftStoreForTests(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("userKey", () => {
  it("uses the account id, then sub, then email; null when nobody is signed in", () => {
    expect(userKey({ id: "u1", email: "a@x.com" })).toBe("u1");
    expect(userKey({ sub: 7 })).toBe("7");
    expect(userKey({ email: "a@x.com" })).toBe("a@x.com");
    expect(userKey(null)).toBeNull();
    expect(userKey({})).toBeNull();
  });
});

describe("sanitizeWizard: never trust what comes out of storage", () => {
  it("keeps good values and drops unknown keys", () => {
    const out = sanitizeWizard({ className: "Basic 7", subject: "Mathematics", selectedTopics: ["Fractions"], hacked: "x", difficulty: "Hard" });
    expect(out).toEqual({ className: "Basic 7", subject: "Mathematics", selectedTopics: ["Fractions"], difficulty: "Hard" });
  });
  it("drops only the bad field, not the whole draft", () => {
    const out = sanitizeWizard({ className: "Basic 7", difficulty: "Impossible", languageStyle: 5, durationMinutes: "60", allowDiagrams: "yes" });
    expect(out).toEqual({ className: "Basic 7" });
  });
  it("caps lengths and counts to the real limits", () => {
    const out = sanitizeWizard({ className: "x".repeat(500), selectedTopics: Array.from({ length: 80 }, (_, i) => `t${i}`), pastedSyllabus: "y".repeat(100000) });
    expect(out.className.length).toBe(40);
    expect(out.selectedTopics.length).toBe(40);
    expect(out.pastedSyllabus.length).toBe(60000);
  });
  it("only accepts the three real cognitive levels, once each", () => {
    expect(sanitizeWizard({ className: "B1", cognitiveLevels: ["Recall", "Recall", "Hacking", "Critical Thinking"] }).cognitiveLevels).toEqual(["Recall", "Critical Thinking"]);
  });
  it("rejects non-objects", () => {
    for (const bad of [null, undefined, 5, "x", [], [1, 2]]) expect(sanitizeWizard(bad)).toBeNull();
  });
  it("drops sections that are not valid, keeps the valid ones", () => {
    const out = sanitizeWizard({ className: "B1", sections: [...sections(), { id: "Z", type: "bogus", questionCount: 1, marksPerQuestion: 1 }, { id: "Q", type: "essay", questionCount: 9999, marksPerQuestion: 1 }, "junk", null] });
    expect(out.sections.map((s) => s.id)).toEqual(["A", "B"]);
  });
  it("cannot be used for prototype pollution", () => {
    const evil = JSON.parse('{"className":"B1","sections":[{"id":"A","type":"objective","questionCount":1,"marksPerQuestion":1,"__proto__":{"polluted":true},"constructor":{"x":1}}]}');
    const out = sanitizeWizard(evil);
    expect(({}).polluted).toBeUndefined();
    expect(Object.keys(out.sections[0])).not.toContain("constructor");
    expect(out.sections[0].polluted).toBeUndefined();
  });
  it("a real BECE section set survives the round trip unchanged (the teacher's edits keep their exam-board fields)", () => {
    const real = beceSections(getBeceProfile("Mathematics")).map((s) => ({ ...s, enabled: true }));
    const out = sanitizeWizard({ className: "Basic 9", examStyle: "public", sections: real });
    expect(out.sections).toEqual(real);
  });
  it("an untouched wizard is not 'meaningful'", () => {
    expect(isMeaningfulWizard({ difficulty: "Hard" })).toBe(false);
    expect(isMeaningfulWizard({ className: "Basic 7" })).toBe(true);
    expect(isMeaningfulWizard({ pastedSyllabus: "  \n " })).toBe(false);
    expect(isMeaningfulWizard({ pastedSyllabus: "Fractions" })).toBe(true);
  });
});

describe("wizard draft", () => {
  it("round-trips for the same signed-in account", () => {
    expect(saveWizardDraft({ className: "Basic 7", subject: "Mathematics", sections: sections() }, "u1", NOW)).toBe(true);
    const d = loadWizardDraft("u1", NOW + 1000);
    expect(d.fields.className).toBe("Basic 7");
    expect(d.fields.sections).toHaveLength(2);
  });
  it("a draft made before signing in is adopted by whoever signs in (the Google / Hub redirect case)", () => {
    saveWizardDraft({ className: "Basic 7" }, null, NOW);
    expect(loadWizardDraft("u1", NOW + 1000).fields.className).toBe("Basic 7");
    expect(loadWizardDraft(null, NOW + 1000).fields.className).toBe("Basic 7");
  });
  it("another account on the same computer never sees it, and it is deleted", () => {
    saveWizardDraft({ className: "Basic 7" }, "u1", NOW);
    expect(loadWizardDraft("u2", NOW + 1000)).toBeNull();
    expect(localStorage.getItem(WIZARD_KEY)).toBeNull();
    expect(loadWizardDraft("u1", NOW + 1000)).toBeNull(); // gone for the owner too: it was removed, never shown to u2
  });
  it("expires after 7 days, counted from the last change", () => {
    saveWizardDraft({ className: "Basic 7" }, "u1", NOW);
    expect(loadWizardDraft("u1", NOW + DRAFT_TTL_MS - 1000)).not.toBeNull();
    saveWizardDraft({ className: "Basic 7" }, "u1", NOW);
    expect(loadWizardDraft("u1", NOW + DRAFT_TTL_MS + 1000)).toBeNull();
    expect(localStorage.getItem(WIZARD_KEY)).toBeNull();
  });
  it("ignores a draft from the future (clock changes)", () => {
    saveWizardDraft({ className: "Basic 7" }, "u1", NOW + 3_600_000);
    expect(loadWizardDraft("u1", NOW)).toBeNull();
  });
  it("saving an emptied wizard removes the draft instead of keeping a blank one", () => {
    saveWizardDraft({ className: "Basic 7" }, "u1", NOW);
    expect(saveWizardDraft({ className: "", subject: "", selectedTopics: [], pastedSyllabus: "" }, "u1", NOW)).toBe(false);
    expect(localStorage.getItem(WIZARD_KEY)).toBeNull();
  });
  it("survives corrupted or old-version data without throwing", () => {
    localStorage.setItem(WIZARD_KEY, "{not json");
    expect(loadWizardDraft("u1", NOW)).toBeNull();
    localStorage.setItem(WIZARD_KEY, JSON.stringify({ v: 999, ts: NOW, uid: null, fields: { className: "B1" } }));
    expect(loadWizardDraft("u1", NOW)).toBeNull();
    localStorage.setItem(WIZARD_KEY, JSON.stringify({ v: 1, ts: NOW, uid: null, fields: "garbage" }));
    expect(loadWizardDraft("u1", NOW)).toBeNull();
  });
  it("never throws when storage is blocked or full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    expect(saveWizardDraft({ className: "Basic 7" }, "u1", NOW)).toBe(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(loadWizardDraft("u1", NOW)).toBeNull();
  });
});

describe("generation job marker", () => {
  it("round-trips for the same account only", () => {
    saveJob({ tier: "premium", total: 5, done: 2 }, "u1", NOW);
    expect(loadJob("u1", NOW + 1000)).toMatchObject({ tier: "premium", total: 5, done: 2 });
    expect(loadJob("u2", NOW + 1000)).toBeNull();
  });
  it("needs a signed-in account (a run can't start without one)", () => {
    saveJob({ tier: "free", total: 1, done: 0 }, null, NOW);
    expect(loadJob(null, NOW + 1000)).toBeNull();
  });
  it("is only meaningful for 30 minutes", () => {
    saveJob({ tier: "premium", total: 5, done: 2 }, "u1", NOW);
    expect(loadJob("u1", NOW + JOB_TTL_MS + 1000)).toBeNull();
    expect(localStorage.getItem(JOB_KEY)).toBeNull();
  });
  it("clamps nonsense numbers", () => {
    saveJob({ tier: "weird", total: 99999, done: -4 }, "u1", NOW);
    expect(loadJob("u1", NOW)).toMatchObject({ tier: "premium", total: 50, done: 0 });
  });
});

const heldSection = (id, n = 2) => ({ id, label: `Section ${id}`, questions: Array.from({ length: n }, (_, i) => ({ number: i + 1, text: `Q${i + 1}`, marks: 1 })) });

describe("settings fingerprint (is 'continue' safe?)", () => {
  it("is the same for the same settings whatever the key order", () => {
    expect(fingerprint({ a: 1, b: { c: [1, 2], d: "x" } })).toBe(fingerprint({ b: { d: "x", c: [1, 2] }, a: 1 }));
    expect(stableStringify({ b: undefined, a: 1 })).toBe(stableStringify({ a: 1 }));
  });
  it("changes when any setting changes (topics, counts, order of a list)", () => {
    const base = { topics: ["Fractions", "Decimals"], sections: [{ id: "A", questionCount: 5 }] };
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, topics: ["Fractions"] }));
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, topics: ["Decimals", "Fractions"] }));
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, sections: [{ id: "A", questionCount: 6 }] }));
  });
  it("is short and stable", () => {
    expect(fingerprint({ x: 1 })).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprint({ x: 1 })).toBe(fingerprint({ x: 1 }));
  });
});

describe("generation job keeps the finished sections so the run can be continued", () => {
  it("round-trips the sections, the title and the settings fingerprint", () => {
    saveJob({ tier: "premium", total: 3, done: 2, key: "abc123", title: "CLASS TEST", instructions: ["Answer all."], sections: [heldSection("A"), heldSection("B")] }, "u1", NOW);
    const j = loadJob("u1", NOW + 1000);
    expect(j.sections.map((x) => x.id)).toEqual(["A", "B"]);
    expect(j).toMatchObject({ key: "abc123", title: "CLASS TEST", instructions: ["Answer all."], done: 2, total: 3 });
  });
  it("drops sections that are not sections, and keeps nothing at all without a fingerprint", () => {
    saveJob({ tier: "premium", total: 3, done: 1, key: "k", sections: [heldSection("A"), { id: "B" }, "junk", { id: "C", questions: [] }, { id: "WAYTOOLONGID", questions: [{ number: 1 }] }] }, "u1", NOW);
    expect(loadJob("u1", NOW).sections.map((x) => x.id)).toEqual(["A"]);
    saveJob({ tier: "premium", total: 3, done: 1, sections: [heldSection("A")] }, "u1", NOW);
    expect(loadJob("u1", NOW).sections).toBeUndefined();
  });
  it("refuses to keep sections that are too big for localStorage (the run is still explained, just not continuable)", () => {
    const big = heldSection("A", 1); big.questions[0].text = "x".repeat(450000);
    saveJob({ tier: "premium", total: 3, done: 1, key: "k", sections: [big] }, "u1", NOW);
    const j = loadJob("u1", NOW);
    expect(j.sections).toBeUndefined();
    expect(j).toMatchObject({ tier: "premium", total: 3, done: 1 });
  });
  it("re-validates what it reads back, so a tampered record cannot inject a bad section", () => {
    localStorage.setItem(JOB_KEY, JSON.stringify({ v: 1, ts: NOW, uid: "u1", job: { tier: "premium", total: 3, done: 1, key: "k", sections: [{ id: "A", questions: "no" }] } }));
    expect(loadJob("u1", NOW).sections).toBeUndefined();
  });
});

describe("paper snapshot (IndexedDB)", () => {
  it("round-trips the paper with its save state", async () => {
    expect(await savePaperSnapshot(snap({ dirty: true, examVersion: "B" }), "u1", NOW)).toBe(true);
    const got = await loadPaperSnapshot("u1", NOW + 1000);
    expect(got.snap.examData.title).toBe("CLASS TEST");
    expect(got.snap).toMatchObject({ savedId: "abc", dirty: true, examVersion: "B", examTier: "premium" });
  });
  it("is private to the account that made it, and removed when someone else asks", async () => {
    await savePaperSnapshot(snap(), "u1", NOW);
    expect(await loadPaperSnapshot("u2", NOW + 1000)).toBeNull();
    expect(await loadPaperSnapshot("u1", NOW + 1000)).toBeNull();
  });
  it("is not restorable without a signed-in account", async () => {
    await savePaperSnapshot(snap(), "u1", NOW);
    expect(await loadPaperSnapshot(null, NOW + 1000)).toBeNull();
  });
  it("expires after 7 days", async () => {
    await savePaperSnapshot(snap(), "u1", NOW);
    expect(await loadPaperSnapshot("u1", NOW + DRAFT_TTL_MS + 1000)).toBeNull();
  });
  it("refuses something that is not a paper", async () => {
    expect(await savePaperSnapshot(snap({ examData: { sections: [] } }), "u1", NOW)).toBe(false);
    expect(await savePaperSnapshot(snap({ examData: { sections: [{ questions: "no" }] } }), "u1", NOW)).toBe(false);
    expect(await savePaperSnapshot(null, "u1", NOW)).toBe(false);
  });
  it("keeps the newest copy only, and clear removes it", async () => {
    await savePaperSnapshot(snap({ savedId: "one" }), "u1", NOW);
    await savePaperSnapshot(snap({ savedId: "two" }), "u1", NOW + 10);
    expect((await loadPaperSnapshot("u1", NOW + 20)).snap.savedId).toBe("two");
    await clearPaperSnapshot();
    expect(await loadPaperSnapshot("u1", NOW + 30)).toBeNull();
  });
  it("falls back to localStorage when IndexedDB is unavailable, and still round-trips", async () => {
    globalThis.indexedDB = undefined; __resetDraftStoreForTests();
    expect(await savePaperSnapshot(snap(), "u1", NOW)).toBe(true);
    expect(localStorage.getItem("eduq.paper.v1")).toBeTruthy();
    expect((await loadPaperSnapshot("u1", NOW + 1000)).snap.examData.title).toBe("CLASS TEST");
  });
  it("the fallback refuses a paper too big for localStorage instead of throwing", async () => {
    globalThis.indexedDB = undefined; __resetDraftStoreForTests();
    const big = snap(); big.examData.sections[0].questions[0].text = "x".repeat(2_000_000);
    expect(await savePaperSnapshot(big, "u1", NOW)).toBe(false);
  });
  it("reports false (and never throws) when nothing can be stored", async () => {
    globalThis.indexedDB = undefined; __resetDraftStoreForTests();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    expect(await savePaperSnapshot(snap(), "u1", NOW)).toBe(false);
  });
});

describe("crash-loop guard", () => {
  it("one interrupted restore (e.g. a quick double refresh) still restores the paper", async () => {
    await savePaperSnapshot(snap(), "u1", Date.now());
    markRestoreAttempt();
    expect(await loadPaperSnapshot("u1")).not.toBeNull();
  });
  it("two restores in a row that never finished rendering discard the paper instead of looping", async () => {
    await savePaperSnapshot(snap(), "u1", Date.now());
    markRestoreAttempt(); markRestoreAttempt();
    expect(await loadPaperSnapshot("u1")).toBeNull();
    // ...and the guard resets, so the next paper the teacher makes is restorable again
    await savePaperSnapshot(snap(), "u1", Date.now());
    expect(await loadPaperSnapshot("u1")).not.toBeNull();
  });
  it("a restore that rendered fine clears the marker", async () => {
    await savePaperSnapshot(snap(), "u1", Date.now());
    markRestoreAttempt(); clearRestoreAttempt(); markRestoreAttempt();
    expect(await loadPaperSnapshot("u1")).not.toBeNull();
  });
});

describe("clearAllDrafts (sign-out)", () => {
  it("removes the draft, the job marker and the paper copy", async () => {
    saveWizardDraft({ className: "Basic 7" }, "u1");
    saveJob({ tier: "premium", total: 3, done: 1 }, "u1");
    await savePaperSnapshot(snap(), "u1");
    await clearAllDrafts();
    expect(loadWizardDraft("u1")).toBeNull();
    expect(loadJob("u1")).toBeNull();
    expect(await loadPaperSnapshot("u1")).toBeNull();
    expect(localStorage.getItem("eduq.paper.v1")).toBeNull();
  });
});
