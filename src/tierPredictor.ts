import type { Tier } from "./catalog";

/**
 * A learned tier classifier: a 3-class logistic regression over prompt embeddings,
 * fit OFFLINE from real routing outcomes (which cheapest tier actually solved each
 * prompt) rather than hand-tuned. The weights are embedding-space specific, so the
 * predictor only applies when the router embeds in the same space it was trained in.
 */
export interface TierModel {
  /** Tier names aligned to the rows of {@link coef} / {@link intercept}. */
  labels: string[];
  /** Embedding dimension the weights expect. */
  dim: number;
  /** The embedder the weights were trained in (they do not transfer across spaces). */
  embedder: string;
  /** Provenance of the training data, for honesty. */
  source: string;
  /** One weight row per label: labels.length x dim. */
  coef: number[][];
  /** One bias per label. */
  intercept: number[];
}

export interface TierPrediction {
  tier: Tier;
  /** Softmax probability per label. */
  scores: Record<string, number>;
  /** The top probability. */
  confidence: number;
}

/**
 * Predict a tier from a prompt embedding with the learned weights. Returns null when
 * the embedding dimension does not match the model (e.g. a different embedder), so the
 * router falls back to seed-based tiering instead of trusting the wrong vector space.
 */
export function predictTier(
  model: TierModel,
  embedding: number[],
): TierPrediction | null {
  if (embedding.length !== model.dim) return null;

  const logits = model.coef.map((weights, i) => {
    let sum = model.intercept[i] ?? 0;
    for (let d = 0; d < model.dim; d++) {
      sum += (weights[d] ?? 0) * (embedding[d] ?? 0);
    }
    return sum;
  });

  const max = Math.max(...logits);
  const exp = logits.map((l) => Math.exp(l - max));
  const total = exp.reduce((a, b) => a + b, 0) || 1;
  const probs = exp.map((e) => e / total);

  let best = 0;
  for (let i = 1; i < probs.length; i++) {
    if ((probs[i] ?? 0) > (probs[best] ?? 0)) best = i;
  }

  const scores: Record<string, number> = {};
  model.labels.forEach((label, i) => {
    scores[label] = probs[i] ?? 0;
  });

  return {
    tier: (model.labels[best] ?? "mid") as Tier,
    scores,
    confidence: probs[best] ?? 0,
  };
}
