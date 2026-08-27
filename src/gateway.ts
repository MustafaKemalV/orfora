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

  /**
   * The primitive both surfaces build on: route, forward (respecting `stream`), and
   * return the raw upstream Response plus the routing metadata.
   */
  async function handle(
    request: ChatCompletionRequest,
  ): Promise<{ meta: OrforaMeta; response: Response }> {
    const { model, meta } = await route(request);
    const response = await forward(model, { ...request, model });
    return { meta, response };
  }

  return { route, chatCompletion, handle, forward, withMeta };
}

/** Routing metadata as `x-orfora-*` response headers. */
function metaHeaders(meta: OrforaMeta): Record<string, string> {
  const h: Record<string, string> = {
    "x-orfora-model": meta.model,
    "x-orfora-routed": String(meta.routed),
  };
  if (meta.capability) h["x-orfora-capability"] = meta.capability;
  if (meta.tier) h["x-orfora-tier"] = meta.tier;
  if (typeof meta.fitness === "number") {
    h["x-orfora-fitness"] = meta.fitness.toFixed(3);
  }
  return h;
}

function errorResponse(
  status: number,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({ error: { message, type: "orfora_gateway_error" } }),
    { status, headers: { "content-type": "application/json", ...headers } },
  );
}

/** Chat requests are tiny; this is a DoS guard, not a real limit. Infinity disables it. */
const DEFAULT_MAX_BODY_BYTES = 1_000_000;

/** The HTTP handler's config: the gateway plus HTTP-only policy (auth, body size). */
export interface HttpHandlerConfig<TOutput = unknown>
  extends GatewayConfig<TOutput> {
  /**
   * Gate inbound callers; return false (or throw) to reject with 401. The handler is a
   * KEYED proxy: without this it is open to anyone who can reach it, and they can spend
   * your provider key. Always set it on a public deployment.
   */
  authorize?: (request: Request) => boolean | Promise<boolean>;
  /** Max request body size in bytes (default 1_000_000). Pass Infinity to disable. */
  maxBodyBytes?: number;
}

/** Read a request body as text, returning null once it exceeds maxBytes. */
async function readBodyCapped(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  if (!Number.isFinite(maxBytes)) return request.text();
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const body = request.body;
  if (!body) return request.text();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/**
 * An OpenAI-compatible HTTP handler: `(Request) => Promise<Response>`, mountable at
 * `/v1/chat/completions` on any fetch-style runtime (Vercel edge, Bun, Deno, or Node
 * via an adapter). Point your OpenAI base URL at it and set `model: "auto"`; streaming
 * passes through untouched, and routing shows up in `x-orfora-*` headers.
 *
 * SECURITY: this forwards with your provider key. It is UNAUTHENTICATED unless you pass
 * `authorize`; a body-size cap (`maxBodyBytes`, default 1MB) guards against oversized
 * requests. On a public deployment, always set `authorize` and rate-limit at the edge.
 */
export function orforaHandler<TOutput = unknown>(
  config: HttpHandlerConfig<TOutput>,
): (request: Request) => Promise<Response> {
  const gw = createGateway(config);
  const maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  return async (request) => {
    if (config.authorize) {
      let allowed = false;
      try {
        allowed = await config.authorize(request);
      } catch {
        allowed = false;
      }
      if (!allowed) return errorResponse(401, "unauthorized");
    }
    const raw = await readBodyCapped(request, maxBodyBytes);
    if (raw === null) return errorResponse(413, "request body too large");
    let body: ChatCompletionRequest;
    try {
      body = JSON.parse(raw) as ChatCompletionRequest;
    } catch {
      return errorResponse(400, "invalid JSON body");
    }
    if (!body || !Array.isArray(body.messages)) {
      return errorResponse(400, "a messages[] array is required");
    }
    try {
      const { meta, response } = await gw.handle(body);
      const headers = metaHeaders(meta);
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        return errorResponse(
          response.status,
          `upstream error for "${meta.model}": ${detail}`.trim(),
          headers,
        );
      }
      if (body.stream && response.body) {
        return new Response(response.body, {
          status: 200,
          headers: { "content-type": "text/event-stream", ...headers },
        });
      }
      const data = (await response.json()) as Record<string, unknown>;
      if (gw.withMeta) data.orfora = meta;
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-type": "application/json", ...headers },
      });
    } catch (e) {
      return errorResponse(500, (e as Error).message);
    }
  };
}

/** Parse an upstream SSE stream into OpenAI chunk objects; tag the first with meta. */
async function* streamChunks(
  response: Response,
  meta: OrforaMeta,
  withMeta: boolean,
): AsyncGenerator<Record<string, unknown>> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let first = true;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (;;) {
      const idx = buffer.indexOf("\n\n");
      if (idx === -1) break;
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of event.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const obj = JSON.parse(payload) as Record<string, unknown>;
          if (first && withMeta) {
            obj.orfora = meta;
            first = false;
          }
          yield obj;
        } catch {
          // Ignore keep-alive / non-JSON lines.
        }
      }
    }
  }
}

/**
 * An in-process, OpenAI-SDK-shaped client. Wrap it around your app and call
 * `client.chat.completions.create({ model: "auto", messages, stream })`: non-stream
 * returns the completion (with an `orfora` field); stream returns an async iterable of
 * chunks (the first tagged with routing metadata).
 */
export function createOrforaClient<TOutput = unknown>(
  config: GatewayConfig<TOutput>,
) {
  const gw = createGateway(config);
  return {
    chat: {
      completions: {
        create: async (request: ChatCompletionRequest) => {
          if (!request.stream) {
            const { data } = await gw.chatCompletion(request);
            return data;
          }
          const { meta, response } = await gw.handle(request);
          if (!response.ok) {
            const detail = await response.text().catch(() => "");
            throw new Error(
              `orfora/gateway: upstream ${response.status} for "${meta.model}". ${detail}`.trim(),
            );
          }
          return streamChunks(response, meta, gw.withMeta);
        },
      },
    },
  };
}
