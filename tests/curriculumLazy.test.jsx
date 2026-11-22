// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import {
  ALL_SUBJECTS, SUPPORTED_SUBJECTS, getStrands, getSupportedClasses, shsSubjectInDB,
  loadSubject, loadAllSubjects, isSubjectLoaded, hasSubject,
} from "../src/curriculumIndex.js";
import { LOADERS } from "../src/curriculumLoaders.js";
import MANIFEST from "../src/curriculumManifest.js";
import { useSubjectData } from "../src/useSubjectData.js";

afterEach(cleanup);

describe("manifest", () => {
  beforeAll(async () => { await loadAllSubjects(); }, 120000);

  it("lists exactly the subjects that have loaders", () => {
    expect(Object.keys(MANIFEST).sort()).toEqual(Object.keys(LOADERS).sort());
    expect(SUPPORTED_SUBJECTS.sort()).toEqual(Object.keys(MANIFEST).sort());
  });
  it("is in sync with the real data (run `npm run sync:curriculum` if this fails)", () => {
    for (const name of Object.keys(LOADERS)) {
      expect(Object.keys(ALL_SUBJECTS[name].data), name).toEqual(MANIFEST[name]);
    }
  });
  it("answers class and SHS questions without any data loaded", () => {
    expect(getSupportedClasses("Mathematics")).toContain("Basic 7");
    expect(getSupportedClasses("No such subject")).toEqual([]);
    expect(shsSubjectInDB("Physics (GS)")).toBe(true);
    expect(shsSubjectInDB("Mathematics")).toBe(true);
    expect(shsSubjectInDB("Science")).toBe(false);
    expect(shsSubjectInDB("")).toBe(false);
  });
});

describe("source files", () => {
  it("has no two byte-identical curriculum files (duplicates must be re-exports of one copy)", () => {
    const seen = new Map(), dups = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      if (!/_curriculum\.js$|KG_CURRICULUM\.js$/.test(e.name)) return;
      const buf = fs.readFileSync(p);
      if (buf.length < 1000) return;                       // one-line re-export stubs are expected to look alike
      const h = crypto.createHash("md5").update(buf).digest("hex");
      if (seen.has(h)) dups.push(`${p} = ${seen.get(h)}`); else seen.set(h, p);
    });
    walk(path.resolve(__dirname, "../src"));
    expect(dups).toEqual([]);
  });
});

describe("loading", () => {
  it("returns nothing before a subject is loaded, the full data after", async () => {
    // pick a subject nothing above has loaded in this file: loadSubject is cached per process, so use a fresh check via hasSubject
    expect(hasSubject("Mathematics")).toBe(true);
    expect(hasSubject("Nope")).toBe(false);
    expect(hasSubject("")).toBe(false);
    const data = await loadSubject("Mathematics");
    expect(isSubjectLoaded("Mathematics")).toBe(true);
    expect(getStrands("Mathematics", "Basic 7").length).toBeGreaterThan(0);
    expect(Object.keys(data)).toEqual(MANIFEST["Mathematics"]);
  });
  it("rejects an unknown subject", async () => {
    await expect(loadSubject("Underwater Basket Weaving")).rejects.toThrow(/Unknown subject/);
    expect(getStrands("Underwater Basket Weaving", "Basic 1")).toEqual([]);
  });
});

describe("loading edge cases (with a stubbed loader)", () => {
  const KEY = "Arabic";
  const real = LOADERS[KEY];
  afterEach(() => { LOADERS[KEY] = real; });

  it("two callers share ONE download", async () => {
    // Arabic is already cached by earlier tests in this process; use a throwaway subject name instead
    LOADERS.__share = async () => { LOADERS.__calls = (LOADERS.__calls || 0) + 1; await new Promise(r => setTimeout(r, 20)); return { "Basic 1": [] }; };
    const [a, b] = await Promise.all([loadSubject("__share"), loadSubject("__share")]);
    expect(a).toBe(b);
    expect(LOADERS.__calls).toBe(1);
    await loadSubject("__share");
    expect(LOADERS.__calls).toBe(1);   // and later calls are served from the cache
    delete LOADERS.__share; delete LOADERS.__calls;
  });
  it("a failed download is not cached: the next call retries and can succeed", async () => {
    let calls = 0;
    LOADERS.__flaky = async () => { calls++; if (calls === 1) throw new Error("offline"); return { "Basic 1": [{ strand: "S", subStrands: [] }] }; };
    await expect(loadSubject("__flaky")).rejects.toThrow("offline");
    expect(isSubjectLoaded("__flaky")).toBe(false);
    await expect(loadSubject("__flaky")).resolves.toBeTruthy();
    expect(calls).toBe(2);
    delete LOADERS.__flaky;
  });
});

describe("useSubjectData", () => {
  it("is ready at once for an empty or unknown subject (nothing to load)", () => {
    expect(renderHook(() => useSubjectData("")).result.current).toMatchObject({ ready: true, loading: false, error: null });
    expect(renderHook(() => useSubjectData("Not a subject")).result.current.ready).toBe(true);
  });
  it("goes loading -> ready and re-renders when the data arrives", async () => {
    let release;
    LOADERS.__slow = () => new Promise(r => { release = () => r({ "Basic 1": [] }); });
    const { result } = renderHook(() => useSubjectData("__slow"));
    expect(result.current).toMatchObject({ ready: false, loading: true });
    await act(async () => { release(); });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.loading).toBe(false);
    delete LOADERS.__slow;
  });
  it("reports a failed download, and retry() recovers", async () => {
    let ok = false;
    LOADERS.__retry = async () => { if (!ok) throw new Error("offline"); return { "Basic 1": [] }; };
    const { result } = renderHook(() => useSubjectData("__retry"));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current).toMatchObject({ ready: false, loading: false });
    ok = true;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error).toBeNull();
    delete LOADERS.__retry;
  });
  it("switching subject loads the new one", async () => {
    const { result, rerender } = renderHook(({ s }) => useSubjectData(s), { initialProps: { s: "" } });
    expect(result.current.ready).toBe(true);
    rerender({ s: "History" });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(isSubjectLoaded("History")).toBe(true);
  });
});
