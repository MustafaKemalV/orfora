import { describe, expect, it } from "vitest";
import type { Capability, Tier } from "./catalog";
import { type CatalogRouterConfig, createCatalogRouter } from "./catalogRouter";
import type { EmbeddingProvider } from "./types";

// 8 dims: [code, math, creative, live, general | cheap, mid, premium]. Capability
// and tier live in separate dims so one query resolves both banks independently.
const d = (...v: number[]) => v;
const VECTORS: Record<string, number[]> = {
  CODE_SEED: d(1, 0, 0, 0, 0, 0, 0, 0),
  MATH_SEED: d(0, 1, 0, 0, 0, 0, 0, 0),
  WRITE_SEED: d(0, 0, 1, 0, 0, 0, 0, 0),
  LIVE_SEED: d(0, 0, 0, 1, 0, 0, 0, 0),
  GENERAL_SEED: d(0, 0, 0, 0, 1, 0, 0, 0),
  CHEAP_SEED: d(0, 0, 0, 0, 0, 1, 0, 0),
  MID_SEED: d(0, 0, 0, 0, 0, 0, 1, 0),
  PREMIUM_SEED: d(0, 0, 0, 0, 0, 0, 0, 1),
  CHEAP_CODE: d(1, 0, 0, 0, 0, 1, 0, 0),
  PREMIUM_MATH: d(0, 1, 0, 0, 0, 0, 0, 1),
  MID_CREATIVE: d(0, 0, 1, 0, 0, 0, 1, 0),
  "show me the latest news": d(0, 0, 0, 0, 0, 1, 0, 0),
  describe: d(0, 0, 0, 0, 0, 1, 0, 0),
  "please analyze this very long document here": d(0, 0, 0, 0, 0, 0, 1, 0),
  "hard code? part two?": d(1, 0, 0, 0, 0, 0, 0, 1),
};

const testEmbed: EmbeddingProvider = {
  embed: async (texts) =>
    texts.map((t) => VECTORS[t] ?? d(0, 0, 0, 0, 0, 0, 0, 0)),
};

const capabilitySeeds: Record<Capability, string[]> = {
  code: ["CODE_SEED"],
  math_reasoning: ["MATH_SEED"],
  creative_writing: ["WRITE_SEED"],
  live_web_search: ["LIVE_SEED"],
  general_qa: ["GENERAL_SEED"],
};
const tierSeeds = {
  cheap: ["CHEAP_SEED"],
  mid: ["MID_SEED"],
  premium: ["PREMIUM_SEED"],
};
const grid: Record<Capability, Partial<Record<Tier, string>>> = {
  code: {
    cheap: "code:cheap",
    mid: "code:mid",
    premium: "code:premium",
    ultra: "code:ultra",
  },
  math_reasoning: {
    cheap: "math:cheap",
    mid: "math:mid",
    premium: "math:premium",
    ultra: "math:ultra",
  },
  creative_writing: { cheap: "cw:cheap", mid: "cw:mid", premium: "cw:premium" },
  live_web_search: {
    cheap: "live:cheap",
    mid: "live:mid",
    premium: "live:premium",
  },
  general_qa: { cheap: "gq:cheap", mid: "gq:mid", premium: "gq:premium" },
};
const vision = { cheap: "vis:cheap", mid: "vis:mid", premium: "vis:premium" };
const longContext = { cheap: "lc:cheap", mid: "lc:mid", premium: "lc:premium" };

function makeRouter(overrides: Partial<CatalogRouterConfig> = {}) {
  return createCatalogRouter({
    embed: testEmbed,
    capabilitySeeds,
    tierSeeds,
    grid,
    vision,
    longContext,
    ...overrides,
  });
}

const reachable = [
  ...new Set([
    ...Object.values(grid).flatMap((c) => Object.values(c)),
    ...Object.values(vision),
    ...Object.values(longContext),
  ]),
];

describe("createCatalogRouter", () => {
  it("routes on both axes: capability and tier", async () => {
    const cheapCode = await makeRouter().route("CHEAP_CODE");
    expect(cheapCode.target).toBe("code");
    expect(cheapCode.tier).toBe("cheap");
    expect(cheapCode.model).toBe("code:cheap");
    expect(cheapCode.fallback).toBe(false);

    const premiumMath = await makeRouter().route("PREMIUM_MATH");
    expect(premiumMath.target).toBe("math_reasoning");
    expect(premiumMath.tier).toBe("premium");
    expect(premiumMath.model).toBe("math:premium");

    const midCreative = await makeRouter().route("MID_CREATIVE");
    expect(midCreative.model).toBe("cw:mid");
  });

  it("routes an attachment to a vision model at the request's tier", async () => {
    const result = await makeRouter().route({
      prompt: "describe",
      attachments: ["photo.png"],
    });
    expect(result.target).toBe("vision");
    expect(result.model).toBe("vis:cheap");
    expect(result.reason).toBe("signal:attachment");
  });

  it("routes a very long prompt to a long-context model", async () => {
    const result = await makeRouter({ longContextChars: 20 }).route(
      "please analyze this very long document here",
    );
    expect(result.target).toBe("long_context");
    expect(result.model).toBe("lc:mid");
    expect(result.reason).toBe("signal:length");
  });

  it("routes freshness-marked prompts to live web search", async () => {
    const result = await makeRouter().route("show me the latest news");
    expect(result.target).toBe("live_web_search");
    expect(result.reason).toBe("signal:freshness");
    expect(result.model).toBe("live:cheap");
  });

  it("escalates a multi-intent premium code request to ultra", async () => {
    const result = await makeRouter().route("hard code? part two?");
    expect(result.target).toBe("code");
    expect(result.tier).toBe("ultra");
    expect(result.model).toBe("code:ultra");
    expect(result.reason).toBe("signal:ultra");
  });

  it("does not escalate to ultra when the ultra signal is disabled", async () => {
    const result = await makeRouter({ ultra: false }).route(
      "hard code? part two?",
    );
    expect(result.tier).toBe("premium");
    expect(result.model).toBe("code:premium");
  });

  it("falls back to general_qa below the threshold", async () => {
    const result = await makeRouter({ threshold: 0.99 }).route("CHEAP_CODE");
    expect(result.target).toBe("general_qa");
    expect(result.fallback).toBe(true);
    expect(result.reason).toBe("below-threshold");
  });

  it("fails open when the embedder throws", async () => {
    const boom: EmbeddingProvider = {
      embed: async () => {
        throw new Error("embed failed");
      },
    };
    const result = await makeRouter({ embed: boom }).route("CHEAP_CODE");
    expect(result.fallback).toBe(true);
    expect(result.reason).toBe("error");
    expect(result.target).toBe("general_qa");
  });

  it("run() decides then calls the chosen model's handler", async () => {
    const handlers = Object.fromEntries(
      reachable.map((m) => [
        m,
        async (i: { prompt: string }) => `${m}<${i.prompt}`,
      ]),
    );
    const router = makeRouter({ handlers });
    expect(await router.run("CHEAP_CODE")).toBe("code:cheap<CHEAP_CODE");
  });

  it("throws at creation when a reachable model has no handler", () => {
    expect(() =>
      makeRouter({ handlers: { "code:cheap": async () => "x" } }),
    ).toThrow(/handler/);
  });
});
