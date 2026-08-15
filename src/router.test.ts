import { describe, expect, it, vi } from "vitest";
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
    expect(result.reason).toBe("below-threshold");
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
    expect(result.reason).toBe("error");
  });

  it("escalates on a length signal without paying for an embedding", async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0]));
    const result = await makeRouter({
      embed: { embed },
      signals: { maxChars: 5 },
    }).route("this is a long prompt");
    expect(result.route).toBe("complex");
    expect(result.fallback).toBe(true);
    expect(result.reason).toBe("signal:length");
    expect(embed).not.toHaveBeenCalled();
  });

  it("routes by attachment modality without paying for an embedding", async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0]));
    const router = createRouter({
      routes: {
        chat: { model: "gpt-4o-mini", seeds: ["hello"] },
        vision: { model: "gpt-4o", seeds: ["describe this image"] },
      },
      fallback: "chat",
      embed: { embed },
      signals: { onModality: { image: "vision" } },
    });

    const result = await router.route({
      prompt: "what's in this?",
      attachments: ["photo.png"],
    });

    expect(result.route).toBe("vision");
    expect(result.model).toBe("gpt-4o");
    expect(result.reason).toBe("signal:modality:image");
    expect(result.fallback).toBe(false);
    expect(embed).not.toHaveBeenCalled();
  });

  it("throws when a modality target route is undefined", () => {
    expect(() =>
      createRouter({
        routes: { chat: { model: "m", seeds: ["hi"] } },
        fallback: "chat",
        embed: testEmbed,
        signals: { onModality: { image: "nope" } },
      }),
    ).toThrow(/onModality/);
  });

  it("throws when fallback is not a defined route", () => {
    expect(() => makeRouter({ fallback: "nope" })).toThrow(/fallback/);
  });
});
