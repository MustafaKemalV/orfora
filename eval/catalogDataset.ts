import type { CatalogLabeledExample } from "../src/evaluate";

/**
 * A labelled set for the catalog router, kept distinct from the seeds so the
 * numbers reflect generalisation. Each example carries both axes: the expected
 * capability and the expected tier (by difficulty). Domain-mixed on purpose.
 */
export const catalogDataset: CatalogLabeledExample[] = [
  // code
  {
    input: "Rename the variable `x` to `count` throughout this snippet.",
    capability: "code",
    tier: "cheap",
  },
  {
    input: "Add a trailing semicolon to each statement in this code.",
    capability: "code",
    tier: "cheap",
  },
  {
    input: "Write a shell command to find and delete files older than 30 days.",
    capability: "code",
    tier: "cheap",
  },
  {
    input:
      "Write a function that merges two sorted arrays into one sorted array.",
    capability: "code",
    tier: "mid",
  },
  {
    input:
      "Debug why this fetch call resolves to undefined instead of the parsed JSON.",
    capability: "code",
    tier: "mid",
  },
  {
    input: "Convert this Python script to use type hints throughout.",
    capability: "code",
    tier: "mid",
  },
  {
    input:
      "Design and implement a thread-safe LRU cache with O(1) get and put.",
    capability: "code",
    tier: "premium",
  },
  {
    input:
      "Architect a plugin loader with hot-reload for this app and implement it.",
    capability: "code",
    tier: "premium",
  },

  // math_reasoning
  { input: "What is 7 times 8?", capability: "math_reasoning", tier: "cheap" },
  { input: "What is 30% of 90?", capability: "math_reasoning", tier: "cheap" },
  {
    input: "Round 12.7 to the nearest whole number.",
    capability: "math_reasoning",
    tier: "cheap",
  },
  {
    input: "Solve for x: 5x - 3 = 2x + 9.",
    capability: "math_reasoning",
    tier: "mid",
  },
  {
    input:
      "A shirt costs 40 dollars after a 20% discount; what was the original price?",
    capability: "math_reasoning",
    tier: "mid",
  },
  {
    input: "How many distinct arrangements are there of the letters in LEVEL?",
    capability: "math_reasoning",
    tier: "mid",
  },
  {
    input:
      "Prove by induction that the sum of the first n odd numbers is n squared.",
    capability: "math_reasoning",
    tier: "premium",
  },
  {
    input:
      "Solve this five-house logic puzzle from the clues and say who owns the fish.",
    capability: "math_reasoning",
    tier: "premium",
  },

  // creative_writing
  {
    input: "Write a two-line birthday rhyme for my dad.",
    capability: "creative_writing",
    tier: "cheap",
  },
  {
    input: "Suggest a fun, punny name for a coffee shop.",
    capability: "creative_writing",
    tier: "cheap",
  },
  {
    input: "Give me a catchy name for a lemonade stand.",
    capability: "creative_writing",
    tier: "cheap",
  },
  {
    input: "Write a 150-word brand story for a handmade leather wallet.",
    capability: "creative_writing",
    tier: "mid",
  },
  {
    input: "Write a short, upbeat tagline and two variations for a plant shop.",
    capability: "creative_writing",
    tier: "mid",
  },
  {
    input:
      "Write the opening of a mystery novel set on a night train, about 400 words.",
    capability: "creative_writing",
    tier: "premium",
  },
  {
    input: "Compose a three-verse sea-shanty-style poem about a lost sailor.",
    capability: "creative_writing",
    tier: "premium",
  },
  {
    input: "Write a heartfelt 300-word eulogy for a beloved teacher.",
    capability: "creative_writing",
    tier: "premium",
  },

  // live_web_search
  {
    input: "What's the weather in Riga today?",
    capability: "live_web_search",
    tier: "cheap",
  },
  {
    input: "What time does the sun set in Berlin today?",
    capability: "live_web_search",
    tier: "cheap",
  },
  {
    input: "What is the current price of gold today?",
    capability: "live_web_search",
    tier: "cheap",
  },
  {
    input: "Summarize the latest news on the euro exchange rate this week.",
    capability: "live_web_search",
    tier: "mid",
  },
  {
    input: "Which movies are trending on streaming right now?",
    capability: "live_web_search",
    tier: "mid",
  },
  {
    input:
      "What are the current top-rated laptops under 1000 dollars right now?",
    capability: "live_web_search",
    tier: "mid",
  },
  {
    input:
      "Research the latest solid-state battery developments and cite recent sources.",
    capability: "live_web_search",
    tier: "premium",
  },
  {
    input:
      "Find and compare the newest flagship phones released this month with current prices.",
    capability: "live_web_search",
    tier: "premium",
  },

  // general_qa
  {
    input: "What is the largest ocean on Earth?",
    capability: "general_qa",
    tier: "cheap",
  },
  {
    input: "Who painted the ceiling of the Sistine Chapel?",
    capability: "general_qa",
    tier: "cheap",
  },
  {
    input: "How many continents are there?",
    capability: "general_qa",
    tier: "cheap",
  },
  {
    input:
      "Explain the difference between HTTP and HTTPS for a non-technical friend.",
    capability: "general_qa",
    tier: "mid",
  },
  {
    input:
      "Summarize this two-paragraph article and list the three key points.",
    capability: "general_qa",
    tier: "mid",
  },
  {
    input:
      "Rewrite this internal memo to sound more polished and professional.",
    capability: "general_qa",
    tier: "mid",
  },
  {
    input:
      "Explain the causes and consequences of the 2008 financial crisis in depth.",
    capability: "general_qa",
    tier: "premium",
  },
  {
    input:
      "Give a thorough explanation of how vaccines train the immune system.",
    capability: "general_qa",
    tier: "premium",
  },
];
