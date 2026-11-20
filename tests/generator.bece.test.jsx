// @vitest-environment jsdom
// The BECE style flow inside the real generator screen: JHS class -> subject -> BECE style.
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

async function openJhsSubject(u, cls, subject) {
  await u.selectOptions(selectFor("Class"), cls);
  await u.selectOptions(selectFor("Subject"), subject);
}

describe("BECE style in the generator screen", () => {
  it("Basic 9 offers BECE style (not WASSCE); picking it loads the real Mathematics structure, Paper 2 then Paper 1", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await openJhsSubject(u, "Basic 9", "Mathematics");
    expect(screen.queryByRole("button", { name: /WASSCE style/i })).toBeNull();
    await u.click(await screen.findByRole("button", { name: /BECE style/i }));
    await waitFor(() => expect(pageText()).toMatch(/Paper 2 \(Essay\):\s*60 marks/));
    expect(pageText()).toMatch(/Paper 1 \(Objective\):\s*40 questions/);
    expect(pageText()).toMatch(/real BECE papers/);
    expect(pageText()).toMatch(/Paper 2, then Paper 1/);
  });
  it("changing subject reloads the BECE structure (Mathematics -> Integrated Science)", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await openJhsSubject(u, "Basic 9", "Mathematics");
    await u.click(await screen.findByRole("button", { name: /BECE style/i }));
    await waitFor(() => expect(pageText()).toMatch(/Paper 2 \(Essay\):\s*60 marks/));
    await u.selectOptions(selectFor("Subject"), "Science");
    await waitFor(() => expect(pageText()).toMatch(/Paper 2 \(Essay\):\s*100 marks/));
  });
});
