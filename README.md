# orfora

> Route each LLM request to the right-sized model. Cut cost, keep quality.

Most LLM apps send every request to one big model. But most requests do not need
it: a short rewrite, a classification, or a quick factual answer runs just as well
on a model that costs a fraction. **orfora** (*Optimal Routes For All*) looks at
each request and picks the model that actually fits it, so you stop overpaying for
the easy ones without giving up quality on the hard ones.

It decides by **meaning**, not by length. Length is a poor proxy: a two-line prompt
can need deep reasoning, and a long one can be a trivial reformat. orfora compares
each request to a handful of example prompts (yours, or the built-in defaults) and
routes to the closest match. The decision is pure math plus a small embedding, so
no extra LLM call is made just to route. It is fast (milliseconds) and cheap.

The guiding principle: route to the **most appropriate** model, not the cheapest
and not always the biggest. A trivial request goes to a small model, a genuinely
hard one goes to a strong model. Low cost is a consequence of good fit, not the goal.

orfora returns a *decision*, it does not sit in front of your model calls. There is
no proxy hop, no extra service to run, and no single point of failure.

> **Status: early development.** The core works and is covered by tests. The API
> may still change, and it is not published to npm yet.

## Install

```sh
npm install orfora
```

You also need an embedding backend. orfora ships three, or you can bring your own:

- `orfora/openai`, any OpenAI-compatible API.
- `orfora/local`, a small model on device via transformers.js, no API key.
- `orfora/openrouter`, one key that both embeds and reaches every model in the catalog.

## Quickstart: two-tier cost routing

The headline use case, with zero hand-written seeds: a cheap model for easy
requests, a strong model for the ones that actually need it.

```ts
import { complexityRouter } from "orfora";
import { openaiEmbedder } from "orfora/openai";

const router = complexityRouter({
  simple: "openai/gpt-5-nano",
  complex: "anthropic/claude-opus-5",
  embed: openaiEmbedder({ apiKey: process.env.OPENAI_API_KEY }),
});

const { model } = await router.route("Summarize this paragraph in one line.");
// model === "openai/gpt-5-nano"  (an easy request, so it takes the cheap model)

// orfora only decides which model. You make the call, with your own client.
```

## Route across many models: the catalog router

For real apps you usually want more than two models. `createCatalogRouter` decides
on two independent axes and maps the result to a concrete model:

- **Capability** (what kind of task): `code`, `math_reasoning`, `creative_writing`,
  `live_web_search`, `general_qa`.
- **Tier** (how strong a model it warrants): `cheap`, `mid`, `premium`, plus an
  opt-in `ultra` for the hardest code and reasoning.

It ships with a catalog of about fifty real models across the major families and a
default grid that maps each capability and tier to a best-fit model. Deterministic
signals run alongside the semantic match: an attachment routes to a vision model, a
very long prompt to a long-context model, freshness words ("today", "latest") to
live web search, and a multi-intent premium request escalates to `ultra`. Anything
unclear fails open to a capable general model.

Paired with `orfora/openrouter`, one key reaches every model in the catalog:

```ts
import { createCatalogRouter } from "orfora";
import { openrouterEmbedder, openrouterHandlers } from "orfora/openrouter";

const apiKey = process.env.OPENROUTER_API_KEY;

const router = createCatalogRouter({
  embed: openrouterEmbedder({ apiKey }),
  handlers: openrouterHandlers({ apiKey }),
});

const decision = await router.route("Refactor this module to remove the duplication.");
// decision.target === "code", tier by difficulty, decision.model a real coding model

const answer = await router.run("What is the USD to EUR rate today?");
// the freshness signal routes to live web search, then orfora calls the model for you
```

The catalog, the grid, and every seed set are just defaults. Pass your own `grid`,
`capabilitySeeds`, or `tierSeeds` to fit your traffic.

## Route by real benchmarks: the vector router

`createVectorRouter` goes one step further: instead of a hand-mapped grid, each model
carries a capability VECTOR scored from real published benchmarks (SWE-bench, GPQA,
IFEval, BFCL, LMArena Elo, and more). A request picks its capability by meaning, and
the router returns the CHEAPEST model whose relevance-weighted fitness for that
capability clears the bar, subject to hard gates (an image needs a vision-capable
model, live search needs a web-search model).

```ts
import { createVectorRouter } from "orfora";
import { openrouterEmbedder } from "orfora/openrouter";

const router = createVectorRouter({
  embed: openrouterEmbedder({ apiKey: process.env.OPENROUTER_API_KEY }),
});

const decision = await router.route("Fix the failing test in this module.");
// decision.capability === "code", decision.model = the cheapest model strong
// enough at coding, decision.fitness = its score for the request
```

It ships with a catalog of ~40 current (August 2026) models scored from LIVE, cited
benchmarks, one canonical benchmark per capability axis normalised to [0,1]. Because
vendors report different suites (SWE-bench Verified vs Pro, Terminal-Bench 2.0/2.1/3.0),
a score is a relative fitness proxy, not an absolute truth; `profileFrom` names the real
benchmark and source on every model. A missing score is left out (never guessed) and the
router degrades gracefully to a neutral prior and price-tier routing over the gap. If a
current model has no number of its own, one is carried forward from its family's latest
measured version, recorded in `profileFrom`.

## Beyond text: the generative branch

Not every request wants a text answer. `createMultimodalRouter` adds a second branch in
front of the chat router: it detects a request's OUTPUT modality (text, image, video,
speech, or music) from the same embedding, then either delegates text to the chat router
above, untouched, or matches a best-fit GENERATIVE model.

```ts
import { createMultimodalRouter } from "orfora";
import { openaiEmbedder } from "orfora/openai";

const router = createMultimodalRouter({
  embed: openaiEmbedder({ apiKey: process.env.OPENAI_API_KEY }),
});

await router.route("Refactor this module.");           // { modality: "text", ...chat decision }
await router.route("Design a poster with bold text."); // { modality: "image", model: "ideogram/ideogram-v3", ... }
await router.route("Read this paragraph aloud.");        // { modality: "speech", ... }
```

Output modality is orthogonal to the chat capability: it asks what the user wants
PRODUCED, not what task the text is. Describing an image to generate is image output; an
uploaded image would be an input gate instead. Detection reuses the capability seeds as
the "text" anchor and biases to text, so a normal request is never mis-sent to an image
generator. Within a modality the same right-fit rule applies: a specialty match
(typography to Ideogram, dialogue video to Veo, voice-clone to ElevenLabs), then a
draft-vs-final quality need, then the cheapest that fits. The generative catalog carries
~30 current image / video / speech / music models with live-sourced pricing, coarse
quality tiers, specialty tags, and a cited source per model.

## Custom routes

If you want full control, `createRouter` is the primitive underneath both wrappers.
Define any named routes you like, each with a model and a few seed examples:

```ts
import { createRouter } from "orfora";
import { openaiEmbedder } from "orfora/openai";

const router = createRouter({
  routes: {
    coding: { model: "anthropic/claude-opus-5", seeds: ["write a function that...", "fix this bug..."] },
    chat: { model: "openai/gpt-5.6-luna", seeds: ["hi", "what's the weather like"] },
    vision: { model: "google/gemini-3.7-flash", seeds: ["describe this image"] },
  },
  fallback: "chat",
  embed: openaiEmbedder({ apiKey: process.env.OPENAI_API_KEY }),
  signals: {
    maxChars: 4000, // very long prompts escalate to the fallback route
    multiIntent: true, // several questions or tasks escalate too
    onModality: { image: "vision", video: "vision" }, // attachments go to the right model
  },
});

const decision = await router.route({ prompt: "what's in this photo?", attachments: ["photo.png"] });
// decision.route === "vision", decision.reason === "signal:modality:image"
```

`openaiEmbedder` takes a `baseURL`, so it works with any OpenAI-compatible provider
(Together, OpenRouter, a local Ollama). Or bring your own embedder: any object with
`embed(texts: string[]): Promise<number[][]>` works.

## Let orfora call the model (optional)

By default orfora returns a decision and you make the call. If you would rather it
call the model for you, give it a handler per model and use `run()`. orfora still
never imports a provider SDK, it only calls the function you supply:

```ts
const router = createRouter({
  routes: {
    chat: { model: "openai/gpt-5.6-luna", seeds: ["hi", "what's the weather like"] },
    reasoning: { model: "anthropic/claude-opus-5", seeds: ["prove that...", "design a system that..."] },
  },
  fallback: "reasoning",
  embed: openaiEmbedder({ apiKey: process.env.OPENAI_API_KEY }),
  handlers: {
    "openai/gpt-5.6-luna": (input) => callModel("openai/gpt-5.6-luna", input.prompt),
    "anthropic/claude-opus-5": (input) => callModel("anthropic/claude-opus-5", input.prompt),
  },
});

const answer = await router.run("Summarize this in one line.");
```

With `orfora/openrouter` this is a one-liner: `openrouterHandlers({ apiKey })` builds
a handler for every catalog model, so `run()` decides and calls through your key.

## Tuning

- **Seeds.** A handful per route is enough to start, five to ten each. The closer
  they are to your real traffic, the better it routes. Override the defaults any
  time with your own labelled examples.
- **threshold.** The minimum confidence to trust a match. Leave it at `0` to always
  take the nearest route, or raise it to fall back to the strong model when unsure.
- **signals.** Deterministic guards that run before the embedding: escalate very
  long or multi-intent prompts, and send attachments to a model that can handle them.

## How it works

1. **Setup (once):** each route's seed examples are embedded to vectors.
2. **Per request:**
   - Deterministic signals run first (length, multi-intent, attachment modality,
     and in the catalog router also freshness and long-context). They can decide
     without any embedding, which is both a safety guard and a cost saving.
   - Otherwise the request is embedded once and compared (cosine similarity) to the
     nearest seed. The catalog router compares against the capability and tier seed
     banks at the same time, so the second axis costs no extra embedding.
   - If confidence is below `threshold`, or anything errors, orfora **fails open**
     to a capable model, so quality is never sacrificed on a bad guess.

It routes by task type and difficulty, not by subject, so it generalises across
domains.

## Does it actually route well?

On a 40-example labelled set for the two-tier complexity case (kept separate from
the seeds, embedded with `text-embedding-3-small`), orfora scored:

- **95% accuracy**
- **100% complex-recall**: it never sent a hard request to the cheap model
- **90% simple-recall**: it sent 18 of 20 easy requests to the cheap model
- **45% of requests routed to the cheap model**

Complex-recall is the number that matters most. orfora is built never to trade
quality for cost, and on this set it never did. Reproduce it with `npm run eval`
using your own OpenAI-compatible key.

For the vector router, on a 40-example main set plus a 19-example adversarial set
(ambiguous, out-of-distribution, non-English, multi-intent), with centroid capability
matching and out-of-distribution abstention:

- **97.5% capability accuracy** on the main set, **78.9%** on the adversarial set: the
  request's task type (code, reasoning, writing, live search, general) is picked
  correctly, and unclear or out-of-distribution inputs fall open to a general model
  instead of a confident wrong specialist.
- **Tier is the hard axis, so it is LEARNED from real outcomes, not hand-tuned.** Which
  strength tier a request warrants is fuzzy, and seed-based tiering barely beats chance
  on held-out data (35% on a balanced 3-tier set). An opt-in `tierPredictor`, a logistic
  regression over prompt embeddings trained on RouterBench (each prompt labelled with the
  cheapest tier that actually solved it), reaches **56% under 5-fold cross-validation** vs
  35% for the seeds and 33% majority. It is embedding-space specific, so it ships off by
  default and is enabled where the embedder matches (as in the playground).
- **Cost and quality, the right-fit lens** (not a cheap-ratio): routing each request to
  its best-fit model keeps about **96-98% of the quality of always using the top flagship,
  at roughly 6-8% of its cost**, because a task-tuned model often matches a pricey
  generalist on its own task while costing far less. Quality here is a benchmark-fitness
  proxy, not measured answer quality.

Reproduce with `npm run eval:catalog` or `npm run eval:vector`.

## Why orfora (vs LLM gateways)

orfora is not a gateway or proxy like LiteLLM or OpenRouter. It is a small decision
library, and that is the point:

- **No proxy in your request path.** No added latency on completions, and no single
  point of failure. orfora returns a decision, and your app calls the model.
- **No infrastructure.** `npm install`, runs in your process. No proxy, no Postgres,
  no Redis to operate.
- **No markup, your own keys.** orfora takes no cut and holds no credentials, so
  there is no central store of secrets to compromise.
- **Provider-agnostic and composable.** It returns a model id, so you can use it
  standalone or feed that decision into a gateway you already run.

It does one thing, pick the model. It is not a feature-for-feature gateway
replacement (no unified multi-provider API, no load balancing, no spend dashboards),
and it happily complements one. Its decision still costs one embedding call, so use
a local embedder if you want zero network.

## Playground

A no-key browser demo lives in `playground/` (it runs the local embedder in the
browser). Try it locally with `cd playground && npm install && npm run dev`.

## Roadmap

- Broader default seeds and domain presets (support bot, coding assistant, and so on)
- An optional multilingual capability preset (paired with a multilingual embedder)
- Auto-calibration that suggests thresholds from real traffic
- Optional feedback-based adjustment from real outcomes

## License

[MIT](./LICENSE)
