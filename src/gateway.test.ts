import { describe, expect, it, vi } from "vitest";
import {
  createForwarder,
  createGateway,
  createOrforaClient,
  orforaHandler,
  routingText,
} from "./gateway";
import type { EmbeddingProvider } from "./types";

function sseFetch(events: string[], ok = true, status = 200) {
  return vi.fn(async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        for (const e of events)
          controller.enqueue(enc.encode(`data: ${e}\n\n`));
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return {
      ok,
      status,
      body,
      json: async () => ({}),
      text: async () => "",
    } as unknown as Response;
  });
}

const fakeEmbed: EmbeddingProvider = {
  embed: async (t) => t.map(() => [1, 1, 1, 1]),
};

function mockFetch(payload: unknown, ok = true, status = 200) {
  return vi.fn(
    async () =>
      ({
        ok,
        status,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      }) as unknown as Response,
  );
}

const bodyOf = (f: ReturnType<typeof mockFetch>): string => {
  const call = f.mock.calls[0] as [string, RequestInit] | undefined;
  return String(call?.[1]?.body ?? "");
};
const urlOf = (f: ReturnType<typeof mockFetch>): string => {
  const call = f.mock.calls[0] as [string, RequestInit] | undefined;
  return String(call?.[0] ?? "");
};

describe("routingText", () => {
  it("uses the last user message, flattening parts", () => {
    expect(
      routingText([
        { role: "system", content: "s" },
        { role: "user", content: "hello" },
      ]),
    ).toBe("hello");
    expect(
      routingText([
        {
          role: "user",
          content: [
            { type: "text", text: "a" },
            { type: "text", text: "b" },
          ],
        },
      ]),
    ).toBe("a b");
  });
});

describe("createForwarder", () => {
  it("openrouter: posts the full prefixed id with the key", async () => {
    const f = mockFetch({ ok: 1 });
    const fwd = createForwarder({
      mode: "openrouter",
      apiKey: "sk-or",
      fetch: f,
    });
    await fwd("anthropic/claude-opus-5", { messages: [] });
    expect(urlOf(f)).toContain("openrouter.ai/api/v1/chat/completions");
    expect(bodyOf(f)).toContain('"model":"anthropic/claude-opus-5"');
  });

  it("providers: posts the bare model name to the provider base URL", async () => {
    const f = mockFetch({ ok: 1 });
    const fwd = createForwarder({
      mode: "providers",
      providers: {
        anthropic: { baseURL: "https://api.anthropic.com/v1", apiKey: "sk-a" },
      },
      fetch: f,
    });
    await fwd("anthropic/claude-opus-5", { messages: [] });
    expect(urlOf(f)).toContain("api.anthropic.com/v1/chat/completions");
    expect(bodyOf(f)).toContain('"model":"claude-opus-5"');
  });

  it("providers: throws when no provider is configured", async () => {
    const fwd = createForwarder({
      mode: "providers",
      providers: {},
      fetch: mockFetch({}),
    });
    await expect(fwd("xai/grok-4.6", {})).rejects.toThrow(/provider/);
  });

  it("providers: throws on a model id without a provider prefix", async () => {
    const fwd = createForwarder({
      mode: "providers",
      providers: {
        anthropic: { baseURL: "https://api.anthropic.com/v1", apiKey: "sk-a" },
      },
      fetch: mockFetch({}),
    });
    await expect(fwd("just-a-model", {})).rejects.toThrow(/provider\/model/);
  });
});

describe("createGateway", () => {
  it("routes 'auto', forwards the chosen model, and attaches metadata", async () => {
    const f = mockFetch({
      id: "cmpl-1",
      choices: [{ message: { content: "hi" } }],
    });
    const gw = createGateway({
      embed: fakeEmbed,
      forward: { mode: "openrouter", apiKey: "sk-or", fetch: f },
    });
    const { data, meta } = await gw.chatCompletion({
      model: "auto",
      messages: [{ role: "user", content: "hello" }],
    });
    expect(meta.routed).toBe(true);
    expect(typeof meta.model).toBe("string");
    expect((data.orfora as { model: string }).model).toBe(meta.model);
    // The forwarded body carries the chosen model, never "auto".
    expect(bodyOf(f)).toContain(`"model":"${meta.model}"`);
    expect(bodyOf(f)).not.toContain('"model":"auto"');
  });

  it("pins an explicit model without routing", async () => {
    const f = mockFetch({ id: "cmpl-2", choices: [] });
    const gw = createGateway({
      embed: fakeEmbed,
      forward: { mode: "openrouter", apiKey: "sk-or", fetch: f },
    });
    const { meta } = await gw.chatCompletion({
      model: "anthropic/claude-opus-5",
      messages: [{ role: "user", content: "x" }],
    });
    expect(meta.routed).toBe(false);
    expect(meta.model).toBe("anthropic/claude-opus-5");
  });

  it("surfaces an upstream error", async () => {
    const f = mockFetch({ error: "bad" }, false, 502);
    const gw = createGateway({
      embed: fakeEmbed,
      forward: { mode: "openrouter", apiKey: "sk-or", fetch: f },
    });
    await expect(
      gw.chatCompletion({
        model: "auto",
        messages: [{ role: "user", content: "x" }],
      }),
    ).rejects.toThrow(/502/);
  });
});

const forward = { mode: "openrouter" as const, apiKey: "sk-or" };

describe("orforaHandler", () => {
  it("returns a JSON completion with x-orfora-* headers", async () => {
    const f = mockFetch({
      id: "c",
      choices: [{ message: { content: "hi" } }],
    });
    const handler = orforaHandler({
      embed: fakeEmbed,
      forward: { ...forward, fetch: f },
    });
    const res = await handler(
      new Request("http://x/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: "auto",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-orfora-model")).toBeTruthy();
    const json = (await res.json()) as Record<string, unknown>;
    expect((json.orfora as { routed: boolean }).routed).toBe(true);
  });

  it("passes a streaming request through as text/event-stream", async () => {
    const f = sseFetch(['{"choices":[{"delta":{"content":"a"}}]}']);
    const handler = orforaHandler({
      embed: fakeEmbed,
      forward: { ...forward, fetch: f },
    });
    const res = await handler(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          model: "auto",
          stream: true,
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-orfora-model")).toBeTruthy();
  });

  it("returns 400 on a bad body", async () => {
    const handler = orforaHandler({
      embed: fakeEmbed,
      forward: { ...forward, fetch: mockFetch({}) },
    });
    const res = await handler(
      new Request("http://x", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an unauthorized caller with 401 and never forwards", async () => {
    const f = mockFetch({ id: "c", choices: [] });
    const handler = orforaHandler({
      embed: fakeEmbed,
      forward: { ...forward, fetch: f },
      authorize: () => false,
    });
    const res = await handler(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          model: "auto",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(res.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it("rejects an oversized body with 413 and never forwards", async () => {
    const f = mockFetch({ id: "c", choices: [] });
    const handler = orforaHandler({
      embed: fakeEmbed,
      forward: { ...forward, fetch: f },
      maxBodyBytes: 32,
    });
    const res = await handler(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          model: "auto",
          messages: [{ role: "user", content: "x".repeat(1000) }],
        }),
      }),
    );
    expect(res.status).toBe(413);
    expect(f).not.toHaveBeenCalled();
  });

  it("does not reflect the upstream error body to the caller", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = mockFetch({ error: "SECRET_UPSTREAM_DETAIL" }, false, 502);
    const handler = orforaHandler({
      embed: fakeEmbed,
      forward: { ...forward, fetch: f },
    });
    const res = await handler(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          model: "auto",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("SECRET_UPSTREAM_DETAIL");
    warn.mockRestore();
  });

  it("rejects a pinned model outside allowedModels with 400", async () => {
    const f = mockFetch({ id: "c", choices: [] });
    const handler = orforaHandler({
      embed: fakeEmbed,
      forward: { ...forward, fetch: f },
      allowedModels: ["anthropic/claude-opus-5"],
    });
    const res = await handler(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          model: "openai/gpt-5.6-sol",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("createOrforaClient", () => {
  it("non-stream create returns the completion with orfora metadata", async () => {
    const f = mockFetch({
      id: "c",
      choices: [{ message: { content: "hi" } }],
    });
    const client = createOrforaClient({
      embed: fakeEmbed,
      forward: { ...forward, fetch: f },
    });
    const out = (await client.chat.completions.create({
      model: "auto",
      messages: [{ role: "user", content: "hi" }],
    })) as Record<string, unknown>;
    expect((out.orfora as { routed: boolean }).routed).toBe(true);
  });

  it("stream create yields chunks, the first tagged with metadata", async () => {
    const f = sseFetch([
      '{"choices":[{"delta":{"content":"a"}}]}',
      '{"choices":[{"delta":{"content":"b"}}]}',
    ]);
    const client = createOrforaClient({
      embed: fakeEmbed,
      forward: { ...forward, fetch: f },
    });
    const stream = (await client.chat.completions.create({
      model: "auto",
      stream: true,
      messages: [{ role: "user", content: "hi" }],
    })) as AsyncGenerator<Record<string, unknown>>;
    const chunks: Record<string, unknown>[] = [];
    for await (const c of stream) chunks.push(c);
    expect(chunks.length).toBe(2);
    expect(chunks[0]?.orfora).toBeTruthy();
    expect(chunks[1]?.orfora).toBeUndefined();
  });
});
