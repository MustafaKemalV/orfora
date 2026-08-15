/**
 * Core types for orfora's routing API.
 *
 * A router is a set of named **routes**. Each route has a target model and a few
 * seed examples that characterise the kind of request it should catch. orfora
 * embeds the seeds once, then routes each request to the route whose seeds it is
 * most similar to. This single shape covers cost routing (routes = simple /
 * complex), capability routing (coding / writing / qa -> different models), and
 * anything else — same engine, different routes.
 */

/** Turns text into vectors. Batched so seeds and requests can be embedded together. */
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

/** A named destination: the model to use, and the seeds that select it. */
export interface Route {
  /** The model to use when this route is chosen. */
  model: string;
  /** Example prompts that characterise this route. Embedded once, on first use. */
  seeds: string[];
}

export interface RouterConfig {
  /** Named routes, e.g. `{ simple: {...}, complex: {...} }`. */
  routes: Record<string, Route>;
  /**
   * Route to use when the decision is unclear or errors — orfora's fail-open
   * guarantee. Must be one of the keys in `routes` (typically the strong model).
   */
  fallback: string;
  /** Backend that turns text into vectors. Bring your own, or use an adapter. */
  embed: EmbeddingProvider;
  /**
   * Minimum cosine similarity to the nearest seed required to trust a decision.
   * Below it, orfora returns the fallback route. Defaults to 0 (trust the nearest
   * non-negative match); raise it to route more conservatively.
   */
  threshold?: number;
}

/** The outcome of a routing decision. */
export interface RouteResult {
  /** The chosen route name. */
  route: string;
  /** The model mapped from the chosen route. */
  model: string;
  /** Cosine similarity to the nearest seed of the chosen route. */
  score: number;
  /** True when orfora fell back (low confidence, no seeds, or an error). */
  fallback: boolean;
}
