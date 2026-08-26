import { describe, expect, it, vi } from "vitest";
import { createForwarder, createGateway, routingText } from "./gateway";
import type { EmbeddingProvider } from "./types";

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
