// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Icon, { ICON_NAMES } from "../src/components/Icon.jsx";
import WizardProgress, { currentStep, STEP_LABELS } from "../src/components/WizardProgress.jsx";
import CardTitle from "../src/components/CardTitle.jsx";
import Welcome from "../src/components/Welcome.jsx";

afterEach(cleanup);

describe("Icon", () => {
  it("draws every named icon as a decorative inline SVG", () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector("svg");
      expect(svg, name).not.toBeNull();
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.querySelectorAll("path").length, name).toBeGreaterThan(0);
      unmount();
    }
  });
  it("renders nothing for an unknown name instead of crashing", () => {
    expect(render(<Icon name="nope" />).container.innerHTML).toBe("");
  });
});

describe("WizardProgress", () => {
  it("moves through Class -> Topics -> Setup -> Review", () => {
    expect(currentStep({ hasClass: false, hasTopics: false, hasExam: false })).toBe(0);
    expect(currentStep({ hasClass: true, hasTopics: false, hasExam: false })).toBe(1);
    expect(currentStep({ hasClass: true, hasTopics: true, hasExam: false })).toBe(2);
    expect(currentStep({ hasClass: true, hasTopics: true, hasExam: true })).toBe(3);
    expect(currentStep({ hasClass: false, hasTopics: true, hasExam: true })).toBe(0);   // an earlier step is incomplete: stay there
  });
  it("marks done and current steps for screen readers, and sets the line fill", () => {
    const { container } = render(<WizardProgress hasClass hasTopics hasExam={false} />);
    const items = container.querySelectorAll("li");
    expect([...items].map(li => li.className.includes("is-done"))).toEqual([true, true, false, false]);
    expect(items[2].getAttribute("aria-current")).toBe("step");
    expect(items[0].getAttribute("aria-current")).toBeNull();
    expect(screen.getAllByText(/\(completed\)/)).toHaveLength(2);
    expect(screen.getByText(/\(current step\)/)).toBeTruthy();
    expect(container.querySelector("ol").style.getPropertyValue("--qa-p")).toBe(String(2 / 3));
    expect(screen.getByRole("navigation", { name: "Progress" })).toBeTruthy();
    for (const l of STEP_LABELS) expect(screen.getByText(new RegExp(`^${l}`))).toBeTruthy();
  });
  it("shows a check instead of a number once a step is done", () => {
    const { container } = render(<WizardProgress hasClass hasTopics={false} hasExam={false} />);
    const dots = container.querySelectorAll(".qa-dot");
    expect(dots[0].querySelector("svg")).not.toBeNull();
    expect(dots[1].textContent).toBe("2");
  });
});

describe("CardTitle and Welcome", () => {
  it("CardTitle renders the heading text as a plain h3 with no icon tile", () => {
    render(<CardTitle F="sans-serif">Curriculum <span>(GES / NaCCA)</span></CardTitle>);
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Curriculum (GES / NaCCA)");
    expect(document.querySelector(".qa-tile")).toBeNull();
  });
  it("Welcome shows three steps and the feature strip (including Diagrams), with no icons", () => {
    const { container } = render(<Welcome F="sans-serif" />);
    expect(container.querySelectorAll(".qa-how-item")).toHaveLength(3);
    expect(container.querySelectorAll(".qa-feat")).toHaveLength(5);
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("Pick class and topics")).toBeTruthy();
    expect(screen.getByText(/BECE and WASSCE styles/)).toBeTruthy();
    expect(screen.getByText(/Diagrams and figures/)).toBeTruthy();
  });
});
