import { describe, it, expect } from "vitest";
import { DIAGRAM_TEMPLATES, templateById, renderDiagramTemplate, describeTemplatesForPrompt } from "../src/diagramRegistry.js";
import { niceScale, fmt } from "../src/diagramTemplates.js";
import { isSafeGeneratedSVG, validateExamData, prepareDiagram } from "../src/examTemplate.js";

const render = (id, p) => renderDiagramTemplate(id, p);

describe("every template", () => {
  it.each(DIAGRAM_TEMPLATES.map(t => [t.id, t]))("%s draws its own example as a safe SVG", (id, t) => {
    const r = render(id, t.example);
    expect(r, "example should render").not.toBeNull();
    expect(isSafeGeneratedSVG(r.svg)).toBe(true);
    expect(r.svg.length).toBeLessThan(20000);
    expect(r.svg).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/);
  });
  it.each(DIAGRAM_TEMPLATES.map(t => [t.id, t]))("%s draws its defaults without throwing", (id, t) => {
    expect(() => render(id, t.defaults)).not.toThrow();
  });
  it.each(DIAGRAM_TEMPLATES.map(t => [t.id]))("%s survives hostile and garbage params", (id) => {
    const evil = "<script>alert(1)</script>\"onload=\"x";
    const junk = [undefined, null, 5, "x", [], {}, { a: 1 }, { title: evil, labels: [evil], categories: [evil], values: [evil, NaN, Infinity, -1], points: [evil, null, 7], dims: [evil], series: [evil], regions: { A: evil }, setNames: [evil, evil], top: [evil], lines: [evil], vertexLabels: [evil] }];
    for (const p of junk) {
      let r;
      expect(() => { r = render(id, p); }).not.toThrow();
      if (r) { expect(isSafeGeneratedSVG(r.svg)).toBe(true); expect(r.svg).not.toContain("<script"); expect(r.svg).not.toContain('"onload'); }
    }
  });
  it("unknown template ids return null", () => {
    expect(render("nope", {})).toBeNull();
    expect(templateById("nope")).toBeNull();
  });
  it("every template has unique id, label and a described field", () => {
    expect(new Set(DIAGRAM_TEMPLATES.map(t => t.id)).size).toBe(DIAGRAM_TEMPLATES.length);
    DIAGRAM_TEMPLATES.forEach(t => { expect(t.label).toBeTruthy(); expect(t.fields.length).toBeGreaterThan(0); });
  });
  it("the AI prompt lists every template id", () => {
    const d = describeTemplatesForPrompt();
    DIAGRAM_TEMPLATES.forEach(t => expect(d).toContain(`"${t.id}"`));
  });
});

describe("accuracy", () => {
  it("niceScale picks friendly steps", () => {
    expect(niceScale(0, 9)).toEqual({ min: 0, max: 10, step: 2 });
    expect(niceScale(0, 95)).toEqual({ min: 0, max: 100, step: 20 });
    expect(niceScale(0, 1)).toMatchObject({ min: 0, max: 1 });
    expect(niceScale(5, 5).max).toBeGreaterThan(5);
  });
  it("fmt trims noise", () => {
    expect(fmt(2.5)).toBe("2.5"); expect(fmt(3)).toBe("3"); expect(fmt(1e-12)).toBe("0"); expect(fmt(0.1 + 0.2)).toBe("0.3");
  });
  it("triangle: rejects impossible sides, draws a 3-4-5 right triangle with the right-angle marker", () => {
    expect(render("triangle", { sideLengths: [1, 1, 5] })).toBeNull();
    const r = render("triangle", { sideLengths: [4, 5, 3], rightAngleAt: "B", sideLabels: ["4 cm", "", "3 cm"] });
    expect(r.svg).toContain("4 cm"); expect(r.svg).toContain("3 cm");
    expect(r.svg).toContain("<polygon"); // the triangle itself
    expect(r.svg.match(/<polyline/g).length).toBe(1); // the right-angle square
  });
  it("triangle: lengths that break Pythagoras fall back to a true 3-4-5 shape instead of a lie", () => {
    const bad = render("triangle", { sideLengths: [3, 3, 3], rightAngleAt: "B" });
    expect(bad.params.sideLengths).toEqual([]);
  });
  it("pie chart: angles add to 360 and percentages are right", () => {
    const r = render("pie_chart", { labels: ["A", "B", "C", "D"], values: [40, 30, 20, 10], show: "angle" });
    expect(r.svg).toContain("144°"); expect(r.svg).toContain("108°"); expect(r.svg).toContain("72°"); expect(r.svg).toContain("36°");
    expect(render("pie_chart", { labels: ["A", "B"], values: [1, 3], show: "percent" }).svg).toContain("25%");
  });
  it("pie chart: rejects zero or negative slices", () => {
    expect(render("pie_chart", { labels: ["A", "B"], values: [5, 0] })).toBeNull();
  });
  it("bar chart: bar heights are proportional to the values", () => {
    const r = render("bar_chart", { categories: ["a", "b"], values: [10, 5] });
    const hs = [...r.svg.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="([\d.]+)" fill="#cfcfcf"/g)].map(m => parseFloat(m[1]));
    expect(hs).toHaveLength(2);
    expect(hs[0] / hs[1]).toBeCloseTo(2, 1);
  });
  it("bar chart: needs matching labels and values, and no negatives", () => {
    expect(render("bar_chart", { categories: [], values: [] })).toBeNull();
    expect(render("bar_chart", { categories: ["a"], values: [-3] })).toBeNull();
    expect(render("bar_chart", { categories: ["a", "b", "c"], values: [1, 2] }).params.categories).toHaveLength(2);
  });
  it("number line: marks only points inside the range and supports open circles + shading", () => {
    const r = render("number_line", { min: 0, max: 10, step: 1, points: [{ value: 3, label: "A" }, { value: 99, label: "Z" }], shade: true, shadeFrom: 2, shadeTo: 6, toOpen: true });
    expect(r.svg).toContain(">A<"); expect(r.svg).not.toContain(">Z<");
    expect(r.svg).toContain('fill="#fff"'); // the open end
  });
  it("number line: tick count is capped so labels never collide", () => {
    const r = render("number_line", { min: 0, max: 1000, step: 1 });
    expect((r.svg.match(/<text/g) || []).length).toBeLessThanOrEqual(45);
  });
  it("coordinate plane: plots points, polygons and both kinds of graph", () => {
    const r = render("coordinate_plane", { xMin: -5, xMax: 5, yMin: -5, yMax: 5, points: [{ x: 1, y: 2, label: "A" }], polygon: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }], graphs: [{ type: "linear", m: 2, c: 1, label: "L" }, { type: "quadratic", a: 1, b: 0, c: -4, label: "Q" }] });
    expect(r.svg).toContain(">A<"); expect(r.svg).toContain("<polygon"); expect(r.svg).toContain(">L<"); expect(r.svg).toContain(">Q<");
  });
  it("coordinate plane: clamps absurd ranges", () => {
    const p = render("coordinate_plane", { xMin: -9999, xMax: 9999, yMin: -9999, yMax: 9999 }).params;
    expect(p.xMin).toBe(-20); expect(p.xMax).toBe(20);
  });
  it("venn: 2 or 3 sets, region text is escaped", () => {
    expect(render("venn_diagram", { setNames: ["A", "B"], regions: { AB: "5" } }).params.setNames).toHaveLength(2);
    const three = render("venn_diagram", { setNames: ["A", "B", "C"], regions: { ABC: "<b>" } });
    expect(three.params.setNames).toHaveLength(3);
    expect(three.svg).not.toContain("<b>");
  });
  it("circle: ignores lines that refer to unknown points", () => {
    const r = render("circle", { centerLabel: "O", points: [{ label: "A", angle: 0 }, { label: "B", angle: 90 }], lines: ["A-B", "A-Z", "O-A"] });
    expect(r.params.lines).toEqual([["A", "B"], ["O", "A"]]);
  });
  it("circuit: series and parallel layouts, unknown parts dropped", () => {
    const s = render("circuit", { source: "cell", series: ["switch:S", "laser", "bulb:L"] });
    expect(s.params.series.map(x => x.type)).toEqual(["switch", "bulb"]);
    const p = render("circuit", { source: "battery", branches: [["bulb:L1"], ["bulb:L2"]] });
    expect(p.params.branches).toHaveLength(2);
    expect(p.svg).toContain("L1"); expect(p.svg).toContain("L2");
    expect(render("circuit", { branches: [["bulb"]] }).params.branches).toEqual([]); // one branch is just a series circuit
  });
  it("clock: hands point to the right place", () => {
    const r = render("clock", { hour: 3, minute: 0 });
    // minute hand straight up (x = centre), hour hand pointing right (y = centre)
    expect(r.svg).toMatch(/<line x1="125" y1="125" x2="171" y2="125"/); // hour hand length 46 -> 125+46
    expect(r.svg).toMatch(/<line x1="125" y1="125" x2="125" y2="41"/);  // minute hand length 84 -> 125-84
  });
  it("fraction shape: shades exactly the requested parts", () => {
    const r = render("fraction_shape", { shape: "bar", parts: 5, shaded: 2 });
    expect((r.svg.match(/fill="#9c9c9c"/g) || []).length).toBe(2);
    expect(render("fraction_shape", { shape: "grid", parts: 4, rows: 3, shaded: 12 }).svg.match(/fill="#9c9c9c"/g)).toHaveLength(12);
    expect(render("fraction_shape", { shape: "bar", parts: 4, shaded: 99 }).params.shaded).toBe(4);
  });
  it("solids: all four shapes draw", () => {
    ["cuboid", "cylinder", "cone", "sphere"].forEach(kind => expect(render("solid", { kind, dims: ["5 cm", "4 cm", "3 cm"] })).not.toBeNull());
  });
  it("parallel lines: labels appear where requested", () => {
    const r = render("parallel_lines", { top: ["", "65°", "", ""], bottom: ["", "", "x", ""] });
    expect(r.svg).toContain("65°"); expect(r.svg).toContain(">x<");
  });
});

describe("AI output is turned into drawings by validateExamData", () => {
  const exam = (diagram) => ({ sections: [{ id: "A", label: "A", type: "structured", questions: [{ number: 1, text: "q", options: null, parts: [], marks: 5, diagram }] }] });
  const run = (diagram) => { const e = exam(diagram); validateExamData(e, []); return e.sections[0].questions[0].diagram; };

  it("draws a valid template and keeps normalised params for later editing", () => {
    const d = run({ needed: true, description: "bars", generatable: true, template: "bar_chart", params: { categories: ["a", "b"], values: [3, 4] } });
    expect(d.generatable).toBe(true);
    expect(isSafeGeneratedSVG(d.svg)).toBe(true);
    expect(d.params.values).toEqual([3, 4]);
  });
  it("falls back to the text placeholder when the template params are unusable", () => {
    const d = run({ needed: true, description: "bars", generatable: true, template: "bar_chart", params: { categories: [], values: [] } });
    expect(d.generatable).toBe(false); expect(d.svg).toBeNull(); expect(d.template).toBeNull();
  });
  it("falls back for an unknown template id", () => {
    expect(run({ needed: true, description: "x", generatable: true, template: "teleporter", params: {} }).generatable).toBe(false);
  });
  it("still sanitises a raw SVG from older exams", () => {
    expect(run({ needed: true, generatable: true, svg: "<svg><script>1</script></svg>" }).svg).toBeNull();
    expect(run({ needed: true, generatable: true, svg: `<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3"/></svg>` }).generatable).toBe(true);
  });
  it("prepareDiagram ignores questions without a diagram", () => {
    expect(() => prepareDiagram({ number: 1 })).not.toThrow();
    expect(() => prepareDiagram(null)).not.toThrow();
  });
});
