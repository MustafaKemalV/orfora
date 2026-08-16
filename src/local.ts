import type { EmbeddingProvider } from "./types";

export interface LocalEmbedderOptions {
  /** transformers.js model id. Defaults to a small, fast sentence-embedding model. */
  model?: string;
}

// The minimal shape orfora relies on from transformers.js, declared locally so
// the core takes no hard type dependency on the optional package.
interface TransformersModule {
  pipeline(
    task: "feature-extraction",
    model: string,
  ): Promise<FeatureExtractor>;
}
type FeatureExtractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

/**
 * An EmbeddingProvider that runs a sentence model locally via transformers.js.
 * No API key, and no network at request time once the model is cached. The model
 * loads lazily on first use and is reused afterwards.
 *
 * Requires the optional peer dependency `@huggingface/transformers`.
 */
export function localEmbedder(
  options: LocalEmbedderOptions = {},
): EmbeddingProvider {
  const model = options.model ?? "Xenova/all-MiniLM-L6-v2";

  let extractorPromise: Promise<FeatureExtractor> | null = null;
  function loadExtractor(): Promise<FeatureExtractor> {
    if (!extractorPromise) {
      extractorPromise = (async () => {
        let mod: TransformersModule;
        try {
          mod = (await import(
            "@huggingface/transformers"
          )) as unknown as TransformersModule;
        } catch {
          throw new Error(
            "orfora/local: the optional peer dependency '@huggingface/transformers' is not installed. Run: npm install @huggingface/transformers",
          );
        }
        return mod.pipeline("feature-extraction", model);
      })();
    }
    return extractorPromise;
  }

  return {
    async embed(texts) {
      if (texts.length === 0) return [];
      const extractor = await loadExtractor();
      const output = await extractor(texts, {
        pooling: "mean",
        normalize: true,
      });
      return output.tolist();
    },
  };
}
