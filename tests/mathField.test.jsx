// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import MathField from "../src/components/MathField.jsx";
import MathText from "../src/components/MathText.jsx";

function Host({ initial }) {
  const [v, setV] = useState(initial);
  return <MathField value={v} onChange={e => setV(e.target.value)} ariaLabel="q" F="sans-serif" style={{}} />;
}

afterEach(cleanup);

describe("MathField", () => {
  it("shows a live preview only when the text has maths", () => {
    const { container, rerender } = render(<Host initial="Plain words" />);
    expect(container.querySelector("math")).toBeNull();
    rerender(<Host initial="Plain words" />);
  });
  it("renders the formula and hides the toolbar until opened", () => {
    const { container } = render(<Host initial="Simplify $\frac{1}{2}$" />);
    expect(container.querySelector(".mf-preview math mfrac")).not.toBeNull();
    expect(screen.queryByRole("toolbar")).toBeNull();
    fireEvent.click(screen.getByLabelText("Maths symbols"));
    expect(screen.getByRole("toolbar")).toBeTruthy();
  });
  it("inserts a fraction from the toolbar", () => {
    render(<Host initial="Simplify " />);
    fireEvent.click(screen.getByLabelText("Maths symbols"));
    fireEvent.click(screen.getByLabelText("Fraction"));
    expect(screen.getByLabelText("q").value).toBe("Simplify $\\frac{}{}$");
  });
  it("warns about a formula typo", () => {
    render(<Host initial="Bad $\frac{1$" />);
    expect(screen.getByRole("alert").textContent).toContain("typo");
  });
});

describe("MathText", () => {
  it("leaves plain text as text and draws maths", () => {
    const a = render(<MathText text="No maths <b>here</b>" />);
    expect(a.container.textContent).toBe("No maths <b>here</b>");
    expect(a.container.querySelector("b")).toBeNull();
    const b = render(<MathText text="x is $x^2$" />);
    expect(b.container.querySelector("msup")).not.toBeNull();
  });
});
