// @vitest-environment jsdom
// Smoke + flow test for the WHOLE generator screen (not just the selector), so a runtime
// crash in the page itself - not only in a helper - fails the build.
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
  const label = screen.queryByText((_, el) => el?.tagName === "LABEL" && el.textContent.trim().startsWith(labelText));
  return label ? label.parentElement.querySelector("select") : null;
};
const opts = (sel) => [...sel.querySelectorAll("option")].map(o => o.textContent);

describe("whole generator screen, SHS flow", () => {
  it("renders without crashing", () => {
    render(<QuestionsGenerator />);
    expect(selectFor("Class")).not.toBeNull();
  });

  it("Basic class: Term 1-3 and Mid-Term / End of Term exam types", async () => {
    const u = userEvent.setup(); render(<QuestionsGenerator />);
    await u.selectOptions(selectFor("Class"), "Basic 7");
    expect(opts(selectFor("Term"))).toEqual(["Term 1", "Term 2", "Term 3"]);
    expect(screen.getByRole("button", { name: "End of Term Exam" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "End of Semester Exam" })).toBeNull();
  });

  it("SHS class: Semester 1-2, Semester exam types, and the Programme step appears", async () => {
    const u = userEvent.setup(); render(<QuestionsGenerator />);
    await u.selectOptions(selectFor("Class"), "SHS 2");
    expect(selectFor("Programme")).not.toBeNull();
    expect(opts(selectFor("Semester"))).toEqual(["Semester 1", "Semester 2"]);
    expect(selectFor("Term")).toBeNull();
    expect(screen.getByRole("button", { name: "End of Semester Exam" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mid-Semester Exam" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "End of Term Exam" })).toBeNull();
  });

  it("carries the teacher's choices across levels: Term 3 -> Semester 2, End of Term -> End of Semester, and back", async () => {
    const u = userEvent.setup(); render(<QuestionsGenerator />);
    await u.selectOptions(selectFor("Class"), "Basic 7");
    await u.selectOptions(selectFor("Term"), "Term 3");
    await u.click(screen.getByRole("button", { name: "End of Term Exam" }));
    await u.selectOptions(selectFor("Class"), "SHS 1");
    await waitFor(() => expect(selectFor("Semester").value).toBe("Semester 2"));
    expect(screen.getByRole("button", { name: "End of Semester Exam" }).getAttribute("aria-pressed")).toBe("true");
    await u.selectOptions(selectFor("Class"), "Basic 9");
    await waitFor(() => expect(selectFor("Term").value).toBe("Term 2"));
    expect(screen.getByRole("button", { name: "End of Term Exam" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("full SHS path works inside the page: class -> programme -> subject -> strand -> topic, no crash", async () => {
    const u = userEvent.setup(); render(<QuestionsGenerator />);
    await u.selectOptions(selectFor("Class"), "SHS 3");
    await u.selectOptions(selectFor("Programme"), "General Science");
    await u.selectOptions(selectFor("Subject"), "Chemistry (GS)");
    const strandBtns = screen.getAllByRole("button").filter(b => b.closest("div")?.previousSibling?.textContent?.startsWith("Strands taught this semester"));
    expect(strandBtns.length).toBeGreaterThan(0);
    await u.click(strandBtns[0]);
    expect(screen.getByText("Topics (Sub-Strands)")).toBeTruthy();
  });
});
