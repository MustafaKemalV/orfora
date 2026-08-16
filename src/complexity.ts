import { createRouter } from "./router";
import { defaultSeeds } from "./seeds";
import type { EmbeddingProvider, RouteHandler, SignalConfig } from "./types";

export interface ComplexityRouterConfig<TOutput = unknown> {
  /** Model for simple requests (the cheap one). */
  simple: string;
  /** Model for complex requests (the strong one). Also the fail-open fallback. */
  complex: string;
  /** Backend that turns text into vectors. */
  embed: EmbeddingProvider;
  /** Override the built-in seeds with your own labelled examples. */
  seeds?: { simple: string[]; complex: string[] };
  /** Minimum confidence to trust a "simple" decision; below it, fall open to complex. */
  threshold?: number;
  /** Optional deterministic signals (length, multi-intent, attachments). */
  signals?: SignalConfig;
  /** Optional handlers to call the chosen model via `run()` (see createRouter). */
  handlers?: Record<string, RouteHandler<TOutput>>;
}

/**
 * The friendly front door for the headline use case: two-tier cost routing with
 * built-in seeds. A thin wrapper over {@link createRouter}, same engine, no
 * separate logic, so the primitive stays the single source of truth.
 *
 * ```ts
 * const router = complexityRouter({
 *   simple: "gpt-4o-mini",
 *   complex: "gpt-4o",
 *   embed,
 * });
 * ```
 */
export function complexityRouter<TOutput = unknown>(
  config: ComplexityRouterConfig<TOutput>,
) {
  const seeds = config.seeds ?? defaultSeeds;
  return createRouter<TOutput>({
    routes: {
      simple: { model: config.simple, seeds: seeds.simple },
      complex: { model: config.complex, seeds: seeds.complex },
    },
    fallback: "complex",
    embed: config.embed,
    threshold: config.threshold,
    signals: config.signals,
    handlers: config.handlers,
  });
}
