// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import PaperAudit from "../src/components/PaperAudit.jsx";

afterEach(cleanup);
const S = { card: {}, sm: {} };
const bad = { title: "T", totalMarks: 2, answerKey: [{ number: 1, answer: "C" }], sections: [{ id: "A", label: "Section A", type: "objective", questions: [
  { number: 1, text: "Which statement is true about this?", options: ["a1", "b1", "c1", "d1"], correctOption: "A", parts: [], marks: 1, topic: "Topic one", cognitiveLevel: "Recall" },
  { number: 2, text: "Which statement is false about that?", options: ["a2", "b2", "c2", "d2"], correctOption: "B", parts: [], marks: 1, topic: "Topic two", cognitiveLevel: "Application" },
] }] };

function Host() {
  const [e, setE] = useState(bad);
  return <PaperAudit examData={e} setExamData={setE} targetLevels={["Recall"]} S={S} F="sans-serif" />;
}

describe("PaperAudit panel", () => {
  it("shows the score, lists problems, and the one-click fix clears them", () => {
    render(<Host />);
    expect(screen.getByText(/to fix/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText(/answer key says C/)).toBeTruthy();
    fireEvent.click(screen.getByText("Rebuild answer key"));
    expect(screen.getByText(/No problems found/)).toBeTruthy();
  });
  it("shows the Table of Specification", () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByText("Table of Specification"));
    expect(screen.getByText("Topic one")).toBeTruthy();
    expect(screen.getByText("Share of marks")).toBeTruthy();
  });
});
