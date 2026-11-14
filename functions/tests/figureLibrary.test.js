import { describe, it, expect } from "vitest";
import { addToLibrary, loadLibrary, removeFromLibrary, LIBRARY_MAX_ITEMS, LIBRARY_MAX_CHARS } from "../src/figureLibrary.js";

const fakeStorage = (quota = Infinity) => {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (v.length > quota) throw new Error("QuotaExceededError"); m.set(k, v); },
  };
};
const img = (tag, n = 20) => `data:image/png;base64,${tag}${"A".repeat(n)}`;

describe("figure library", () => {
  it("saves newest-first and loads back", () => {
    const s = fakeStorage();
    addToLibrary({ name: "Map", src: img("a") }, s, 1);
    addToLibrary({ name: "Cell", src: img("b") }, s, 2);
    expect(loadLibrary(s).map(x => x.name)).toEqual(["Cell", "Map"]);
  });
  it("never stores the same picture twice", () => {
    const s = fakeStorage();
    addToLibrary({ name: "One", src: img("a") }, s, 1);
    addToLibrary({ name: "Again", src: img("a") }, s, 2);
    expect(loadLibrary(s)).toHaveLength(1);
    expect(loadLibrary(s)[0].name).toBe("Again");
  });
  it("drops the oldest when the shelf is full", () => {
    const s = fakeStorage();
    for (let i = 0; i < LIBRARY_MAX_ITEMS + 3; i++) addToLibrary({ name: `n${i}`, src: img(`t${i}`) }, s, i);
    const items = loadLibrary(s);
    expect(items).toHaveLength(LIBRARY_MAX_ITEMS);
    expect(items[0].name).toBe(`n${LIBRARY_MAX_ITEMS + 2}`);
    expect(items.some(x => x.name === "n0")).toBe(false);
  });
  it("keeps total size under the cap by evicting the oldest", () => {
    const s = fakeStorage();
    const big = Math.floor(LIBRARY_MAX_CHARS / 3);
    for (let i = 0; i < 5; i++) addToLibrary({ name: `b${i}`, src: img(`x${i}`, big) }, s, i);
    expect(loadLibrary(s).reduce((n, x) => n + x.src.length, 0)).toBeLessThanOrEqual(LIBRARY_MAX_CHARS);
    expect(loadLibrary(s)[0].name).toBe("b4");
  });
  it("rejects non-images and oversize pictures", () => {
    const s = fakeStorage();
    expect(addToLibrary({ name: "x", src: "https://evil/x.png" }, s).ok).toBe(false);
    expect(addToLibrary({ name: "x", src: img("z", LIBRARY_MAX_CHARS + 10) }, s).ok).toBe(false);
    expect(loadLibrary(s)).toEqual([]);
  });
  it("makes room when the browser quota is hit, instead of losing the new figure", () => {
    const s = fakeStorage(900);
    for (let i = 0; i < 5; i++) addToLibrary({ name: `q${i}`, src: img(`k${i}`, 150) }, s, i);
    const items = loadLibrary(s);
    expect(items[0].name).toBe("q4");
    expect(items.length).toBeGreaterThan(0);
  });
  it("survives corrupt storage and missing storage", () => {
    const s = fakeStorage(); s.setItem("eduformium.figureLibrary.v1", "{not json");
    expect(loadLibrary(s)).toEqual([]);
    expect(loadLibrary(null)).toEqual([]);
    expect(addToLibrary({ name: "x", src: img("a") }, null).ok).toBe(false);
  });
  it("removes by id", () => {
    const s = fakeStorage();
    const { items } = addToLibrary({ name: "Map", src: img("a") }, s, 1);
    expect(removeFromLibrary(items[0].id, s)).toEqual([]);
    expect(loadLibrary(s)).toEqual([]);
  });
});
