import { describe, expect, it } from "vitest";
import { complexityRouter } from "./complexity";
import type { EmbeddingProvider } from "./types";

const VECTORS: Record<string, number[]> = {
  "cheap seed": [1, 0],
  "pricey seed": [0, 1],
  "cheap query": [0.99, 0.01],
};

const embed: EmbeddingProvider = {
  embed: async (texts) => texts.map((t) => VECTORS[t] ?? [0, 0]),
};

describe("complexityRouter", () => {
  it("wires simple/complex models and routes with overridden seeds", async () => {
    const router = complexityRouter({
      simple: "cheap-model",
      complex: "strong-model",
      embed,
      seeds: { simple: ["cheap seed"], complex: ["pricey seed"] },
    });

    const result = await router.route("cheap query");
    expect(result.route).toBe("simple");
    expect(result.model).toBe("cheap-model");
  });

  it("fails open to the complex model", async () => {
    const router = complexityRouter({
      simple: "cheap-model",
      complex: "strong-model",
      embed,
      seeds: { simple: ["cheap seed"], complex: ["pricey seed"] },
      threshold: 2, // unreachable (cosine maxes at 1) → always fall open
    });

    const result = await router.route("cheap query");
    expect(result.route).toBe("complex");
    expect(result.model).toBe("strong-model");
    expect(result.fallback).toBe(true);
  });

  it("uses the built-in default seeds when none are provided", async () => {
    const stub: EmbeddingProvider = { embed: async (t) => t.map(() => [0, 0]) };
    const router = complexityRouter({ simple: "s", complex: "c", embed: stub });

    const result = await router.route("anything");
    expect(["s", "c"]).toContain(result.model);
  });
});
