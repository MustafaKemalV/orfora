import { describe, expect, it } from "vitest";
import { defaultSeeds } from "./seeds";

describe("defaultSeeds", () => {
  it("provides non-empty simple and complex seed sets", () => {
    expect(defaultSeeds.simple.length).toBeGreaterThan(0);
    expect(defaultSeeds.complex.length).toBeGreaterThan(0);
  });

  it("has no empty or duplicate seeds", () => {
    const all = [...defaultSeeds.simple, ...defaultSeeds.complex];
    expect(all.every((s) => s.trim().length > 0)).toBe(true);
    expect(new Set(all).size).toBe(all.length);
  });
});
