import { describe, expect, it } from "vitest";
import { createRouter } from "./router";
import type { EmbeddingProvider } from "./types";

// A no-op embedding backend: the skeleton never calls it yet, but requiring it
// here keeps the test honest about the real API shape.
const stubEmbed: EmbeddingProvider = {
  embed: async (texts) => texts.map(() => [0, 0, 0]),
};

describe("createRouter (skeleton)", () => {
  it("fails open to the strong (complex) tier", async () => {
    const router = createRouter({
      tiers: { simple: "gpt-4o-mini", complex: "gpt-4o" },
      embed: stubEmbed,
    });

    const result = await router.route("Summarize this paragraph in one line.");

    expect(result.tier).toBe("complex");
    expect(result.model).toBe("gpt-4o");
  });

  it("throws when a tier model is missing", () => {
    expect(() =>
      // @ts-expect-error — 'complex' is intentionally omitted
      createRouter({ tiers: { simple: "gpt-4o-mini" }, embed: stubEmbed }),
    ).toThrow(/tiers/);
  });
});
