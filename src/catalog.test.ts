import { describe, expect, it } from "vitest";
import {
  capabilities,
  capabilityGrid,
  catalog,
  findModel,
  longContextTiers,
  multilingualTiers,
  visionTiers,
} from "./catalog";

const ids = new Set(catalog.map((m) => m.id));

/** Every model id referenced across the grid and the signal targets. */
const referenced = [
  ...Object.values(capabilityGrid).flatMap((tiers) => Object.values(tiers)),
  ...Object.values(visionTiers),
  ...Object.values(longContextTiers),
  ...Object.values(multilingualTiers),
];

describe("catalog", () => {
  it("has around fifty models with unique, non-empty ids", () => {
    expect(catalog.length).toBeGreaterThanOrEqual(50);
    expect(catalog.every((m) => m.id.trim().length > 0)).toBe(true);
    expect(ids.size).toBe(catalog.length);
  });

  it("keeps each model's price band consistent with its tier", () => {
    for (const m of catalog) {
      if (m.tier === "cheap") expect(m.pricePerMTokens).toBeLessThanOrEqual(1);
      else if (m.tier === "premium")
        expect(m.pricePerMTokens).toBeGreaterThanOrEqual(12);
      else {
        expect(m.pricePerMTokens).toBeGreaterThan(1);
        expect(m.pricePerMTokens).toBeLessThan(12);
      }
    }
  });

  it("looks up models by id and misses cleanly", () => {
    expect(findModel("anthropic/claude-opus-5")?.family).toBe("Claude");
    expect(findModel("not/a-real-model")).toBeUndefined();
  });
});

describe("grid", () => {
  it("references only models that exist in the catalog", () => {
    for (const id of referenced) expect(ids.has(id)).toBe(true);
  });

  it("fills cheap, mid, and premium for every capability", () => {
    for (const cap of capabilities) {
      const cell = capabilityGrid[cap];
      expect(cell.cheap).toBeTruthy();
      expect(cell.mid).toBeTruthy();
      expect(cell.premium).toBeTruthy();
    }
  });

  it("offers an ultra tier only for code and math_reasoning", () => {
    const withUltra = capabilities.filter((c) => capabilityGrid[c].ultra);
    expect(withUltra.sort()).toEqual(["code", "math_reasoning"]);
  });
});

describe("signal targets", () => {
  it("routes vision only to models that accept images", () => {
    for (const id of Object.values(visionTiers)) {
      expect(findModel(id)?.vision).toBe(true);
    }
  });

  it("routes long-context to genuinely long-context models", () => {
    for (const id of Object.values(longContextTiers)) {
      expect(findModel(id)?.context ?? 0).toBeGreaterThanOrEqual(500000);
    }
  });
});
