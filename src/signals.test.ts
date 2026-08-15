import { describe, expect, it } from "vitest";
import { checkSignals } from "./signals";

describe("checkSignals", () => {
  it("does nothing without a signal config", () => {
    expect(checkSignals({ prompt: "hello" }, undefined).type).toBe("none");
  });

  it("escalates when the prompt exceeds maxChars", () => {
    const res = checkSignals({ prompt: "x".repeat(50) }, { maxChars: 20 });
    expect(res).toEqual({ type: "escalate", reason: "signal:length" });
  });

  it("does not escalate under maxChars", () => {
    expect(checkSignals({ prompt: "short" }, { maxChars: 20 }).type).toBe(
      "none",
    );
  });

  it("escalates on multiple questions when multiIntent is on", () => {
    const res = checkSignals(
      { prompt: "What is X? And how does Y work?" },
      { multiIntent: true },
    );
    expect(res).toEqual({ type: "escalate", reason: "signal:multi-intent" });
  });

  it("routes by modality, with the richest modality winning", () => {
    const res = checkSignals(
      { prompt: "summarise", attachments: ["photo.png", "clip.mp4"] },
      { onModality: { image: "vision", video: "video-model" } },
    );
    expect(res).toEqual({
      type: "route",
      route: "video-model",
      reason: "signal:modality:video",
    });
  });

  it("matches modality keys flexibly (an extension key matches a MIME attachment)", () => {
    const res = checkSignals(
      { prompt: "x", attachments: ["image/png"] },
      { onModality: { jpeg: "img-route" } },
    );
    expect(res).toEqual({
      type: "route",
      route: "img-route",
      reason: "signal:modality:image",
    });
  });

  it("falls back to onAttachment when no modality mapping matches", () => {
    const res = checkSignals(
      { prompt: "x", attachments: ["mystery.xyz"] },
      { onModality: { video: "v" }, onAttachment: "multimodal" },
    );
    expect(res).toEqual({
      type: "route",
      route: "multimodal",
      reason: "signal:attachment",
    });
  });

  it("prioritises modality routing over text escalation", () => {
    const res = checkSignals(
      { prompt: "x".repeat(999), attachments: ["clip.mp4"] },
      { maxChars: 10, onModality: { video: "v" } },
    );
    expect(res).toEqual({
      type: "route",
      route: "v",
      reason: "signal:modality:video",
    });
  });
});
