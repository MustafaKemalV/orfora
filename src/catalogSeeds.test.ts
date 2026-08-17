import { describe, expect, it } from "vitest";
import { capabilities } from "./catalog";
import { capabilitySeeds, tierSeeds } from "./catalogSeeds";

const noEmpty = (seeds: string[]) => seeds.every((s) => s.trim().length > 0);
const allUnique = (seeds: string[]) => new Set(seeds).size === seeds.length;

describe("capabilitySeeds", () => {
  it("covers exactly the five capabilities", () => {
    expect(Object.keys(capabilitySeeds).sort()).toEqual(
      [...capabilities].sort(),
    );
  });

  it("gives each capability a healthy, clean, unique seed set", () => {
    for (const cap of capabilities) {
      const seeds = capabilitySeeds[cap];
      expect(seeds.length).toBeGreaterThanOrEqual(10);
      expect(noEmpty(seeds)).toBe(true);
      expect(allUnique(seeds)).toBe(true);
    }
  });
});

describe("tierSeeds", () => {
  it("gives cheap, mid, and premium clean, unique seed sets", () => {
    for (const tier of ["cheap", "mid", "premium"] as const) {
      const seeds = tierSeeds[tier];
      expect(seeds.length).toBeGreaterThanOrEqual(8);
      expect(noEmpty(seeds)).toBe(true);
      expect(allUnique(seeds)).toBe(true);
    }
  });
});
