/**
 * OpenRouter adapter: one key reaches every model in the catalog.
 *
 * orfora stays the BRAIN, it decides which model, while OpenRouter (with your
 * key) makes the actual call. orfora holds no credentials and bundles no provider
 * SDK; this adapter is a thin `fetch` bridge you opt into.
 *
 * ```ts
 * import { createCatalogRouter } from "orfora";
 * import { openrouterEmbedder, openrouterHandlers } from "orfora/openrouter";
 *
 * const router = createCatalogRouter({
 *   embed: openrouterEmbedder({ apiKey }),
 *   handlers: openrouterHandlers({ apiKey }),
 * });
 * const answer = await router.run("Prove that sqrt(2) is irrational.");
 * ```
 */

import { catalog } from "./catalog";
import { type OpenAIEmbedderOptions, openaiEmbedder } from "./openai";
import type { EmbeddingProvider, RouteInput } from "./types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * An {@link EmbeddingProvider} backed by OpenRouter, so the same key that calls
 * models also embeds. A thin preset over {@link openaiEmbedder} (OpenRouter speaks
 * the OpenAI API), pinned to the OpenRouter base URL.
 */
export function openrouterEmbedder(
  options: Omit<OpenAIEmbedderOptions, "baseURL">,
): EmbeddingProvider {
  return openaiEmbedder({
    model: "text-embedding-3-small",
    ...options,
    baseURL: OPENROUTER_BASE_URL,
  });
}

export interface OpenRouterHandlersOptions {
  /** Your OpenRouter API key. */
  apiKey: string;
  /** Models to build handlers for. Defaults to the built-in catalog's ids. */
  models?: string[];
  /** Base URL. Defaults to the OpenRouter API. */
  baseURL?: string;
  /** Optional HTTP-Referer header, used by OpenRouter for app ranking. */
  referer?: string;
  /** Optional X-Title header (your app name), used by OpenRouter for ranking. */
  title?: string;
  /** Inject a custom fetch (tests, or runtimes without a global fetch). */
  fetch?: typeof fetch;
}

/**
 * Builds a handler per model that calls OpenRouter's chat completions endpoint.
 * Pass the result as `handlers` to a router, then `run()` decides and calls.
 *
 * Each handler ignores the routing decision beyond the model id, so the map works
 * with both {@link createCatalogRouter} and the plain {@link createRouter}.
 */
export function openrouterHandlers(
  options: OpenRouterHandlersOptions,
): Record<string, (input: RouteInput) => Promise<string>> {
  const {
    apiKey,
    models = catalog.map((m) => m.id),
    baseURL = OPENROUTER_BASE_URL,
    referer,
    title,
    fetch: fetchImpl = globalThis.fetch,
  } = options;

  if (!apiKey) {
    throw new Error("orfora/openrouter: apiKey is required.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error(
      "orfora/openrouter: no global fetch found; pass options.fetch explicitly.",
    );
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  if (referer) headers["http-referer"] = referer;
  if (title) headers["x-title"] = title;

  const call = async (model: string, input: RouteInput): Promise<string> => {
    const res = await fetchImpl(`${baseURL}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: input.prompt }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `orfora/openrouter: chat request failed (${res.status}). ${detail}`.trim(),
      );
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error(
        "orfora/openrouter: unexpected response shape (missing choices[0].message.content).",
      );
    }
    return content;
  };

  const handlers: Record<string, (input: RouteInput) => Promise<string>> = {};
  for (const model of models) handlers[model] = (input) => call(model, input);
  return handlers;
}
