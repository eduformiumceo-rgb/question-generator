// @vitest-environment jsdom
// The WASSCE style flow inside the real generator screen: SHS class -> programme -> subject -> WASSCE style.
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../src/auth.js", () => ({
  getUser: () => null, getToken: () => null, completePendingGoogleSignIn: async () => null, signOut: async () => {},
  onAuthChange: () => () => {},
}));
vi.mock("../src/pwaInstall.js", () => ({ usePwaInstall: () => ({ canInstall: false, install: async () => {}, isIOS: false, installed: false, dismissed: true, dismiss: () => {} }) }));
vi.mock("../src/hubSignIn.js", () => ({ goToHubSignIn: () => {} }));

import QuestionsGenerator from "../src/QuestionsGenerator.jsx";

beforeEach(() => {
  window.scrollTo = () => {};
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
});
afterEach(() => { cleanup(); localStorage.clear(); });

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
const pageText = () => document.body.textContent.replace(/\s+/g, " ");

async function openSubject(u, cls, programme, subject) {
  await u.selectOptions(selectFor("Class"), cls);
  await u.selectOptions(selectFor("Programme"), programme);
  await u.selectOptions(selectFor("Subject"), subject);
}

describe("WASSCE style in the generator screen", () => {
  it("SHS class offers WASSCE style; picking it loads the real Biology structure (Paper 1 then Paper 2)", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await openSubject(u, "SHS 3", "General Science", "Biology (GS)");
    const btn = await screen.findByRole("button", { name: /WASSCE style/i });
    await u.click(btn);
    await waitFor(() => expect(pageText()).toMatch(/Paper 1 \(Objective\):\s*50 questions/));
    expect(pageText()).toMatch(/Paper 2 \(Essay\):\s*70 marks/);
    expect(pageText()).toMatch(/real WASSCE paper format/);
    expect(pageText()).toMatch(/Paper 1, then Paper 2/);
  });

  it("a 2&1 subject lists Paper 2 first (Chemistry)", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await openSubject(u, "SHS 3", "General Science", "Chemistry (GS)");
    await u.click(await screen.findByRole("button", { name: /WASSCE style/i }));
    await waitFor(() => expect(pageText()).toMatch(/Paper 2 \(Essay\):\s*100 marks/));
    expect(pageText()).toMatch(/Paper 2, then Paper 1/);
  });

  it("changing subject reloads the structure (Biology -> Physics)", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await openSubject(u, "SHS 3", "General Science", "Biology (GS)");
    await u.click(await screen.findByRole("button", { name: /WASSCE style/i }));
    await waitFor(() => expect(pageText()).toMatch(/Paper 2 \(Essay\):\s*70 marks/));
    await u.selectOptions(selectFor("Subject"), "Physics (GS)");
    await waitFor(() => expect(pageText()).toMatch(/Paper 2 \(Essay\):\s*60 marks/));
    expect(pageText()).toMatch(/Paper 1 \(Objective\):\s*50 questions/);
  });

  it("a subject with no official structure shows the check-it notice", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await openSubject(u, "SHS 3", "Technical", "Woodwork");
    await u.click(await screen.findByRole("button", { name: /WASSCE style/i }));
    await waitFor(() => expect(pageText()).toMatch(/No official WASSCE paper structure is on file/));
  });

  it("a Basic (JHS) class still shows BECE style, never WASSCE", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await u.selectOptions(selectFor("Class"), "Basic 9");
    const btn = await screen.findByRole("button", { name: /BECE style/i });
    expect(btn).toBeTruthy();
    expect(screen.queryByRole("button", { name: /WASSCE style/i })).toBeNull();
  });
});
