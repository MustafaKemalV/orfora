import { describe, expect, it } from "vitest";
import { evaluate, type Routable } from "./evaluate";
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
