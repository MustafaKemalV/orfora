import { describe, expect, it, vi } from "vitest";
import { openrouterEmbedder, openrouterHandlers } from "./openrouter";
import type { RouteInput } from "./types";

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

/** Indexed handler access is `T | undefined` under strict indexing; narrow it. */
const asHandler = (h: ((i: RouteInput) => Promise<string>) | undefined) =>
  h as (i: RouteInput) => Promise<string>;

describe("openrouterHandlers", () => {
  it("calls OpenRouter chat completions and returns the message content", async () => {
    const fetchImpl = mockFetch({
      choices: [{ message: { content: "hello" } }],
    });
    const handlers = openrouterHandlers({
      apiKey: "sk-or",
      fetch: fetchImpl,
      models: ["anthropic/claude-opus-5"],
    });

    const out = await asHandler(handlers["anthropic/claude-opus-5"])({
      prompt: "hi",
    });

    expect(out).toBe("hello");
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("openrouter.ai/api/v1/chat/completions"),
      expect.objectContaining({
        body: expect.stringContaining('"model":"anthropic/claude-opus-5"'),
      }),
    );
  });

  it("defaults to a handler for every catalog model", () => {
    const handlers = openrouterHandlers({
      apiKey: "sk-or",
      fetch: mockFetch({}),
    });
    expect(handlers["anthropic/claude-opus-5"]).toBeTypeOf("function");
    expect(handlers["perplexity/sonar-pro"]).toBeTypeOf("function");
    expect(Object.keys(handlers).length).toBeGreaterThanOrEqual(50);
  });

  it("throws with the status code on non-ok responses", async () => {
    const fetchImpl = mockFetch({ error: "nope" }, false, 402);
    const handlers = openrouterHandlers({
      apiKey: "sk-or",
      fetch: fetchImpl,
      models: ["m"],
    });
    await expect(asHandler(handlers.m)({ prompt: "hi" })).rejects.toThrow(
      /402/,
    );
  });

  it("requires an apiKey", () => {
    // @ts-expect-error apiKey intentionally missing
    expect(() => openrouterHandlers({ fetch: mockFetch({}) })).toThrow(
      /apiKey/,
    );
  });
});

describe("openrouterEmbedder", () => {
  it("embeds through the OpenRouter base URL", async () => {
    const fetchImpl = mockFetch({ data: [{ index: 0, embedding: [0.5] }] });
    const embed = openrouterEmbedder({ apiKey: "sk-or", fetch: fetchImpl });

    const out = await embed.embed(["x"]);

    expect(out).toEqual([[0.5]]);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("openrouter.ai"),
      expect.anything(),
    );
  });
});
