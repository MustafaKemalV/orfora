import { describe, expect, it } from "vitest";
import { defaultTierModel } from "./tierModel";
import { predictTier, type TierModel } from "./tierPredictor";

const toy: TierModel = {
  labels: ["cheap", "mid", "premium"],
  dim: 2,
  embedder: "toy",
  source: "toy",
  intercept: [0, 0, 0],
  coef: [
    [1, 0],
    [0, 1],
    [-1, -1],
  ],
};

describe("predictTier", () => {
  it("returns the argmax label for a matching embedding", () => {
    expect(predictTier(toy, [5, 0])?.tier).toBe("cheap");
    expect(predictTier(toy, [0, 5])?.tier).toBe("mid");
    expect(predictTier(toy, [-5, -5])?.tier).toBe("premium");
  });

  it("returns null on a dimension mismatch (wrong embedder space)", () => {
    expect(predictTier(toy, [1, 2, 3])).toBeNull();
  });

  it("gives softmax probabilities that sum to one", () => {
    const p = predictTier(toy, [2, 1]);
    expect(p).not.toBeNull();
    const sum = Object.values(p?.scores ?? {}).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });
});

describe("defaultTierModel", () => {
  it("is a 3-class MiniLM model with aligned weights", () => {
    expect(defaultTierModel.labels).toEqual(["cheap", "mid", "premium"]);
    expect(defaultTierModel.dim).toBe(384);
    expect(defaultTierModel.coef.length).toBe(3);
    expect(defaultTierModel.coef.every((r) => r.length === 384)).toBe(true);
    expect(defaultTierModel.intercept.length).toBe(3);
  });

  it("predicts a valid tier from a 384-dim embedding", () => {
    const emb = new Array(384).fill(0.05);
    const p = predictTier(defaultTierModel, emb);
    expect(p).not.toBeNull();
    expect(["cheap", "mid", "premium"]).toContain(p?.tier);
  });
});
