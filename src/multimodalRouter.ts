/**
 * The multimodal router: a thin SECOND BRANCH in front of the chat vector router.
 *
 *   prompt -> embed once -> detect output modality
 *     - text            -> delegate to the chat vector router (untouched)
 *     - image/video/... -> match the best-fit GENERATIVE model for that modality
 *
 * Output modality is orthogonal to the chat capability axis: it asks what the user
 * wants PRODUCED, not what task the text is. Detection reuses the existing capability
 * seeds as the "text" anchor and adds generative seeds; the nearest wins, biased to
 * text so a normal request is never mis-sent to an image generator. Within a modality
 * the same right-fit philosophy applies: a specialty match and a draft-vs-final need
 * decide the model, and cost is the consequence, not the goal.
 */

import { capabilitySeeds as defaultCapabilitySeeds } from "./catalogSeeds";
import {
  defaultGenerativeCatalog,
  defaultModalitySeeds,
  defaultQualitySeeds,
  type GenerativeModality,
  type GenerativeModel,
  QUALITY_ORDER,
  type QualityTier,
} from "./generativeCatalog";
import { cosineSimilarity } from "./similarity";
import type { EmbeddingProvider, RouteInput } from "./types";
import {
  createVectorRouter,
  type VectorRouteDecision,
  type VectorRouterConfig,
} from "./vectorRouter";

export interface GenerativeDecision {
  modality: GenerativeModality;
  model: string;
  qualityTier: QualityTier;
  priceUnit: GenerativeModel["priceUnit"];
  pricePerUnit: number;
  /** Specialty tags that were detected in the request and matched by the model. */
  tags: string[];
  reason: string;
}

/** A routing decision across both branches, discriminated on `modality`. */
export type MultimodalDecision =
  | ({ modality: "text" } & VectorRouteDecision)
  | GenerativeDecision;

export interface MultimodalRouterConfig<TOutput = unknown> {
  embed: EmbeddingProvider;
  /** Passed through to the underlying chat vector router; the embedder is shared. */
  chat?: Omit<VectorRouterConfig<TOutput>, "embed">;
  generativeCatalog?: GenerativeModel[];
  modalitySeeds?: Record<GenerativeModality, string[]>;
  qualitySeeds?: { draft: string[]; premium: string[] };
  /** Text-anchor seeds; defaults to the chat capability seeds. */
  textSeeds?: string[];
  /**
   * How clearly a generative intent must beat the text anchor to switch branches:
   * `minMargin` over the text score AND `minCosine` absolute. Higher = safer (more
   * requests stay on the text branch).
   */
  detect?: { minCosine?: number; minMargin?: number };
}

// Keyword cues per specialty tag, scoped to the modality they make sense in. Kept
// deliberately light: the modality is chosen by embeddings, the specialty by intent.
const TAG_CUES: Array<{
  tag: string;
  modality: GenerativeModality;
  re: RegExp;
}> = [
  {
    tag: "typography",
    modality: "image",
    re: /\b(logo|text|typograph|lettering|title|caption|words?|font)\b/i,
  },
  {
    tag: "photoreal",
    modality: "image",
    re: /\b(photo|photoreal|realistic|lifelike|photograph)\b/i,
  },
  {
    tag: "control",
    modality: "video",
    re: /\b(consistent|consistency|same character|control|precise|storyboard)\b/i,
  },
  {
    tag: "dialogue",
    modality: "video",
    re: /\b(dialogue|talking|speaking|lip.?sync|conversation|voice)\b/i,
  },
  { tag: "4k", modality: "video", re: /\b(4k|high.?res|ultra.?hd|hd)\b/i },
  {
    tag: "voice-clone",
    modality: "speech",
    re: /\b(clone|my voice|same voice|voice clone|impersonat)\b/i,
  },
  {
    tag: "vocals",
    modality: "music",
    re: /\b(lyrics|vocals?|singing|singer|chorus|verse)\b/i,
  },
  {
    tag: "instrumental",
    modality: "music",
    re: /\b(instrumental|no vocals|beat|melody|backing track)\b/i,
  },
];

/** Specialty tags a request signals, scoped to the chosen modality. */
export function detectTags(
  prompt: string,
  modality: GenerativeModality,
): string[] {
  const tags: string[] = [];
  for (const cue of TAG_CUES) {
    if (
      cue.modality === modality &&
      cue.re.test(prompt) &&
      !tags.includes(cue.tag)
    ) {
      tags.push(cue.tag);
    }
  }
  return tags;
}

/**
 * Pick the best-fit generative model: specialty match first (a typography request
 * wants Ideogram even if it is not the flashiest), then the quality tier the request
 * needs, then the cheapest that fits. Savings is the consequence of the fit.
 */
export function matchGenerative(
  catalog: GenerativeModel[],
  modality: GenerativeModality,
  need: QualityTier,
  tags: string[],
): GenerativeDecision {
  const pool = catalog.filter((m) => m.modality === modality);
  if (pool.length === 0) {
    throw new Error(`orfora: no generative model for modality "${modality}".`);
  }

  // Specialty: if the request asked for a tag some model provides, restrict to those.
  const tagged = pool.filter((m) => tags.some((t) => m.tags.includes(t)));
  const bySpecialty = tagged.length > 0 ? tagged : pool;

  // Quality: at or above the needed tier; if none qualify, take the highest available.
  let byQuality = bySpecialty.filter(
    (m) => QUALITY_ORDER[m.qualityTier] >= QUALITY_ORDER[need],
  );
  if (byQuality.length === 0) {
    const top = Math.max(
      ...bySpecialty.map((m) => QUALITY_ORDER[m.qualityTier]),
    );
    byQuality = bySpecialty.filter((m) => QUALITY_ORDER[m.qualityTier] === top);
  }

  // Cost as consequence: the cheapest per-unit among the models that fit.
  const chosen = byQuality.reduce((a, b) =>
    b.pricePerUnit < a.pricePerUnit ? b : a,
  );
  const matchedTags = tags.filter((t) => chosen.tags.includes(t));
  const reason =
    matchedTags.length > 0 ? `fit:${matchedTags.join("+")}` : `fit:${need}`;
  return {
    modality,
    model: chosen.id,
    qualityTier: chosen.qualityTier,
    priceUnit: chosen.priceUnit,
    pricePerUnit: chosen.pricePerUnit,
    tags: matchedTags,
    reason,
  };
}

const maxCosine = (query: number[], vectors: number[][]): number => {
  let best = Number.NEGATIVE_INFINITY;
  for (const v of vectors) {
    const s = cosineSimilarity(query, v);
    if (s > best) best = s;
  }
  return best;
};

export function createMultimodalRouter<TOutput = unknown>(
  config: MultimodalRouterConfig<TOutput>,
) {
  const { embed } = config;
  if (typeof embed?.embed !== "function") {
    throw new Error("orfora: config.embed (an EmbeddingProvider) is required.");
  }

  const chat = createVectorRouter<TOutput>({ embed, ...config.chat });
  const generativeCatalog =
    config.generativeCatalog ?? defaultGenerativeCatalog;
  const modalitySeeds = config.modalitySeeds ?? defaultModalitySeeds;
  const qualitySeeds = config.qualitySeeds ?? defaultQualitySeeds;
  const textSeeds =
    config.textSeeds ?? Object.values(defaultCapabilitySeeds).flat();
  const minCosine = config.detect?.minCosine ?? 0.25;
  const minMargin = config.detect?.minMargin ?? 0.02;

  const GEN_MODALITIES: GenerativeModality[] = [
    "image",
    "video",
    "speech",
    "music",
  ];

  let bank: Promise<{
    text: number[][];
    modality: Record<GenerativeModality, number[][]>;
    draft: number[][];
    premium: number[][];
  }> | null = null;
  function loadBank() {
    if (!bank) {
      bank = (async () => {
        const embedGroup = (arr: string[]) =>
          arr.length > 0 ? embed.embed(arr) : Promise.resolve([]);
        const [text, image, video, speech, music, draft, premium] =
          await Promise.all([
            embedGroup(textSeeds),
            embedGroup(modalitySeeds.image),
            embedGroup(modalitySeeds.video),
            embedGroup(modalitySeeds.speech),
            embedGroup(modalitySeeds.music),
            embedGroup(qualitySeeds.draft),
            embedGroup(qualitySeeds.premium),
          ]);
        return {
          text,
          modality: { image, video, speech, music },
          draft,
          premium,
        };
      })();
    }
    return bank;
  }

  async function route(
    input: string | RouteInput,
  ): Promise<MultimodalDecision> {
    const request: RouteInput =
      typeof input === "string" ? { prompt: input } : input;
    const seeds = await loadBank();
    const embedded = await embed.embed([request.prompt]);
    const query = embedded[0];

    // No embedding, or seeds missing: fall safely onto the text branch.
    if (!query || seeds.text.length === 0) {
      return { modality: "text", ...(await chat.route(request)) };
    }

    // Detect the output modality: nearest seed group, biased to text.
    const textScore = maxCosine(query, seeds.text);
    let bestModality: GenerativeModality | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const m of GEN_MODALITIES) {
      const group = seeds.modality[m];
      if (group.length === 0) continue;
      const s = maxCosine(query, group);
      if (s > bestScore) {
        bestScore = s;
        bestModality = m;
      }
    }
    const isGenerative =
      bestModality !== null &&
      bestScore >= minCosine &&
      bestScore >= textScore + minMargin;
    if (!isGenerative || bestModality === null) {
      return { modality: "text", ...(await chat.route(request)) };
    }

    // Detect the draft-vs-final quality need.
    const draftScore =
      seeds.draft.length > 0 ? maxCosine(query, seeds.draft) : -1;
    const premiumScore =
      seeds.premium.length > 0 ? maxCosine(query, seeds.premium) : -1;
    let need: QualityTier = "standard";
    if (draftScore > premiumScore + minMargin) need = "draft";
    else if (premiumScore > draftScore + minMargin) need = "premium";

    const tags = detectTags(request.prompt, bestModality);
    return matchGenerative(generativeCatalog, bestModality, need, tags);
  }

  return { route };
}
