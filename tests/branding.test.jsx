// @vitest-environment jsdom
// The product is "Eduformium Assessment Studio". These pin every place a teacher or a browser reads the name,
// so a later edit cannot quietly bring back a stale or inconsistent one.
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("../src/auth.js", () => ({ getUser: () => null, getToken: () => null, completePendingGoogleSignIn: async () => null, signOut: () => {}, onAuthChange: () => () => {} }));
vi.mock("../src/pwaInstall.js", () => ({ usePwaInstall: () => ({ canInstall: false, install: async () => {}, isIOS: false, installed: false, dismissed: true, dismiss: () => {} }) }));
vi.mock("../src/hubSignIn.js", async (orig) => ({ ...(await orig()), goToHubSignIn: () => {} }));
import QuestionsGenerator from "../src/QuestionsGenerator.jsx";

const root = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
beforeEach(() => {
  localStorage.clear();
  window.scrollTo = () => {};
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
});
afterEach(() => cleanup());

describe("browser tab, search and link previews (index.html)", () => {
  const html = read("index.html");
  it("the tab title carries the name AND the words teachers search for", () => {
    const title = /<title>([^<]*)<\/title>/.exec(html)[1].replace(/&amp;/g, "&");
    expect(title).toMatch(/^Eduformium Assessment Studio/);
    expect(title).toMatch(/Tests/); expect(title).toMatch(/Quizzes/); expect(title).toMatch(/Exam/);
    expect(title.length).toBeLessThanOrEqual(60);   // Google cuts a title at about 60 characters
  });
  it("the description names what it makes, for Ghana, with marking schemes", () => {
    const d = /name="description" content="([^"]*)"/.exec(html)[1];
    expect(d).toMatch(/tests, quizzes, mock exams/i); expect(d).toMatch(/BECE\/WASSCE/); expect(d).toMatch(/marking schemes/i);
    expect(d.length).toBeLessThanOrEqual(170);
  });
  it("WhatsApp / Facebook / X previews use the same name", () => {
    expect(html).toMatch(/property="og:title" content="Eduformium Assessment Studio"/);
    expect(html).toMatch(/property="og:site_name" content="Eduformium"/);
    expect(html).toMatch(/name="twitter:title" content="Eduformium Assessment Studio"/);
  });
  it("the iPhone home-screen label is short enough not to be cut off", () => {
    const label = /apple-mobile-web-app-title" content="([^"]*)"/.exec(html)[1];
    expect(label).toBe("Assessments"); expect(label.length).toBeLessThanOrEqual(12);
  });
});

describe("installed app (manifest + service worker)", () => {
  const m = JSON.parse(read("public/manifest.json"));
  it("has the full name, a short label that fits under an icon, and a matching description", () => {
    expect(m.name).toBe("Eduformium Assessment Studio");
    expect(m.short_name).toBe("Assessments");
    expect(m.short_name.length).toBeLessThanOrEqual(12);
    expect(m.description).toMatch(/tests, quizzes, mock exams/i);
  });
  it("the service-worker cache was renewed with the rename, so installed apps pick the new name up", () => {
    expect(read("public/sw.js")).toMatch(/CACHE_VERSION = "eduformium-questions-v([2-9]|\d{2,})"/);
  });
});

describe("what the teacher sees", () => {
  it("the header shows Eduformium with 'Assessment Studio' under it, and the old tagline is gone", () => {
    render(<QuestionsGenerator />);
    const sub = document.querySelector(".qh-brand-sub");
    expect(sub.textContent.trim()).toBe("Assessment Studio");
    expect(document.body.textContent).not.toMatch(/Assessments made simple/);
  });
  it("the hero says what it is, what it makes, and what it does", () => {
    render(<QuestionsGenerator />);
    expect(screen.getByRole("heading", { level: 1, name: "Assessment Studio" })).toBeTruthy();
    expect(document.querySelector(".qa-hero-eyebrow").textContent).toBe("Tests · Quizzes · Exams · Mocks");
    expect(document.querySelector(".qa-hero p").textContent).toMatch(/Ghana curriculum.*marking schemes/);
    expect(document.body.textContent).not.toMatch(/Questions Generator/);
  });
});

describe("no stale name left in the code a user can read", () => {
  const files = ["src/QuestionsGenerator.jsx", "src/components/InstallPrompt.jsx", "src/components/PaymentSuccess.jsx", "src/components/AppHeader.jsx", "public/manifest.json", "index.html"];
  it.each(files)("%s has no 'Questions Generator' / old tagline in user-facing text", (f) => {
    const code = read(f).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    expect(code).not.toMatch(/Questions Generator|Assessments made simple|AI Questions/i);
  });
});
