import type { CatalogLabeledExample } from "../src/evaluate";

/**
 * A harder, adversarial set: ambiguous capability boundaries, out-of-distribution
 * junk, non-English prompts, multi-intent requests, short-but-hard vs long-but-easy
 * tiers, and freshness edges. Labels are the most defensible reading; genuinely
 * ambiguous or junk prompts are labelled general_qa, which is the safe fall-open
 * target, so a router that abstains to general on them is scored correct.
 */
export const adversarialDataset: CatalogLabeledExample[] = [
  // Ambiguous capability boundaries
  {
    input: "Summarize what this Python script does in plain English.",
    capability: "general_qa",
    tier: "cheap",
  },
  {
    input: "Total this receipt and write a one-line summary of the purchase.",
    capability: "general_qa",
    tier: "mid",
  },
  {
    input:
      "Why does this JavaScript error message appear, and how do I fix it?",
    capability: "code",
    tier: "mid",
  },
  {
    input: "Is this regex correct for matching emails, and why or why not?",
    capability: "code",
    tier: "mid",
  },
  {
    input: "Write a haiku about recursion.",
    capability: "creative_writing",
    tier: "cheap",
  },
  {
    input: "What is the Big-O complexity of bubble sort, and why?",
    capability: "math_reasoning",
    tier: "mid",
  },

  // Out-of-distribution / junk (abstention should send these to general)
  { input: "asdf qwerty zxcv hjkl", capability: "general_qa", tier: "cheap" },
  { input: "vibe check", capability: "general_qa", tier: "cheap" },
  { input: "ok", capability: "general_qa", tier: "cheap" },

  // Non-English
  {
    input: "Bu fonksiyondaki hatayi bul ve duzelt.",
    capability: "code",
    tier: "mid",
  },
  {
    input: "Ecris un court poeme sur la mer au coucher du soleil.",
    capability: "creative_writing",
    tier: "cheap",
  },
  {
    input: "Cual es la capital de Francia?",
    capability: "general_qa",
    tier: "cheap",
  },

  // Multi-intent (primary intent labelled)
  {
    input:
      "Fix this null-pointer bug, then write short release notes for the fix.",
    capability: "code",
    tier: "mid",
  },
  {
    input:
      "Compare React and Vue and recommend one for a beginner, with reasons.",
    capability: "general_qa",
    tier: "mid",
  },

  // Tricky tier: short-but-hard vs long-but-trivial
  {
    input: "Prove that the halting problem is undecidable.",
    capability: "math_reasoning",
    tier: "premium",
  },
  {
    input: "Is 17 a prime number?",
    capability: "math_reasoning",
    tier: "cheap",
  },
  {
    input:
      "Please, if you would be so kind, could you possibly tell me, whenever it is convenient for you, what the capital city of the nation of Japan happens to be?",
    capability: "general_qa",
    tier: "cheap",
  },

  // Freshness edges
  {
    input: "What is the latest stable version of Node.js right now?",
    capability: "live_web_search",
    tier: "cheap",
  },
  {
    input: "What were the biggest technology IPOs in the news last month?",
    capability: "live_web_search",
    tier: "mid",
  },
];
