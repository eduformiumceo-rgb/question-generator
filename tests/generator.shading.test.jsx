// @vitest-environment jsdom
// The shading-sheet option inside the real generator screen: it appears once a subject is chosen,
// follows the level (BECE for JHS, WASSCE for SHS), and opens an A4-landscape, two-per-page sheet.
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
  window.history.replaceState(null, "", window.location.pathname);   // each test starts on a clean address (tab lives in the hash)
  window.scrollTo = () => {};
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

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
const openShadingTab = (u) => u.click(screen.getAllByRole("tab", { name: /Shading Sheet/i })[0]);
const pageText = () => document.body.textContent.replace(/\s+/g, " ");

describe("Shading sheet option in the generator screen", () => {
  it("lives on its own Shading Sheet tab, not inside the Assessment form", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    expect(screen.queryByTestId("shading-card")).toBeNull();           // Assessment tab is showing
    await openShadingTab(u);
    const tab = await screen.findByTestId("shading-tab");
    expect(tab.textContent).toMatch(/Choose a class/);                 // nothing to set up until a class is chosen
    expect(screen.queryByTestId("shading-card")).toBeNull();
    expect(screen.getAllByRole("tab", { name: /Shading Sheet/i })[0].getAttribute("aria-selected")).toBe("true");
  });

  it("the three tabs switch between Assessment, Shading Sheet and My Assessments", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map(t => t.textContent.replace(/\d+$/, ""))).toEqual(["Assessment", "Shading Sheet", "My Assessments"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    await u.click(tabs[1]);
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    await u.click(tabs[0]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByTestId("shading-card")).toBeNull();
  });

  it("SHS: appears after the subject, defaults to the WASSCE-type sheet with school colours, and prints two per A4 landscape", async () => {
    const u = userEvent.setup();
    const w = { document: { open: vi.fn(), write: vi.fn(), close: vi.fn() }, closed: false, __paperReady: true, print: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(w);
    render(<QuestionsGenerator />);
    await u.selectOptions(selectFor("Class"), "SHS 3");
    await u.selectOptions(selectFor("Programme"), "General Science");
    await u.selectOptions(selectFor("Subject"), "Biology (GS)");
    await openShadingTab(u);
    const card = await screen.findByTestId("shading-card");
    expect(card.textContent).toMatch(/Sheet Layout/);
    expect(screen.getByRole("button", { name: /WASSCE-type sheet/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^School colours$/i }).getAttribute("aria-pressed")).toBe("true");
    expect(card.textContent).toMatch(/148\.5 × 210 mm/);
    expect(card.textContent).toMatch(/A4 landscape/);
    await u.click(screen.getByRole("button", { name: /Preview & print shading sheet/i }));
    const html = (await screen.findByTitle("Shading sheet preview")).getAttribute("srcdoc");   // preview first; printing happens from the preview window
    expect(html).toContain("@page{size:297mm 210mm;margin:0}");
    expect(html).toContain('data-sheet-style="wassce"');
    expect((html.match(/<div class="card st-wassce">/g) || []).length).toBe(2);
  });

  it("Basic 9 (JHS 3): defaults to the BECE-type sheet in school colours (v11), black-and-white is one tap away, and the style can be switched", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await u.selectOptions(selectFor("Class"), "Basic 9");
    await u.selectOptions(selectFor("Subject"), "Mathematics");
    await openShadingTab(u);
    await screen.findByTestId("shading-card");
    expect(screen.getByRole("button", { name: /BECE-type sheet/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^School colours$/i }).getAttribute("aria-pressed")).toBe("true");
    await u.click(screen.getByRole("button", { name: /Black & white/i }));
    expect(screen.getByRole("button", { name: /Black & white/i }).getAttribute("aria-pressed")).toBe("true");
    await u.click(screen.getByRole("button", { name: /WASSCE-type sheet/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^School colours$/i }).getAttribute("aria-pressed")).toBe("true"));
  });
});
