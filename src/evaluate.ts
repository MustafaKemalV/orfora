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
