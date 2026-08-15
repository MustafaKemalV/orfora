/**
 * orfora — Optimal Routes For All.
 *
 * A semantic router for LLM apps: route each request to the right-sized model —
 * a cheap model for trivial requests, a strong model for the ones that actually
 * need reasoning — decided by meaning (embeddings + math), not by message length.
 *
 * This is the public API surface. The router implementation lands incrementally,
 * commit by commit.
 */

export const VERSION = "0.0.0";

export { createRouter } from "./router";
export type {
  EmbeddingProvider,
  Route,
  RouteResult,
  RouterConfig,
  SignalConfig,
} from "./types";
