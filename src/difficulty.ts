/**
 * An LLM-free difficulty scorer: how strong a model does this request warrant?
 *
 * It combines cheap, deterministic text signals with one embedding-derived signal
 * (distance to the nearest capability seed, passed in by the router) into a single
 * scalar in [0,1], plus an epistemic/aleatoric split:
 *   - EPISTEMIC (distance to seed) = "we do not recognise this" -> escalating to a
 *     stronger model may resolve it.
 *   - ALEATORIC (open-endedness) = "there is no single right answer" -> a stronger
 *     model will not help, so do not pay to escalate.
 *
 * Weights are hand-tuned to ship (grouped by evidence strength) and are meant to be
 * recalibrated later from observed cheap-model outcomes, not treated as ground
 * truth. No large-model call is ever made, so routing stays fast and cheap.
 */

import type { Tier } from "./catalog";

export interface DifficultyWeights {
  epistemic: number;
  length: number;
  multiIntent: number;
  numeric: number;
  codeBlock: number;
  language: number;
  verb: number;
  readability: number;
}

/** Upper cut-points that map the difficulty scalar to a tier. */
export interface DifficultyBands {
  cheap: number;
  mid: number;
  premium: number;
}

export interface DifficultyOptions {
  /** 1 - cosine to the nearest seed, in [0,1]; the epistemic (OOD) signal. */
  seedDistance?: number;
  /** Override the hand-tuned weights. */
  weights?: Partial<DifficultyWeights>;
  /** Override the tier cut-points. */
  bands?: Partial<DifficultyBands>;
}

export interface DifficultyResult {
  /** Combined difficulty in [0,1]. */
  difficulty: number;
  /** The tier the difficulty maps to. */
  tier: Tier;
  /** Epistemic component (unfamiliarity): high argues for escalation. */
  epistemic: number;
  /** Aleatoric component (open-endedness): high argues against escalation. */
  aleatoric: number;
  /** Each factor's raw value in [0,1] (verb can be negative), for transparency. */
  factors: Record<string, number>;
}

const DEFAULT_WEIGHTS: DifficultyWeights = {
  epistemic: 2.5, // strong: distance-to-seed (OOD / epistemic uncertainty)
  length: 1.5, // strong: bucketed prompt length
  multiIntent: 1.0, // moderate: sub-question / hop count
  numeric: 0.8, // moderate: numeric / symbolic density
  codeBlock: 0.8, // moderate: code presence
  language: 0.8, // moderate: non-English / low-resource
  verb: 0.5, // weak tie-breaker: task-marker verbs
  readability: 0.3, // weak tie-breaker: Flesch-Kincaid grade
};

const DEFAULT_BANDS: DifficultyBands = { cheap: 0.35, mid: 0.6, premium: 0.85 };

const BIAS = 2.2;

const HIGH_LOAD =
  /\b(prove|derive|design|architect|analys|analyz|optimi|refactor|critique|evaluate|implement|debug|diagnose|model|formulate|reason|justify)\w*/i;
const LOW_LOAD =
  /\b(list|define|name|translate|summari[sz]e|format|convert|spell|rename|capitali[sz]e|round)\w*/i;
const OPEN_ENDED =
  /\b(design|brainstorm|imagine|invent|opinion|suggest|write a (?:story|poem|song)|come up with|creative)\w*/i;

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function lengthFactor(len: number): number {
  if (len < 120) return 0.1;
  if (len < 400) return 0.3;
  if (len < 1200) return 0.5;
  if (len < 4000) return 0.7;
  return 0.9;
}

function multiIntentFactor(p: string): number {
  const questions = (p.match(/\?/g) ?? []).length;
  const listItems = (p.match(/(^|\n)\s*(\d+[.)]|[-*])\s+/g) ?? []).length;
  const hops = Math.max(questions - 1, 0) + listItems;
  return clamp01(hops / 4);
}

function numericFactor(p: string): number {
  const digits = (p.match(/[0-9]/g) ?? []).length;
  const ops = (
    p.match(/[+\-*/=^%<>]|\b(?:integral|sqrt|derivative|sum)\b/gi) ?? []
  ).length;
  return clamp01((digits + ops * 3) / Math.max(p.length, 20));
}

function codeBlockFactor(p: string): number {
  // Strong code markers only, to avoid firing on prose like "let me" or "return".
  return /```|=>|\bfunction\b|\bdef \b|\bclass \b|\bimport \b|console\.|\);|\}\s*;/.test(
    p,
  )
    ? 1
    : 0;
}

function verbFactor(p: string): number {
  if (HIGH_LOAD.test(p)) return 1;
  if (LOW_LOAD.test(p)) return -0.5;
  return 0;
}

function readabilityFactor(p: string): number {
  const words = p.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const sentences = Math.max((p.match(/[.!?]+/g) ?? []).length, 1);
  const syllables = words.reduce(
    (n, w) =>
      n + Math.max((w.toLowerCase().match(/[aeiouy]+/g) ?? []).length, 1),
    0,
  );
  const grade =
    0.39 * (words.length / sentences) +
    11.8 * (syllables / words.length) -
    15.59;
  return clamp01(grade / 18);
}

function languageFactor(p: string): number {
  if (p.length === 0) return 0;
  let nonAscii = 0;
  for (let i = 0; i < p.length; i++) {
    if (p.charCodeAt(i) > 127) nonAscii++;
  }
  return nonAscii / p.length > 0.2 ? 0.6 : 0;
}

function toTier(difficulty: number, bands: DifficultyBands): Tier {
  if (difficulty < bands.cheap) return "cheap";
  if (difficulty < bands.mid) return "mid";
  if (difficulty < bands.premium) return "premium";
  return "ultra";
}

/** Scores how hard a prompt is, LLM-free, from text signals plus a seed-distance. */
export function scoreDifficulty(
  prompt: string,
  options: DifficultyOptions = {},
): DifficultyResult {
  const w = { ...DEFAULT_WEIGHTS, ...options.weights };
  const bands = { ...DEFAULT_BANDS, ...options.bands };

  const epistemic = clamp01(options.seedDistance ?? 0);
  const aleatoric = OPEN_ENDED.test(prompt) ? 0.6 : 0.25;

  const factors = {
    epistemic,
    length: lengthFactor(prompt.length),
    multiIntent: multiIntentFactor(prompt),
    numeric: numericFactor(prompt),
    codeBlock: codeBlockFactor(prompt),
    language: languageFactor(prompt),
    verb: verbFactor(prompt),
    readability: readabilityFactor(prompt),
  };

  const activation =
    w.epistemic * factors.epistemic +
    w.length * factors.length +
    w.multiIntent * factors.multiIntent +
    w.numeric * factors.numeric +
    w.codeBlock * factors.codeBlock +
    w.language * factors.language +
    w.verb * factors.verb +
    w.readability * factors.readability -
    BIAS;

  const difficulty = clamp01(sigmoid(activation));

  return {
    difficulty,
    tier: toTier(difficulty, bands),
    epistemic,
    aleatoric,
    factors,
  };
}
