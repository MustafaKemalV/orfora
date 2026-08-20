import { describe, expect, it } from "vitest";
import { defaultGenerativeCatalog } from "./generativeCatalog";
import {
  createMultimodalRouter,
  detectTags,
  matchGenerative,
} from "./multimodalRouter";
import type { EmbeddingProvider } from "./types";

// A deterministic fake embedder: each text becomes a vector over concept dimensions
// set by keyword, plus a small bias dim so no vector is all-zero. Enough for cosine
// to route by intent without a real model.
const DIMS = [
  "image",
  "video",
  "speech",
  "music",
  "code",
  "math",
  "write",
  "qa",
  "draft",
  "premium",
] as const;
const CUES: Record<(typeof DIMS)[number], RegExp> = {
  image: /image|picture|logo|poster|illustration|photo|artwork|draw|render/i,
  video: /video|clip|animate|footage|film|timelapse/i,
  speech: /speech|aloud|voiceover|narrat|read this|say this|text to speech/i,
  music: /song|music|instrumental|melody|beat|track|chorus/i,
  code: /code|bug|refactor|function|module|debug/i,
  math: /prove|math|theorem|equation|integral|irrational/i,
  write: /write|story|poem|noir|essay|novel/i,
  qa: /what is|explain|summar|capital|define/i,
  draft: /draft|sketch|mockup|thumbnail|placeholder|rough|quick/i,
  premium:
    /final|hero|production|polished|professional|highest quality|print ready/i,
};
const fakeEmbed = (text: string): number[] => {
  const t = text.toLowerCase();
  const v = DIMS.map((d) => (CUES[d].test(t) ? 1 : 0));
  v.push(0.25); // bias so unrelated vectors still have a defined cosine
  return v;
};
const fake: EmbeddingProvider = {
  embed: async (texts) => texts.map(fakeEmbed),
};

const textSeeds = [
  "fix the bug in this code",
  "prove this math theorem",
  "write a short story",
  "what is the capital of france",
  "summarize this article",
];

describe("detectTags", () => {
  it("reads specialty cues scoped to the modality", () => {
    expect(detectTags("design a logo with bold text", "image")).toEqual([
      "typography",
    ]);
    expect(detectTags("clone my voice and read this", "speech")).toEqual([
      "voice-clone",
    ]);
    expect(detectTags("make an instrumental beat", "music")).toContain(
      "instrumental",
    );
    // A cue only counts inside its own modality.
    expect(detectTags("a logo", "video")).toEqual([]);
  });
});

describe("matchGenerative", () => {
  it("picks the cheapest model at or above the needed tier", () => {
    const d = matchGenerative(defaultGenerativeCatalog, "image", "premium", []);
    expect(d.qualityTier).toBe("premium");
    expect(d.pricePerUnit).toBe(0.03); // reve, cheapest premium image
  });

  it("lets a specialty match override the tier (typography -> Ideogram)", () => {
    const d = matchGenerative(defaultGenerativeCatalog, "image", "premium", [
      "typography",
    ]);
    expect(d.model).toBe("ideogram/ideogram-v3");
    expect(d.tags).toContain("typography");
  });

  it("routes a draft need to the cheapest draft-capable model", () => {
    const d = matchGenerative(defaultGenerativeCatalog, "image", "draft", []);
    expect(d.model).toBe("openai/gpt-image-1-mini");
  });

  it("matches a voice-clone speech request to a clone-capable model", () => {
    const d = matchGenerative(defaultGenerativeCatalog, "speech", "standard", [
      "voice-clone",
    ]);
    expect(d.model).toBe("elevenlabs/eleven-flash");
  });
});

describe("createMultimodalRouter", () => {
  const router = createMultimodalRouter({ embed: fake, textSeeds });

  it("keeps a text task on the chat branch", async () => {
    const d = await router.route("fix the bug in this code module");
    expect(d.modality).toBe("text");
    if (d.modality === "text") expect(typeof d.model).toBe("string");
  });

  it("routes an image request to the image branch", async () => {
    const d = await router.route(
      "generate an image of a sunset over mountains",
    );
    expect(d.modality).toBe("image");
    if (d.modality !== "text") {
      expect(d.model.length).toBeGreaterThan(0);
    }
  });

  it("routes speech, music and video requests to their branches", async () => {
    const speech = await router.route(
      "read this article aloud in a calm voice",
    );
    expect(speech.modality).toBe("speech");
    const music = await router.route("generate a song about the ocean");
    expect(music.modality).toBe("music");
    const video = await router.route(
      "create a ten second video of a running horse",
    );
    expect(video.modality).toBe("video");
  });

  it("detects a final-quality image need and picks a premium model", async () => {
    const d = await router.route(
      "generate a polished hero shot photo, final production quality",
    );
    expect(d.modality).toBe("image");
    if (d.modality === "image") expect(d.qualityTier).toBe("premium");
  });
});
