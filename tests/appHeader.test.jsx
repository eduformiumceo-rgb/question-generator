// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppHeader from "../src/components/AppHeader.jsx";

afterEach(cleanup);
const open = async (props = {}) => {
  const u = userEvent.setup();
  render(<AppHeader user={null} creditBalance={null} toDisplayCredits={(n) => n} onSignIn={() => {}} onTopUp={() => {}} onSignOut={() => {}} {...props} />);
  await u.click(screen.getByRole("button", { name: "Menu" }));
};

describe("AppHeader menu", () => {
  it("is available when signed out, and offers a way back to the Hub", async () => {
    await open();
    const link = screen.getByRole("menuitem", { name: /Back to Eduformium Hub/ });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/app\.eduformium\.com\/?$/);
  });
  it("carries the legal and help links that used to be in the page footer", async () => {
    await open();
    for (const name of ["Privacy", "Terms", "Refunds", "Compliance", "Pricing", "Help"]) {
      expect(screen.getByRole("link", { name })).toBeTruthy();
    }
  });
  it("still shows Sign out for a signed-in user", async () => {
    await open({ user: { name: "Ama", email: "a@x.com" } });
    expect(screen.getByRole("menuitem", { name: /Sign out/ })).toBeTruthy();
  });
});
