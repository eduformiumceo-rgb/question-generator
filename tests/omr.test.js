import { describe, it, expect } from "vitest";
import jsQR from "jsqr";
import { readWassceSheet, scoreSheet, keyFromExam, resultsCsv, decideRow, homography, project } from "../src/omrReader.js";
import { sheetPayload, parseSheetPayload, qrMatrix, qrSvg, paperRef, SHEET_CODE_TAG } from "../src/sheetCode.js";
import { wassceSheetModel, wassceLayout, WASSCE_GEOM } from "../src/wassceSheet.js";
import { drawSheet, scan, randomPupil } from "./helpers/omrRaster.js";

const mismatches = (read, pupil) => pupil.answers.map((a, i) => ((read.answers[i].answer || "") === a ? null : `${i + 1}:${a || "-"}->${read.answers[i].answer || "-"}`)).filter(Boolean);

describe("sheet ID (QR code)", () => {
  it("payload round-trips and rejects anything that is not a sheet code", () => {
    const p = sheetPayload({ n: 50, optionCount: 4, digits: 10, version: "b", ref: "ab-12" });
    expect(p).toBe("EDQ1|50|4|10|B|AB12");
    expect(parseSheetPayload(p)).toEqual({ n: 50, optionCount: 4, digits: 10, version: "B", ref: "AB12" });
    expect(parseSheetPayload("https://example.com")).toBeNull();
    expect(parseSheetPayload("EDQ1|500|4|10|A|X")).toBeNull();
    expect(parseSheetPayload("EDQ1|50|7|10|A|X")).toBeNull();
    expect(p.startsWith(SHEET_CODE_TAG)).toBe(true);
  });
  it("paper reference is stable and differs between papers", () => {
    expect(paperRef(["a", "b", 50])).toBe(paperRef(["A", "B", 50]));
    expect(paperRef(["a", "b", 50])).not.toBe(paperRef(["a", "b", 40]));
    expect(paperRef(["x"])).toMatch(/^[A-Z0-9]{6}$/);
  });
  it("is a real QR code: a standard decoder reads the payload back from the matrix", () => {
    const text = sheetPayload({ n: 100, optionCount: 5, digits: 15, version: "D", ref: "ZZ99AA" });
    const m = qrMatrix(text), q = 4, mod = 8, T = m.length + 2 * q, px = T * mod, rgba = new Uint8ClampedArray(px * px * 4).fill(255);
    m.forEach((row, r) => row.forEach((d, c) => { if (!d) return; for (let y = 0; y < mod; y++) for (let x = 0; x < mod; x++) { const o = (((r + q) * mod + y) * px + (c + q) * mod + x) * 4; rgba[o] = rgba[o + 1] = rgba[o + 2] = 0; } }));
    expect(jsQR(rgba, px, px).data).toBe(text);
  });
  it("renders as an SVG of the stated size", () => {
    const svg = qrSvg("EDQ1|50|4|10|A|X", 21, "#12285C");
    expect(svg).toContain('width="21mm"');
    expect(svg).toContain('fill="#12285C"');
  });
});

describe("sheet geometry (the model the reader uses)", () => {
  it("has one bubble row per question, option columns that match the printed layout, and the index grid", () => {
    const M = wassceSheetModel(50, 4, 10), L = wassceLayout(50, 4, 10);
    expect(M.answers).toHaveLength(50);
    expect(M.answers[0].xs).toHaveLength(4);
    expect(M.index).toHaveLength(10);
    expect(M.index[0].ys).toHaveLength(10);
    expect(M.strip).toHaveLength(10 + L.per);
    expect(M.top).toHaveLength(L.cols * 4);
    expect(M.version.map(v => v.v)).toEqual(["A", "B", "C", "D"]);
    expect(M.sex.map(v => v.v)).toEqual(["M", "F"]);
  });
  it("every bubble lies inside the page, clear of the timing strip, and rows do not overlap", () => {
    for (const [n, o, d] of [[100, 5, 15], [40, 4, 4], [60, 4, 10]]) {
      const M = wassceSheetModel(n, o, d), g = WASSCE_GEOM;
      for (const a of M.answers) { expect(a.xs.at(-1) + 2.3).toBeLessThan(g.strip.x); expect(a.xs[0] - 2.3).toBeGreaterThan(g.L); }
      for (const c of M.index) for (const y of c.ys) { expect(y).toBeGreaterThan(0); expect(c.x + 1.9).toBeLessThan(g.strip.x); }
      expect(M.qr.x + M.qr.size).toBeLessThanOrEqual(g.L + g.CW + 0.001);
      expect(M.qr.y + M.qr.size).toBeLessThan(g.ruleTop);
      for (const v of [...M.version, ...M.sex, M.absent]) { expect(v.y).toBeGreaterThan(M.layout.infoTop); expect(v.y).toBeLessThan(M.layout.infoTop + M.layout.idH); }
    }
  });
  it("version, sex and absent bubbles sit inside their own boxes with room to spare", () => {
    const M = wassceSheetModel(50, 4, 10), L = M.layout, g = WASSCE_GEOM;
    expect(M.version[0].x - 3.5).toBeGreaterThan(g.L + 24);                       // clear of the PAPER VERSION label
    expect(M.version[3].x + 3.5).toBeLessThan(g.L + L.c1W);
    expect(M.sex[0].x - 3.5).toBeGreaterThan(g.L + L.c1W + g.left.gap + 8);
    expect(M.sex[1].x + 3.5).toBeLessThan(g.L + L.leftW);
    expect(M.absent.x + 4).toBeLessThan(g.L + L.leftW);
  });
});

describe("homography", () => {
  it("maps four points exactly and handles a turn plus a perspective squeeze", () => {
    const src = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 200 }, { x: 100, y: 200 }], dst = [{ x: 10, y: 20 }, { x: 118, y: 14 }, { x: 4, y: 230 }, { x: 108, y: 240 }];
    const H = homography(src, dst);
    src.forEach((p, i) => { const q = project(H, p.x, p.y); expect(q.x).toBeCloseTo(dst[i].x, 6); expect(q.y).toBeCloseTo(dst[i].y, 6); });
  });
  it("refuses a degenerate set of points", () => { expect(homography([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }], [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }])).toBeNull(); });
});

describe("deciding a row of bubbles", () => {
  it("blank, single, ghost beside a firm mark, and a double mark", () => {
    expect(decideRow([0.1, 0.12, 0.09, 0.11], 0.31).state).toBe("blank");
    expect(decideRow([0.1, 0.7, 0.09, 0.11], 0.31)).toMatchObject({ pick: 1, state: "ok", review: false });
    expect(decideRow([0.34, 0.8, 0.09, 0.11], 0.31)).toMatchObject({ pick: 1, state: "ok", review: true });
    expect(decideRow([0.6, 0.7, 0.09, 0.11], 0.31)).toMatchObject({ pick: -1, state: "multiple", review: true });
  });
  it("flags a very light mark for checking", () => { expect(decideRow([0.1, 0.34, 0.1, 0.1], 0.31).review).toBe(true); });
});

describe("reading a scanned sheet", () => {
  const cases = [
    { name: "50 questions, A-D, 10-digit index, clean scan", n: 50, o: 4, d: 10, opts: {} },
    { name: "100 questions, A-E, 15-digit index", n: 100, o: 5, d: 15, opts: {} },
    { name: "40 questions with the page tilted 2 degrees and shifted", n: 40, o: 4, d: 8, opts: { angle: 0.035, dx: 3, dy: -2 } },
    { name: "60 questions fed upside down", n: 60, o: 4, d: 10, opts: { flip180: true } },
    { name: "30 questions, upside down AND tilted, noisy", n: 30, o: 4, d: 12, opts: { flip180: true, angle: -0.05, noise: 0.08 } },
  ];
  for (const c of cases) it(`reads every answer, the index number and the version: ${c.name}`, () => {
    const meta = { schoolName: "Test SHS", subject: "Maths", examVersion: "C" };
    const pupil = randomPupil(c.n, c.o, c.d, c.n + c.d);
    const s = scan(drawSheet({ n: c.n, optionCount: c.o, digits: c.d, meta, pupil }), c.opts);
    const r = readWassceSheet(s, {});
    expect(r.ok).toBe(true);
    expect(r.qr).toBe(true);
    expect([r.n, r.optionCount, r.digits]).toEqual([c.n, c.o, c.d]);
    expect(r.indexNumber).toBe(pupil.index);
    expect(r.indexOk).toBe(true);
    expect(r.version).toBe("C");
    expect(r.sex).toBe("F");
    expect(r.rotated).toBe(!!c.opts.flip180);
    expect(mismatches(r, pupil)).toEqual([]);
  });

  it("still reads when the QR code cannot be read, using the settings it is given", () => {
    const pupil = randomPupil(40, 4, 10, 5), d = drawSheet({ n: 40, optionCount: 4, digits: 10, pupil });
    d.img.fill(0, 0, 0);                                      // keep the sheet, then wipe the QR area
    const M = d.M; for (let y = Math.floor((M.qr.y - 1) * d.ppm); y < Math.ceil((M.qr.y + M.qr.size + 1) * d.ppm); y++) for (let x = Math.floor((M.qr.x - 1) * d.ppm); x < Math.ceil((M.qr.x + M.qr.size + 1) * d.ppm); x++) d.img[y * d.W + x] = 0;
    const r = readWassceSheet(scan(d), { n: 40, optionCount: 4, digits: 10 });
    expect(r.ok).toBe(true); expect(r.qr).toBe(false);
    expect(mismatches(r, pupil)).toEqual([]);
    const none = readWassceSheet(scan(d), {});
    expect(none.ok).toBe(false); expect(none.error).toMatch(/number of questions/);
  });

  it("marks blanks and double marks as such, and is not fooled by a faint rubbed-out ghost", () => {
    const pupil = { answers: ["A", "", "*", "C", "D", "B"], index: "1234567890" };
    const s = scan(drawSheet({ n: 6, optionCount: 4, digits: 10, pupil, ghosts: [{ q: 4, opt: "A" }] }));
    const r = readWassceSheet(s, {});
    expect(r.answers.map(a => a.answer)).toEqual(["A", "", "*", "C", "D", "B"]);
    expect(r.answers[1].state).toBe("blank");
    expect(r.answers[2].state).toBe("multiple");
    expect(r.review).toContain(3);
    expect(r.answers[3].answer).toBe("C");                      // the faint ghost of A beside the real answer is ignored
    expect(r.answerString).toBe("A-*CDB");
  });

  it("reads a gap in the index number as '_' and a double digit as '*'", () => {
    const d = drawSheet({ n: 10, pupil: { answers: Array(10).fill("A"), index: "0123456789" } });
    const M = d.M, colY = M.index[3].ys[3], colX = M.index[3].x;       // wipe the shaded digit (3) in column 3
    for (let y = Math.floor((colY - 2) * d.ppm); y < Math.ceil((colY + 2) * d.ppm); y++) for (let x = Math.floor((colX - 2) * d.ppm); x < Math.ceil((colX + 2) * d.ppm); x++) d.img[y * d.W + x] = 0;
    const r = readWassceSheet(scan(d), {});
    expect(r.indexNumber).toBe("012_456789");
    expect(r.indexOk).toBe(false);
  });

  it("reads the absent oval and the candidate's sex", () => {
    const r = readWassceSheet(scan(drawSheet({ n: 10, pupil: { answers: Array(10).fill(""), index: "0000000000" }, absent: true, sex: "M" })), {});
    expect(r.absent).toBe(true); expect(r.sex).toBe("M");
    const r2 = readWassceSheet(scan(drawSheet({ n: 10, pupil: { answers: Array(10).fill("A"), index: "0000000000" } })), {});
    expect(r2.absent).toBe(false);
  });

  it("copes with light pencil", () => {
    const pupil = randomPupil(50, 4, 10, 11, { blanks: 0, doubles: 0 });
    const r = readWassceSheet(scan(drawSheet({ n: 50, optionCount: 4, digits: 10, pupil, pencil: 0.46 })), {});
    expect(mismatches(r, pupil)).toEqual([]);
  });

  it("says what is wrong when the corners are not in the picture", () => {
    const blank = { data: new Uint8ClampedArray(400 * 500 * 4).fill(255), width: 400, height: 500 };
    const r = readWassceSheet(blank, {});
    expect(r.ok).toBe(false); expect(r.error).toMatch(/corner/);
  });
});

describe("marking", () => {
  const read = { answers: [{ q: 1, answer: "A" }, { q: 2, answer: "C" }, { q: 3, answer: "" }, { q: 4, answer: "*" }, { q: 5, answer: "B" }] };
  it("scores against a key given as a string or an object", () => {
    const a = scoreSheet(read, "ABCDB"), b = scoreSheet(read, { 1: "A", 2: "B", 3: "C", 4: "D", 5: "B" });
    for (const s of [a, b]) expect(s).toMatchObject({ score: 2, total: 5, right: 2, wrong: 1, blank: 1, multiple: 1 });
    expect(a.perQ[1]).toEqual({ q: 2, given: "C", correct: "B", ok: false });
  });
  it("counts only the questions that have a key, and scales by marks", () => {
    expect(scoreSheet(read, "AC")).toMatchObject({ score: 2, total: 2 });
    expect(scoreSheet(read, "AC", 2)).toMatchObject({ score: 4, total: 4 });
  });
  it("builds a key from a generated paper", () => {
    expect(keyFromExam({ answerKey: [{ number: 1, answer: "a" }, { number: 2, answer: "C. text" }, { number: 3 }] })).toEqual({ 1: "A", 2: "C" });
    expect(keyFromExam(null)).toEqual({});
  });
  it("writes a CSV with one row per sheet and quotes safely", () => {
    const rows = [{ file: 'scan "1".png', read: { indexNumber: "0123", version: "B", sex: "F", absent: false, review: [3, 4], answers: read.answers }, score: scoreSheet(read, "ABCDB") }];
    const csv = resultsCsv(rows, 5).split("\r\n");
    expect(csv).toHaveLength(2);
    expect(csv[0]).toContain('"Index number"'); expect(csv[0]).toContain('"Q5"');
    expect(csv[1]).toContain('"scan ""1"".png"'); expect(csv[1]).toContain('"3 4"');
  });
});
