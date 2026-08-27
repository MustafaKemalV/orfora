import { describe, expect, it } from "vitest";
import { capabilities } from "./catalog";
import { capabilityRelevance, fitness, type ModelVector } from "./modelVector";

const base: ModelVector = {
  id: "test/model",
  family: "Test",
  modelClass: "chat",
  priceTier: "mid",
  pricePerMTokens: 5,
  context: 200000,
  imageIn: true,
  audioIn: false,
  videoIn: false,
  toolsSupported: true,
  hasWebSearch: false,
  scores: {},
};

describe("capabilityRelevance", () => {
  it("covers every capability and weights each sum to 1", () => {
    expect(Object.keys(capabilityRelevance).sort()).toEqual(
      [...capabilities].sort(),
    );
    for (const cap of capabilities) {
      const total = Object.values(capabilityRelevance[cap]).reduce(
        (a, b) => a + b,
        0,
      );
      expect(total).toBeCloseTo(1);
    }
  });
});

describe("fitness", () => {
  it("computes the relevance-weighted score when all dims are present", () => {
    const model: ModelVector = {
      ...base,
      scores: {
        code_agentic: 1,
        code_snippet: 1,
        instruction_following: 1,
        tool_use: 1,
      },
    };
    expect(fitness(model, "code")).toBeCloseTo(1);
  });

  it("shrinks a thin profile toward the prior by axis coverage", () => {
    // Only code_agentic present (1 of code's 4 relevant axes) at 1.0; coverage is 1/4,
    // so fitness = 0.25*1 + 0.75*0.5 = 0.625. One measured axis cannot claim a top score.
    const model: ModelVector = { ...base, scores: { code_agentic: 1 } };
    expect(fitness(model, "code")).toBeCloseTo(0.625);
  });

  it("does not let a sparse high-axis model beat a fuller lower one", () => {
    const sparse: ModelVector = { ...base, scores: { code_agentic: 1 } };
    const full: ModelVector = {
      ...base,
      scores: {
        code_agentic: 0.85,
        code_snippet: 0.85,
        instruction_following: 0.85,
        tool_use: 0.85,
      },
    };
    expect(fitness(full, "code") ?? 0).toBeGreaterThan(
      fitness(sparse, "code") ?? 0,
    );
  });

  it("returns null when no relevant score is available", () => {
    const model: ModelVector = { ...base, scores: { creative_writing: 0.9 } };
    expect(fitness(model, "code")).toBeNull();
  });

  it("weights the relevant dims correctly on a mixed model", () => {
    // math_reasoning: math_reasoning 0.8 * 0.9 + general_knowledge 0.2 * 0.4 = 0.8.
    const model: ModelVector = {
      ...base,
      scores: { math_reasoning: 0.9, general_knowledge: 0.4 },
    };
    expect(fitness(model, "math_reasoning")).toBeCloseTo(0.8);
  });

  it("requires the PRIMARY axis: no neutral-prior credit for an unmeasured primary", () => {
    // Strong on tool_use but NO code axis: it must not win a code request off the 0.6
    // neutral prior on code_agentic. A measured-but-weaker coder still scores.
    const toolOnly: ModelVector = {
      ...base,
      scores: { tool_use: 1, instruction_following: 1 },
    };
    expect(fitness(toolOnly, "code")).toBeNull();
    const weakCoder: ModelVector = { ...base, scores: { code_agentic: 0.4 } };
    expect(fitness(weakCoder, "code") ?? 0).toBeGreaterThan(0);
  });
});
