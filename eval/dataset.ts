import type { LabeledExample } from "../src/evaluate";

/**
 * A labelled evaluation set, kept deliberately distinct from the default seeds so
 * the numbers reflect generalisation rather than memorisation. Domain-mixed and
 * labelled by intent shape.
 */
export const evalDataset: LabeledExample[] = [
  // simple: short factual, lookup, transform, single-step
  {
    input: "What is the boiling point of water at sea level?",
    expected: "simple",
  },
  { input: "Translate 'thank you' into Japanese.", expected: "simple" },
  { input: "How many days are in February 2028?", expected: "simple" },
  {
    input: "Capitalize the first letter of each word in this title.",
    expected: "simple",
  },
  { input: "What is 45 multiplied by 6?", expected: "simple" },
  { input: "Give me a synonym for 'quick'.", expected: "simple" },
  { input: "Convert 90 degrees Fahrenheit to Celsius.", expected: "simple" },
  { input: "What is the currency of Japan?", expected: "simple" },
  { input: "Rewrite this sentence in the past tense.", expected: "simple" },
  { input: "Round 3.14159 to two decimal places.", expected: "simple" },
  { input: "List the primary colours.", expected: "simple" },
  { input: "Shorten this tweet to under 100 characters.", expected: "simple" },
  { input: "What is the chemical symbol for gold?", expected: "simple" },
  { input: "Spell 'accommodate' correctly.", expected: "simple" },
  { input: "How do you say 'good night' in Italian?", expected: "simple" },
  { input: "What is the square root of 144?", expected: "simple" },
  { input: "Give the plural of 'cactus'.", expected: "simple" },
  { input: "What is the capital of Canada?", expected: "simple" },
  {
    input: "Extract the email address from this line of text.",
    expected: "simple",
  },
  { input: "Convert this date to ISO 8601 format.", expected: "simple" },

  // complex: multi-step reasoning, design, analysis, proof
  {
    input:
      "Design a leader-election protocol and explain how it handles network partitions.",
    expected: "complex",
  },
  {
    input:
      "Analyse the pros and cons of event sourcing for an order-management system.",
    expected: "complex",
  },
  {
    input: "Prove that there are infinitely many prime numbers.",
    expected: "complex",
  },
  {
    input: "Diagnose why this memory usage grows over time and suggest a fix.",
    expected: "complex",
  },
  {
    input:
      "Write a strategy to migrate a monolith to microservices with zero downtime.",
    expected: "complex",
  },
  {
    input: "Explain how gradient descent converges and when it fails.",
    expected: "complex",
  },
  {
    input:
      "Compare optimistic and pessimistic locking and recommend one for high contention.",
    expected: "complex",
  },
  {
    input:
      "Refactor this component to separate business logic from rendering, and justify it.",
    expected: "complex",
  },
  {
    input:
      "Outline a threat model for a multi-tenant SaaS handling payment data.",
    expected: "complex",
  },
  {
    input:
      "Derive the time complexity of this recursive function step by step.",
    expected: "complex",
  },
  {
    input:
      "Propose an A/B test for a new onboarding flow, including metrics and pitfalls.",
    expected: "complex",
  },
  {
    input:
      "Explain the trade-offs between eventual and strong consistency for a shopping cart.",
    expected: "complex",
  },
  {
    input: "Plan a rollback strategy for a failed database schema migration.",
    expected: "complex",
  },
  {
    input: "Critique this API design and suggest a more RESTful alternative.",
    expected: "complex",
  },
  {
    input:
      "Reason about whether we should build or buy an authentication system.",
    expected: "complex",
  },
  {
    input:
      "Explain why this SQL query is slow and rewrite it with proper indexing.",
    expected: "complex",
  },
  {
    input:
      "Design a rate-limiting algorithm that is fair across tenants and justify it.",
    expected: "complex",
  },
  {
    input:
      "Walk through how you would debug an intermittent production-only failure.",
    expected: "complex",
  },
  {
    input:
      "Summarise the trade-offs of three state-management approaches and recommend one.",
    expected: "complex",
  },
  {
    input:
      "Analyse the security implications of storing JWTs in local storage versus cookies.",
    expected: "complex",
  },
];
