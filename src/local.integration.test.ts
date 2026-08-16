import { describe, expect, it } from "vitest";
import { localEmbedder } from "./local";
import { cosineSimilarity } from "./similarity";

// Opt-in: this downloads a real model, so it is skipped unless ORFORA_INTEGRATION
// is set (run it with `npm run test:integration`). It stays out of the fast suite.
const suite = process.env.ORFORA_INTEGRATION ? describe : describe.skip;

suite("localEmbedder (integration, downloads a real model)", () => {
  it("produces 384-dim vectors where similar text scores higher", async () => {
    const embed = localEmbedder();
    const [a, b, c] = await embed.embed([
      "How do I reset my password?",
      "I forgot my password, please help me log in.",
      "Design a distributed rate limiter with fair tenancy.",
    ]);
    if (!a || !b || !c) throw new Error("expected three embeddings");

    expect(a).toHaveLength(384);
    expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, c));
  }, 120_000);
});
