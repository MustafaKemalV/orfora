import { describe, expect, it } from "vitest";
import { checkSignals } from "./signals";

describe("checkSignals", () => {
  it("does nothing without a signal config", () => {
    expect(checkSignals("hello", undefined).escalate).toBe(false);
  });

  it("escalates when the prompt exceeds maxChars", () => {
    const res = checkSignals("x".repeat(50), { maxChars: 20 });
    expect(res.escalate).toBe(true);
    expect(res.reason).toBe("signal:length");
  });

  it("does not escalate under maxChars", () => {
    expect(checkSignals("short", { maxChars: 20 }).escalate).toBe(false);
  });

  it("escalates on multiple questions when multiIntent is on", () => {
    const res = checkSignals("What is X? And how does Y work?", {
      multiIntent: true,
    });
    expect(res.escalate).toBe(true);
    expect(res.reason).toBe("signal:multi-intent");
  });

  it("escalates on an enumerated list when multiIntent is on", () => {
    const res = checkSignals("Do this:\n1. foo\n2. bar", { multiIntent: true });
    expect(res.escalate).toBe(true);
  });

  it("ignores multi-intent when the flag is off", () => {
    expect(checkSignals("What? Why?", {}).escalate).toBe(false);
  });
});
