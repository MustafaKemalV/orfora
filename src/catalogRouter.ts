/**
 * The catalog router: routing on two orthogonal axes at once.
 *
 *   1. CAPABILITY (what kind of task) via seed similarity: code, math_reasoning,
 *      creative_writing, live_web_search, general_qa.
 *   2. TIER (how strong a model) via a separate seed set: cheap / mid / premium,
 *      plus an opt-in `ultra` step for the hardest code and reasoning.
 *
 * A grid then maps (capability, tier) to a concrete model. Deterministic signals
 * run alongside the semantic match and can override the capability:
 *   - an attachment routes to a vision-capable model;
 *   - a very long prompt routes to a long-context model;
 *   - freshness markers ("today", "latest", "current") route to live web search;
 *   - a multi-intent premium request escalates to the ultra tier.
 *
 * The request is embedded ONCE and compared to both the capability and tier seed
 * banks, so the extra axis costs no extra embedding call. Anything unclear or
 * throwing fails open to a capable general model, orfora never trades away quality.
 */

import {
  type Capability,
  capabilityGrid,
  longContextTiers,
  type Tier,
  visionTiers,
} from "./catalog";
import {
  capabilitySeeds as defaultCapabilitySeeds,
  tierSeeds as defaultTierSeeds,
} from "./catalogSeeds";
import { looksMultiIntent } from "./signals";
import { cosineSimilarity } from "./similarity";
import type { EmbeddingProvider, RouteInput } from "./types";

/** What a request resolved to: a capability, or a signal-driven target. */
export type RouteTarget = Capability | "vision" | "long_context";

/** The outcome of a catalog routing decision. */
export interface CatalogDecision {
  /** The capability or signal target the request resolved to. */
  target: RouteTarget;
  /** The chosen model id. */
  model: string;
  /** The tier the request was routed at. */
  tier: Tier;
  /** Capability match score (1 for a deterministic signal route). */
  score: number;
  /** True when orfora fell open to the fallback capability. */
  fallback: boolean;
  /** Why, when it isn't a plain capability match, e.g. "signal:attachment". */
  reason?: string;
}

/**
 * Turns a catalog decision into a real model call. You supply one per model, and
 * orfora calls it, so no provider SDK is ever bundled into orfora.
 */
export type CatalogHandler<TOutput = unknown> = (
  input: RouteInput,
  decision: CatalogDecision,
) => Promise<TOutput> | TOutput;

export interface CatalogRouterConfig<TOutput = unknown> {
  /** Backend that turns text into vectors. Bring your own, or use an adapter. */
  embed: EmbeddingProvider;
  /** Override the (capability, tier) -> model grid. Defaults to the built-in grid. */
  grid?: Record<Capability, Partial<Record<Tier, string>>>;
  /** Override the capability seed sets. */
  capabilitySeeds?: Record<Capability, string[]>;
  /** Override the tier seed sets. */
  tierSeeds?: { cheap: string[]; mid: string[]; premium: string[] };
  /** Capability used when confidence is low or on error. Default "general_qa". */
  fallback?: Capability;
  /** Min cosine to trust the capability match; below it, fall back. Default 0. */
  threshold?: number;
  /** Prompt length (chars) above which the long-context route fires. Default 16000; 0 disables. */
  longContextChars?: number;
  /** Route freshness-marked prompts to live_web_search. Default true. */
  freshness?: boolean;
  /** Allow multi-intent premium code/reasoning to escalate to ultra. Default true. */
  ultra?: boolean;
  /** Override the vision signal target grid. */
  vision?: Partial<Record<Tier, string>>;
  /** Override the long-context signal target grid. */
  longContext?: Partial<Record<Tier, string>>;
  /** Optional handlers to call the chosen model via run() (see createRouter). */
  handlers?: Record<string, CatalogHandler<TOutput>>;
}

type LabeledVector<L> = { label: L; vector: number[] };

/** From strongest to weakest: how we step to a neighbouring tier when a cell is empty. */
const TIER_ORDER: Tier[] = ["ultra", "premium", "mid", "cheap"];

/** Freshness markers: their presence routes a request to live web search. */
const FRESHNESS =
  /\b(today|tonight|right now|latest|newest|current(?:ly)?|recent(?:ly)?|this (?:week|month|morning|weekend|year)|as of|breaking|headlines?|up to date|just (?:announced|released|launched|dropped)|last night|who won|stock price|exchange rate|weather)\b/i;

function looksFresh(prompt: string): boolean {
  return FRESHNESS.test(prompt);
}

/** Pick the model at `tier`, else step DOWN to weaker tiers, else UP to stronger ones. */
function resolveModel(
  cell: Partial<Record<Tier, string>> | undefined,
  tier: Tier,
): string | undefined {
  if (!cell) return undefined;
  const start = TIER_ORDER.indexOf(tier);
  for (let i = start; i < TIER_ORDER.length; i++) {
    const t = TIER_ORDER[i];
    if (!t) continue;
    const model = cell[t];
    if (model) return model;
  }
  for (let i = start - 1; i >= 0; i--) {
    const t = TIER_ORDER[i];
    if (!t) continue;
    const model = cell[t];
    if (model) return model;
  }
  return undefined;
}

/** The nearest label in a seed bank by cosine similarity, with its score. */
function nearest<L>(
  query: number[],
  bank: LabeledVector<L>[],
): { label: L; score: number } | undefined {
  let best: L | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const seed of bank) {
    const score = cosineSimilarity(query, seed.vector);
    if (score > bestScore) {
      bestScore = score;
      best = seed.label;
    }
  }
  return best === undefined ? undefined : { label: best, score: bestScore };
}

/**
 * Creates a two-axis router over a model catalog, exposing `route(input)` and,
 * when handlers are supplied, `run(input)`. Zero-config with the built-in catalog,
 * seeds, and grid: `createCatalogRouter({ embed })`.
 */
export function createCatalogRouter<TOutput = unknown>(
  config: CatalogRouterConfig<TOutput>,
) {
  const {
    embed,
    grid = capabilityGrid,
    capabilitySeeds = defaultCapabilitySeeds,
    tierSeeds = defaultTierSeeds,
    fallback = "general_qa",
    threshold = 0,
    longContextChars = 16000,
    freshness = true,
    ultra = true,
    vision = visionTiers,
    longContext = longContextTiers,
    handlers,
  } = config;

  if (typeof embed?.embed !== "function") {
    throw new Error("orfora: config.embed (an EmbeddingProvider) is required.");
  }
  if (!grid[fallback] || !resolveModel(grid[fallback], "premium")) {
    throw new Error(
      `orfora: fallback capability "${fallback}" has no model in the grid.`,
    );
  }

  // Every model a request could resolve to, across the grid and signal targets.
  const reachable = new Set<string>();
  for (const cell of Object.values(grid))
    for (const model of Object.values(cell)) reachable.add(model);
  for (const model of Object.values(vision)) reachable.add(model);
  for (const model of Object.values(longContext)) reachable.add(model);

  if (handlers) {
    const missing = [...reachable].filter((model) => !handlers[model]);
    if (missing.length > 0) {
      throw new Error(
        `orfora: config.handlers is missing ${missing.length} handler(s): ${missing.join(", ")}. openrouterHandlers({ apiKey }) builds one per catalog model.`,
      );
    }
  }

  // Embed all seeds once, lazily, sharing the work across concurrent first calls.
  let banks: Promise<{
    capability: LabeledVector<Capability>[];
    tier: LabeledVector<Tier>[];
  }> | null = null;
  function loadBanks() {
    if (!banks) {
      banks = (async () => {
        const cap: { label: Capability; text: string }[] = [];
        for (const [capability, seeds] of Object.entries(capabilitySeeds))
          for (const text of seeds)
            cap.push({ label: capability as Capability, text });

        const tier: { label: Tier; text: string }[] = [];
        for (const t of ["cheap", "mid", "premium"] as const)
          for (const text of tierSeeds[t]) tier.push({ label: t, text });

        const texts = [...cap.map((s) => s.text), ...tier.map((s) => s.text)];
        const vectors = texts.length ? await embed.embed(texts) : [];

        const capBank: LabeledVector<Capability>[] = [];
        cap.forEach((s, i) => {
          const vector = vectors[i];
          if (vector) capBank.push({ label: s.label, vector });
        });
        const tierBank: LabeledVector<Tier>[] = [];
        tier.forEach((s, i) => {
          const vector = vectors[cap.length + i];
          if (vector) tierBank.push({ label: s.label, vector });
        });
        return { capability: capBank, tier: tierBank };
      })();
    }
    return banks;
  }

  function failOpen(reason: string): CatalogDecision {
    const model = resolveModel(grid[fallback], "premium") as string;
    return {
      target: fallback,
      model,
      tier: "premium",
      score: 0,
      fallback: true,
      reason,
    };
  }

  async function route(input: string | RouteInput): Promise<CatalogDecision> {
    const request: RouteInput =
      typeof input === "string" ? { prompt: input } : input;

    try {
      const { capability: capBank, tier: tierBank } = await loadBanks();

      const embedded = await embed.embed([request.prompt]);
      const query = embedded[0];
      if (!query) return failOpen("no-embedding");

      // Tier is semantic, and needed even for signal routes (a photo can be a
      // trivial or a hard vision task).
      const tierMatch = nearest(query, tierBank);
      let tier: Tier = tierMatch?.label ?? "premium";

      // Deterministic overrides that replace the capability but keep the tier.
      if ((request.attachments?.length ?? 0) > 0) {
        const model = resolveModel(vision, tier);
        if (model)
          return {
            target: "vision",
            model,
            tier,
            score: 1,
            fallback: false,
            reason: "signal:attachment",
          };
      }
      if (longContextChars > 0 && request.prompt.length > longContextChars) {
        const model = resolveModel(longContext, tier);
        if (model)
          return {
            target: "long_context",
            model,
            tier,
            score: 1,
            fallback: false,
            reason: "signal:length",
          };
      }

      // Semantic capability, then freshness / threshold adjustments.
      const capMatch = nearest(query, capBank);
      if (!capMatch) return failOpen("no-capability");

      let capability = capMatch.label;
      let score = capMatch.score;
      let fell = false;
      let reason: string | undefined;

      if (freshness && looksFresh(request.prompt)) {
        capability = "live_web_search";
        score = 1;
        reason = "signal:freshness";
      } else if (score < threshold) {
        capability = fallback;
        fell = true;
        reason = "below-threshold";
      }

      // Hardest of the hard: a multi-part premium code/reasoning task steps to ultra.
      if (
        ultra &&
        tier === "premium" &&
        grid[capability]?.ultra &&
        looksMultiIntent(request.prompt)
      ) {
        tier = "ultra";
        reason = reason ?? "signal:ultra";
      }

      const model = resolveModel(grid[capability], tier);
      if (!model) return failOpen("no-model");

      return { target: capability, model, tier, score, fallback: fell, reason };
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
    if (!handler)
      throw new Error(`orfora: no handler for model "${decision.model}".`);
    return handler(request, decision);
  }

  return { route, run };
}
