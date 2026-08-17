import type { RouteInput, RouteResult } from "./types";

/** One labelled example: an input and the route it should be sent to. */
export interface LabeledExample {
  input: string | RouteInput;
  expected: string;
}

/** The minimal router shape evaluate needs: anything with a `route()` method. */
export interface Routable {
  route(input: string | RouteInput): Promise<RouteResult>;
}

export interface EvalReport {
  total: number;
  correct: number;
  accuracy: number;
  /** confusion[expected][predicted] = count. */
  confusion: Record<string, Record<string, number>>;
  /** Per expected route, the fraction routed correctly (0..1). */
  recallByRoute: Record<string, number>;
  results: {
    expected: string;
    predicted: string;
    correct: boolean;
  }[];
}

/**
 * Runs a router over a labelled set and reports how well it routed: overall
 * accuracy, a confusion matrix, and per-route recall. It is deterministic and
 * provider-free (it just calls the router you pass), so it is easy to test; feed
 * it a router backed by a real embedder to measure real quality.
 */
export async function evaluate(
  router: Routable,
  examples: LabeledExample[],
): Promise<EvalReport> {
  const results: EvalReport["results"] = [];
  const confusion: Record<string, Record<string, number>> = {};
  const totalByRoute: Record<string, number> = {};
  const correctByRoute: Record<string, number> = {};

  for (const example of examples) {
    const decision = await router.route(example.input);
    const predicted = decision.route;
    const correct = predicted === example.expected;
    results.push({ expected: example.expected, predicted, correct });

    let row = confusion[example.expected];
    if (!row) {
      row = {};
      confusion[example.expected] = row;
    }
    row[predicted] = (row[predicted] ?? 0) + 1;
    totalByRoute[example.expected] = (totalByRoute[example.expected] ?? 0) + 1;
    if (correct) {
      correctByRoute[example.expected] =
        (correctByRoute[example.expected] ?? 0) + 1;
    }
  }

  const correct = results.filter((r) => r.correct).length;
  const recallByRoute: Record<string, number> = {};
  for (const route of Object.keys(totalByRoute)) {
    const total = totalByRoute[route] ?? 0;
    recallByRoute[route] =
      total === 0 ? 0 : (correctByRoute[route] ?? 0) / total;
  }

  return {
    total: examples.length,
    correct,
    accuracy: examples.length === 0 ? 0 : correct / examples.length,
    confusion,
    recallByRoute,
    results,
  };
}

/** One labelled example for the catalog router: an input plus its two axes. */
export interface CatalogLabeledExample {
  input: string | RouteInput;
  /** The expected capability (or signal target, e.g. "vision"). */
  capability: string;
  /** The expected tier (cheap / mid / premium / ultra). */
  tier: string;
}

/** The minimal catalog-router shape evaluate needs: `route()` returning both axes. */
export interface CatalogRoutable {
  route(input: string | RouteInput): Promise<{ target: string; tier: string }>;
}

export interface CatalogEvalReport {
  total: number;
  /** Fraction of requests whose capability was predicted correctly. */
  capabilityAccuracy: number;
  /** Fraction whose tier was predicted correctly. */
  tierAccuracy: number;
  /** Fraction where BOTH capability and tier were correct. */
  bothAccuracy: number;
  /** Per expected capability, the fraction routed correctly (0..1). */
  capabilityRecall: Record<string, number>;
  /** Per expected tier, the fraction routed correctly (0..1). */
  tierRecall: Record<string, number>;
  /** capabilityConfusion[expected][predicted] = count. */
  capabilityConfusion: Record<string, Record<string, number>>;
  results: {
    expectedCapability: string;
    predictedCapability: string;
    expectedTier: string;
    predictedTier: string;
    capabilityCorrect: boolean;
    tierCorrect: boolean;
  }[];
}

function recallFrom(
  total: Record<string, number>,
  hit: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(total)) {
    const t = total[key] ?? 0;
    out[key] = t === 0 ? 0 : (hit[key] ?? 0) / t;
  }
  return out;
}

/**
 * Evaluates a catalog router on its two axes at once: how often it picks the right
 * capability, the right tier, and both together. Same idea as {@link evaluate},
 * provider-free, so pass a router backed by a real embedder to measure real quality.
 */
export async function evaluateCatalog(
  router: CatalogRoutable,
  examples: CatalogLabeledExample[],
): Promise<CatalogEvalReport> {
  const results: CatalogEvalReport["results"] = [];
  const capabilityConfusion: Record<string, Record<string, number>> = {};
  const capTotal: Record<string, number> = {};
  const capHit: Record<string, number> = {};
  const tierTotal: Record<string, number> = {};
  const tierHit: Record<string, number> = {};

  for (const example of examples) {
    const decision = await router.route(example.input);
    const predictedCapability = decision.target;
    const predictedTier = decision.tier;
    const capabilityCorrect = predictedCapability === example.capability;
    const tierCorrect = predictedTier === example.tier;
    results.push({
      expectedCapability: example.capability,
      predictedCapability,
      expectedTier: example.tier,
      predictedTier,
      capabilityCorrect,
      tierCorrect,
    });

    let row = capabilityConfusion[example.capability];
    if (!row) {
      row = {};
      capabilityConfusion[example.capability] = row;
    }
    row[predictedCapability] = (row[predictedCapability] ?? 0) + 1;

    capTotal[example.capability] = (capTotal[example.capability] ?? 0) + 1;
    if (capabilityCorrect) {
      capHit[example.capability] = (capHit[example.capability] ?? 0) + 1;
    }
    tierTotal[example.tier] = (tierTotal[example.tier] ?? 0) + 1;
    if (tierCorrect) tierHit[example.tier] = (tierHit[example.tier] ?? 0) + 1;
  }

  const n = examples.length;
  const frac = (count: number) => (n === 0 ? 0 : count / n);

  return {
    total: n,
    capabilityAccuracy: frac(results.filter((r) => r.capabilityCorrect).length),
    tierAccuracy: frac(results.filter((r) => r.tierCorrect).length),
    bothAccuracy: frac(
      results.filter((r) => r.capabilityCorrect && r.tierCorrect).length,
    ),
    capabilityRecall: recallFrom(capTotal, capHit),
    tierRecall: recallFrom(tierTotal, tierHit),
    capabilityConfusion,
    results,
  };
}
