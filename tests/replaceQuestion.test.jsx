// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import ReplaceQuestion from "../src/components/ReplaceQuestion.jsx";
import ExamEditor from "../src/components/ExamEditor.jsx";
import { checkReplacement, cleanReplacement, requestQuestionReplacement } from "../src/regenerateQuestion.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const S = { sm: {}, btn: {}, lbl: {}, inp: {}, card: {} };
const good = { number: 9, text: "New question text here?", options: ["a", "b", "c", "d"], correctOption: "b", parts: [], marks: 1, diagram: { needed: false }, image: "OLD" };

describe("checking a replacement before it touches the paper", () => {
  it("accepts a good one, rejects wrong marks, option counts and missing answers", () => {
    expect(checkReplacement(good, { type: "objective", marks: 1 })).toBe("");
    expect(checkReplacement({ ...good, marks: 2 }, { type: "objective", marks: 1 })).toMatch(/marks/);
    expect(checkReplacement({ ...good, options: ["a", "b"] }, { type: "objective", marks: 1 })).toMatch(/four options/);
    expect(checkReplacement({ ...good, correctOption: "" }, { type: "objective", marks: 1 })).toMatch(/correct answer/);
    expect(checkReplacement({ ...good, text: "" }, { type: "objective", marks: 1 })).toMatch(/no text/);
    expect(checkReplacement(null, { type: "objective", marks: 1 })).toMatch(/empty/);
    expect(checkReplacement({ text: "t", marks: 5, parts: [{ marks: 2 }, { marks: 2 }] }, { type: "structured", marks: 5 })).toMatch(/add up/);
  });
  it("keeps the number and marks, upper-cases the answer, and drops the old picture", () => {
    const q = cleanReplacement(good, { number: 4, marks: 1 });
    expect(q.number).toBe(4);
    expect(q.correctOption).toBe("B");
    expect(q.image).toBeUndefined();
    expect(q.diagram).toBeNull();
  });
});

describe("requestQuestionReplacement", () => {
  const args = { api: "/api/x", token: "t", settings: { subject: "S", className: "JHS 1" }, section: { id: "A", label: "A", type: "objective" }, question: { number: 4, marks: 1 }, avoid: ["x"], note: "harder" };
  it("posts the right body and returns a cleaned question", async () => {
    globalThis.fetch = vi.fn(async (u, init) => new Response(JSON.stringify({ question: good, creditsRemaining: 7 }), { status: 200 }));
    const r = await requestQuestionReplacement(args);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ mode: "regenerate-question", number: 4, marks: 1, avoidQuestions: ["x"], revisionNote: "harder", section: { id: "A", type: "objective" } });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer t");
    expect(r.question.number).toBe(4);
    expect(r.creditsRemaining).toBe(7);
  });
  it("surfaces server errors and the refunded balance", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "Not enough credits.", creditsRemaining: 0.05 }), { status: 402 }));
    await expect(requestQuestionReplacement(args)).rejects.toMatchObject({ message: "Not enough credits.", creditsRemaining: 0.05 });
  });
  it("explains a network failure plainly, and rejects an unusable reply", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("fail"); });
    await expect(requestQuestionReplacement(args)).rejects.toThrow(/Couldn't reach the server/);
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ question: { ...good, marks: 3 } }), { status: 200 }));
    await expect(requestQuestionReplacement(args)).rejects.toThrow(/wrong marks/);
  });
});

describe("ReplaceQuestion control", () => {
  const q = { number: 4, text: "old" };
  it("replaces on success and offers one-step undo", async () => {
    const applied = [];
    const onReplace = vi.fn(async () => ({ number: 4, text: "new" }));
    render(<ReplaceQuestion question={q} S={S} F="sans-serif" onReplace={onReplace} onApply={x => applied.push(x)} />);
    fireEvent.click(screen.getByText("Replace question"));
    fireEvent.change(screen.getByLabelText(/What should the new question be like/), { target: { value: " harder " } });
    fireEvent.click(screen.getByText("Write new question"));
    await waitFor(() => expect(applied).toEqual([{ number: 4, text: "new" }]));
    expect(onReplace).toHaveBeenCalledWith("harder");
    fireEvent.click(await screen.findByText("Undo replace"));
    expect(applied[1]).toEqual(q);
    expect(screen.queryByText("Undo replace")).toBeNull();
  });
  it("shows the error and leaves the question alone when it fails", async () => {
    const applied = [];
    render(<ReplaceQuestion question={q} S={S} F="sans-serif" onReplace={async () => { throw new Error("Not enough credits."); }} onApply={x => applied.push(x)} />);
    fireEvent.click(screen.getByText("Replace question"));
    fireEvent.click(screen.getByText("Write new question"));
    expect((await screen.findByRole("alert")).textContent).toBe("Not enough credits.");
    expect(applied).toEqual([]);
  });
});

describe("ExamEditor integration", () => {
  const exam = { title: "T", instructions: [], totalMarks: 2, answerKey: [{ number: 1, answer: "A" }, { number: 2, answer: "B" }], sections: [{ id: "A", label: "Section A", type: "objective", questions: [
    { number: 1, text: "First stem here", options: ["a", "b", "c", "d"], correctOption: "A", parts: [], marks: 1 },
    { number: 2, text: "Second stem here", options: ["a", "b", "c", "d"], correctOption: "B", parts: [], marks: 1 },
  ] }] };
  function Host({ onReplace }) {
    const [e, setE] = useState(exam);
    return <><ExamEditor examData={e} setExamData={setE} S={S} F="sans-serif" onReplace={onReplace} /><pre data-testid="key">{JSON.stringify(e.answerKey)}</pre></>;
  }
  it("shows no replace buttons when replacing is not offered (BECE/WASSCE)", () => {
    render(<Host />);
    expect(screen.queryByText("Replace question")).toBeNull();
  });
  it("sends the OTHER questions to avoid, swaps the question in place, and keeps the answer key in step", async () => {
    const onReplace = vi.fn(async () => ({ number: 1, text: "Brand new stem", options: ["w", "x", "y", "z"], correctOption: "C", parts: [], marks: 1 }));
    render(<Host onReplace={onReplace} />);
    fireEvent.click(screen.getAllByText("Replace question")[0]);
    fireEvent.click(screen.getByText("Write new question"));
    await waitFor(() => expect(screen.getByDisplayValue("Brand new stem")).toBeTruthy());
    expect(onReplace.mock.calls[0][0].avoid).toEqual(["Second stem here"]);
    expect(JSON.parse(screen.getByTestId("key").textContent)).toEqual([{ number: 1, answer: "C" }, { number: 2, answer: "B" }]);
  });
});
