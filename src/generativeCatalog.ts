/**
 * The GENERATIVE side of orfora: models whose OUTPUT is not text but an image,
 * a video, speech, or music. This is the "second branch" of the router. A request
 * is still plain text (a description or instruction); what differs is the modality
 * the user wants PRODUCED. "Describe a poster and generate it" is image OUTPUT, not
 * an uploaded image (that would be an input gate on a chat model).
 *
 * Generative models have none of the chat capability axes (code, math, ...), so they
 * carry a different shape: a coarse quality TIER (public arenas are thin and not
 * cross-comparable, so an honest ordinal beats a fake [0,1]), an optional arena Elo
 * when one exists, opt-in specialisation tags, and a price in the modality's own unit
 * (per image / per second / per 1k characters / per song / per minute). profileFrom
 * cites the live 2026 source, same honesty discipline as the chat catalog.
 */

export type OutputModality = "text" | "image" | "video" | "speech" | "music";
export type GenerativeModality = Exclude<OutputModality, "text">;
export type QualityTier = "draft" | "standard" | "premium";
export type PriceUnit = "image" | "second" | "minute" | "song" | "1k_chars";

export interface GenerativeModel {
  id: string;
  family: string;
  modality: GenerativeModality;
  /** Coarse quality band, matched against a request's draft-vs-final need. */
  qualityTier: QualityTier;
  priceUnit: PriceUnit;
  pricePerUnit: number;
  /** Opt-in specialisations a request can ask for (typography, control, ...). */
  tags: string[];
  /** A public arena Elo when one rates this model, kept for honesty/reference. */
  arenaElo?: number;
  maxDurationSec?: number;
  profileFrom: string;
}

/** Ordering of quality tiers, lowest to highest. */
export const QUALITY_ORDER: Record<QualityTier, number> = {
  draft: 0,
  standard: 1,
  premium: 2,
};

// Live-sourced, August 2026 (artificialanalysis.ai image arena, provider pages,
// cometapi/howaiworks/teamday/buildmvpfast pricing pages). Prices marked "est" are
// per-unit estimates where a vendor only lists subscriptions.
export const defaultGenerativeCatalog: GenerativeModel[] = [
  // Image (price per image).
  {
    id: "openai/gpt-image-2",
    family: "GPT Image",
    modality: "image",
    qualityTier: "premium",
    priceUnit: "image",
    pricePerUnit: 0.04,
    tags: ["photoreal", "general"],
    arenaElo: 1370,
    profileFrom:
      "Image Arena Elo 1370 (#1) / ~$0.04 (artificialanalysis.ai, cometapi)",
  },
  {
    id: "reve/reve-2.1",
    family: "Reve",
    modality: "image",
    qualityTier: "premium",
    priceUnit: "image",
    pricePerUnit: 0.03,
    tags: ["general"],
    arenaElo: 1299,
    profileFrom: "Image Arena Elo 1299 / ~$0.03 (llm-stats)",
  },
  {
    id: "microsoft/mai-image-2.5",
    family: "MAI Image",
    modality: "image",
    qualityTier: "premium",
    priceUnit: "image",
    pricePerUnit: 0.03,
    tags: ["general"],
    arenaElo: 1270,
    profileFrom: "Image Arena Elo 1270 / ~$0.03 (llm-stats)",
  },
  {
    id: "google/imagen-4-ultra",
    family: "Imagen",
    modality: "image",
    qualityTier: "premium",
    priceUnit: "image",
    pricePerUnit: 0.06,
    tags: ["photoreal", "editorial"],
    profileFrom: "quality ceiling / $0.06 per image (howaiworks, cometapi)",
  },
  {
    id: "google/nano-banana-pro",
    family: "Imagen",
    modality: "image",
    qualityTier: "premium",
    priceUnit: "image",
    pricePerUnit: 0.134,
    tags: ["general"],
    profileFrom: "$0.134-0.24 per image (howaiworks)",
  },
  {
    id: "black-forest-labs/flux-2-pro",
    family: "FLUX",
    modality: "image",
    qualityTier: "standard",
    priceUnit: "image",
    pricePerUnit: 0.03,
    tags: ["general", "default", "fast"],
    profileFrom: "best default / $0.02-0.055 per image (howaiworks, cometapi)",
  },
  {
    id: "ideogram/ideogram-v3",
    family: "Ideogram",
    modality: "image",
    qualityTier: "standard",
    priceUnit: "image",
    pricePerUnit: 0.07,
    tags: ["typography", "text-in-image"],
    profileFrom: "typography specialist / $0.07 per image balanced (cometapi)",
  },
  {
    id: "bytedance/seedream-5-lite",
    family: "Seedream",
    modality: "image",
    qualityTier: "standard",
    priceUnit: "image",
    pricePerUnit: 0.026,
    tags: ["volume", "cost"],
    profileFrom: "volume play / $0.026 per image (howaiworks)",
  },
  {
    id: "google/imagen-4-fast",
    family: "Imagen",
    modality: "image",
    qualityTier: "draft",
    priceUnit: "image",
    pricePerUnit: 0.02,
    tags: ["fast"],
    profileFrom: "$0.02 per image (cometapi)",
  },
  {
    id: "google/nano-banana-2-lite",
    family: "Imagen",
    modality: "image",
    qualityTier: "draft",
    priceUnit: "image",
    pricePerUnit: 0.0336,
    tags: ["fast", "cost"],
    profileFrom: "$0.0336 per image (howaiworks)",
  },
  {
    id: "bytedance/z-image-turbo",
    family: "Seedream",
    modality: "image",
    qualityTier: "draft",
    priceUnit: "image",
    pricePerUnit: 0.01,
    tags: ["draft", "fast"],
    profileFrom: "$0.01 per image, drafts (howaiworks)",
  },
  {
    id: "openai/gpt-image-1-mini",
    family: "GPT Image",
    modality: "image",
    qualityTier: "draft",
    priceUnit: "image",
    pricePerUnit: 0.005,
    tags: ["draft", "cost"],
    profileFrom: "$0.005 per image (buildmvpfast)",
  },

  // Video (price per second of output).
  {
    id: "google/veo-3.1",
    family: "Veo",
    modality: "video",
    qualityTier: "premium",
    priceUnit: "second",
    pricePerUnit: 0.15,
    tags: ["dialogue", "audio", "48khz"],
    profileFrom:
      "only 48kHz synced dialogue / $0.15/s fast (teamday, tech-insider)",
  },
  {
    id: "kuaishou/kling-3.0",
    family: "Kling",
    modality: "video",
    qualityTier: "premium",
    priceUnit: "second",
    pricePerUnit: 0.1,
    tags: ["4k", "60fps", "lip-sync"],
    maxDurationSec: 15,
    profileFrom: "4K/60fps/15s, multilingual lip-sync / ~$0.10/s (teamday)",
  },
  {
    id: "runway/gen-4.5",
    family: "Runway",
    modality: "video",
    qualityTier: "premium",
    priceUnit: "second",
    pricePerUnit: 0.12,
    tags: ["control", "consistency"],
    profileFrom:
      "best control surface / ~$0.12/s est, $76/mo unlimited (teamday)",
  },
  {
    id: "bytedance/seedance-2",
    family: "Seedance",
    modality: "video",
    qualityTier: "premium",
    priceUnit: "second",
    pricePerUnit: 0.15,
    tags: ["general"],
    profileFrom: "current leader / ~$0.15/s est (teamday)",
  },
  {
    id: "alibaba/wan-2.7",
    family: "Wan",
    modality: "video",
    qualityTier: "standard",
    priceUnit: "second",
    pricePerUnit: 0.06,
    tags: ["general", "open"],
    profileFrom: "open weights / ~$0.06/s est (teamday)",
  },
  {
    id: "minimax/hailuo-2.3",
    family: "Hailuo",
    modality: "video",
    qualityTier: "standard",
    priceUnit: "second",
    pricePerUnit: 0.08,
    tags: ["general"],
    profileFrom: "~$0.08/s est (teamday)",
  },
  {
    id: "xai/grok-imagine-video-1.5",
    family: "Grok",
    modality: "video",
    qualityTier: "standard",
    priceUnit: "second",
    pricePerUnit: 0.08,
    tags: ["general"],
    profileFrom: "~$0.08/s est (teamday)",
  },

  // Speech / TTS (price per 1000 characters).
  {
    id: "elevenlabs/eleven-multilingual-v3",
    family: "ElevenLabs",
    modality: "speech",
    qualityTier: "premium",
    priceUnit: "1k_chars",
    pricePerUnit: 0.206,
    tags: ["voice-clone", "multilingual"],
    profileFrom: "MOS 4.3 / $206 per 1M chars (speechmatics, buildmvpfast)",
  },
  {
    id: "elevenlabs/eleven-flash",
    family: "ElevenLabs",
    modality: "speech",
    qualityTier: "standard",
    priceUnit: "1k_chars",
    pricePerUnit: 0.103,
    tags: ["fast", "voice-clone"],
    profileFrom: "$103 per 1M chars (buildmvpfast)",
  },
  {
    id: "openai/gpt-5.5-audio-tts",
    family: "OpenAI TTS",
    modality: "speech",
    qualityTier: "standard",
    priceUnit: "1k_chars",
    pricePerUnit: 0.03,
    tags: ["general"],
    profileFrom: "MOS 3.9 / HD $30 per 1M chars (tokenmix)",
  },
  {
    id: "google/tts-studio",
    family: "Google TTS",
    modality: "speech",
    qualityTier: "standard",
    priceUnit: "1k_chars",
    pricePerUnit: 0.016,
    tags: ["general"],
    profileFrom: "MOS 4.1 / $4-16 per 1M chars (deepgram)",
  },
  {
    id: "deepgram/aura-2",
    family: "Deepgram",
    modality: "speech",
    qualityTier: "standard",
    priceUnit: "1k_chars",
    pricePerUnit: 0.03,
    tags: ["fast", "low-latency"],
    profileFrom: "~95ms latency / $30 per 1M chars (buildmvpfast)",
  },
  {
    id: "openai/tts-standard",
    family: "OpenAI TTS",
    modality: "speech",
    qualityTier: "draft",
    priceUnit: "1k_chars",
    pricePerUnit: 0.015,
    tags: ["cost"],
    profileFrom: "$15 per 1M chars (tokenmix)",
  },
  {
    id: "hume/octave-2",
    family: "Hume",
    modality: "speech",
    qualityTier: "draft",
    priceUnit: "1k_chars",
    pricePerUnit: 0.0076,
    tags: ["cost", "expressive"],
    profileFrom: "$7.60 per 1M chars (buildmvpfast)",
  },

  // Music (price per song, or per minute where the vendor bills that way).
  {
    id: "suno/suno-v5.5",
    family: "Suno",
    modality: "music",
    qualityTier: "premium",
    priceUnit: "song",
    pricePerUnit: 0.016,
    tags: ["vocals", "song"],
    profileFrom: "quality leader / ~$0.016 per song, Pro (felloai, pricemyai)",
  },
  {
    id: "udio/udio",
    family: "Udio",
    modality: "music",
    qualityTier: "premium",
    priceUnit: "song",
    pricePerUnit: 0.013,
    tags: ["vocals", "licensing"],
    profileFrom: "cleanest licensing / ~$0.013 per song (eesel)",
  },
  {
    id: "elevenlabs/eleven-music",
    family: "ElevenLabs",
    modality: "music",
    qualityTier: "standard",
    priceUnit: "minute",
    pricePerUnit: 0.15,
    tags: ["background", "commercial"],
    profileFrom:
      "licensed commercial background / $0.15 per minute API (felloai)",
  },
  {
    id: "stability/stable-audio-3",
    family: "Stable Audio",
    modality: "music",
    qualityTier: "standard",
    priceUnit: "song",
    pricePerUnit: 0.012,
    tags: ["open", "instrumental"],
    profileFrom: "open weights, 6-min tracks / ~$0.012 per song est (dubspot)",
  },
];

/** Default seed phrases that anchor each generative modality for detection. */
export const defaultModalitySeeds: Record<GenerativeModality, string[]> = {
  image: [
    "generate an image of a mountain landscape",
    "create a picture of a friendly robot",
    "draw an illustration of a red fox",
    "design a logo for a coffee brand",
    "design a poster for a summer concert",
    "make an image of a futuristic city at night",
    "render a photo of a sports car",
    "create digital artwork of a dragon",
  ],
  video: [
    "generate a video of waves crashing on rocks",
    "create a short clip of a running horse",
    "animate a scene of snow falling in a forest",
    "make a ten second video of a city timelapse",
    "produce a video of a spaceship launching",
  ],
  speech: [
    "read this text aloud in a calm voice",
    "convert this article into speech",
    "narrate this story with a warm voice",
    "generate a voiceover for my advertisement",
    "turn this paragraph into text to speech audio",
    "say this sentence out loud",
  ],
  music: [
    "generate a song about a summer road trip",
    "compose background music for a video",
    "create an upbeat instrumental track",
    "make a lo-fi beat to study to",
    "write a melody for a pop chorus",
  ],
};

/** Default seed phrases that anchor the draft-vs-final quality need. */
export const defaultQualitySeeds: { draft: string[]; premium: string[] } = {
  draft: [
    "a quick rough draft",
    "just a rough sketch",
    "a simple mockup to test the idea",
    "a low resolution thumbnail",
    "a placeholder version, nothing fancy",
  ],
  premium: [
    "a final production ready result",
    "a polished hero shot",
    "the highest quality for publishing",
    "a professional print ready asset",
    "the best possible quality, no compromises",
  ],
};
