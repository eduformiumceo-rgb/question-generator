import { describe, it, expect } from "vitest";
import { readWassceSheet, decideRow, rowStrengths, markThreshold } from "../src/omrReader.js";
import { drawSheet, scan, randomPupil } from "./helpers/omrRaster.js";

const D = Math.PI / 180;
/** Draw a pupil's sheet with the given pencil, scan it with the given distortion, read it, and count the differences. */
function run({ n = 50, optionCount = 4, digits = 10, seed = 1, strokes = "solid", pencil = 0.62, ...scanOpts }) {
  const pupil = randomPupil(n, optionCount, digits, seed, { blanks: 0, doubles: 0 });
  const r = readWassceSheet(scan(drawSheet({ n, optionCount, digits, pupil, strokes, pencil, seed }), { seed, ...scanOpts }), { n, optionCount, digits });
  if (!r.ok) return { r, wrong: Infinity, silent: Infinity, indexOk: false };
  const bad = r.answers.filter((a, i) => a.answer !== pupil.answers[i]);
  return { r, pupil, wrong: bad.length, silent: bad.filter(a => !a.review).length, indexOk: r.indexNumber === pupil.index };
}

describe("a sheet turned on its side or upside down", () => {
  for (const [name, angle, turn] of [["a quarter turn clockwise", 90, 90], ["a quarter turn anticlockwise", -90, 270], ["upside down", 180, 180], ["on its side and a little crooked", 93, 90]]) {
    it(`reads a sheet ${name}`, () => {
      const { r, wrong, indexOk } = run({ angle: angle * D });
      expect(r.turn).toBe(turn); expect(r.sideways).toBe(turn === 90 || turn === 270); expect(r.rotated).toBe(turn === 180);
      expect(wrong).toBe(0); expect(indexOk).toBe(true); expect(r.qr).toBe(true);
    });
  }
  it("an upright sheet reports turn 0", () => expect(run({}).r.turn).toBe(0));
  it("reads a sideways sheet with five options and 15 digits", () => {
    const { wrong, indexOk } = run({ n: 100, optionCount: 5, digits: 15, angle: 90 * D });
    expect(wrong).toBe(0); expect(indexOk).toBe(true);
  });
});

describe("realistic pencil: hatched, scribbled and light", () => {
  for (const [name, strokes, pencil] of [["firm hatching", "hatch", 0.55], ["light hatching", "hatch", 0.32], ["light scribble", "scribble", 0.3]]) {
    it(`reads ${name} on every sheet tried`, () => {
      for (const seed of [1, 2, 3]) { const { wrong, indexOk } = run({ strokes, pencil, seed }); expect(wrong, `seed ${seed}`).toBe(0); expect(indexOk, `seed ${seed} index`).toBe(true); }
    });
  }
  it("light hatching on a five-option, 100-question sheet is at worst flagged, never silently wrong", () => {
    for (const seed of [1, 2]) { const { silent, indexOk } = run({ n: 100, optionCount: 5, digits: 15, strokes: "hatch", pencil: 0.35, seed }); expect(silent).toBe(0); expect(indexOk).toBe(true); }
  });
  it("a rubbed-out ghost beside a firm hatched mark is still ignored", () => {
    // strengths: a firm mark 0.30 and a ghost 0.09
    expect(decideRow([0, 0.3, 0.09, 0], 0.05, 0).pick).toBe(1);
    expect(decideRow([0, 0.3, 0.09, 0], 0.05, 0).review).toBe(true);
  });
  it("a light mark only just over the line is read but flagged for the teacher to check", () => {
    const d = decideRow([0, 0.06, 0, 0], 0.05, 0, 0.05); expect(d.pick).toBe(1); expect(d.review).toBe(true);
  });
  it("blank rows stay blank: no bubble clears the line on a clean sheet", () => {
    const { r } = run({ strokes: "hatch", pencil: 0.0001 });
    expect(r.answers.filter(a => a.answer !== "").length).toBe(0);
  });
});

describe("a curled or shadowed page", () => {
  it("reads a page curling up to 3 mm on the right, with shading", () => {
    for (const seed of [1, 2]) { const { silent, wrong, indexOk } = run({ strokes: "hatch", pencil: 0.5, seed, curl: { mm: 3, side: "right", bow: 2 }, shade: 0.2 }); expect(silent).toBe(0); expect(wrong).toBeLessThanOrEqual(2); expect(indexOk).toBe(true); }
  });
  it("reads a page curling on the left, the bottom and the top", () => {
    for (const side of ["left", "bottom", "top"]) { const { silent, wrong } = run({ strokes: "hatch", pencil: 0.5, curl: { mm: 2.5, side, bow: 1.5 }, shade: 0.15 }); expect(silent, side).toBe(0); expect(wrong, side).toBeLessThanOrEqual(2); }
  });
  it("a shadow across the sheet is not read as marks (blank sheet stays blank)", () => {
    const { r } = run({ strokes: "hatch", pencil: 0.0001, shade: 0.3, curl: { mm: 2, side: "right", bow: 1 } });
    expect(r.answers.filter(a => a.answer !== "").length).toBe(0);
  });
  it("curl, light pencil and a sideways sheet together are never silently wrong", () => {
    for (const seed of [1, 2]) { const { silent } = run({ strokes: "hatch", pencil: 0.4, seed, angle: 90 * D, curl: { mm: 3, side: "right", bow: 2 }, shade: 0.2 }); expect(silent).toBe(0); }
  });
});

describe("row strengths", () => {
  it("measure each bubble against the blanks of its own row", () => {
    const { s } = rowStrengths([0.3, 0.32, 0.5, 0.31]);
    expect(s[2]).toBeGreaterThan(0.15); expect(s[0]).toBeLessThan(0.05);
  });
  it("one wiped, over-bright bubble does not make the others look marked", () => {
    const { s } = rowStrengths([0.0, 0.3, 0.3, 0.3]);
    expect(Math.max(...s)).toBeLessThan(0.05);
  });
  it("the mark threshold rises with the noise of the blanks but never drops under the minimum", () => {
    const quiet = markThreshold([[0, 0.01, 0, 0.005], [0, 0, 0.01, 0]]), noisy = markThreshold([[0.05, 0.08, 0.04, 0.07], [0.06, 0.05, 0.09, 0.04]]);
    expect(quiet).toBeGreaterThanOrEqual(0.045); expect(noisy).toBeGreaterThan(quiet);
  });
});
