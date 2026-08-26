/**
 * The catalog and the default (capability, tier) -> model grid for the two-axis
 * catalog router.
 *
 * There is ONE source of model identity: `defaultVectorCatalog`. This file DERIVES
 * its `CatalogModel[]` from it (id, family, price band, context, vision), so the two
 * routers cannot drift apart and the OpenRouter handler surface covers exactly the
 * models the vector router routes to. The grid below is a curated best-fit default
 * over those ids (gate-aware: web search to Sonar, vision to image models, long
 * context to big-window models); bring your own grid any time.
 */

import type { ModelVector } from "./modelVector";
import { defaultVectorCatalog } from "./vectorCatalog";

/** The semantic capability axis: what kind of task a request is. */
export type Capability =
  | "code"
  | "math_reasoning"
  | "creative_writing"
  | "live_web_search"
  | "general_qa";

/** A model's inherent price band, from its completion price per 1M tokens. */
export type PriceTier = "cheap" | "mid" | "premium";

/** The routing tier axis. `ultra` is an opt-in top step above `premium`. */
export type Tier = PriceTier | "ultra";

/** One catalog entry, derived from a model vector (the single source of truth). */
export interface CatalogModel {
  /** The model id, used verbatim as the route's model. */
  id: string;
  /** The model family, e.g. "Claude", "GPT", "Gemini". */
  family: string;
  /** Price band from the completion price: cheap <= $3, mid <= $15, premium > $15. */
  tier: PriceTier;
  /** Maximum context length in tokens. */
  context: number;
  /** True when the model accepts image input (used by the vision signal). */
  vision: boolean;
  /** Completion price in USD per 1M tokens. */
  pricePerMTokens: number;
}

/** The five semantic capabilities, in a stable order. */
export const capabilities: Capability[] = [
  "code",
  "math_reasoning",
  "creative_writing",
  "live_web_search",
  "general_qa",
];

/** Derive a catalog entry from a model vector; the vector catalog is the single truth. */
function toCatalogModel(m: ModelVector): CatalogModel {
  return {
    id: m.id,
    family: m.family,
    tier: m.priceTier,
    context: m.context,
    vision: m.imageIn,
    pricePerMTokens: m.pricePerMTokens,
  };
}

/** The catalog: the vector catalog's chat models, so the two routers never diverge. */
export const catalog: CatalogModel[] = defaultVectorCatalog
  .filter((m) => m.modelClass === "chat")
  .map(toCatalogModel);

/**
 * The default (capability, tier) -> model grid. A curated best-fit default over the
 * derived catalog's ids: gate-aware (live_web_search stays on Sonar), with an `ultra`
 * step only for the hardest code and reasoning. Override with your own grid any time.
 */
export const capabilityGrid: Record<
  Capability,
  Partial<Record<Tier, string>>
> = {
  code: {
    cheap: "deepseek/deepseek-v4-flash",
    mid: "alibaba/qwen3.8-max",
    premium: "anthropic/claude-opus-5",
    ultra: "anthropic/claude-fable-5",
  },
  math_reasoning: {
    cheap: "openai/gpt-5.6-luna",
    mid: "openai/gpt-5.6-terra",
    premium: "openai/gpt-5.6-sol",
    ultra: "google/gemini-3.1-pro-preview",
  },
  creative_writing: {
    cheap: "openai/gpt-5.6-luna",
    mid: "anthropic/claude-sonnet-5",
    premium: "anthropic/claude-opus-5",
  },
  live_web_search: {
    cheap: "perplexity/sonar",
    mid: "perplexity/sonar-pro",
    premium: "perplexity/sonar-reasoning-pro",
  },
  general_qa: {
    cheap: "openai/gpt-5.6-luna",
    mid: "openai/gpt-5.6-terra",
    premium: "openai/gpt-5.6-sol",
  },
};

/**
 * Signal targets, chosen OUTSIDE the semantic axis by deterministic signals. An
 * attached image routes to a vision-capable model; a very long prompt to a
 * long-context model; the optional multilingual preset to a language-strong model.
 * Each is picked at the request's tier, over ids in the derived catalog.
 */
export const visionTiers: Partial<Record<Tier, string>> = {
  cheap: "openai/gpt-5.6-luna",
  mid: "google/gemini-3.7-flash",
  premium: "google/gemini-3.1-pro-preview",
};

export const longContextTiers: Partial<Record<Tier, string>> = {
  cheap: "meta/llama-4-scout",
  mid: "google/gemini-3.7-flash",
  premium: "anthropic/claude-opus-5",
};

export const multilingualTiers: Partial<Record<Tier, string>> = {
  cheap: "openai/gpt-5.6-luna",
  mid: "alibaba/qwen3.8-max",
  premium: "google/gemini-3.1-pro-preview",
};

/** Look up a catalog entry by its model id. */
export function findModel(id: string): CatalogModel | undefined {
  return catalog.find((m) => m.id === id);
}
