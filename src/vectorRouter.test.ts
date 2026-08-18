import { describe, expect, it } from "vitest";
import type { Capability } from "./catalog";
import type { ModelVector } from "./modelVector";
import type { EmbeddingProvider } from "./types";
import { defaultVectorCatalog } from "./vectorCatalog";
import {
  createVectorRouter,
  matchModel,
  type VectorRouterConfig,
} from "./vectorRouter";

const chat = (over: Partial<ModelVector>): ModelVector => ({
  id: "x",
  family: "F",
  modelClass: "chat",
  priceTier: "mid",
  pricePerMTokens: 5,
  context: 200000,
  imageIn: false,
  audioIn: false,
  videoIn: false,
  toolsSupported: false,
  hasWebSearch: false,
  scores: {},
  ...over,
});

const cheapCoder = chat({
  id: "cheap-coder",
  priceTier: "cheap",
  pricePerMTokens: 0.5,
  scores: {
    code_agentic: 0.5,
    code_snippet: 0.5,
    instruction_following: 0.5,
    tool_use: 0.5,
  },
});
const strongCoder = chat({
  id: "strong-coder",
  priceTier: "premium",
  pricePerMTokens: 20,
  scores: {
    code_agentic: 0.95,
    code_snippet: 0.9,
    instruction_following: 0.9,
    tool_use: 0.9,
  },
});
const generalist = chat({
  id: "generalist",
  pricePerMTokens: 8,
  scores: {
    general_knowledge: 0.8,
    human_preference_elo: 0.8,
    instruction_following: 0.8,
  },
});
const visionModel = chat({
  id: "vision",
  pricePerMTokens: 3,
  imageIn: true,
  scores: {
    general_knowledge: 0.7,
    human_preference_elo: 0.7,
    instruction_following: 0.7,
  },
});
const searchModel = chat({
  id: "search",
  pricePerMTokens: 2,
  hasWebSearch: true,
  scores: { general_knowledge: 0.6, human_preference_elo: 0.6 },
});

const catalog = [cheapCoder, strongCoder, generalist, visionModel, searchModel];

describe("matchModel", () => {
  it("picks the cheapest model clearing the tier bar", () => {
    // code + cheap: both coders clear 0.5, pick the cheaper.
    expect(matchModel(catalog, "code", "cheap").model?.id).toBe("cheap-coder");
  });

  it("demands a high-fitness model at premium", () => {
    // code + premium bar 0.9: only the strong coder qualifies.
    expect(matchModel(catalog, "code", "premium").model?.id).toBe(
      "strong-coder",
    );
  });

  it("respects the image gate", () => {
    const r = matchModel(catalog, "general_qa", "cheap", { needsImage: true });
    expect(r.model?.id).toBe("vision");
  });

  it("respects the web-search gate", () => {
    const r = matchModel(catalog, "live_web_search", "cheap", {
      needsWebSearch: true,
    });
    expect(r.model?.id).toBe("search");
  });

  it("returns null when no model passes the gates", () => {
    const r = matchModel(catalog, "general_qa", "cheap", { needsAudio: true });
    expect(r.model).toBeNull();
  });

  it("degrades to price-tier routing when no model has scores", () => {
    const bare = [
      chat({ id: "c", priceTier: "cheap", pricePerMTokens: 0.4 }),
      chat({ id: "m", priceTier: "mid", pricePerMTokens: 5 }),
      chat({ id: "p", priceTier: "premium", pricePerMTokens: 25 }),
    ];
    expect(matchModel(bare, "code", "premium").model?.id).toBe("p");
    expect(matchModel(bare, "code", "cheap").model?.id).toBe("c");
    expect(matchModel(bare, "code", "cheap").reason).toBe(
      "no-scores-tier-proxy",
    );
  });
});

// Deterministic 5-D embeddings: [code, math, creative, live, general].
const VECTORS: Record<string, number[]> = {
  CODE_SEED: [1, 0, 0, 0, 0],
  MATH_SEED: [0, 1, 0, 0, 0],
  WRITE_SEED: [0, 0, 1, 0, 0],
  LIVE_SEED: [0, 0, 0, 1, 0],
  GEN_SEED: [0, 0, 0, 0, 1],
  CODE_EASY: [1, 0, 0, 0, 0],
  DESCRIBE: [0, 0, 0, 0, 1],
  LIVE_Q: [0, 0, 0, 1, 0],
};
const testEmbed: EmbeddingProvider = {
  embed: async (texts) => texts.map((t) => VECTORS[t] ?? [0, 0, 0, 0, 0]),
};
const capabilitySeeds: Record<Capability, string[]> = {
  code: ["CODE_SEED"],
  math_reasoning: ["MATH_SEED"],
  creative_writing: ["WRITE_SEED"],
  live_web_search: ["LIVE_SEED"],
  general_qa: ["GEN_SEED"],
};

function makeRouter(overrides: Partial<VectorRouterConfig> = {}) {
  return createVectorRouter({
    embed: testEmbed,
    catalog,
    capabilitySeeds,
    ...overrides,
  });
}

describe("createVectorRouter", () => {
  it("routes an easy code request to a cheap coding model", async () => {
    const d = await makeRouter().route("CODE_EASY");
    expect(d.capability).toBe("code");
    expect(d.model).toBe("cheap-coder");
    expect(d.fallback).toBe(false);
  });

  it("sends an attachment to a vision-capable model", async () => {
    const d = await makeRouter().route({
      prompt: "DESCRIBE",
      attachments: ["photo.png"],
    });
    expect(d.model).toBe("vision");
  });

  it("sends a live-search request to a web-search model", async () => {
    const d = await makeRouter().route("LIVE_Q");
    expect(d.capability).toBe("live_web_search");
    expect(d.model).toBe("search");
  });

  it("fails open to the priciest chat model when the embedder throws", async () => {
    const boom: EmbeddingProvider = {
      embed: async () => {
        throw new Error("embed failed");
      },
    };
    const d = await makeRouter({ embed: boom }).route("CODE_EASY");
    expect(d.fallback).toBe(true);
    expect(d.reason).toBe("error");
    expect(d.model).toBe("strong-coder"); // priciest chat model
  });

  it("run() decides then calls the chosen model's handler", async () => {
    const handlers = Object.fromEntries(
      catalog.map((m) => [
        m.id,
        async (i: { prompt: string }) => `${m.id}<${i.prompt}`,
      ]),
    );
    const router = makeRouter({ handlers });
    expect(await router.run("CODE_EASY")).toBe("cheap-coder<CODE_EASY");
  });

  it("throws at creation when a chat model has no handler", () => {
    expect(() =>
      makeRouter({ handlers: { "cheap-coder": async () => "x" } }),
    ).toThrow(/handler/);
  });

  it("works zero-config, routing over the built-in catalog", async () => {
    const d = await createVectorRouter({ embed: testEmbed }).route("hello");
    expect(defaultVectorCatalog.some((m) => m.id === d.model)).toBe(true);
  });
});
