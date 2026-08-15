/**
 * Core types for orfora's routing API.
 *
 * v1 is deliberately two-tier — a cheap "simple" model and a strong "complex"
 * model — because that covers the dominant cost/quality trade-off with the
 * least surface area. Multi-tier is a later extension, not a v1 concern.
 */

/** The routing tiers. "simple" = cheap model, "complex" = strong model. */
export type Tier = "simple" | "complex";

/**
 * Turns text into vectors. Batched on purpose: seeds are embedded once at setup
 * and each request is embedded per call, so a caller can hand us many strings at
 * once and let the backend batch them. Pluggable by design — orfora never hard-
 * wires a specific embedding vendor.
 */
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

/** A labeled example that anchors what "simple" vs "complex" means for an app. */
export interface Seed {
  text: string;
  tier: Tier;
}

/** The outcome of a routing decision. */
export interface RouteResult {
  tier: Tier;
  /** The concrete model, mapped from the chosen tier via `config.tiers`. */
  model: string;
}

export interface RouterConfig {
  /** Maps each tier to the concrete model name the caller wants to use. */
  tiers: Record<Tier, string>;
  /** Backend that turns text into vectors. */
  embed: EmbeddingProvider;
  /**
   * Labeled examples that define "simple" vs "complex" for THIS app. Optional:
   * when omitted, orfora falls back to built-in generic seeds (added later).
   */
  seeds?: Seed[];
  /**
   * Minimum similarity confidence required to downgrade to "simple". Below it,
   * orfora fails open to "complex" so quality is never sacrificed. Sensible
   * defaults are calibrated in a later commit.
   */
  threshold?: number;
}
