// Performance budget for the UI polish layer. These rules exist because the app must stay fast on old phones and slow
// networks. If one of these fails, the fix is almost never to edit the test: find a cheaper way to get the effect.
import { describe, it, expect } from "vitest";
import fs from "fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const theme = read("src/theme.css");
const polish = theme.slice(theme.lastIndexOf("/*", theme.indexOf("APP POLISH")));   // from the start of the heading comment
const ADDED = ["src/components/Icon.jsx", "src/components/WizardProgress.jsx", "src/components/CardTitle.jsx", "src/components/Welcome.jsx"];

describe("UI polish layer: no expensive effects", () => {
  it("has a polish block to check", () => { expect(polish.length).toBeGreaterThan(500); });

  it("uses no shadows, filters, blur or will-change (outside comments)", () => {
    const code = polish.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/box-shadow\s*:\s*(?!\s*none)/);   // "none" is the only allowed value
    expect(code).not.toMatch(/(^|[;{\s])filter\s*:/);
    expect(code).not.toMatch(/backdrop-filter/);
    expect(code).not.toMatch(/blur\(/);
    expect(code).not.toMatch(/will-change/);
  });

  it("animates only opacity and transform", () => {
    const code = polish.replace(/\/\*[\s\S]*?\*\//g, "");
    const frames = [...code.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)];
    expect(frames.length).toBeGreaterThanOrEqual(3);
    for (const [, name, body] of frames) {
      const props = [...body.matchAll(/([\w-]+)\s*:/g)].map(m => m[1]);
      for (const p of props) expect(["opacity", "transform"], `@keyframes ${name} animates ${p}`).toContain(p);
    }
  });

  it("only transitions cheap properties (colour, border, opacity, transform)", () => {
    const code = polish.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of code.matchAll(/transition\s*:\s*([^;]+);/g)) {
      for (const part of m[1].split(/,(?![^(]*\))/)) {            // split on commas that are not inside cubic-bezier(...)
        const prop = part.trim().split(/\s+/)[0];
        if (prop === "none") continue;
        expect(["border-color", "background-color", "color", "opacity", "transform"], `transition on ${prop}`).toContain(prop);
      }
    }
  });

  it("wizard cards only FADE: a transform on them doubled layout passes when measured", () => {
    const rule = /\.qa-flow\s*>\s*\*\s*\{([^}]*)\}/.exec(polish.replace(/\/\*[\s\S]*?\*\//g, ""))[1];
    expect(rule).toMatch(/qa-fade/);
    expect(rule).not.toMatch(/qa-rise|qa-pop|transform/);
  });

  it("nothing loops except the loading skeleton", () => {
    const code = polish.replace(/\/\*[\s\S]*?\*\//g, "");
    const infinite = [...code.matchAll(/([^{}]+)\{[^{}]*infinite[^{}]*\}/g)].map(m => m[1].trim());
    expect(infinite).toEqual([".qa-skel"]);
  });

  it("switches motion off for people who prefer reduced motion", () => {
    expect(polish).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    const reduced = polish.slice(polish.indexOf("prefers-reduced-motion"));
    for (const cls of [".qa-flow", ".qa-rise", ".qa-pop", ".qa-skel"]) expect(reduced).toContain(cls);
  });

  it("keeps keyboard focus visible (the old global rules removed every outline)", () => {
    expect(polish).toMatch(/button:focus-visible[\s\S]*outline:\s*2px solid/);
  });
});

describe("loading: nothing blocks the first paint", () => {
  it("theme.css has no @import (it blocks rendering until the font server answers)", () => {
    expect(theme.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/@import/);
  });
  it("index.html loads the one web font without blocking", () => {
    const html = read("index.html").replace(/<noscript>[\s\S]*?<\/noscript>/g, "");              // the <noscript> fallback may be a plain link
    expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet["'][^>]+fonts\.googleapis/);           // a plain stylesheet link would block
    expect(html).toMatch(/rel="preload"[^>]+as="style"[^>]+fonts\.googleapis[^>]+onload=/);
    expect(html).toMatch(/Playfair\+Display:wght@800/);
    expect(html).not.toMatch(/family=Inter/);                                                   // Inter was never used
  });
  it("no other CSS in src imports web fonts", () => {
    for (const f of ["src/AuthCallback.jsx"]) expect(read(f)).not.toMatch(/@import url\('https:\/\/fonts/);
  });
});

describe("new components stay cheap", () => {
  it.each(ADDED)("%s has no shadows, filters, will-change or animation libraries", (f) => {
    const src = read(f);
    expect(src).not.toMatch(/boxShadow|backdropFilter|willChange|filter\s*:|blur\(/);
    expect(src).not.toMatch(/framer-motion|gsap|react-spring|lottie|anime/);
  });
  it("no animation library has been added to the app", () => {
    const pkg = JSON.parse(read("package.json"));
    const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const lib of ["framer-motion", "gsap", "animejs", "react-spring", "lottie-web", "react-transition-group", "@react-spring/web", "motion"]) expect(all).not.toContain(lib);
  });
});
