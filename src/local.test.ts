import { describe, expect, it } from "vitest";
import { localEmbedder } from "./local";

describe("localEmbedder", () => {
  it("returns [] for empty input without loading a model", async () => {
    const embed = localEmbedder();
    expect(await embed.embed([])).toEqual([]);
  });
});
