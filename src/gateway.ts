/**
 * The gateway: a drop-in, OpenAI-compatible layer that routes each chat request to
 * its best-fit model and forwards the call. This is orfora's "wrapping" surface: an
 * app keeps its OpenAI-shaped code and either points its base URL at a proxy built
 * from this, or wraps its client with the SDK built from this. The prompt is embedded
 * ONCE for routing, then the request is forwarded verbatim with the model swapped.
 */

import type { Capability, Tier } from "./catalog";
import type { ModelVector } from "./modelVector";
import type { EmbeddingProvider } from "./types";
import { defaultVectorCatalog } from "./vectorCatalog";
import {
  createVectorRouter,
  type VectorRouteDecision,
  type VectorRouterConfig,
} from "./vectorRouter";

/** A minimal OpenAI-compatible chat message. Content may be a string or parts. */
export interface ChatMessage {
  role: string;
  content?:
    | string
    | Array<{ type?: string; text?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

/** An OpenAI-compatible chat completion request; unknown fields pass through. */
export interface ChatCompletionRequest {
  /** The model, or "auto" to let orfora route. */
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  [k: string]: unknown;
}

/** How orfora forwards the chosen model's call. */
export type ForwardConfig =
  | {
      mode: "openrouter";
      apiKey: string;
      baseURL?: string;
      referer?: string;
      title?: string;
      fetch?: typeof fetch;
    }
  | {
      mode: "providers";
      /** Keyed by the model id's provider prefix, e.g. "anthropic", "openai". */
      providers: Record<string, { baseURL: string; apiKey: string }>;
      /** Provider prefix to use when a model's own provider is not configured. */
      fallback?: string;
      fetch?: typeof fetch;
    };

/** Routing metadata attached to the response and returned alongside it. */
export interface OrforaMeta {
  /** True when orfora chose the model (model was "auto"); false when pinned. */
  routed: boolean;
  model: string;
  capability?: Capability;
  tier?: Tier;
  fitness?: number | null;
  reason?: string;
  /** The chosen model's output price per 1M tokens, when known. */
  estCostPerMTokens?: number;
}

export interface GatewayConfig<TOutput = unknown> {
  /** Backend that turns the routing text into a vector. */
  embed: EmbeddingProvider;
  /** Where the chosen model's call is forwarded. */
  forward: ForwardConfig;
  /** Passed to the underlying chat vector router; the embedder is shared. */
  router?: Omit<VectorRouterConfig<TOutput>, "embed">;
  /** Attach an `orfora` metadata field to the response body. Default true. */
  metadata?: boolean;
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function flattenContent(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join(" ")
      .trim();
  }
  return "";
}

/** The text a routing decision is made on: the last user message, flattened. */
export function routingText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "user") return flattenContent(m.content);
  }
  const last = messages[messages.length - 1];
  return last ? flattenContent(last.content) : "";
}

/** Builds the forwarder: given a model and body, POSTs to the right provider. */
export function createForwarder(
  config: ForwardConfig,
): (model: string, body: unknown) => Promise<Response> {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error(
      "orfora/gateway: no global fetch found; pass forward.fetch explicitly.",
    );
  }

  return async (model, body) => {
    let url: string;
    let sendModel = model;
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (config.mode === "openrouter") {
      if (!config.apiKey) {
        throw new Error("orfora/gateway: forward.apiKey is required.");
      }
      url = `${config.baseURL ?? OPENROUTER_BASE_URL}/chat/completions`;
      headers.authorization = `Bearer ${config.apiKey}`;
      if (config.referer) headers["http-referer"] = config.referer;
      if (config.title) headers["x-title"] = config.title;
    } else {
      const prefix = model.split("/")[0] ?? "";
      const provider =
        config.providers[prefix] ??
        (config.fallback ? config.providers[config.fallback] : undefined);
      if (!provider) {
        throw new Error(
          `orfora/gateway: no forwarding provider configured for "${prefix}".`,
        );
      }
      url = `${provider.baseURL.replace(/\/+$/, "")}/chat/completions`;
      headers.authorization = `Bearer ${provider.apiKey}`;
      // Direct provider endpoints expect the bare model name, not the prefixed id.
      sendModel = model.slice(prefix.length + 1) || model;
    }

    const payload = body && typeof body === "object" ? { ...body } : {};
    (payload as { model?: string }).model = sendModel;
    return fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  };
}

/**
 * Creates the gateway. `route` decides (embedding once); `chatCompletion` decides,
 * forwards, and returns the OpenAI response with `orfora` routing metadata attached.
 * `forward` is exposed for the streaming and proxy surfaces built on top.
 */
export function createGateway<TOutput = unknown>(
  config: GatewayConfig<TOutput>,
) {
  const { embed } = config;
  if (typeof embed?.embed !== "function") {
    throw new Error(
      "orfora/gateway: config.embed (an EmbeddingProvider) is required.",
    );
  }
  const router = createVectorRouter({ embed, ...config.router });
  const catalog = config.router?.catalog ?? defaultVectorCatalog;
  const byId = new Map<string, ModelVector>(catalog.map((m) => [m.id, m]));
  const forward = createForwarder(config.forward);
  const withMeta = config.metadata !== false;

  async function route(
    request: ChatCompletionRequest,
  ): Promise<{ model: string; meta: OrforaMeta }> {
    if (request.model && request.model !== "auto") {
      return {
        model: request.model,
        meta: { routed: false, model: request.model },
      };
    }
    const d: VectorRouteDecision = await router.route(
      routingText(request.messages),
    );
    const priced = byId.get(d.model);
    return {
      model: d.model,
      meta: {
        routed: true,
        model: d.model,
        capability: d.capability,
        tier: d.tier,
        fitness: d.fitness,
        reason: d.reason,
        estCostPerMTokens: priced?.pricePerMTokens,
      },
    };
  }

  async function chatCompletion(
    request: ChatCompletionRequest,
  ): Promise<{ data: Record<string, unknown>; meta: OrforaMeta }> {
    const { model, meta } = await route(request);
    const res = await forward(model, { ...request, model, stream: false });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `orfora/gateway: upstream ${res.status} for "${model}". ${detail}`.trim(),
      );
    }
    const data = (await res.json()) as Record<string, unknown>;
    if (withMeta) data.orfora = meta;
    return { data, meta };
  }

  return { route, chatCompletion, forward };
}
