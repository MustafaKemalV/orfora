import type { EmbeddingProvider } from "./types";

export interface OpenAIEmbedderOptions {
  /** API key for OpenAI (or any OpenAI-compatible provider). */
  apiKey: string;
  /** Embedding model. Defaults to a small, cheap, high-quality model. */
  model?: string;
  /**
   * Base URL, for OpenAI-compatible providers (Together, OpenRouter, a local
   * Ollama, …). Defaults to the OpenAI API.
   */
  baseURL?: string;
  /** Inject a custom fetch (tests, or runtimes without a global fetch). */
  fetch?: typeof fetch;
}

/**
 * An {@link EmbeddingProvider} backed by the OpenAI embeddings endpoint.
 *
 * Uses plain `fetch` on purpose — no SDK dependency, so it runs unchanged on
 * Node, the edge, and the browser. `baseURL` makes it work with any
 * OpenAI-compatible API, not just OpenAI itself.
 */
export function openaiEmbedder(
  options: OpenAIEmbedderOptions,
): EmbeddingProvider {
  const {
    apiKey,
    model = "text-embedding-3-small",
    baseURL = "https://api.openai.com/v1",
    fetch: fetchImpl = globalThis.fetch,
  } = options;

  if (!apiKey) {
    throw new Error("orfora/openai: apiKey is required.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error(
      "orfora/openai: no global fetch found; pass options.fetch explicitly.",
    );
  }

  return {
    async embed(texts) {
      // Nothing to embed — avoid a pointless network round-trip.
      if (texts.length === 0) return [];

      const res = await fetchImpl(`${baseURL}/embeddings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: texts }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `orfora/openai: embeddings request failed (${res.status}). ${detail}`.trim(),
        );
      }

      const json = (await res.json()) as {
        data?: { embedding: number[]; index: number }[];
      };
      if (!Array.isArray(json.data)) {
        throw new Error(
          "orfora/openai: unexpected response shape (missing data array).",
        );
      }

      // The API tags each item with its input `index`; sort by it so the
      // returned order always matches the input order, regardless of the API.
      return json.data
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    },
  };
}
