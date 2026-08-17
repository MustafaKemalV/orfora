/**
 * orfora: Optimal Routes For All.
 *
 * A semantic router for LLM apps: route each request to the right-sized model,
 * a cheap model for trivial requests, a strong model for the ones that actually
 * need reasoning, decided by meaning (embeddings + math), not by message length.
 */

export const VERSION = "0.0.0";

export type { Capability, CatalogModel, PriceTier, Tier } from "./catalog";
export {
  capabilities,
  capabilityGrid,
  catalog,
  findModel,
  longContextTiers,
  multilingualTiers,
  visionTiers,
} from "./catalog";
export type {
  CatalogDecision,
  CatalogHandler,
  CatalogRouterConfig,
  RouteTarget,
} from "./catalogRouter";
export { createCatalogRouter } from "./catalogRouter";
export { capabilitySeeds, tierSeeds } from "./catalogSeeds";
export type { ComplexityRouterConfig } from "./complexity";
export { complexityRouter } from "./complexity";
export type {
  CatalogEvalReport,
  CatalogLabeledExample,
  CatalogRoutable,
  EvalReport,
  LabeledExample,
  Routable,
} from "./evaluate";
export { evaluate, evaluateCatalog } from "./evaluate";
export type { Modality } from "./modality";
export { normalizeModality } from "./modality";
export { createRouter } from "./router";
export { defaultSeeds } from "./seeds";
export type {
  EmbeddingProvider,
  Route,
  RouteHandler,
  RouteInput,
  RouteResult,
  RouterConfig,
  SignalConfig,
} from "./types";
