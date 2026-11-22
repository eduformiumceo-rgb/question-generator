// The visual rules this app's redesign depends on, so a later edit can't quietly undo them.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const css = read("src/theme.css");
const comp = (n) => read(`src/components/${n}`);

describe("design system", () => {
  it("uses all three brand colours: deep blue, teal and white", () => {
    expect(css).toMatch(/--brand-solid:\s*#102A6B/i);
    expect(css).toMatch(/--accent:\s*#0D9488/i);
    expect(css).toMatch(/--card-bg:\s*#FFFFFF/i);
  });
  it("primary button teal keeps white text readable (AA, 4.5:1)", () => {
    const hex = css.match(/--btn:\s*(#[0-9A-F]{6})/i)[1];
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(1.05 / (L + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
  it("placeholders are not faded to half opacity", () => {
    expect(css).not.toMatch(/::placeholder[^}]*opacity:\s*0?\.5/);
  });
  it("draws its own checkbox, because the global appearance:none made ticked boxes look empty", () => {
    expect(css).toMatch(/input\[type="checkbox"\]:checked/);
  });
  it("shares one chip, note and inset style instead of repeating inline borders", () => {
    for (const c of [".qa-chip", ".qa-note", ".qa-inset", ".qa-opt", ".qa-gen"]) expect(css).toContain(c);
  });
  it("components carry no icon tiles or Icon imports (the stepper's tick is the only icon)", () => {
    for (const f of ["CardTitle.jsx", "Welcome.jsx", "TopicSelector.jsx", "ExamStructureBuilder.jsx"]) {
      expect(comp(f)).not.toMatch(/import Icon/);
      expect(comp(f)).not.toContain("qa-tile");
    }
  });
  it("the accordion has a single border (no accent border, no inner divider)", () => {
    const src = comp("TopicSelector.jsx");
    expect(src).toContain('border: "1px solid var(--border-strong)", borderRadius: 12');
    expect(src).not.toMatch(/border: `1\.5px solid \$\{open/);
    expect(src).not.toMatch(/padding: "6px 16px 16px", borderTop/);
  });
  it("the font is self-hosted (no third-party request, no render blocking)", () => {
    expect(read("src/main.jsx")).toMatch(/@fontsource-variable\/dm-sans/);
    expect(read("src/sharedStyles.jsx")).toMatch(/DM Sans Variable/);
  });
});
