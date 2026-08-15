import { describe, expect, it, vi } from "vitest";
import { openaiEmbedder } from "./openai";

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

describe("openaiEmbedder", () => {
  it("returns vectors in input order regardless of API ordering", async () => {
    const fetchImpl = mockFetch({
      data: [
        { index: 1, embedding: [0.2] },
        { index: 0, embedding: [0.1] },
      ],
    });
    const embed = openaiEmbedder({ apiKey: "sk-test", fetch: fetchImpl });

    const out = await embed.embed(["a", "b"]);

    expect(out).toEqual([[0.1], [0.2]]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("throws with the status code on non-ok responses", async () => {
    const fetchImpl = mockFetch({ error: "unauthorized" }, false, 401);
    const embed = openaiEmbedder({ apiKey: "sk-test", fetch: fetchImpl });

    await expect(embed.embed(["a"])).rejects.toThrow(/401/);
  });

  it("requires an apiKey", () => {
    // @ts-expect-error apiKey intentionally missing
    expect(() => openaiEmbedder({})).toThrow(/apiKey/);
  });

  it("short-circuits on empty input without calling fetch", async () => {
    const fetchImpl = mockFetch({ data: [] });
    const embed = openaiEmbedder({ apiKey: "sk-test", fetch: fetchImpl });

    expect(await embed.embed([])).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
