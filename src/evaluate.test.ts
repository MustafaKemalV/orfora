import { describe, expect, it } from "vitest";
import {
  type CatalogRoutable,
  evaluate,
  evaluateCatalog,
  type Routable,
} from "./evaluate";
import type { RouteInput } from "./types";

// A stub router: any prompt starting with "hard" goes to complex, else simple.
const stubRouter: Routable = {
  route: async (input: string | RouteInput) => {
    const prompt = typeof input === "string" ? input : input.prompt;
    const route = prompt.startsWith("hard") ? "complex" : "simple";
    return { route, model: route, score: 1, fallback: false };
  },
};

describe("evaluate", () => {
  it("computes accuracy, recall, and a confusion matrix", async () => {
    const report = await evaluate(stubRouter, [
      { input: "easy a", expected: "simple" },
      { input: "easy b", expected: "simple" },
      { input: "hard a", expected: "complex" },
      { input: "hard b", expected: "simple" }, // stub sends to complex, so wrong
    ]);

    expect(report.total).toBe(4);
    expect(report.correct).toBe(3);
    expect(report.accuracy).toBeCloseTo(0.75);
    expect(report.recallByRoute.complex).toBeCloseTo(1);
    expect(report.recallByRoute.simple).toBeCloseTo(2 / 3);
    expect(report.confusion.simple).toEqual({ simple: 2, complex: 1 });
    expect(report.confusion.complex).toEqual({ complex: 1 });
  });

  it("handles an empty set without dividing by zero", async () => {
    const report = await evaluate(stubRouter, []);
    expect(report.total).toBe(0);
    expect(report.accuracy).toBe(0);
  });
});

// A stub catalog router: "code" in the prompt -> code, else general_qa; "hard" in
// the prompt -> premium, else cheap.
const stubCatalog: CatalogRoutable = {
  route: async (input: string | RouteInput) => {
    const prompt = typeof input === "string" ? input : input.prompt;
    const target = prompt.includes("code") ? "code" : "general_qa";
    const tier = prompt.includes("hard") ? "premium" : "cheap";
    return { target, tier };
  },
};

describe("evaluateCatalog", () => {
  it("scores capability and tier independently, and both together", async () => {
    const report = await evaluateCatalog(stubCatalog, [
      { input: "code easy", capability: "code", tier: "cheap" },
      { input: "code hard", capability: "code", tier: "premium" },
      { input: "write easy", capability: "creative_writing", tier: "cheap" }, // wrong capability
      { input: "general hard", capability: "general_qa", tier: "premium" },
    ]);

    expect(report.total).toBe(4);
    expect(report.capabilityAccuracy).toBeCloseTo(0.75);
    expect(report.tierAccuracy).toBeCloseTo(1);
    expect(report.bothAccuracy).toBeCloseTo(0.75);
    expect(report.capabilityRecall.code).toBeCloseTo(1);
    expect(report.capabilityRecall.creative_writing).toBeCloseTo(0);
    expect(report.tierRecall.cheap).toBeCloseTo(1);
    expect(report.capabilityConfusion.creative_writing).toEqual({
      general_qa: 1,
    });
  });

  it("handles an empty set without dividing by zero", async () => {
    const report = await evaluateCatalog(stubCatalog, []);
    expect(report.total).toBe(0);
    expect(report.capabilityAccuracy).toBe(0);
    expect(report.tierAccuracy).toBe(0);
  });
});
