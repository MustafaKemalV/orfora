import { describe, expect, it } from "vitest";
import { scoreDifficulty } from "./difficulty";

describe("scoreDifficulty", () => {
  it("scores a trivial prompt as cheap", () => {
    const r = scoreDifficulty("What is 2+2?", { seedDistance: 0 });
    expect(r.difficulty).toBeLessThan(0.35);
    expect(r.tier).toBe("cheap");
  });

  it("scores a hard, unfamiliar prompt into the top tiers", () => {
    const r = scoreDifficulty(
      "Design and prove the correctness of a distributed consensus protocol that tolerates Byzantine faults, and analyze its message complexity.",
      { seedDistance: 0.85 },
    );
    expect(r.difficulty).toBeGreaterThan(0.6);
    expect(["premium", "ultra"]).toContain(r.tier);
  });

  it("ranks the hard prompt above the trivial one", () => {
    const easy = scoreDifficulty("List three colours.", { seedDistance: 0 });
    const hard = scoreDifficulty(
      "Derive the time complexity of this recursive algorithm and justify each step.",
      { seedDistance: 0.7 },
    );
    expect(hard.difficulty).toBeGreaterThan(easy.difficulty);
  });

  it("passes the seed distance through as the epistemic component", () => {
    expect(
      scoreDifficulty("anything", { seedDistance: 0.7 }).epistemic,
    ).toBeCloseTo(0.7);
    // clamps out-of-range distances
    expect(scoreDifficulty("x", { seedDistance: 2 }).epistemic).toBe(1);
  });

  it("marks open-ended prompts as more aleatoric", () => {
    const open = scoreDifficulty("Design a fun logo concept for a bakery.");
    const factual = scoreDifficulty("What is the capital of Peru?");
    expect(open.aleatoric).toBeGreaterThan(factual.aleatoric);
  });

  it("raises the language factor for a non-English prompt", () => {
    const r = scoreDifficulty("请把这段话翻译成英文");
    expect(r.factors.language).toBeGreaterThan(0);
  });

  it("respects overridden bands", () => {
    const r = scoreDifficulty("What is 2+2?", {
      seedDistance: 0,
      bands: { cheap: 0.001 },
    });
    expect(r.tier).not.toBe("cheap");
  });

  it("always returns a difficulty within [0,1]", () => {
    for (const p of ["", "hi", "x".repeat(9000)]) {
      const r = scoreDifficulty(p, { seedDistance: 0.5 });
      expect(r.difficulty).toBeGreaterThanOrEqual(0);
      expect(r.difficulty).toBeLessThanOrEqual(1);
    }
  });
});
