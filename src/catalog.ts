/**
 * A curated catalog of ~50 real models (OpenRouter ids) and the default grid that
 * maps a routing decision to a concrete model.
 *
 * orfora decides on TWO orthogonal axes:
 *   - capability (WHAT KIND of task): code, math_reasoning, creative_writing,
 *     live_web_search, general_qa. Chosen by meaning (seed similarity).
 *   - tier (HOW STRONG a model the request warrants): cheap / mid / premium, plus
 *     an optional `ultra` for the genuinely hardest code and reasoning.
 *
 * The grid then picks the single best-fit model for each (capability, tier) cell.
 * This is a sensible DEFAULT: bring your own catalog and grid any time. Metadata
 * (context, vision, price) is real, pulled from the live OpenRouter catalog; the
 * grid mapping is a curated best-fit choice, not a benchmark ranking.
 */

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

/** One catalog entry. Metadata is real (live OpenRouter catalog); ids are verbatim. */
export interface CatalogModel {
  /** The OpenRouter model id, used verbatim as the route's model. */
  id: string;
  /** The model family, e.g. "Claude", "GPT", "Gemini". */
  family: string;
  /** Price band from the completion price: cheap <= $1, mid <= $12, premium > $12. */
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

/**
 * ~50 real models across the major families, each with a member or two per tier so
 * the grid and signal targets always have a real destination.
 */
export const catalog: CatalogModel[] = [
  // Claude — coding and writing strength, long context.
  {
    id: "anthropic/claude-opus-5",
    family: "Claude",
    tier: "premium",
    context: 1000000,
    vision: true,
    pricePerMTokens: 25,
  },
  {
    id: "anthropic/claude-opus-5-fast",
    family: "Claude",
    tier: "premium",
    context: 1000000,
    vision: true,
    pricePerMTokens: 50,
  },
  {
    id: "anthropic/claude-sonnet-5",
    family: "Claude",
    tier: "mid",
    context: 1000000,
    vision: true,
    pricePerMTokens: 10,
  },
  {
    id: "anthropic/claude-haiku-4.5",
    family: "Claude",
    tier: "mid",
    context: 200000,
    vision: true,
    pricePerMTokens: 5,
  },

  // GPT — general and reasoning flagships, plus a coding-tuned Codex.
  {
    id: "openai/gpt-5.6-sol",
    family: "GPT",
    tier: "premium",
    context: 1050000,
    vision: true,
    pricePerMTokens: 30,
  },
  {
    id: "openai/gpt-5.3-codex",
    family: "GPT",
    tier: "premium",
    context: 400000,
    vision: true,
    pricePerMTokens: 14,
  },
  {
    id: "openai/gpt-5.5-pro",
    family: "GPT",
    tier: "premium",
    context: 1050000,
    vision: true,
    pricePerMTokens: 180,
  },
  {
    id: "openai/gpt-5.4",
    family: "GPT",
    tier: "premium",
    context: 1050000,
    vision: true,
    pricePerMTokens: 15,
  },
  {
    id: "openai/gpt-5.6-terra",
    family: "GPT",
    tier: "mid",
    context: 1050000,
    vision: true,
    pricePerMTokens: 6,
  },
  {
    id: "openai/gpt-5.6-luna",
    family: "GPT",
    tier: "cheap",
    context: 1050000,
    vision: true,
    pricePerMTokens: 0.6,
  },
  {
    id: "openai/gpt-5-nano",
    family: "GPT",
    tier: "cheap",
    context: 400000,
    vision: true,
    pricePerMTokens: 0.4,
  },

  // Gemini — broad multimodal, huge context, strong translation.
  {
    id: "google/gemini-3.1-pro-preview",
    family: "Gemini",
    tier: "premium",
    context: 1048576,
    vision: true,
    pricePerMTokens: 12,
  },
  {
    id: "google/gemini-3.7-flash",
    family: "Gemini",
    tier: "mid",
    context: 1048576,
    vision: true,
    pricePerMTokens: 1.88,
  },
  {
    id: "google/gemini-3.5-flash-lite",
    family: "Gemini",
    tier: "mid",
    context: 1048576,
    vision: true,
    pricePerMTokens: 2.5,
  },
  {
    id: "google/gemini-2.5-flash-lite",
    family: "Gemini",
    tier: "cheap",
    context: 1048576,
    vision: true,
    pricePerMTokens: 0.4,
  },
  {
    id: "google/gemma-3-27b-it",
    family: "Gemini",
    tier: "cheap",
    context: 262144,
    vision: true,
    pricePerMTokens: 0.45,
  },

  // DeepSeek — strong reasoning and math per dollar.
  {
    id: "deepseek/deepseek-v4-pro",
    family: "DeepSeek",
    tier: "mid",
    context: 1048576,
    vision: false,
    pricePerMTokens: 1.98,
  },
  {
    id: "deepseek/deepseek-r1",
    family: "DeepSeek",
    tier: "mid",
    context: 64000,
    vision: false,
    pricePerMTokens: 2.5,
  },
  {
    id: "deepseek/deepseek-v4-flash",
    family: "DeepSeek",
    tier: "cheap",
    context: 1048576,
    vision: false,
    pricePerMTokens: 0.17,
  },
  {
    id: "deepseek/deepseek-v3.2",
    family: "DeepSeek",
    tier: "cheap",
    context: 163840,
    vision: false,
    pricePerMTokens: 0.4,
  },

  // Qwen — cheap generalists, coding and vision specialists.
  {
    id: "qwen/qwen3.8-max",
    family: "Qwen",
    tier: "mid",
    context: 1000000,
    vision: true,
    pricePerMTokens: 6,
  },
  {
    id: "qwen/qwen3-coder",
    family: "Qwen",
    tier: "cheap",
    context: 262144,
    vision: false,
    pricePerMTokens: 1,
  },
  {
    id: "qwen/qwen3-coder-flash",
    family: "Qwen",
    tier: "cheap",
    context: 1000000,
    vision: false,
    pricePerMTokens: 0.98,
  },
  {
    id: "qwen/qwen3-vl-32b-instruct",
    family: "Qwen",
    tier: "cheap",
    context: 131072,
    vision: true,
    pricePerMTokens: 0.42,
  },
  {
    id: "qwen/qwen3.7-flash",
    family: "Qwen",
    tier: "cheap",
    context: 1000000,
    vision: true,
    pricePerMTokens: 0.13,
  },

  // Llama — open weights, very long context.
  {
    id: "meta-llama/llama-4-maverick",
    family: "Llama",
    tier: "cheap",
    context: 1048576,
    vision: true,
    pricePerMTokens: 0.8,
  },
  {
    id: "meta-llama/llama-4-scout",
    family: "Llama",
    tier: "cheap",
    context: 1310720,
    vision: true,
    pricePerMTokens: 0.3,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    family: "Llama",
    tier: "cheap",
    context: 131072,
    vision: false,
    pricePerMTokens: 0.32,
  },

  // Mistral — efficient models, a coding-tuned Codestral, a multilingual Saba.
  {
    id: "mistralai/mistral-large",
    family: "Mistral",
    tier: "mid",
    context: 128000,
    vision: false,
    pricePerMTokens: 6,
  },
  {
    id: "mistralai/mistral-medium-3-5",
    family: "Mistral",
    tier: "mid",
    context: 262144,
    vision: true,
    pricePerMTokens: 7.5,
  },
  {
    id: "mistralai/codestral-2508",
    family: "Mistral",
    tier: "cheap",
    context: 256000,
    vision: false,
    pricePerMTokens: 0.9,
  },
  {
    id: "mistralai/mistral-small-2603",
    family: "Mistral",
    tier: "cheap",
    context: 262144,
    vision: true,
    pricePerMTokens: 0.6,
  },
  {
    id: "mistralai/mistral-saba",
    family: "Mistral",
    tier: "cheap",
    context: 32768,
    vision: false,
    pricePerMTokens: 0.6,
  },

  // Grok — strong generalists.
  {
    id: "x-ai/grok-4.6",
    family: "Grok",
    tier: "mid",
    context: 500000,
    vision: true,
    pricePerMTokens: 6,
  },
  {
    id: "x-ai/grok-4.3",
    family: "Grok",
    tier: "mid",
    context: 1000000,
    vision: true,
    pricePerMTokens: 2.5,
  },

  // Kimi — long context, a coding-tuned variant.
  {
    id: "moonshotai/kimi-k3",
    family: "Kimi",
    tier: "premium",
    context: 1048576,
    vision: true,
    pricePerMTokens: 15,
  },
  {
    id: "moonshotai/kimi-k2.7-code",
    family: "Kimi",
    tier: "mid",
    context: 262144,
    vision: true,
    pricePerMTokens: 3.5,
  },

  // Cohere — enterprise and RAG tuning.
  {
    id: "cohere/command-a",
    family: "Cohere",
    tier: "mid",
    context: 256000,
    vision: false,
    pricePerMTokens: 10,
  },
  {
    id: "cohere/command-r7b-12-2024",
    family: "Cohere",
    tier: "cheap",
    context: 128000,
    vision: false,
    pricePerMTokens: 0.15,
  },

  // Nova — Amazon's multimodal line.
  {
    id: "amazon/nova-pro-v1",
    family: "Nova",
    tier: "mid",
    context: 300000,
    vision: true,
    pricePerMTokens: 3.2,
  },
  {
    id: "amazon/nova-lite-v1",
    family: "Nova",
    tier: "cheap",
    context: 300000,
    vision: true,
    pricePerMTokens: 0.24,
  },
  {
    id: "amazon/nova-micro-v1",
    family: "Nova",
    tier: "cheap",
    context: 128000,
    vision: false,
    pricePerMTokens: 0.14,
  },

  // MiniMax — long-context multimodal.
  {
    id: "minimax/minimax-m3",
    family: "MiniMax",
    tier: "mid",
    context: 1048576,
    vision: true,
    pricePerMTokens: 1.2,
  },

  // GLM — a vision variant and a cheap flash.
  {
    id: "z-ai/glm-5.2",
    family: "GLM",
    tier: "mid",
    context: 1048576,
    vision: false,
    pricePerMTokens: 3.74,
  },
  {
    id: "z-ai/glm-4.6v",
    family: "GLM",
    tier: "cheap",
    context: 131072,
    vision: true,
    pricePerMTokens: 0.9,
  },
  {
    id: "z-ai/glm-4.7-flash",
    family: "GLM",
    tier: "cheap",
    context: 202752,
    vision: false,
    pricePerMTokens: 0.4,
  },

  // Nemotron — NVIDIA open models, large context.
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    family: "Nemotron",
    tier: "mid",
    context: 512288,
    vision: false,
    pricePerMTokens: 3.6,
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b",
    family: "Nemotron",
    tier: "cheap",
    context: 1000000,
    vision: false,
    pricePerMTokens: 0.4,
  },
  {
    id: "nvidia/nemotron-3.5-lightning",
    family: "Nemotron",
    tier: "cheap",
    context: 1000000,
    vision: false,
    pricePerMTokens: 0.2,
  },

  // Perplexity — the only live-web-search models in the catalog.
  {
    id: "perplexity/sonar-pro",
    family: "Perplexity",
    tier: "premium",
    context: 200000,
    vision: true,
    pricePerMTokens: 15,
  },
  {
    id: "perplexity/sonar",
    family: "Perplexity",
    tier: "cheap",
    context: 127072,
    vision: true,
    pricePerMTokens: 1,
  },
];

/**
 * The default grid: the best-fit model for each (capability, tier) cell.
 *
 * Premium picks follow specialisation rather than one flagship for everything:
 * Claude leads code and writing, GPT leads reasoning and general, Perplexity owns
 * live search. `ultra` is an opt-in top step for the hardest code and reasoning.
 * live_web_search has no distinct mid model (only sonar and sonar-pro exist), so
 * mid reuses sonar.
 */
export const capabilityGrid: Record<
  Capability,
  Partial<Record<Tier, string>>
> = {
  code: {
    cheap: "qwen/qwen3-coder-flash",
    mid: "moonshotai/kimi-k2.7-code",
    premium: "anthropic/claude-opus-5",
    ultra: "anthropic/claude-opus-5-fast",
  },
  math_reasoning: {
    cheap: "deepseek/deepseek-v3.2",
    mid: "deepseek/deepseek-r1",
    premium: "openai/gpt-5.6-sol",
    ultra: "openai/gpt-5.5-pro",
  },
  creative_writing: {
    cheap: "openai/gpt-5.6-luna",
    mid: "anthropic/claude-sonnet-5",
    premium: "anthropic/claude-opus-5",
  },
  live_web_search: {
    cheap: "perplexity/sonar",
    mid: "perplexity/sonar",
    premium: "perplexity/sonar-pro",
  },
  general_qa: {
    cheap: "google/gemini-2.5-flash-lite",
    mid: "google/gemini-3.7-flash",
    premium: "openai/gpt-5.6-sol",
  },
};

/**
 * Signal targets, chosen OUTSIDE the semantic axis by deterministic signals.
 *
 * An attached image routes to a vision-capable model; a very long prompt routes to
 * a long-context specialist; the optional multilingual preset routes non-English or
 * translation work to a language-strong model. Each is picked at the request's tier.
 */
export const visionTiers: Partial<Record<Tier, string>> = {
  cheap: "qwen/qwen3-vl-32b-instruct",
  mid: "google/gemini-3.7-flash",
  premium: "google/gemini-3.1-pro-preview",
};

export const longContextTiers: Partial<Record<Tier, string>> = {
  cheap: "meta-llama/llama-4-scout",
  mid: "google/gemini-3.7-flash",
  premium: "anthropic/claude-opus-5",
};

export const multilingualTiers: Partial<Record<Tier, string>> = {
  cheap: "mistralai/mistral-saba",
  mid: "cohere/command-a",
  premium: "google/gemini-3.1-pro-preview",
};

/** Look up a catalog entry by its model id. */
export function findModel(id: string): CatalogModel | undefined {
  return catalog.find((m) => m.id === id);
}
