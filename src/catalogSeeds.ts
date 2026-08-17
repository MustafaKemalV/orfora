/**
 * Seed examples for the catalog router's two axes.
 *
 * `capabilitySeeds` drives the semantic CAPABILITY axis (what kind of task).
 * `tierSeeds` drives the COMPLEXITY axis (how strong a model the request warrants).
 * The two are orthogonal: a request has both a capability and a tier, so a prompt
 * may sit near a capability seed AND a tier seed at once. That is expected.
 *
 * Seeds are TASK-TYPE examples, kept difficulty-agnostic (difficulty is the tier
 * axis), and scoped to stay separable from each other, so a request lands in one
 * capability, not between two. Override any of them with your own labelled traffic.
 */

import type { Capability } from "./catalog";

/** Representative requests for each semantic capability. */
export const capabilitySeeds: Record<Capability, string[]> = {
  // Programming intent: produce, debug, or transform code. Distinct code tokens.
  code: [
    "Write a Python function that removes duplicate entries from a list while preserving order.",
    "Why does this JavaScript code throw 'undefined is not a function' when I call the callback?",
    "Add a loading spinner to this React component while the fetch request is pending.",
    "Convert this for-loop into a list comprehension in Python.",
    "Write a SQL query that returns the top five customers by total order value.",
    "Fix the off-by-one error in this loop that skips the last array element.",
    "Write a unit test in Jest for this function that validates email addresses.",
    "Refactor this callback-based Node function to use async/await instead.",
    "Add type annotations to this TypeScript function so it stops complaining about implicit any.",
    "Write a regular expression that matches a valid US phone number.",
    "Implement a debounce wrapper in vanilla JavaScript for a search input handler.",
    "Update this Dockerfile so the Node dependencies are cached in a separate layer.",
  ],
  // Symbolic / quantitative work with an explicit chain: math, proofs, logic.
  math_reasoning: [
    "Solve for x in the equation 3x + 7 = 22.",
    "Compute the derivative of f(x) = x^3 - 5x^2 + 2x.",
    "Evaluate the integral of 2x + 4 from 0 to 3.",
    "What is the probability of rolling a sum of 8 with two dice?",
    "Simplify the expression (4a^2 b) / (2ab).",
    "Solve the system of equations 2x + y = 10 and x - y = 2.",
    "Prove that the square root of 2 is irrational.",
    "Find all real solutions of x^4 - 5x^2 + 4 = 0 and show your steps.",
    "If all roses are flowers and some flowers fade quickly, can we conclude that some roses fade quickly?",
    "Given these three clues about who sat where at dinner, work out the seating order.",
    "Deduce who is lying if exactly one of these three statements must be false.",
    "Derive the time complexity of this recursive algorithm step by step.",
  ],
  // Expressive generation and persona work. Style and voice, not facts.
  creative_writing: [
    "Write a short story about a lighthouse keeper who discovers a message in a bottle.",
    "Compose a heartfelt wedding toast for my younger sister.",
    "Write a catchy tagline for a new eco-friendly water bottle brand.",
    "Write a poem about autumn leaves falling in an empty park.",
    "Turn these bullet points into a flowing product description for our online store.",
    "Write an engaging opening paragraph for a blog post about morning routines.",
    "Draft a launch tagline and three ad variations for a productivity app.",
    "Write a LinkedIn post announcing that I just finished a coding bootcamp.",
    "Stay in character as a gruff medieval blacksmith and answer my apprentice's questions.",
    "Roleplay as a film-noir detective narrating my morning commute.",
    "Write a dialogue between two rival wizards arguing over a spell.",
    "Continue this fantasy story where the hero enters the haunted forest.",
  ],
  // Needs current, post-cutoff information: freshness markers dominate.
  live_web_search: [
    "What are the top headlines about the EU AI Act right now?",
    "What's the current USD to EUR exchange rate today?",
    "Did the latest iPhone ship yet, and what's its starting price?",
    "What's the weather in Berlin this weekend?",
    "Who won the game last night?",
    "Find recent news about interest rate changes this month.",
    "What is the current price of Bitcoin?",
    "What are the most recent job postings for React developers in Germany?",
    "Summarize what changed in the newest OpenAI announcement this week.",
    "What are today's top trending topics on tech news sites?",
    "Look up the current status of the rocket launch scheduled for today.",
    "What are the latest reviews of the newest Framework laptop?",
  ],
  // The fail-open default: everyday Q&A plus input-dominated summarize / extract /
  // classify and short transactional writing, which do not earn their own routes.
  general_qa: [
    "Who wrote the novel Frankenstein?",
    "What is the boiling point of water at sea level?",
    "When did the Berlin Wall fall?",
    "Which planet is the largest in our solar system?",
    "What is the currency used in Japan?",
    "Summarize this three-paragraph email into two bullet points.",
    "Extract the names and dates mentioned in this text.",
    "Is the tone of this customer review positive or negative?",
    "Write a polite follow-up email to a client who hasn't replied in two weeks.",
    "Rewrite this paragraph to sound more formal and professional.",
    "Explain how compound interest works in simple terms.",
    "What does the acronym NASA stand for?",
  ],
};

/**
 * Complexity-tier seeds for the orthogonal difficulty axis. Cheap = trivial /
 * lookup, mid = moderate multi-step, premium = hard design / proof / deep analysis.
 * Kept across mixed domains so tier is read from difficulty, not from task type.
 */
export const tierSeeds: { cheap: string[]; mid: string[]; premium: string[] } =
  {
    cheap: [
      "What is the capital of Norway?",
      "Convert 5 kilometres to miles.",
      "Translate 'thank you' into German.",
      "Fix the spelling in this sentence.",
      "What is 20% of 150?",
      "List three synonyms for 'big'.",
      "What day of the week is 1 January 2027?",
      "Give the chemical symbol for iron.",
      "Round 7.86 to the nearest whole number.",
      "Summarise this paragraph in one sentence.",
    ],
    mid: [
      "Write a polite email declining a meeting and suggesting another time.",
      "Explain how compound interest works with a simple example.",
      "Turn these bullet points into a short blog intro.",
      "Compare two phone plans and tell me which is cheaper for my usage.",
      "Debug why this loop prints the wrong count and fix it.",
      "Plan a three-day itinerary for a weekend trip to Lisbon.",
      "Summarise this article and pull out the three main takeaways.",
      "Rewrite this paragraph to sound more formal for a report.",
      "Walk me through solving this two-variable equation step by step.",
      "Suggest a weekly meal plan that stays under a set calorie budget.",
    ],
    premium: [
      "Design a fault-tolerant payment system and justify the trade-offs.",
      "Prove that there are infinitely many prime numbers.",
      "Analyse whether we should migrate our monolith to microservices.",
      "Diagnose this intermittent production failure and propose a fix.",
      "Draft a go-to-market strategy for a B2B SaaS launch.",
      "Derive the time complexity of this recursive algorithm step by step.",
      "Critique this research method and suggest a stronger experimental design.",
      "Model the long-term financial impact of three pricing strategies and recommend one.",
      "Explain the CAP theorem's implications for our database architecture.",
      "Outline a threat model for a multi-tenant app handling medical records.",
    ],
  };
