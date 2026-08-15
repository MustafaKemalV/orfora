import type { RouteResult, RouterConfig } from "./types";

/**
 * Creates a router bound to a config, exposing `route(prompt)`.
 *
 * INCREMENT 2 — skeleton only. `route()` currently fails open to the strong tier
 * on every call. The real decision pipeline (embed -> cosine vs nearest seeds ->
 * deterministic signals -> threshold) lands in later commits. Failing open is
 * the correct placeholder, not a stub-to-be-forgotten: orfora's core promise is
 * to never trade away quality, so "unsure" always resolves to the strong model.
 */
export function createRouter(config: RouterConfig) {
  // Validate eagerly: a misconfigured router should fail at creation, not at the
  // first request in production.
  if (!config.tiers?.simple || !config.tiers?.complex) {
    throw new Error(
      "orfora: config.tiers must map both 'simple' and 'complex' to a model.",
    );
  }
  if (!config.embed) {
    throw new Error("orfora: config.embed (an EmbeddingProvider) is required.");
  }

  async function route(_prompt: string): Promise<RouteResult> {
    return { tier: "complex", model: config.tiers.complex };
  }

  return { route };
}
