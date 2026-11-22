// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExamStructureBuilder, { DEFAULT_SECTIONS, nextSectionId, makeSection, cleanSectionTitle, sectionLabel } from "../src/components/ExamStructureBuilder.jsx";
import { S } from "../src/sharedStyles.jsx";

afterEach(cleanup);

function Builder() {
  const [sections, setSections] = useState(DEFAULT_SECTIONS.map(s => ({ ...s })));
  return <><ExamStructureBuilder sections={sections} setSections={setSections} S={S} F="sans-serif" /><output data-testid="ids">{sections.map(s => s.id).join(",")}</output></>;
}
const ids = () => screen.getByTestId("ids").textContent;

describe("ExamStructureBuilder - Section C", () => {
  it("ticking Section C enables it and its fields appear", async () => {
    const u = userEvent.setup(); render(<Builder />);
    const c = screen.getByLabelText("Include Section C: Essay");
    expect(c.checked).toBe(false);
    await u.click(c);
    expect(c.checked).toBe(true);
    expect(screen.getByLabelText("Section C: Essay: number of questions")).toBeTruthy();
    expect(screen.getByText(/27 questions · 110 marks total/)).toBeTruthy(); // 20x1 + 5x10 + 2x20
  });
});

describe("ExamStructureBuilder - adding sections", () => {
  it("Add Section appends the next free letter, enabled, and it counts toward the totals", async () => {
    const u = userEvent.setup(); render(<Builder />);
    await u.click(screen.getByRole("button", { name: /Add Section D/ }));
    expect(ids()).toBe("A,B,C,D");
    expect(screen.getByLabelText("Include Section D: Structured / Theory").checked).toBe(true);
    expect(screen.getByText(/30 questions · 120 marks total/)).toBeTruthy(); // 20x1 + 5x10 + 5x10 (C is still off)
  });

  it("can add a section of another type", async () => {
    const u = userEvent.setup(); render(<Builder />);
    await u.selectOptions(screen.getByLabelText("Type of section to add"), "essay");
    await u.click(screen.getByRole("button", { name: /Add Section D/ }));
    expect(screen.getByLabelText("Include Section D: Essay")).toBeTruthy();
  });

  it("an added section can be removed, and its letter is reused", async () => {
    const u = userEvent.setup(); render(<Builder />);
    await u.click(screen.getByRole("button", { name: /Add Section D/ }));
    await u.click(screen.getByRole("button", { name: /Remove Section D/ }));
    expect(ids()).toBe("A,B,C");
    await u.click(screen.getByRole("button", { name: /Add Section D/ }));
    expect(ids()).toBe("A,B,C,D");
  });

  it("the three standard sections cannot be removed, only unticked", () => {
    render(<Builder />);
    expect(screen.queryByRole("button", { name: /Remove Section [ABC]/ })).toBeNull();
  });

  it("stops at 8 sections", async () => {
    const u = userEvent.setup(); render(<Builder />);
    for (let i = 0; i < 5; i++) await u.click(screen.getByRole("button", { name: /Add Section/ }));
    expect(ids()).toBe("A,B,C,D,E,F,G,H");
    expect(screen.getByRole("button", { name: /Add Section/ }).disabled).toBe(true);
  });

  it("a section title updates the label", async () => {
    const u = userEvent.setup(); render(<Builder />);
    await u.click(screen.getByRole("button", { name: /Add Section D/ }));
    await u.type(screen.getByLabelText("Section D: Structured / Theory: title"), "Practical");
    expect(screen.getByLabelText("Include Section D: Practical")).toBeTruthy();
  });
});

describe("section helpers", () => {
  it("nextSectionId skips letters already used, even by exam-board sections", () => {
    expect(nextSectionId([{ id: "A" }, { id: "B" }, { id: "OBJ" }])).toBe("C");
    expect(nextSectionId([{ id: "A" }, { id: "C" }])).toBe("B");
  });
  it("makeSection returns null when every letter is taken", () => {
    const all = Array.from({ length: 26 }, (_, i) => ({ id: String.fromCharCode(65 + i) }));
    expect(makeSection(all, "essay")).toBeNull();
  });
  it("titles are stripped of quotes, brackets and line breaks (they reach the AI prompt and the printed paper)", () => {
    expect(cleanSectionTitle('Oral "test"\n<b>{x}')).toBe("Oral testbx");
    expect(cleanSectionTitle("x".repeat(100)).length).toBe(40);
    expect(sectionLabel("D", "essay", "  ")).toBe("Section D: Essay");
  });
});
