/**
 * Cascade / escalation: the runtime complement to predicting a tier up front. Instead
 * of guessing how hard a request is, orfora hands back an escalation LADDER (the best
 * gate-passing model in each price tier, cheapest first). The app calls the cheapest,
 * verifies the answer, and only escalates to a stronger tier when the check fails, so
 * frontier tokens are spent only on the requests that provably needed them.
 *
 * orfora stays LLM-free at routing time: it plans the ladder and executes it, but the
 * verifier is the app's (a judge, a unit test, a schema check). A cheap heuristic is
 * provided for a sensible default.
 */

import type { Capability } from "./catalog";
import type { ModelVector } from "./modelVector";

export interface CascadeStep {
  model: string;
  priceTier: "cheap" | "mid" | "premium";
  pricePerMTokens: number;
  /** The model's fitness for the request's capability, or null when unscored. */
  fitness: number | null;
}

export interface CascadePlan {
  capability: Capability;
  /** Ascending ladder: the best model per available price tier, cheapest first. */
  steps: CascadeStep[];
  reason: string;
}

export interface CascadeResult<T> {
  answer: T;
  step: CascadeStep;
  /** Which rung accepted the answer (0 = the cheapest). */
  index: number;
  /** True if we climbed past the cheapest rung. */
  escalated: boolean;
  /** True if no rung's answer passed verification (returns the strongest answer). */
  exhausted: boolean;
}

const TIER_RANK: Record<CascadeStep["priceTier"], number> = {
  cheap: 0,
  mid: 1,
  premium: 2,
};

/**
 * Build the escalation ladder from gate-passing candidates: keep the highest-fitness
 * model in each price tier, ordered cheap -> mid -> premium. One rung per tier keeps
 * the ladder short and each rung meaningfully stronger than the last.
 */
export function buildCascade(
  candidates: Array<{ model: ModelVector; fitness: number | null }>,
): CascadeStep[] {
  const best = new Map<
    CascadeStep["priceTier"],
    { model: ModelVector; fitness: number | null }
  >();
  for (const c of candidates) {
    const tier = c.model.priceTier;
    const cur = best.get(tier);
    if (!cur || (c.fitness ?? -1) > (cur.fitness ?? -1)) best.set(tier, c);
  }
  return [...best.values()]
    .sort((a, b) => TIER_RANK[a.model.priceTier] - TIER_RANK[b.model.priceTier])
    .map((c) => ({
      model: c.model.id,
      priceTier: c.model.priceTier,
      pricePerMTokens: c.model.pricePerMTokens,
      fitness: c.fitness,
    }));
}

/**
 * Execute a cascade: call each rung in turn, verify its answer, and return the first
 * that passes. If none pass, return the strongest rung's answer flagged `exhausted`.
 */
export async function runCascade<T>(
  plan: CascadePlan,
  call: (step: CascadeStep) => Promise<T> | T,
  verify: (answer: T, step: CascadeStep) => boolean | Promise<boolean>,
): Promise<CascadeResult<T>> {
  let last: { answer: T; step: CascadeStep; index: number } | null = null;
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    if (!step) continue;
    const answer = await call(step);
    last = { answer, step, index: i };
    if (await verify(answer, step)) {
      return { answer, step, index: i, escalated: i > 0, exhausted: false };
    }
  }
  if (!last) throw new Error("orfora: cascade plan has no steps.");
  return { ...last, escalated: last.index > 0, exhausted: true };
}

const REFUSAL =
  /\b(i (can'?t|cannot|am unable to)|i'?m (not able|unable)|as an ai|i (don'?t|do not) (know|have)|i'?m not sure|cannot (help|assist|comply))\b/i;

/**
 * A cheap, LLM-free adequacy check for the cascade's default: reject an empty, too
 * short, or refusal/uncertainty answer so it escalates. Apps should pass their own
 * verifier (a judge, a schema or unit-test check) for anything they can verify harder.
 */
export function heuristicVerify(
  answer: string,
  opts?: { minLength?: number },
): boolean {
  const min = opts?.minLength ?? 20;
  const text = answer.trim();
  if (text.length < min) return false;
  if (REFUSAL.test(text)) return false;
  return true;
}
