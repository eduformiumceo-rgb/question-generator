// @vitest-environment jsdom
// Navigation of Assessment Studio: three tabs that live in the address, a Shading Sheet tab that can never disturb the paper form,
// and a theme-proof, accessible active colour.
import React from "react";
import fs from "fs";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../src/auth.js", () => ({
  getUser: () => null, getToken: () => null, completePendingGoogleSignIn: async () => null, signOut: async () => {},
  onAuthChange: () => () => {},
}));
vi.mock("../src/pwaInstall.js", () => ({ usePwaInstall: () => ({ canInstall: false, install: async () => {}, isIOS: false, installed: false, dismissed: true, dismiss: () => {} }) }));
vi.mock("../src/hubSignIn.js", () => ({ goToHubSignIn: () => {} }));

import QuestionsGenerator from "../src/QuestionsGenerator.jsx";

beforeEach(() => {
  window.history.replaceState(null, "", window.location.pathname);
  window.scrollTo = () => {};
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

const tab = (name) => screen.getAllByRole("tab", { name })[0];
const wizardClass = () => document.querySelector(".qa-flow select");   // first select inside the Assessment form is the Class select

describe("tabs live in the address", () => {
  it("opens straight on the Shading Sheet tab from #shading, and on Assessment with no hash", async () => {
    window.location.hash = "#shading";
    render(<QuestionsGenerator />);
    expect(tab(/Shading Sheet/).getAttribute("aria-selected")).toBe("true");
    cleanup(); window.history.replaceState(null, "", window.location.pathname);
    render(<QuestionsGenerator />);
    expect(tab(/^Assessment$/).getAttribute("aria-selected")).toBe("true");
  });

  it("choosing a tab updates the address; Assessment clears it", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await u.click(tab(/Shading Sheet/));
    expect(window.location.hash).toBe("#shading");
    await u.click(tab(/My Assessments/));
    expect(window.location.hash).toBe("#saved");
    await u.click(tab(/^Assessment$/));
    expect(window.location.hash).toBe("");
  });

  it("the browser Back button returns to the previous tab", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await u.click(tab(/Shading Sheet/));
    await act(async () => { window.history.back(); await new Promise(r => setTimeout(r, 60)); });
    await waitFor(() => expect(tab(/^Assessment$/).getAttribute("aria-selected")).toBe("true"));
  });

  it("ignores a sign-in redirect hash instead of treating it as a tab", async () => {
    window.location.hash = "#access_token=abc&type=signup";
    render(<QuestionsGenerator />);
    expect(tab(/^Assessment$/).getAttribute("aria-selected")).toBe("true");
  });

  it("each tab has a labelled panel and the page title follows the tab", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await u.click(tab(/Shading Sheet/));
    const panel = screen.getByRole("tabpanel", { name: /Shading Sheet/i });
    expect(panel).toBeTruthy();
    expect(document.title).toMatch(/^Shading Sheet/);
  });
});

describe("the Shading Sheet tab never disturbs the Assessment form", () => {
  it("choosing a class for the sheet leaves the paper's class (and everything under it) alone", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await u.selectOptions(wizardClass(), "Basic 9");
    await u.click(tab(/Shading Sheet/));
    const sheetClass = document.querySelector('[data-testid="shading-tab"] select');
    await u.selectOptions(sheetClass, "SHS 3");
    expect(sheetClass.value).toBe("SHS 3");
    expect(wizardClass().value).toBe("Basic 9");                       // the paper form kept its class
    expect(screen.getByText(/Different from your paper's class \(Basic 9\)/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: /Use paper's class/i }));
    expect(sheetClass.value).toBe("Basic 9");
  });

  it("works with no class chosen anywhere: the sheet has its own class, and the paper stays empty", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await u.click(tab(/Shading Sheet/));
    await u.selectOptions(document.querySelector('[data-testid="shading-tab"] select'), "Basic 8");
    expect(await screen.findByTestId("shading-card")).toBeTruthy();
    expect(wizardClass().value).toBe("");
  });

  it("shows the school fields once, from one shared component (no second copy to drift)", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await u.selectOptions(wizardClass(), "Basic 9");
    const wiz = document.querySelector(".qa-flow input[placeholder*='St. Mary']");
    await u.type(wiz, "Sunrise JHS");
    await u.click(tab(/Shading Sheet/));
    expect(document.querySelector('[data-testid="shading-tab"] input[placeholder*="St. Mary"]').value).toBe("Sunrise JHS");
  });

  it("a different class from the paper does not borrow the paper's objective count", async () => {
    const u = userEvent.setup();
    render(<QuestionsGenerator />);
    await u.selectOptions(wizardClass(), "Basic 9");
    await u.click(tab(/Shading Sheet/));
    await u.selectOptions(document.querySelector('[data-testid="shading-tab"] select'), "SHS 2");
    expect(screen.queryByText(/Linked to your paper/)).toBeNull();
  });
});

describe("navigation colours are theme-proof and accessible", () => {
  const css = fs.readFileSync(`${process.cwd()}/src/theme.css`, "utf8");
  const nav = css.slice(css.indexOf("App navigation: pill switch"));
  const lum = (hex) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  it("the active fill is a fixed dark teal (not the theme accent) and white text on it passes AA", () => {
    const fill = /--nav-fill:\s*(#[0-9A-Fa-f]{6})/.exec(nav)[1];
    expect(ratio(fill, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(/\.qa-pill-thumb\s*\{[^}]*background:\s*var\(--nav-fill\)/.test(nav)).toBe(true);
    expect(/\.qa-bnav-btn\.active \.qa-bnav-icon-wrap\s*\{[^}]*background:\s*var\(--nav-fill\)/.test(nav)).toBe(true);
  });

  it("the active label is readable on both page backgrounds", () => {
    const light = /:root, \[data-theme="light"\] \{[^}]*--nav-ink:\s*(#[0-9A-Fa-f]{6})/.exec(nav)[1];
    const dark = /\[data-theme="dark"\] \{[^}]*--nav-ink:\s*(#[0-9A-Fa-f]{6})/.exec(nav)[1];
    expect(ratio(light, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark, "#2C2C2E")).toBeGreaterThanOrEqual(4.5);
  });

  it("the phone bottom nav never overlaps the finished-paper bar, and only moves with cheap transforms", () => {
    expect(nav).toMatch(/\.eduq-bar \{ bottom: calc\(57px/);
    expect(nav).toMatch(/\.qa-bottom-nav\.is-hidden \{ transform: translateY\(100%\)/);
    expect(nav).not.toMatch(/will-change|box-shadow|backdrop-filter/);
  });
});
