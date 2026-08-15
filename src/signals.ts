import { type Modality, normalizeModality } from "./modality";
import type { RouteInput, SignalConfig } from "./types";

export type SignalDecision =
  | { type: "none" }
  | { type: "escalate"; reason: string }
  | { type: "route"; route: string; reason: string };

// Richer modalities win when several are present (a video + image request should
// go to the video route).
const MODALITY_PRIORITY: Modality[] = [
  "video",
  "image",
  "audio",
  "document",
  "other",
];

/**
 * Deterministic checks that run before any embedding. When one fires, orfora
 * either routes to a specific route (modality) or escalates to the fallback
 * (length / multi-intent) — in both cases skipping the embedding call.
 */
export function checkSignals(
  input: RouteInput,
  signals: SignalConfig | undefined,
): SignalDecision {
  if (!signals) return { type: "none" };

  // 1. Attachment / modality routing — most specific, so it goes first.
  const attachments = input.attachments ?? [];
  if (attachments.length > 0) {
    const present = new Set<Modality>(attachments.map(normalizeModality));

    if (signals.onModality) {
      // Normalise the user's keys too, so "video", "video/mp4" and "mp4" all map
      // to the same modality — no misses from formatting.
      const byModality = new Map<Modality, string>();
      for (const [key, target] of Object.entries(signals.onModality)) {
        const canon = normalizeModality(key);
        if (!byModality.has(canon)) byModality.set(canon, target);
      }
      for (const modality of MODALITY_PRIORITY) {
        if (present.has(modality)) {
          const target = byModality.get(modality);
          if (target) {
            return {
              type: "route",
              route: target,
              reason: `signal:modality:${modality}`,
            };
          }
        }
      }
    }

    if (signals.onAttachment) {
      return {
        type: "route",
        route: signals.onAttachment,
        reason: "signal:attachment",
      };
    }
  }

  // 2. Text escalation signals.
  if (
    signals.maxChars !== undefined &&
    input.prompt.length > signals.maxChars
  ) {
    return { type: "escalate", reason: "signal:length" };
  }
  if (signals.multiIntent && looksMultiIntent(input.prompt)) {
    return { type: "escalate", reason: "signal:multi-intent" };
  }

  return { type: "none" };
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
