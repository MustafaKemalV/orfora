/**
 * The vector router: model-as-vector routing.
 *
 * Per request it embeds the prompt ONCE, then:
 *   1. finds the nearest capability centroid -> the request's capability;
 *   2. finds the nearest tier seed -> the tier (the tier-seed match measured best;
 *      the multi-factor difficulty scorer is reported but experimental, awaiting a
 *      calibration from real outcome data, so it does not decide the tier);
 *   3. matches against the model catalog: apply hard gates, then among the models
 *      whose relevance-weighted fitness clears the tier's bar pick the cheapest at
 *      lower tiers or the strongest at premium/ultra. If no model has scores yet, it
 *      degrades gracefully to price-tier routing; if nothing clears the bar, it fails
 *      open to the strongest available. Anything unclear or throwing falls open too.
 *
 * This unifies the capability x tier grid into one profile match: a full model
 * vector for coverage, request-relevant weighting for precision.
 */

import { buildCascade, type CascadePlan } from "./cascade";
import type { Capability, Tier } from "./catalog";
import {
  capabilitySeeds as defaultCapabilitySeeds,
  tierSeeds as defaultTierSeeds,
} from "./catalogSeeds";
import { type DifficultyOptions, scoreDifficulty } from "./difficulty";
import { capabilityRelevance, fitness, type ModelVector } from "./modelVector";
import { cosineSimilarity } from "./similarity";
import { predictTier, type TierModel } from "./tierPredictor";
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
  /** Override the tier seed sets (cheap / mid / premium). */
  tierSeeds?: { cheap: string[]; mid: string[]; premium: string[] };
  /**
   * Where to fail open when routing cannot decide (empty/failed embedding, an error).
   * A model id, or "strongest" (default) / "cheapest". The default never trades quality
   * on a bad guess; set "cheapest" (or a cheap id) for a cost-safe fail-open instead.
   */
  fallback?: string;
  /** Minimum fitness to accept per tier. */
  thresholds?: Partial<Record<Tier, number>>;
  /** Difficulty scorer overrides (weights / bands). */
  difficulty?: DifficultyOptions;
  /**
   * Abstain to general_qa when the request is out-of-distribution (far from every
   * capability) or ambiguous (the top two capabilities too close), rather than
   * routing to a wrong specialist. Set to false to disable.
   */
  abstain?: { minCosine?: number; minMargin?: number } | false;
  /**
   * A learned tier predictor (trained on real routing outcomes) that overrides the
   * seed-based tier when its embedding space matches the router's. Opt-in, because
   * the weights only transfer within the embedder they were trained in.
   */
  tierPredictor?: TierModel;
  /** Optional handlers to call the chosen model via run(). */
  handlers?: Record<string, VectorHandler<TOutput>>;
}

// Tier thresholds are DERIVED from the catalog's own fitness distribution, not hand
// set. A fixed 0.9 "premium" bar was unreachable for code and creative writing (whose
// fitness tops out near 0.85), so those tiers always fell to the strongest-model branch
// and the tier axis went inert. Percentiles keep every tier reachable and meaningful,
// and recalibrate automatically when the catalog changes.
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(p * (sorted.length - 1))),
  );
  return sorted[i] ?? 0;
}
function deriveThresholds(models: ModelVector[]): Record<Tier, number> {
  const vals: number[] = [];
  for (const m of models)
    for (const cap of Object.keys(capabilityRelevance) as Capability[]) {
      const f = fitness(m, cap);
      if (f !== null) vals.push(f);
    }
  vals.sort((a, b) => a - b);
  // Percentiles of the fitness distribution: cheap floors at the bottom quartile (a
  // modest model, not rock-bottom), each tier above it a real step, premium the top
  // fifth, ultra the top tenth. Reachable by construction, and self-recalibrating.
  return {
    cheap: percentile(vals, 0.25),
    mid: percentile(vals, 0.55),
    premium: percentile(vals, 0.8),
    ultra: percentile(vals, 0.92),
  };
}
const DEFAULT_THRESHOLDS: Record<Tier, number> =
  deriveThresholds(defaultVectorCatalog);

const TIER_TO_PRICE: Record<Tier, "cheap" | "mid" | "premium"> = {
  cheap: "cheap",
  mid: "mid",
  premium: "premium",
  ultra: "premium",
};

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
const cheaper = (a: ModelVector, b: ModelVector) =>
  b.pricePerMTokens < a.pricePerMTokens ? b : a;

/** The mean of a set of vectors; cosine is scale-invariant, so no normalisation. */
function centroid(vectors: number[][]): number[] | null {
  const first = vectors[0];
  if (!first) return null;
  const sum = new Array<number>(first.length).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < sum.length; i++) sum[i] = (sum[i] ?? 0) + (v[i] ?? 0);
  }
  return sum.map((x) => x / vectors.length);
}

/**
 * The text a routing decision is embedded on. For a long prompt the capability is the
 * INSTRUCTION, not the pasted body, so keep the leading and trailing text (where the ask
 * usually sits) and drop the middle, whose content would otherwise dominate the vector.
 */
export function instructionSpan(text: string, maxChars = 600): string {
  if (text.length <= maxChars) return text;
  const head = Math.ceil(maxChars * 0.6);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n…\n${text.slice(text.length - tail)}`;
}

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
 * Picks the best-fit model for a capability at a tier, subject to hard gates. Among the
 * models clearing the tier's fitness bar, lower tiers take the CHEAPEST (cost-efficient
 * when "good enough" suffices) and premium/ultra take the STRONGEST (a hard request
 * should get the best model, not the cheapest that merely clears). If none clears the
 * bar, the strongest available; if no model has scores, the cheapest at the price tier.
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
      // Lower tiers optimise cost; premium and ultra optimise quality, so a hard
      // request gets the strongest model rather than the cheapest that clears the bar.
      const qualityFirst = tier === "premium" || tier === "ultra";
      const best = qualityFirst
        ? eligible.reduce((a, b) =>
            b.f > a.f || (b.f === a.f && cheaper(a.m, b.m) === b.m) ? b : a,
          )
        : eligible.reduce((a, b) => (cheaper(a.m, b.m) === b.m ? b : a));
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

/** The request's capability by nearest capability seed, with OOD/ambiguity abstention. */
function nearestCapability(
  query: number[],
  capBank: { label: Capability; vector: number[] }[],
  abstain: { minCosine: number; minMargin: number } | null,
): {
  capability: Capability;
  seedDistance: number;
  abstainReason: string | null;
} {
  let capability: Capability = "general_qa";
  let bestCosine = Number.NEGATIVE_INFINITY;
  let secondCosine = Number.NEGATIVE_INFINITY;
  for (const seed of capBank) {
    const score = cosineSimilarity(query, seed.vector);
    if (score > bestCosine) {
      secondCosine = bestCosine;
      bestCosine = score;
      capability = seed.label;
    } else if (score > secondCosine) {
      secondCosine = score;
    }
  }
  const seedDistance = clamp01(1 - bestCosine);
  let abstainReason: string | null = null;
  if (abstain && capability !== "general_qa") {
    if (bestCosine < abstain.minCosine) abstainReason = "abstain:ood";
    else if (bestCosine - secondCosine < abstain.minMargin)
      abstainReason = "abstain:margin";
    if (abstainReason) capability = "general_qa";
  }
  return { capability, seedDistance, abstainReason };
}

/** A rough context requirement in tokens for the gate: ~4 chars per token, plus headroom
 * for the model's own response, so the window must fit input AND output. */
function estimateContextNeed(text: string): number {
  return Math.ceil(text.length / 4) + 2000;
}

function buildGates(request: RouteInput, capability: Capability): Gates {
  return {
    needsImage: (request.attachments?.length ?? 0) > 0,
    needsWebSearch: capability === "live_web_search",
    minContext: estimateContextNeed(request.prompt),
  };
}

/** Creates a model-as-vector router exposing route(input), run(input), and plan(input). */
export function createVectorRouter<TOutput = unknown>(
  config: VectorRouterConfig<TOutput>,
) {
  const {
    embed,
    catalog = defaultVectorCatalog,
    capabilitySeeds = defaultCapabilitySeeds,
    tierSeeds = defaultTierSeeds,
    difficulty: difficultyOptions,
    handlers,
  } = config;

  const abstain =
    config.abstain === false
      ? null
      : { minCosine: 0.15, minMargin: 0.03, ...config.abstain };

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
  const strongest = () =>
    chatModels.reduce((a, b) =>
      b.pricePerMTokens > a.pricePerMTokens ? b : a,
    );
  const cheapest = () =>
    chatModels.reduce((a, b) =>
      b.pricePerMTokens < a.pricePerMTokens ? b : a,
    );
  const fb = config.fallback;
  if (fb && fb !== "strongest" && fb !== "cheapest" && !byId.has(fb)) {
    throw new Error(`orfora: config.fallback "${fb}" is not in the catalog.`);
  }
  const fallbackModel =
    !fb || fb === "strongest"
      ? strongest()
      : fb === "cheapest"
        ? cheapest()
        : (byId.get(fb) as ModelVector);

  if (handlers) {
    for (const m of chatModels) {
      if (!handlers[m.id]) {
        throw new Error(
          `orfora: config.handlers is missing a handler for "${m.id}".`,
        );
      }
    }
  }

  let bank: Promise<{
    capability: { label: Capability; vector: number[] }[];
    tier: { label: Tier; vector: number[] }[];
  }> | null = null;
  function loadBank() {
    if (!bank) {
      bank = (async () => {
        const capFlat: { label: Capability; text: string }[] = [];
        for (const [capability, seeds] of Object.entries(capabilitySeeds)) {
          for (const text of seeds)
            capFlat.push({ label: capability as Capability, text });
        }
        const tierFlat: { label: Tier; text: string }[] = [];
        for (const t of ["cheap", "mid", "premium"] as const) {
          for (const text of tierSeeds[t]) tierFlat.push({ label: t, text });
        }
        const texts = [
          ...capFlat.map((s) => s.text),
          ...tierFlat.map((s) => s.text),
        ];
        const vectors = texts.length ? await embed.embed(texts) : [];
        // Capability is matched by CENTROID (mean of a capability's seed vectors),
        // so one outlier seed cannot swing the decision.
        const grouped = new Map<Capability, number[][]>();
        capFlat.forEach((s, i) => {
          const vector = vectors[i];
          if (!vector) return;
          const arr = grouped.get(s.label) ?? [];
          arr.push(vector);
          grouped.set(s.label, arr);
        });
        const capBank: { label: Capability; vector: number[] }[] = [];
        for (const [label, vecs] of grouped) {
          const c = centroid(vecs);
          if (c) capBank.push({ label, vector: c });
        }
        const tierBank: { label: Tier; vector: number[] }[] = [];
        tierFlat.forEach((s, i) => {
          const vector = vectors[capFlat.length + i];
          if (vector) tierBank.push({ label: s.label, vector });
        });
        return { capability: capBank, tier: tierBank };
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
      const { capability: capBank, tier: tierBank } = await loadBank();
      if (capBank.length === 0) return failOpen("no-seeds");

      const embedded = await embed.embed([instructionSpan(request.prompt)]);
      const query = embedded[0];
      if (!query) return failOpen("no-embedding");

      const { capability, seedDistance, abstainReason } = nearestCapability(
        query,
        capBank,
        abstain,
      );

      // Tier comes from the nearest tier seed by default.
      let tier: Tier = "premium";
      let bestTierCosine = Number.NEGATIVE_INFINITY;
      for (const seed of tierBank) {
        const score = cosineSimilarity(query, seed.vector);
        if (score > bestTierCosine) {
          bestTierCosine = score;
          tier = seed.label;
        }
      }
      // A learned predictor (trained on real outcomes) overrides the seed tier when
      // provided and its embedding space matches; otherwise the seed tier stands.
      if (config.tierPredictor) {
        const pred = predictTier(config.tierPredictor, query);
        if (pred) tier = pred.tier;
      }

      // Difficulty is reported for transparency (epistemic / aleatoric); it does not
      // decide the tier, pending a calibration from real outcome data.
      const diff = scoreDifficulty(request.prompt, {
        ...difficultyOptions,
        seedDistance,
      });

      const gates = buildGates(request, capability);

      const match = matchModel(catalog, capability, tier, gates, thresholds);
      const base = {
        capability,
        tier,
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
          reason: abstainReason ?? match.reason,
        };
      }
      return {
        ...base,
        model: match.model.id,
        fitness: match.fitness,
        fallback: false,
        reason: abstainReason ?? match.reason,
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

  /**
   * A cascade plan for the request: the escalation ladder (best model per price tier,
   * cheapest first) for the detected capability. Feed it to runCascade to start cheap
   * and climb only when a verifier rejects an answer.
   */
  async function plan(input: string | RouteInput): Promise<CascadePlan> {
    const request: RouteInput =
      typeof input === "string" ? { prompt: input } : input;
    const { capability: capBank } = await loadBank();
    let capability: Capability = "general_qa";
    if (capBank.length > 0) {
      const embedded = await embed.embed([instructionSpan(request.prompt)]);
      const query = embedded[0];
      if (query) {
        capability = nearestCapability(query, capBank, abstain).capability;
      }
    }
    const gates = buildGates(request, capability);
    const candidates = catalog
      .filter((m) => passesGates(m, gates))
      .map((m) => ({ model: m, fitness: fitness(m, capability) }));
    return {
      capability,
      steps: buildCascade(candidates),
      reason: `cascade:${capability}`,
    };
  }

  return { route, run, plan };
}
