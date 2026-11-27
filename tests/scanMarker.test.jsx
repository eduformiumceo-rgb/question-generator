// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScanMarker from "../src/components/ScanMarker.jsx";

afterEach(cleanup);
const S = { card: {}, lbl: {}, inp: {}, btn: {}, sm: {} };
const answers = (str) => [...str].map((c, i) => ({ q: i + 1, answer: c === "-" ? "" : c, review: false }));
const sheet = (idx, str, extra = {}) => ({ ok: true, qr: true, indexNumber: idx, indexOk: true, version: "A", sex: "F", absent: false, n: str.length, review: [], answers: answers(str), ...extra });
const file = (name) => new File(["x"], name, { type: "image/png" });

function setup(props = {}) {
  const reads = props.reads || [];
  const reader = vi.fn(() => reads.shift());
  const load = vi.fn(async (f) => [{ name: f.name, image: {} }]);
  render(<ScanMarker S={S} F="Arial" expectedN={5} load={load} reader={reader} {...props} />);
  return { reader, load, input: screen.getByTestId("scan-input") };
}

describe("Scan & mark card", () => {
  it("marks scanned sheets against the generated paper's key", async () => {
    const u = userEvent.setup();
    const { input } = setup({ keyFor: () => ({ 1: "A", 2: "B", 3: "C", 4: "D", 5: "A" }), reads: [sheet("0001", "ABCDA"), sheet("0002", "ABXD-")] });
    expect(screen.getByTestId("scan-key-auto")).toBeTruthy();
    await u.upload(input, [file("a.png"), file("b.png")]);
    const table = await screen.findByTestId("scan-results");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByLabelText(/Index number for/).value).toBe("0001"); expect(rows[0].textContent).toContain("5 / 5");
    expect(within(rows[1]).getByLabelText(/Index number for/).value).toBe("0002"); expect(rows[1].textContent).toContain("3 / 5"); expect(rows[1].textContent).toContain("1 blank");
  });

  it("uses each sheet's own paper version key", async () => {
    const u = userEvent.setup();
    const keyFor = vi.fn((v) => (v === "B" ? { 1: "B" } : { 1: "A" }));
    const { input } = setup({ keyFor, reads: [sheet("0001", "B", { version: "B" })] });
    await u.upload(input, [file("a.png")]);
    expect((await screen.findByTestId("scan-results")).textContent).toContain("1 / 1");
    expect(keyFor).toHaveBeenCalledWith("B");
  });

  it("with no generated paper it asks for a typed key, which then scores the sheets", async () => {
    const u = userEvent.setup();
    const { input } = setup({ keyFor: () => null, reads: [sheet("0007", "ABC")] });
    await u.upload(input, [file("a.png")]);
    expect((await screen.findByRole("alert")).textContent).toMatch(/No answer key/);
    await u.type(screen.getByLabelText("Answer key typed in order"), "ABD");
    await waitFor(() => expect(screen.getByTestId("scan-results").textContent).toContain("2 / 3"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says why a sheet could not be read and keeps going with the others", async () => {
    const u = userEvent.setup();
    const { input } = setup({ keyFor: () => ({ 1: "A" }), reads: [{ ok: false, error: "Could not find the four corner marks." }, sheet("0002", "A")] });
    await u.upload(input, [file("bad.png"), file("good.png")]);
    const t = (await screen.findByTestId("scan-results")).textContent;
    expect(t).toContain("Could not find the four corner marks."); expect(screen.getByLabelText("Index number for good.png").value).toBe("0002");
  });

  it("flags duplicate index numbers, gaps in the index number and questions to look at", async () => {
    const u = userEvent.setup();
    const { input } = setup({ keyFor: () => ({ 1: "A", 2: "A" }), reads: [sheet("0001", "AA", { review: [2] }), sheet("0001", "AA"), sheet("00_3", "AA", { indexOk: false })] });
    await u.upload(input, [file("1.png"), file("2.png"), file("3.png")]);
    const t = (await screen.findByTestId("scan-results")).textContent;
    expect(t).toContain("Duplicate index number"); expect(t).toContain("Look at question 2"); expect(t).toContain("Index number needs correcting");
  });

  it("offers a CSV download and can clear the list", async () => {
    const u = userEvent.setup();
    const created = []; globalThis.URL.createObjectURL = vi.fn((b) => { created.push(b); return "blob:x"; }); globalThis.URL.revokeObjectURL = vi.fn();
    const { input } = setup({ keyFor: () => ({ 1: "A" }), reads: [sheet("0001", "A")] });
    await u.upload(input, [file("a.png")]);
    await u.click(await screen.findByRole("button", { name: /Download results/ }));
    expect(created).toHaveLength(1);
    expect(await created[0].text()).toContain('"Index number"');
    await u.click(screen.getByRole("button", { name: /Clear all/ }));
    expect(screen.queryByTestId("scan-results")).toBeNull();
  });

  it("marks per question: scores are multiplied, half marks work, and a bad value falls back to 1", async () => {
    const u = userEvent.setup();
    const { input } = setup({ keyFor: () => ({ 1: "A", 2: "B", 3: "C", 4: "D", 5: "A" }), reads: [sheet("0001", "ABCDA"), sheet("0002", "ABXD-")] });
    await u.upload(input, [file("a.png"), file("b.png")]);
    const t = () => screen.getByTestId("scan-results").textContent;
    await screen.findByTestId("scan-results");
    const marks = screen.getByLabelText("Marks for each question");
    await u.clear(marks); await u.type(marks, "2");
    await waitFor(() => expect(t()).toContain("10 / 10")); expect(t()).toContain("6 / 10");
    await u.clear(marks); await u.type(marks, "0.5");
    await waitFor(() => expect(t()).toContain("2.5 / 2.5")); expect(t()).toContain("1.5 / 2.5");
    await u.clear(marks); await u.type(marks, "abc");
    await waitFor(() => expect(t()).toContain("5 / 5")); expect(marks.getAttribute("aria-invalid")).toBe("true");
  });

  it("a wrong index number can be corrected on the spot, and the duplicate warning follows it", async () => {
    const u = userEvent.setup();
    const { input } = setup({ keyFor: () => ({ 1: "A", 2: "A" }), reads: [sheet("0001", "AA"), sheet("0001", "AA"), sheet("00_3", "AA", { indexOk: false })] });
    await u.upload(input, [file("1.png"), file("2.png"), file("3.png")]);
    await screen.findByTestId("scan-results");
    expect(screen.getByTestId("scan-results").textContent).toContain("Duplicate index number");
    const second = screen.getByLabelText("Index number for 2.png");
    await u.clear(second); await u.type(second, "0002");
    await waitFor(() => expect(screen.getByTestId("scan-results").textContent).not.toContain("Duplicate index number"));
    expect(screen.getByLabelText("Index number for 2.png").value).toBe("0002");
    expect(screen.getByTestId("scan-results").textContent).toContain("Corrected");
    // the gap in the third is fixed too: flagged until it is a full number
    const third = screen.getByLabelText("Index number for 3.png");
    expect(third.getAttribute("aria-invalid")).toBe("true");
    await u.clear(third); await u.type(third, "0003");
    await waitFor(() => expect(screen.getByLabelText("Index number for 3.png").getAttribute("aria-invalid")).toBe("false"));
    expect(screen.getByTestId("scan-results").textContent).not.toContain("needs correcting");
  });

  it("an emptied index box stays empty so it can be retyped, letters are ignored, and undo restores the scanned number", async () => {
    const u = userEvent.setup();
    const { input } = setup({ keyFor: () => ({ 1: "A" }), reads: [sheet("1234", "A")] });
    await u.upload(input, [file("a.png")]);
    await screen.findByTestId("scan-results");
    const box = screen.getByLabelText("Index number for a.png");
    await u.clear(box);
    expect(box.value).toBe("");
    await u.type(box, "9x8y7z6");
    expect(box.value).toBe("9876");
    await u.click(screen.getByRole("button", { name: "undo" }));
    expect(screen.getByLabelText("Index number for a.png").value).toBe("1234");
  });

  it("the CSV uses the corrected index number and the marks per question", async () => {
    const u = userEvent.setup();
    let captured = "";
    const OrigBlob = globalThis.Blob; globalThis.Blob = class extends OrigBlob { constructor(parts, o) { super(parts, o); captured = String(parts[0]); } };
    URL.createObjectURL = () => "blob:x"; URL.revokeObjectURL = () => {};
    const { input } = setup({ keyFor: () => ({ 1: "A", 2: "A" }), reads: [sheet("0001", "AA")] });
    await u.upload(input, [file("a.png")]);
    await screen.findByTestId("scan-results");
    const box = screen.getByLabelText("Index number for a.png"); await u.clear(box); await u.type(box, "7777");
    const marks = screen.getByLabelText("Marks for each question"); await u.clear(marks); await u.type(marks, "3");
    await u.click(screen.getByRole("button", { name: /Download results/ }));
    globalThis.Blob = OrigBlob;
    expect(captured).toContain('"7777"'); expect(captured).not.toContain('"0001"'); expect(captured).toContain('"6","6"');
  });
});
