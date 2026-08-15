/**
 * Built-in default seeds for the common two-tier complexity case, so orfora
 * works with zero hand-written examples.
 *
 * Chosen by INTENT SHAPE, not subject, so they generalise across domains: short
 * factual / lookup / transform requests read as "simple"; multi-step reasoning,
 * design, and analysis read as "complex". Override them any time with your own.
 */
export const defaultSeeds: { simple: string[]; complex: string[] } = {
  simple: [
    "What time is it in Tokyo?",
    "Translate 'good morning' into Spanish.",
    "What is the capital of Australia?",
    "Convert 10 kilometres to miles.",
    "Fix the grammar in this sentence.",
    "What is 15% of 240?",
    "Summarise this paragraph in one line.",
    "List three synonyms for 'happy'.",
  ],
  complex: [
    "Design a scalable rate limiter for a distributed API and justify the trade-offs.",
    "Analyse whether we should choose microservices or a monolith for our use case.",
    "Prove that the square root of 2 is irrational.",
    "Debug why this async race condition happens and propose a fix.",
    "Draft a go-to-market strategy for a B2B SaaS product.",
    "Explain the implications of the CAP theorem for our database choice.",
    "Refactor this module to reduce coupling and explain your reasoning.",
    "Compare three caching strategies and recommend one with justification.",
  ],
};
