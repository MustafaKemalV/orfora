/**
 * The model-as-vector representation: each model is a capability profile made of
 * hard GATES (things a request either needs or does not, checked deterministically)
 * and soft SCORES in [0,1] (how good the model is on each capability axis).
 *
 * Routing does NOT compare the whole vector blindly. Given a request's capability,
 * only the RELEVANT scores are weighted (a code request cares about code, not
 * creative writing), so a rich vector adds coverage without adding noise. Scores
 * are filled from real benchmarks; unknown scores are simply absent. fitness() averages
 * over the axes actually measured, then shrinks toward the prior by how few there are,
 * so one lucky number cannot outrank a fuller, well-measured profile.
 */

import type { Capability } from "./catalog";

/** A model's class. Only "chat" models enter the answer-the-user routing grid. */
export type ModelClass =
  | "chat"
  | "embedding"
  | "image_gen"
  | "speech"
  | "moderation";

/** The soft capability axes, each scored in [0,1]. */
export type CapabilityScore =
  | "code_snippet"
  | "code_agentic"
  | "math_reasoning"
  | "general_knowledge"
  | "instruction_following"
  | "tool_use"
  | "creative_writing"
  | "human_preference_elo";

/** A model's full capability profile: gates, cost, and soft scores. */
export interface ModelVector {
  id: string;
  family: string;
  modelClass: ModelClass;

  // Cost side of the routing objective.
  priceTier: "cheap" | "mid" | "premium";
  /** Headline cost used for routing; mirrors {@link priceOutput}. */
  pricePerMTokens: number;
  /** Split token prices per million tokens, when known. */
  priceInput?: number;
  priceOutput?: number;

  // Hard gates: a request either needs these or it does not.
  context: number;
  imageIn: boolean;
  audioIn: boolean;
  videoIn: boolean;
  toolsSupported: boolean;
  hasWebSearch: boolean;

  /** Soft capability scores in [0,1]. Absent keys mean "not sourced yet". */
  scores: Partial<Record<CapabilityScore, number>>;

  /**
   * Where the scores came from, for honesty. When a current model has no published
   * benchmarks yet, its profile is carried forward from the family's latest MEASURED
   * version (capability persists across versions), and this names that source so it
   * is never mistaken for the current model's own measured numbers.
   */
  profileFrom?: string;
  /** Optional: how current the model's knowledge is, 0..1. */
  knowledgeRecency?: number;
  /** Optional opt-in domain specialisations, e.g. ["legal"]. */
  domainAffinity?: string[];
}

/**
 * Which capability scores matter for each request capability, and how much. The
 * weights per capability sum to 1, so a weighted score is a 0..1 fitness. This is
 * how a full vector stays precise: irrelevant axes get zero weight for the request.
 */
export const capabilityRelevance: Record<
  Capability,
  Partial<Record<CapabilityScore, number>>
> = {
  code: {
    code_agentic: 0.6,
    code_snippet: 0.2,
    instruction_following: 0.1,
    tool_use: 0.1,
  },
  math_reasoning: { math_reasoning: 0.8, general_knowledge: 0.2 },
  creative_writing: { creative_writing: 0.8, instruction_following: 0.2 },
  // live_web_search fitness leans on general competence; the real decider is the
  // hasWebSearch gate applied by the router, not a soft score.
  live_web_search: { general_knowledge: 0.6, human_preference_elo: 0.4 },
  general_qa: {
    general_knowledge: 0.5,
    human_preference_elo: 0.3,
    instruction_following: 0.2,
  },
};

/** The prior fitness of an unmeasured model: "assume average". */
const NEUTRAL_PRIOR = 0.5;

/**
 * A model's fitness for a capability in [0,1], or null when it cannot be judged.
 *
 * The PRIMARY axis (the highest-weighted one for the capability) is REQUIRED: with no
 * score there, fitness is null and the router degrades to price-tier routing, so we
 * never credit a model on what the request needs most when we cannot measure it there.
 *
 * Otherwise: take the relevance-weighted mean over the axes we DID measure (renormalised,
 * so a missing minor axis neither inflates nor deflates the score), then shrink that mean
 * toward {@link NEUTRAL_PRIOR} by the fraction of relevant axes left unmeasured. A model
 * judged on all its relevant axes is trusted fully; one judged on a single axis is pulled
 * toward average, so a lone high benchmark number can no longer claim a top score.
 */
export function fitness(
  model: ModelVector,
  capability: Capability,
): number | null {
  const weights = capabilityRelevance[capability];

  let primary: CapabilityScore | undefined;
  let primaryWeight = Number.NEGATIVE_INFINITY;
  for (const [dim, weight] of Object.entries(weights)) {
    if (weight > primaryWeight) {
      primaryWeight = weight;
      primary = dim as CapabilityScore;
    }
  }
  if (primary && typeof model.scores[primary] !== "number") return null;

  let presentWeight = 0;
  let weightedScore = 0;
  let measured = 0;
  for (const [dim, weight] of Object.entries(weights)) {
    const score = model.scores[dim as CapabilityScore];
    if (typeof score === "number") {
      presentWeight += weight;
      weightedScore += weight * score;
      measured += 1;
    }
  }
  if (presentWeight === 0) return null;
  const mean = weightedScore / presentWeight;
  const coverage = measured / Object.keys(weights).length;
  return coverage * mean + (1 - coverage) * NEUTRAL_PRIOR;
}
