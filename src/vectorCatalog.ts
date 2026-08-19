import type { CapabilityScore, ModelClass, ModelVector } from "./modelVector";

/**
 * The default routing catalog, built from LIVE-SOURCED benchmarks (August 2026),
 * not from training memory. Each entry carries the RAW canonical benchmark value
 * chosen per orfora axis, plus its gates and split token prices; {@link buildCatalog}
 * turns those into the [0,1] `scores` a ModelVector needs.
 *
 * Mapping (canonical benchmark -> axis, primary -> fallback), normalised:
 *   code_agentic          Terminal-Bench 2.1 -> SWE-bench Pro      (percent / 100)
 *   code_snippet          LiveCodeBench      -> SWE-bench Verified (percent / 100)
 *   math_reasoning        GPQA Diamond       -> AIME               (percent / 100)
 *   general_knowledge     AA Intelligence Idx -> HLE               (index: min-max; HLE: /100)
 *   tool_use              OSWorld-Verified   -> tau-bench / BFCL    (percent / 100)
 *   instruction_following IFBench                                  (percent / 100)
 *   human_preference_elo  LMArena text Elo                         (Elo: min-max)
 *   creative_writing      no comparable public benchmark           -> left absent
 *
 * Because vendors report DIFFERENT suites (SWE-bench Verified vs Pro; Terminal-Bench
 * 2.0/2.1/3.0; OSWorld vs OSWorld-Verified) and some numbers are self-reported or
 * third-party, a score is a RELATIVE fitness proxy, not an absolute truth. An axis
 * with no comparable source is left absent, and fitness() fills it with a neutral
 * prior rather than a fabricated number. profileFrom names the real basis + source.
 * If a current model has no number of its own, carry one forward from the family's
 * latest measured version (recording it in profileFrom) before leaving an axis absent.
 */

interface Raw {
  id: string;
  family: string;
  priceIn: number;
  priceOut: number;
  context: number;
  image?: boolean;
  video?: boolean;
  audio?: boolean;
  tools?: boolean;
  web?: boolean;
  // Canonical raw metrics, percent 0-100 unless noted; absent = not sourced.
  termbench?: number; // Terminal-Bench 2.1
  swePro?: number; // SWE-bench Pro
  livecode?: number; // LiveCodeBench (or HumanEval, code_snippet class)
  sweVerified?: number; // SWE-bench Verified
  gpqa?: number; // GPQA Diamond
  aime?: number; // AIME
  aaIndex?: number; // Artificial Analysis Intelligence Index (raw ~9-63)
  hle?: number; // Humanity's Last Exam
  osworld?: number; // OSWorld-Verified / OSWorld 2.0
  tau?: number; // tau-bench / BFCL / Toolathlon (tool use)
  ifbench?: number; // IFBench
  elo?: number; // LMArena text Arena Elo
  from: string;
}

// Every number below is transcribed from the 2026 research (artificialanalysis.ai,
// official model cards, vendor/3rd-party reviews). See the memory research note.
const RAW: Raw[] = [
  // Anthropic. Anthropic does not publish SWE-bench Verified or GPQA as text, so
  // those axes are intentionally left absent rather than filled from noisy leaks.
  {
    id: "anthropic/claude-fable-5",
    family: "Claude",
    priceIn: 10,
    priceOut: 50,
    context: 1_000_000,
    image: true,
    tools: true,
    web: true,
    termbench: 88.0,
    swePro: 80.3,
    aaIndex: 62,
    hle: 59.0,
    osworld: 85.0,
    from: "Terminal-Bench 2.1 88.0 / SWE-Pro 80.3 / OSWorld 85.0 / AA Index 62 (artificialanalysis.ai, anthropic)",
  },
  {
    id: "anthropic/claude-opus-5",
    family: "Claude",
    priceIn: 5,
    priceOut: 25,
    context: 1_000_000,
    image: true,
    tools: true,
    web: true,
    termbench: 89.1,
    swePro: 79.2,
    aaIndex: 63,
    hle: 54.9,
    osworld: 70.6,
    from: "Terminal-Bench 2.1 89.1 / SWE-Pro 79.2 / OSWorld2 70.6 / AA Index 63 (artificialanalysis.ai, anthropic)",
  },
  {
    id: "anthropic/claude-sonnet-5",
    family: "Claude",
    priceIn: 2,
    priceOut: 10,
    context: 1_000_000,
    image: true,
    tools: true,
    web: true,
    termbench: 80.4,
    swePro: 63.2,
    aaIndex: 55,
    hle: 43.2,
    osworld: 81.2,
    from: "Terminal-Bench 2.1 80.4 / SWE-Pro 63.2 / OSWorld-V 81.2 / AA Index 55 (datacamp, anthropic)",
  },
  {
    id: "anthropic/claude-haiku-4-5",
    family: "Claude",
    priceIn: 1,
    priceOut: 5,
    context: 200_000,
    image: true,
    tools: true,
    web: true,
    termbench: 41.75,
    sweVerified: 73.3,
    from: "SWE-bench Verified 73.3 / Terminal-Bench 41.75 (anthropic-reported)",
  },

  // OpenAI.
  {
    id: "openai/gpt-5.6-sol",
    family: "GPT",
    priceIn: 5,
    priceOut: 30,
    context: 1_050_000,
    image: true,
    tools: true,
    web: true,
    termbench: 88.8,
    swePro: 64.6,
    gpqa: 94.6,
    aaIndex: 58.9,
    osworld: 62.6,
    from: "Terminal-Bench 2.1 88.8 / SWE-Pro 64.6 / GPQA 94.6 / AA Index 58.9 (artificialanalysis.ai, openai)",
  },
  {
    id: "openai/gpt-5.6-terra",
    family: "GPT",
    priceIn: 2,
    priceOut: 12,
    context: 1_050_000,
    image: true,
    tools: true,
    web: true,
    termbench: 87.4,
    swePro: 63.4,
    gpqa: 92.9,
    aaIndex: 55.0,
    elo: 1477,
    from: "Terminal-Bench 2.1 87.4 / GPQA 92.9 / AA Index 55 / LMArena ~1477 (artificialanalysis.ai, openai)",
  },
  {
    id: "openai/gpt-5.6-luna",
    family: "GPT",
    priceIn: 0.2,
    priceOut: 1.2,
    context: 1_050_000,
    image: true,
    tools: true,
    web: true,
    termbench: 84.7,
    swePro: 62.7,
    gpqa: 92.3,
    aaIndex: 51.2,
    from: "Terminal-Bench 2.1 84.7 / GPQA 92.3 / AA Index 51.2 (artificialanalysis.ai, openai)",
  },
  {
    id: "openai/gpt-5.5-pro",
    family: "GPT",
    priceIn: 30,
    priceOut: 180,
    context: 272_000,
    image: true,
    tools: true,
    web: true,
    elo: 1510,
    from: "LMArena Text Arena Elo 1510, rank ~#11 (swfte.com); per-benchmark figures not isolated",
  },

  // Google Gemini.
  {
    id: "google/gemini-3.1-pro-preview",
    family: "Gemini",
    priceIn: 2,
    priceOut: 12,
    context: 1_048_576,
    image: true,
    tools: true,
    web: true,
    swePro: 54.2,
    sweVerified: 80.6,
    gpqa: 94.3,
    aime: 91.2,
    aaIndex: 48,
    elo: 1486,
    from: "SWE-Verified 80.6 / GPQA 94.3 / AA Index 48 / LMArena 1486 (official card + artificialanalysis.ai)",
  },
  {
    id: "google/gemini-3.7-flash",
    family: "Gemini",
    priceIn: 0.75,
    priceOut: 3.75,
    context: 1_048_576,
    image: true,
    video: true,
    tools: true,
    web: true,
    termbench: 85.8,
    aaIndex: 56,
    hle: 53.6,
    osworld: 47.9,
    from: "Terminal-Bench 2.1 85.8 / HLE-V 53.6 / AA Index 56 (official card, google)",
  },
  {
    id: "google/gemini-3.6-flash",
    family: "Gemini",
    priceIn: 0.75,
    priceOut: 3.75,
    context: 1_048_576,
    image: true,
    tools: true,
    web: true,
    termbench: 78.0,
    swePro: 58.7,
    osworld: 83.0,
    elo: 1484,
    from: "Terminal-Bench 2.1 78.0 / SWE-Pro 58.7 / OSWorld-V 83.0 / LMArena 1484 (google)",
  },
  {
    id: "google/gemini-3.5-flash",
    family: "Gemini",
    priceIn: 1.5,
    priceOut: 9,
    context: 1_048_576,
    image: true,
    tools: true,
    web: true,
    termbench: 76.2,
    swePro: 55.1,
    gpqa: 74,
    hle: 40.2,
    elo: 1477,
    from: "Terminal-Bench 2.1 76.2 / GPQA 74 (secondary) / HLE 40.2 / LMArena 1477 (google + llm-stats)",
  },
  {
    id: "google/gemini-3.5-flash-lite",
    family: "Gemini",
    priceIn: 0.3,
    priceOut: 2.5,
    context: 1_048_576,
    image: true,
    tools: true,
    web: true,
    termbench: 54.0,
    swePro: 54.2,
    aaIndex: 37,
    osworld: 74.0,
    from: "Terminal-Bench 2.1 54.0 / OSWorld-V 74.0 / AA Index 37 (google)",
  },
  {
    id: "google/gemini-3.1-flash-lite",
    family: "Gemini",
    priceIn: 0.25,
    priceOut: 1.5,
    context: 1_048_576,
    image: true,
    tools: true,
    web: true,
    livecode: 72.0,
    gpqa: 86.9,
    from: "GPQA 86.9 / LiveCodeBench 72.0 / MMMLU 88.9 (google)",
  },

  // DeepSeek (text-only, no native web search in the sources reviewed).
  {
    id: "deepseek/deepseek-v4-pro",
    family: "DeepSeek",
    priceIn: 0.66,
    priceOut: 1.98,
    context: 1_000_000,
    tools: true,
    termbench: 87.9,
    livecode: 93.5,
    sweVerified: 80.6,
    gpqa: 90.1,
    hle: 37.7,
    tau: 74.1,
    from: "Terminal-Bench 2.1 87.9 / LiveCodeBench 93.5 / GPQA 90.1 (Max mode, self-reported; deepseek)",
  },
  {
    id: "deepseek/deepseek-v4-flash",
    family: "DeepSeek",
    priceIn: 0.22,
    priceOut: 0.66,
    context: 1_000_000,
    tools: true,
    termbench: 82.7,
    livecode: 91.6,
    sweVerified: 79.0,
    gpqa: 88.1,
    hle: 34.8,
    tau: 70.3,
    from: "Terminal-Bench 2.1 82.7 / LiveCodeBench 91.6 / GPQA 88.1 (Max mode; deepseek)",
  },

  // Alibaba Qwen.
  {
    id: "alibaba/qwen3.8-max",
    family: "Qwen",
    priceIn: 2,
    priceOut: 6,
    context: 991_808,
    image: true,
    video: true,
    tools: true,
    web: true,
    termbench: 86.6,
    swePro: 67.7,
    gpqa: 92.6,
    hle: 43.6,
    osworld: 86.1,
    ifbench: 82.8,
    from: "Terminal-Bench 2.1 86.6 / GPQA 92.6 / OSWorld-V 86.1 / IFBench 82.8 (benchlm, alibaba)",
  },
  {
    id: "alibaba/qwen3.7-max",
    family: "Qwen",
    priceIn: 2.5,
    priceOut: 7.5,
    context: 1_000_000,
    tools: true,
    swePro: 60.6,
    livecode: 91.6,
    sweVerified: 80.4,
    gpqa: 92.4,
    aaIndex: 47,
    elo: 1475,
    from: "SWE-Verified 80.4 / LiveCodeBench 91.6 / GPQA 92.4 / AA Index 47 / LMArena ~1475 (3rd-party)",
  },
  {
    id: "alibaba/qwen3.7-plus",
    family: "Qwen",
    priceIn: 0.4,
    priceOut: 1.6,
    context: 1_000_000,
    image: true,
    tools: true,
    gpqa: 90.0,
    aaIndex: 39,
    elo: 1463,
    from: "GPQA 90.0 / AA Index 39 / LMArena 1463 (artificialanalysis.ai, alibaba)",
  },
  {
    id: "alibaba/qwen3.8-27b",
    family: "Qwen",
    priceIn: 0.45,
    priceOut: 3.2,
    context: 262_144,
    image: true,
    tools: true,
    termbench: 73.0,
    livecode: 90.3,
    swePro: 61.7,
    gpqa: 89.2,
    hle: 30.8,
    osworld: 84.3,
    from: "Terminal-Bench 2.1 73.0 / LiveCodeBench 90.3 / GPQA 89.2 / OSWorld-V 84.3 (kingy.ai, alibaba)",
  },

  // Meta.
  {
    id: "meta/muse-spark-1.2",
    family: "Muse",
    priceIn: 1.25,
    priceOut: 4.25,
    context: 1_048_576,
    image: true,
    tools: true,
    web: true,
    termbench: 82.9,
    aaIndex: 57,
    hle: 44,
    tau: 27,
    from: "Terminal-Bench 2.1 82.9 (Meta) / HLE 44 / AA Index 57 (artificialanalysis.ai, meta)",
  },
  {
    id: "meta/muse-spark-1.1",
    family: "Muse",
    priceIn: 1.25,
    priceOut: 4.25,
    context: 1_048_576,
    image: true,
    tools: true,
    web: true,
    termbench: 80.0,
    swePro: 61.5,
    sweVerified: 82.0,
    gpqa: 89.8,
    hle: 45.1,
    aaIndex: 51,
    osworld: 80.8,
    from: "SWE-Verified 82.0 (agiranker, approx) / GPQA 89.8 / OSWorld-V 80.8 / AA Index 51 (meta)",
  },
  {
    id: "meta/llama-4-maverick",
    family: "Llama",
    priceIn: 0.27,
    priceOut: 0.85,
    context: 1_048_576,
    image: true,
    tools: true,
    livecode: 43.4,
    gpqa: 69.8,
    elo: 1288,
    from: "GPQA 69.8 / LiveCodeBench 43.4 / LMArena 1288 (#139 production; apidog, meta)",
  },
  {
    id: "meta/llama-4-scout",
    family: "Llama",
    priceIn: 0.18,
    priceOut: 0.59,
    context: 10_000_000,
    image: true,
    tools: true,
    livecode: 72.1,
    elo: 1281,
    from: "HumanEval 72.1 / MATH 74.3 / LMArena 1281 (#146 production; explainx, meta)",
  },

  // Mistral. Most Mistral figures are contested/estimated; only the AA-measured
  // index and aggregator Elo are kept, plus vendor SWE where explicitly reported.
  {
    id: "mistralai/mistral-large-3",
    family: "Mistral",
    priceIn: 0.5,
    priceOut: 1.5,
    context: 256_000,
    image: true,
    tools: true,
    aaIndex: 16,
    elo: 1430,
    from: "AA Index 16 / LMArena 1430 (metatext); GPQA/AIME contested, omitted (mistral)",
  },
  {
    id: "mistralai/mistral-medium-3-5",
    family: "Mistral",
    priceIn: 1.5,
    priceOut: 7.5,
    context: 256_000,
    image: true,
    tools: true,
    sweVerified: 77.6,
    aaIndex: 30,
    tau: 91.4,
    elo: 1420,
    from: "SWE-Verified 77.6 (vendor) / tau3-Telecom 91.4 / AA Index 30 / LMArena 1420 (mistral)",
  },
  {
    id: "mistralai/mistral-small-4",
    family: "Mistral",
    priceIn: 0.15,
    priceOut: 0.6,
    context: 256_000,
    image: true,
    tools: true,
    aaIndex: 20,
    from: "AA Index 20 (artificialanalysis.ai); no numeric coding/math published (mistral)",
  },
  {
    id: "mistralai/ministral-3-14b",
    family: "Mistral",
    priceIn: 0.2,
    priceOut: 0.2,
    context: 256_000,
    image: true,
    tools: true,
    aime: 85,
    from: "AIME 2025 85 (vendor, reasoning variant); other benches not published (mistral)",
  },
  {
    id: "mistralai/ministral-3-8b",
    family: "Mistral",
    priceIn: 0.15,
    priceOut: 0.15,
    context: 256_000,
    image: true,
    tools: true,
    from: "no published benchmarks; routes by price and gates (mistral)",
  },
  {
    id: "mistralai/ministral-3-3b",
    family: "Mistral",
    priceIn: 0.1,
    priceOut: 0.1,
    context: 256_000,
    image: true,
    tools: true,
    from: "no published benchmarks; routes by price and gates (mistral)",
  },

  // Perplexity Sonar: live web-search specialists.
  {
    id: "perplexity/sonar",
    family: "Sonar",
    priceIn: 1,
    priceOut: 1,
    context: 127_072,
    image: true,
    tools: false,
    web: true,
    livecode: 29.5,
    gpqa: 47.1,
    aaIndex: 9,
    from: "SimpleQA 0.773 / GPQA 0.471 / AA Index 9 (3rd-party; perplexity)",
  },
  {
    id: "perplexity/sonar-reasoning",
    family: "Sonar",
    priceIn: 1,
    priceOut: 5,
    context: 127_000,
    tools: false,
    web: true,
    from: "no published capability benchmarks; live-search specialist (perplexity)",
  },
  {
    id: "perplexity/sonar-pro",
    family: "Sonar",
    priceIn: 3,
    priceOut: 15,
    context: 200_000,
    image: true,
    tools: false,
    web: true,
    aaIndex: 9,
    from: "SimpleQA 0.858 / AA Index 9 (perplexity)",
  },
  {
    id: "perplexity/sonar-reasoning-pro",
    family: "Sonar",
    priceIn: 2,
    priceOut: 8,
    context: 128_000,
    image: true,
    tools: false,
    web: true,
    aaIndex: 18,
    from: "Search Arena 1136 (tied #1) / AA Index 18 (perplexity)",
  },
  {
    id: "perplexity/sonar-deep-research",
    family: "Sonar",
    priceIn: 2,
    priceOut: 8,
    context: 128_000,
    tools: false,
    web: true,
    hle: 21.1,
    from: "HLE 21.1 / SimpleQA 93.9 (perplexity)",
  },

  // xAI Grok. Grok's coding figures use xAI-proprietary suites (DeepSWE, CursorBench,
  // APEX) not comparable to Terminal-Bench/SWE-Pro, so code axes are only filled
  // where a comparable bench exists; AA Index anchors general capability.
  {
    id: "xai/grok-4.6",
    family: "Grok",
    priceIn: 2,
    priceOut: 6,
    context: 500_000,
    image: true,
    tools: true,
    web: true,
    aaIndex: 61,
    from: "AA Index 61 (artificialanalysis.ai); coding on xAI-only suites, not mapped (xai)",
  },
  {
    id: "xai/grok-4.5",
    family: "Grok",
    priceIn: 2,
    priceOut: 6,
    context: 500_000,
    image: true,
    tools: true,
    web: true,
    termbench: 83.3,
    swePro: 64.7,
    aaIndex: 56,
    from: "Terminal-Bench 2.1 83.3 / SWE-Pro 64.7 / AA Index 56 (xAI-reported)",
  },
  {
    id: "xai/grok-4.3",
    family: "Grok",
    priceIn: 1.25,
    priceOut: 2.5,
    context: 1_000_000,
    image: true,
    tools: true,
    web: true,
    aaIndex: 53,
    tau: 98,
    ifbench: 81,
    from: "AA Index 53 / tau2-Telecom 98 / IFBench 81 (xAI-reported)",
  },
  {
    id: "xai/grok-4.20-0309-reasoning",
    family: "Grok",
    priceIn: 1.25,
    priceOut: 2.5,
    context: 1_000_000,
    image: true,
    tools: true,
    web: true,
    from: "no published benchmarks; routes by price and gates (xai)",
  },
  {
    id: "xai/grok-build-0.1",
    family: "Grok",
    priceIn: 1,
    priceOut: 2,
    context: 256_000,
    image: true,
    tools: true,
    web: true,
    from: "no published benchmarks; routes by price and gates (xai)",
  },
  {
    id: "xai/grok-4.1-fast",
    family: "Grok",
    priceIn: 0.2,
    priceOut: 0.5,
    context: 2_000_000,
    tools: true,
    web: true,
    tau: 100,
    from: "tau2-Telecom 100 / Berkeley FC v4 72 / FRAMES 87.6 (xAI-reported; tool specialist)",
  },
];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pct = (v?: number): number | undefined =>
  typeof v === "number" ? clamp01(v / 100) : undefined;

// Global min-max ranges for the two non-percentage benchmarks, computed across the
// catalog so an index/Elo becomes a relative [0,1] fitness.
const present = (pick: (r: Raw) => number | undefined): number[] =>
  RAW.map(pick).filter((x): x is number => typeof x === "number");
const idxVals = present((r) => r.aaIndex);
const eloVals = present((r) => r.elo);
const idxMin = Math.min(...idxVals);
const idxMax = Math.max(...idxVals);
const eloMin = Math.min(...eloVals);
const eloMax = Math.max(...eloVals);
const norm = (
  v: number | undefined,
  lo: number,
  hi: number,
): number | undefined =>
  typeof v === "number" && hi > lo ? clamp01((v - lo) / (hi - lo)) : undefined;

function scoresOf(r: Raw): Partial<Record<CapabilityScore, number>> {
  const s: Partial<Record<CapabilityScore, number>> = {};
  const set = (k: CapabilityScore, v: number | undefined) => {
    if (typeof v === "number") s[k] = v;
  };
  set("code_agentic", pct(r.termbench) ?? pct(r.swePro));
  set("code_snippet", pct(r.livecode) ?? pct(r.sweVerified));
  set("math_reasoning", pct(r.gpqa) ?? pct(r.aime));
  set("general_knowledge", norm(r.aaIndex, idxMin, idxMax) ?? pct(r.hle));
  set("tool_use", pct(r.osworld) ?? pct(r.tau));
  set("instruction_following", pct(r.ifbench));
  set("human_preference_elo", norm(r.elo, eloMin, eloMax));
  return s;
}

function priceTier(out: number): ModelVector["priceTier"] {
  if (out <= 3) return "cheap";
  if (out <= 15) return "mid";
  return "premium";
}

function buildCatalog(rows: Raw[]): ModelVector[] {
  return rows.map((r) => ({
    id: r.id,
    family: r.family,
    modelClass: "chat" as ModelClass,
    priceTier: priceTier(r.priceOut),
    pricePerMTokens: r.priceOut,
    priceInput: r.priceIn,
    priceOutput: r.priceOut,
    context: r.context,
    imageIn: r.image ?? false,
    audioIn: r.audio ?? false,
    videoIn: r.video ?? false,
    toolsSupported: r.tools ?? true,
    hasWebSearch: r.web ?? false,
    scores: scoresOf(r),
    profileFrom: r.from,
  }));
}

/** The default catalog: 41 current (Aug 2026) chat models, scored from live data. */
export const defaultVectorCatalog: ModelVector[] = buildCatalog(RAW);
