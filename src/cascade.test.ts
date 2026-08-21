import { describe, expect, it } from "vitest";
import {
  buildCascade,
  type CascadePlan,
  heuristicVerify,
  runCascade,
} from "./cascade";
import type { ModelVector } from "./modelVector";

const mk = (
  id: string,
  priceTier: ModelVector["priceTier"],
  price: number,
  fit: number | null,
): { model: ModelVector; fitness: number | null } => ({
  model: {
    id,
    family: "T",
    modelClass: "chat",
    priceTier,
    pricePerMTokens: price,
    context: 100000,
    imageIn: false,
    audioIn: false,
    videoIn: false,
    toolsSupported: true,
    hasWebSearch: false,
    scores: {},
  },
  fitness: fit,
});

describe("buildCascade", () => {
  it("keeps the best model per tier, ordered cheap -> mid -> premium", () => {
    const steps = buildCascade([
      mk("cheap-a", "cheap", 1, 0.5),
      mk("cheap-b", "cheap", 2, 0.7),
      mk("mid-a", "mid", 5, 0.8),
      mk("prem-a", "premium", 25, 0.9),
    ]);
    expect(steps.map((s) => s.model)).toEqual(["cheap-b", "mid-a", "prem-a"]);
    expect(steps.map((s) => s.priceTier)).toEqual(["cheap", "mid", "premium"]);
  });
});

const plan: CascadePlan = {
  capability: "code",
  reason: "cascade:code",
  steps: [
    { model: "cheap", priceTier: "cheap", pricePerMTokens: 1, fitness: 0.6 },
    { model: "mid", priceTier: "mid", pricePerMTokens: 5, fitness: 0.8 },
    { model: "prem", priceTier: "premium", pricePerMTokens: 25, fitness: 0.9 },
  ],
};

describe("runCascade", () => {
  it("returns the first rung whose answer passes verification", async () => {
    const r = await runCascade(
      plan,
      (step) => `answer from ${step.model}`,
      (_a, step) => step.priceTier !== "cheap", // reject cheap, accept mid
    );
    expect(r.index).toBe(1);
    expect(r.step.model).toBe("mid");
    expect(r.escalated).toBe(true);
    expect(r.exhausted).toBe(false);
  });

  it("stops at the cheapest rung when it already passes", async () => {
    const r = await runCascade(
      plan,
      (step) => step.model,
      () => true,
    );
    expect(r.index).toBe(0);
    expect(r.escalated).toBe(false);
  });

  it("returns the strongest answer flagged exhausted when none pass", async () => {
    const r = await runCascade(
      plan,
      (step) => step.model,
      () => false,
    );
    expect(r.index).toBe(2);
    expect(r.exhausted).toBe(true);
    expect(r.answer).toBe("prem");
  });
});

describe("heuristicVerify", () => {
  it("accepts a substantive answer and rejects short or refusal answers", () => {
    expect(
      heuristicVerify("This is a complete, useful answer to the query."),
    ).toBe(true);
    expect(heuristicVerify("no")).toBe(false);
    expect(heuristicVerify("I cannot help with that request.")).toBe(false);
    expect(heuristicVerify("I'm not sure, I don't know the answer.")).toBe(
      false,
    );
  });
});
