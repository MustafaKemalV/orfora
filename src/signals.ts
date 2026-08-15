import type { SignalConfig } from "./types";

export interface SignalResult {
  escalate: boolean;
  reason?: string;
}

/**
 * Deterministic checks that run before any embedding. When one fires, orfora
 * escalates straight to the fallback (strong) route and skips the embedding call
 * — both a safety guard and a cost saving.
 */
export function checkSignals(
  prompt: string,
  signals: SignalConfig | undefined,
): SignalResult {
  if (!signals) return { escalate: false };

  if (signals.maxChars !== undefined && prompt.length > signals.maxChars) {
    return { escalate: true, reason: "signal:length" };
  }

  if (signals.multiIntent && looksMultiIntent(prompt)) {
    return { escalate: true, reason: "signal:multi-intent" };
  }

  return { escalate: false };
}

/**
 * Coarse multi-intent heuristic — intentionally simple and tunable: two or more
 * questions, or an enumerated/bulleted list of two or more items. It is a guard,
 * not a parser; when unsure it does nothing and lets the semantic router decide.
 */
function looksMultiIntent(prompt: string): boolean {
  const questions = (prompt.match(/\?/g) ?? []).length;
  if (questions >= 2) return true;

  const listItems = (prompt.match(/(^|\n)\s*(\d+[.)]|[-*])\s+/g) ?? []).length;
  return listItems >= 2;
}
