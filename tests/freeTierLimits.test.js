import { describe, it, expect } from "vitest";
import fs from "fs";
import {
  FREE_TIER_MAX_SECTIONS, FREE_TIER_MAX_TOTAL_QUESTIONS,
  FREE_TIER_ALLOWED_TYPES, FREE_TIER_DAILY_LIMIT,
} from "../src/freeTierLimits.js";

describe("freeTierLimits", () => {
  it("has sane, intentional values", () => {
    expect(FREE_TIER_MAX_SECTIONS).toBe(2);
    expect(FREE_TIER_MAX_TOTAL_QUESTIONS).toBe(15);
    expect(FREE_TIER_ALLOWED_TYPES).toEqual(["objective", "structured"]);
    expect(FREE_TIER_ALLOWED_TYPES).not.toContain("essay");
    expect(FREE_TIER_DAILY_LIMIT).toBeGreaterThan(0);
  });

  it("stays byte-identical to the duplicated Cloudflare Functions copy", () => {
    // Can't import functions/_shared/freeTierLimits.js directly here (it's
    // outside src/, same cross-boundary reasoning as the file's own header
    // comment) — so this test just diffs the two files textually, which
    // is enough to catch someone editing one copy and forgetting the other.
    const clientSrc = fs.readFileSync(new URL("../src/freeTierLimits.js", import.meta.url), "utf8");
    const serverSrc = fs.readFileSync(new URL("../functions/_shared/freeTierLimits.js", import.meta.url), "utf8");
    expect(serverSrc).toBe(clientSrc);
  });
});
