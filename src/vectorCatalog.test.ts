import { describe, expect, it } from "vitest";
import { defaultVectorCatalog } from "./vectorCatalog";

describe("defaultVectorCatalog", () => {
  it("has current models with unique ids, all chat class", () => {
    expect(defaultVectorCatalog.length).toBeGreaterThanOrEqual(12);
    const ids = defaultVectorCatalog.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(defaultVectorCatalog.every((m) => m.modelClass === "chat")).toBe(
      true,
    );
  });

  it("keeps every score within [0,1]", () => {
    for (const m of defaultVectorCatalog) {
      for (const value of Object.values(m.scores)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("only gives a vision score to image-capable models", () => {
    for (const m of defaultVectorCatalog) {
      if (m.scores.vision_score !== undefined) expect(m.imageIn).toBe(true);
    }
  });

  it("flags the Sonar live-search specialists as web-capable", () => {
    // Many current models now have native web search, so it is no longer a Sonar
    // exclusive; but every Sonar model must be web-capable, and the gate is boolean.
    const sonar = defaultVectorCatalog.filter((m) => m.family === "Sonar");
    expect(sonar.length).toBeGreaterThan(0);
    expect(sonar.every((m) => m.hasWebSearch)).toBe(true);
    expect(
      defaultVectorCatalog.every((m) => typeof m.hasWebSearch === "boolean"),
    ).toBe(true);
  });

  it("documents every model's profile source for honesty", () => {
    expect(defaultVectorCatalog.every((m) => !!m.profileFrom)).toBe(true);
  });

  it("spans cheap, mid, and premium tiers", () => {
    const tiers = new Set(defaultVectorCatalog.map((m) => m.priceTier));
    expect(tiers.has("cheap")).toBe(true);
    expect(tiers.has("mid")).toBe(true);
    expect(tiers.has("premium")).toBe(true);
  });
});
