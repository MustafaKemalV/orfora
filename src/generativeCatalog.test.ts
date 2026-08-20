import { describe, expect, it } from "vitest";
import {
  defaultGenerativeCatalog,
  type GenerativeModality,
  QUALITY_ORDER,
} from "./generativeCatalog";

describe("defaultGenerativeCatalog", () => {
  it("covers all four generative modalities with unique ids", () => {
    const ids = defaultGenerativeCatalog.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const modalities: GenerativeModality[] = [
      "image",
      "video",
      "speech",
      "music",
    ];
    for (const modality of modalities) {
      expect(
        defaultGenerativeCatalog.some((m) => m.modality === modality),
      ).toBe(true);
    }
  });

  it("has a positive price, tags, a valid tier and a source on every model", () => {
    for (const m of defaultGenerativeCatalog) {
      expect(m.pricePerUnit).toBeGreaterThan(0);
      expect(Array.isArray(m.tags)).toBe(true);
      expect(m.qualityTier in QUALITY_ORDER).toBe(true);
      expect(m.profileFrom.length).toBeGreaterThan(0);
    }
  });

  it("spans draft, standard and premium tiers within image", () => {
    const tiers = new Set(
      defaultGenerativeCatalog
        .filter((m) => m.modality === "image")
        .map((m) => m.qualityTier),
    );
    expect(tiers.has("draft")).toBe(true);
    expect(tiers.has("standard")).toBe(true);
    expect(tiers.has("premium")).toBe(true);
  });
});
