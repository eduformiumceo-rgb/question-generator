// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NumberField from "../src/components/NumberField.jsx";
import ExamStructureBuilder, { DEFAULT_SECTIONS } from "../src/components/ExamStructureBuilder.jsx";

afterEach(cleanup);

function Field({ initial = 20, min = 1, max = 60 }) {
  const [v, setV] = useState(initial);
  return (<><NumberField aria-label="n" value={v} min={min} max={max} onChange={setV} /><output data-testid="committed">{String(v)}</output></>);
}
const committed = () => screen.getByTestId("committed").textContent;

describe("NumberField - the 'a 1 appears and I can't clear it' bug", () => {
  it("can be fully cleared WITHOUT a 1 appearing", async () => {
    const u = userEvent.setup(); render(<Field />);
    const input = screen.getByLabelText("n");
    await u.clear(input);
    expect(input.value).toBe("");           // was "1" before the fix
  });

  it("clearing then typing a new number replaces the old one", async () => {
    const u = userEvent.setup(); render(<Field />);
    const input = screen.getByLabelText("n");
    await u.clear(input); await u.type(input, "35");
    expect(input.value).toBe("35");
    expect(committed()).toBe("35");
  });

  it("backspacing digit by digit works all the way to empty", async () => {
    const u = userEvent.setup(); render(<Field initial={25} />);
    const input = screen.getByLabelText("n");
    await u.click(input); await u.keyboard("{End}{Backspace}{Backspace}");
    expect(input.value).toBe("");
  });

  it("leaving it empty restores the last good value instead of forcing 1", async () => {
    const u = userEvent.setup(); render(<Field initial={25} />);
    const input = screen.getByLabelText("n");
    await u.clear(input); await u.tab();
    expect(input.value).toBe("25");
    expect(committed()).toBe("25");
  });

  it("backspacing 25 to empty and leaving restores 25 (not the in-between '2')", async () => {
    const u = userEvent.setup(); render(<Field initial={25} />);
    const input = screen.getByLabelText("n");
    await u.click(input); await u.keyboard("{End}{Backspace}{Backspace}");
    expect(input.value).toBe("");
    await u.tab();
    expect(input.value).toBe("25"); expect(committed()).toBe("25");
  });

  it("clamps above max immediately and below min on blur", async () => {
    const u = userEvent.setup(); render(<Field min={1} max={60} />);
    const input = screen.getByLabelText("n");
    await u.clear(input); await u.type(input, "99");
    expect(input.value).toBe("60"); expect(committed()).toBe("60");
    await u.clear(input); await u.type(input, "0"); await u.tab();
    expect(input.value).toBe("1"); expect(committed()).toBe("1");
  });

  it("allows typing through a below-min prefix (min 4: '1' then '0' -> 10)", async () => {
    const u = userEvent.setup(); render(<Field initial={8} min={4} max={15} />);
    const input = screen.getByLabelText("n");
    await u.clear(input); await u.type(input, "10");
    expect(input.value).toBe("10"); expect(committed()).toBe("10");
  });

  it("ignores non-digits (no e, -, .)", async () => {
    const u = userEvent.setup(); render(<Field initial={5} max={999} />);
    const input = screen.getByLabelText("n");
    await u.clear(input); await u.type(input, "1e-2.5");
    expect(input.value).toBe("125");
  });

  it("ArrowUp / ArrowDown step the value within range", async () => {
    const u = userEvent.setup(); render(<Field initial={59} max={60} />);
    const input = screen.getByLabelText("n");
    await u.click(input); await u.keyboard("{ArrowUp}{ArrowUp}");
    expect(committed()).toBe("60");
    await u.keyboard("{ArrowDown}");
    expect(committed()).toBe("59");
  });
});

describe("Exam Structure Builder uses it", () => {
  function Builder() {
    const [sections, setSections] = useState(DEFAULT_SECTIONS);
    const S = { card: {}, lbl: {}, inp: {}, err: {} };
    return <ExamStructureBuilder sections={sections} setSections={setSections} S={S} F="sans-serif" />;
  }
  it("Number of Questions can be cleared, retyped, and totals follow", async () => {
    const u = userEvent.setup(); render(<Builder />);
    const q = screen.getByLabelText("Section A: Objective (Multiple Choice): number of questions");
    await u.clear(q);
    expect(q.value).toBe("");
    await u.type(q, "30");
    expect(q.value).toBe("30");
    expect(screen.getByText(/35 questions · 80 marks total/)).toBeTruthy(); // 30x1 + 5x10
  });
  it("Marks per Question can be cleared and retyped too", async () => {
    const u = userEvent.setup(); render(<Builder />);
    const m = screen.getByLabelText("Section B: Structured / Theory: marks per question");
    await u.clear(m); expect(m.value).toBe("");
    await u.type(m, "4");
    expect(screen.getByText(/25 questions · 40 marks total/)).toBeTruthy(); // 20x1 + 5x4
  });
});
