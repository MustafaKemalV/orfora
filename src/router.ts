import { checkSignals } from "./signals";
import { cosineSimilarity } from "./similarity";
import type { RouteResult, RouterConfig } from "./types";

/**
 * Creates a router bound to a config, exposing `route(prompt)`.
 *
 * Order of decision:
 *   1. Deterministic signals (cheap, no embedding) — can escalate to `fallback`.
 *   2. Semantic match: embed seeds once, embed the request, pick the route whose
 *      nearest seed is most similar.
 * If confidence is below `threshold`, or anything throws, it fails open to
 * `fallback` — orfora never trades away quality on a bad guess.
 */
export function createRouter(config: RouterConfig) {
  const { routes, fallback, embed, threshold = 0, signals } = config;

  // Validate eagerly: a misconfigured router should fail at creation, not on the
  // first production request.
  const routeEntries = Object.entries(routes);
  if (routeEntries.length === 0) {
    throw new Error("orfora: config.routes must define at least one route.");
  }
  const fallbackRoute = routes[fallback];
  if (!fallbackRoute) {
    throw new Error(
      `orfora: config.fallback "${fallback}" is not one of the defined routes.`,
    );
  }
  if (typeof embed?.embed !== "function") {
    throw new Error("orfora: config.embed (an EmbeddingProvider) is required.");
  }

  type SeedVector = { route: string; vector: number[] };

  // Embed all seeds once, lazily, and share the work across concurrent first
  // calls by memoising the promise (not the value).
  let seedVectors: Promise<SeedVector[]> | null = null;
  function loadSeeds(): Promise<SeedVector[]> {
    if (!seedVectors) {
      seedVectors = (async () => {
        const flat: { route: string; text: string }[] = [];
        for (const [name, route] of routeEntries) {
          for (const text of route.seeds) flat.push({ route: name, text });
        }
        if (flat.length === 0) return [];

        const vectors = await embed.embed(flat.map((s) => s.text));
        const out: SeedVector[] = [];
        for (let i = 0; i < flat.length; i++) {
          const item = flat[i];
          const vector = vectors[i];
          if (item && vector) out.push({ route: item.route, vector });
        }
        return out;
      })();
    }
    return seedVectors;
  }

  const failOpen = (reason: string): RouteResult => ({
    route: fallback,
    model: fallbackRoute.model,
    score: 0,
    fallback: true,
    reason,
  });

  async function route(prompt: string): Promise<RouteResult> {
    // 1. Deterministic signals first: cheap, and they can short-circuit to the
    //    safe route without paying for an embedding at all.
    const signal = checkSignals(prompt, signals);
    if (signal.escalate) return failOpen(signal.reason ?? "signal");

    // 2. Semantic match.
    try {
      const seeds = await loadSeeds();
      if (seeds.length === 0) return failOpen("no-seeds");

      const embedded = await embed.embed([prompt]);
      const queryVector = embedded[0];
      if (!queryVector) return failOpen("no-embedding");

      let bestRoute = fallback;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const seed of seeds) {
        const score = cosineSimilarity(queryVector, seed.vector);
        if (score > bestScore) {
          bestScore = score;
          bestRoute = seed.route;
        }
      }

      if (bestScore < threshold) return failOpen("below-threshold");

      const chosen = routes[bestRoute];
      if (!chosen) return failOpen("no-route");

      return {
        route: bestRoute,
        model: chosen.model,
        score: bestScore,
        fallback: false,
      };
    } catch {
      // Fail open: a routing failure must never take down the caller.
      return failOpen("error");
    }
  }

  return { route };
}
