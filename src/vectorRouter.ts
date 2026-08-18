/**
 * The vector router: model-as-vector routing.
 *
 * Per request it embeds the prompt ONCE, then:
 *   1. finds the nearest capability seed -> the request's capability, and uses the
 *      seed distance as the epistemic (out-of-distribution) difficulty signal;
 *   2. scores difficulty (LLM-free) -> a tier;
 *   3. matches against the model catalog: apply hard gates, then among the
 *      survivors pick the CHEAPEST model whose relevance-weighted fitness for the
 *      capability clears the tier's bar. If no model has scores yet, it degrades
 *      gracefully to price-tier routing; if nothing clears the bar, it fails open
 *      to the strongest available. Anything unclear or throwing falls open too.
 *
 * This unifies the capability x tier grid into one profile match: a full model
 * vector for coverage, request-relevant weighting for precision.
 */

import type { Capability, Tier } from "./catalog";
import { capabilitySeeds as defaultCapabilitySeeds } from "./catalogSeeds";
import { type DifficultyOptions, scoreDifficulty } from "./difficulty";
import { fitness, type ModelVector } from "./modelVector";
import { cosineSimilarity } from "./similarity";
import type { EmbeddingProvider, RouteInput } from "./types";
import { defaultVectorCatalog } from "./vectorCatalog";

/** Hard requirements a request places on a model. */
export interface Gates {
  needsImage?: boolean;
  needsAudio?: boolean;
  needsVideo?: boolean;
  needsTools?: boolean;
  needsWebSearch?: boolean;
  minContext?: number;
}

/** The outcome of a vector routing decision. */
export interface VectorRouteDecision {
  model: string;
  capability: Capability;
  tier: Tier;
  difficulty: number;
  /** The chosen model's fitness for the capability, or null when unscored. */
  fitness: number | null;
  fallback: boolean;
  reason: string;
  epistemic: number;
  aleatoric: number;
}

export type VectorHandler<TOutput = unknown> = (
  input: RouteInput,
  decision: VectorRouteDecision,
) => Promise<TOutput> | TOutput;

export interface VectorRouterConfig<TOutput = unknown> {
  /** Backend that turns text into vectors. */
  embed: EmbeddingProvider;
  /** The model catalog, each entry a capability vector. Defaults to the built-in catalog. */
  catalog?: ModelVector[];
  /** Override the capability seed sets. */
  capabilitySeeds?: Record<Capability, string[]>;
  /** Model id to fall open to. Defaults to the priciest chat model (strongest). */
  fallback?: string;
  /** Minimum fitness to accept per tier. */
  thresholds?: Partial<Record<Tier, number>>;
  /** Difficulty scorer overrides (weights / bands). */
  difficulty?: DifficultyOptions;
  /** Optional handlers to call the chosen model via run(). */
  handlers?: Record<string, VectorHandler<TOutput>>;
}

const DEFAULT_THRESHOLDS: Record<Tier, number> = {
  cheap: 0.5,
  mid: 0.7,
  premium: 0.9,
  ultra: 0.95,
};

const TIER_TO_PRICE: Record<Tier, "cheap" | "mid" | "premium"> = {
  cheap: "cheap",
  mid: "mid",
  premium: "premium",
  ultra: "premium",
};

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
const cheaper = (a: ModelVector, b: ModelVector) =>
  b.pricePerMTokens < a.pricePerMTokens ? b : a;

function passesGates(m: ModelVector, gates: Gates): boolean {
  return (
    m.modelClass === "chat" &&
    (!gates.needsImage || m.imageIn) &&
    (!gates.needsAudio || m.audioIn) &&
    (!gates.needsVideo || m.videoIn) &&
    (!gates.needsTools || m.toolsSupported) &&
    (!gates.needsWebSearch || m.hasWebSearch) &&
    (gates.minContext === undefined || m.context >= gates.minContext)
  );
}

/**
 * Picks the best-fit model for a capability at a tier, subject to hard gates.
 * Cheapest model clearing the tier's fitness bar; else the strongest available;
 * else, when no model has scores, the cheapest at the matching price tier.
 */
export function matchModel(
  catalog: ModelVector[],
  capability: Capability,
  tier: Tier,
  gates: Gates = {},
  thresholds: Record<Tier, number> = DEFAULT_THRESHOLDS,
): { model: ModelVector | null; fitness: number | null; reason: string } {
  const survivors = catalog.filter((m) => passesGates(m, gates));
  if (survivors.length === 0) {
    return { model: null, fitness: null, reason: "no-model-passes-gates" };
  }

  const scored = survivors
    .map((m) => ({ m, f: fitness(m, capability) }))
    .filter((s): s is { m: ModelVector; f: number } => s.f !== null);

  if (scored.length > 0) {
    const required = thresholds[tier];
    const eligible = scored.filter((s) => s.f >= required);
    if (eligible.length > 0) {
      const best = eligible.reduce((a, b) =>
        cheaper(a.m, b.m) === b.m ? b : a,
      );
      return { model: best.m, fitness: best.f, reason: "fit" };
    }
    const strongest = scored.reduce((a, b) => (b.f > a.f ? b : a));
    return {
      model: strongest.m,
      fitness: strongest.f,
      reason: "below-threshold-strongest",
    };
  }

  // No scores anywhere: degrade to price-tier routing.
  const wantPrice = TIER_TO_PRICE[tier];
  const atTier = survivors.filter((m) => m.priceTier === wantPrice);
  const pool = atTier.length > 0 ? atTier : survivors;
  return {
    model: pool.reduce(cheaper),
    fitness: null,
    reason: "no-scores-tier-proxy",
  };
}

/** Creates a model-as-vector router exposing route(input) and, with handlers, run(input). */
export function createVectorRouter<TOutput = unknown>(
  config: VectorRouterConfig<TOutput>,
) {
  const {
    embed,
    catalog = defaultVectorCatalog,
    capabilitySeeds = defaultCapabilitySeeds,
    difficulty: difficultyOptions,
    handlers,
  } = config;

  if (typeof embed?.embed !== "function") {
    throw new Error("orfora: config.embed (an EmbeddingProvider) is required.");
  }
  if (!catalog || catalog.length === 0) {
    throw new Error("orfora: config.catalog must have at least one model.");
  }

  const thresholds = { ...DEFAULT_THRESHOLDS, ...config.thresholds };
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const chatModels = catalog.filter((m) => m.modelClass === "chat");
  if (chatModels.length === 0) {
    throw new Error("orfora: config.catalog has no chat model to route to.");
  }
  if (config.fallback && !byId.has(config.fallback)) {
    throw new Error(
      `orfora: config.fallback "${config.fallback}" is not in the catalog.`,
    );
  }
  const fallbackModel = config.fallback
    ? (byId.get(config.fallback) as ModelVector)
    : chatModels.reduce((a, b) =>
        b.pricePerMTokens > a.pricePerMTokens ? b : a,
      );

  if (handlers) {
    for (const m of chatModels) {
      if (!handlers[m.id]) {
        throw new Error(
          `orfora: config.handlers is missing a handler for "${m.id}".`,
        );
      }
    }
  }

  let bank: Promise<{ label: Capability; vector: number[] }[]> | null = null;
  function loadBank() {
    if (!bank) {
      bank = (async () => {
        const flat: { label: Capability; text: string }[] = [];
        for (const [capability, seeds] of Object.entries(capabilitySeeds)) {
          for (const text of seeds)
            flat.push({ label: capability as Capability, text });
        }
        if (flat.length === 0) return [];
        const vectors = await embed.embed(flat.map((s) => s.text));
        const out: { label: Capability; vector: number[] }[] = [];
        flat.forEach((s, i) => {
          const vector = vectors[i];
          if (vector) out.push({ label: s.label, vector });
        });
        return out;
      })();
    }
    return bank;
  }

  const failOpen = (reason: string): VectorRouteDecision => ({
    model: fallbackModel.id,
    capability: "general_qa",
    tier: "premium",
    difficulty: 1,
    fitness: null,
    fallback: true,
    reason,
    epistemic: 1,
    aleatoric: 0.25,
  });

  async function route(
    input: string | RouteInput,
  ): Promise<VectorRouteDecision> {
    const request: RouteInput =
      typeof input === "string" ? { prompt: input } : input;
    try {
      const seeds = await loadBank();
      if (seeds.length === 0) return failOpen("no-seeds");

      const embedded = await embed.embed([request.prompt]);
      const query = embedded[0];
      if (!query) return failOpen("no-embedding");

      let capability: Capability = "general_qa";
      let bestCosine = Number.NEGATIVE_INFINITY;
      for (const seed of seeds) {
        const score = cosineSimilarity(query, seed.vector);
        if (score > bestCosine) {
          bestCosine = score;
          capability = seed.label;
        }
      }
      const seedDistance = clamp01(1 - bestCosine);
      const diff = scoreDifficulty(request.prompt, {
        ...difficultyOptions,
        seedDistance,
      });

      const gates: Gates = {
        needsImage: (request.attachments?.length ?? 0) > 0,
        needsWebSearch: capability === "live_web_search",
        minContext: Math.ceil(request.prompt.length / 3),
      };

      const match = matchModel(
        catalog,
        capability,
        diff.tier,
        gates,
        thresholds,
      );
      const base = {
        capability,
        tier: diff.tier,
        difficulty: diff.difficulty,
        epistemic: diff.epistemic,
        aleatoric: diff.aleatoric,
      };
      if (!match.model) {
        return {
          ...base,
          model: fallbackModel.id,
          fitness: null,
          fallback: true,
          reason: match.reason,
        };
      }
      return {
        ...base,
        model: match.model.id,
        fitness: match.fitness,
        fallback: false,
        reason: match.reason,
      };
    } catch {
      return failOpen("error");
    }
  }

  async function run(input: string | RouteInput): Promise<TOutput> {
    if (!handlers) throw new Error("orfora: run() requires config.handlers.");
    const request: RouteInput =
      typeof input === "string" ? { prompt: input } : input;
    const decision = await route(request);
    const handler = handlers[decision.model];
    if (!handler) {
      throw new Error(`orfora: no handler for model "${decision.model}".`);
    }
    return handler(request, decision);
  }

  return { route, run };
}
