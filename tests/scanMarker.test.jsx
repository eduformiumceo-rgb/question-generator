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
    expect(rows[0].textContent).toContain("0001"); expect(rows[0].textContent).toContain("5 / 5");
    expect(rows[1].textContent).toContain("0002"); expect(rows[1].textContent).toContain("3 / 5"); expect(rows[1].textContent).toContain("1 blank");
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
    expect(t).toContain("Could not find the four corner marks."); expect(t).toContain("0002");
  });

  it("flags duplicate index numbers, gaps in the index number and questions to look at", async () => {
    const u = userEvent.setup();
    const { input } = setup({ keyFor: () => ({ 1: "A", 2: "A" }), reads: [sheet("0001", "AA", { review: [2] }), sheet("0001", "AA"), sheet("00_3", "AA", { indexOk: false })] });
    await u.upload(input, [file("1.png"), file("2.png"), file("3.png")]);
    const t = (await screen.findByTestId("scan-results")).textContent;
    expect(t).toContain("Duplicate index number"); expect(t).toContain("Look at question 2"); expect(t).toContain("Index number has a gap");
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
});
