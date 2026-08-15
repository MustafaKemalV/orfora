import { describe, expect, it } from "vitest";
import { createRouter } from "./router";
import type { EmbeddingProvider, RouterConfig } from "./types";

// Deterministic 2-D embeddings: "simple-ish" texts point along x, "complex-ish"
// along y. Lets us assert routing without a real embedding model.
const VECTORS: Record<string, number[]> = {
  "add two numbers": [1, 0],
  "what is 2+2": [0.9, 0.1],
  "design a distributed system": [0, 1],
  "explain CAP theorem trade-offs": [0.1, 0.9],
  "sum 3 and 4": [0.95, 0.05],
  "architect a fault-tolerant queue": [0.05, 0.95],
};

const testEmbed: EmbeddingProvider = {
  embed: async (texts) => texts.map((t) => VECTORS[t] ?? [0, 0]),
};

function makeRouter(overrides: Partial<RouterConfig> = {}) {
  return createRouter({
    routes: {
      simple: {
        model: "cheap-model",
        seeds: ["add two numbers", "what is 2+2"],
      },
      complex: {
        model: "strong-model",
        seeds: [
          "design a distributed system",
          "explain CAP theorem trade-offs",
        ],
      },
    },
    fallback: "complex",
    embed: testEmbed,
    ...overrides,
  });
}

describe("createRouter", () => {
  it("routes a simple request to the simple route", async () => {
    const result = await makeRouter().route("sum 3 and 4");
    expect(result.route).toBe("simple");
    expect(result.model).toBe("cheap-model");
    expect(result.fallback).toBe(false);
    expect(result.score).toBeGreaterThan(0.9);
  });

  it("routes a complex request to the complex route", async () => {
    const result = await makeRouter().route("architect a fault-tolerant queue");
    expect(result.route).toBe("complex");
    expect(result.model).toBe("strong-model");
    expect(result.fallback).toBe(false);
  });

  it("fails open to the fallback when confidence is below threshold", async () => {
    const result = await makeRouter({ threshold: 0.999 }).route("sum 3 and 4");
    expect(result.route).toBe("complex");
    expect(result.fallback).toBe(true);
  });

  it("fails open when the embedder throws", async () => {
    const boom: EmbeddingProvider = {
      embed: async () => {
        throw new Error("embed failed");
      },
    };
    const result = await makeRouter({ embed: boom }).route("sum 3 and 4");
    expect(result.route).toBe("complex");
    expect(result.fallback).toBe(true);
  });

  it("throws when fallback is not a defined route", () => {
    expect(() => makeRouter({ fallback: "nope" })).toThrow(/fallback/);
  });
});
