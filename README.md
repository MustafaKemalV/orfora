# orfora

> Route each LLM request to the right-sized model. Cut cost, keep quality.

Most LLM apps send every request to one big model. But most requests do not need
it: a short rewrite, a classification, or a quick factual answer runs just as well
on a model that costs a fraction. **orfora** (*Optimal Routes For All*) looks at
each request and picks the right-sized model for it, so you stop overpaying for
the easy ones without giving up quality on the hard ones.

It decides by **meaning**, not by length. Length is a poor proxy: a two-line
prompt can need deep reasoning, and a long one can be a trivial reformat. orfora
compares each request to a handful of example prompts you provide (or the built-in
defaults) and routes to the closest match. The decision is pure math plus a small
embedding, so no extra LLM call is made just to route. It is fast (milliseconds)
and adds negligible cost.

orfora returns a *decision*, it does not sit in front of your model calls. There
is no proxy hop, no extra service to run, and no single point of failure.

> **Status: early development.** The core works and is covered by tests. The API
> may still change, and it is not published to npm yet.

## Install

```sh
npm install orfora
```

You also need an embedding backend. orfora ships two, or you can bring your own:
`orfora/openai` (any OpenAI-compatible API) and `orfora/local` (runs a small model
on device via transformers.js, no API key).

## Quickstart

Two-tier cost routing, using the built-in seeds:

```ts
import { complexityRouter } from "orfora";
import { openaiEmbedder } from "orfora/openai";

const router = complexityRouter({
  simple: "gpt-4o-mini",
  complex: "gpt-4o",
  embed: openaiEmbedder({ apiKey: process.env.OPENAI_API_KEY }),
});

const { model } = await router.route("Summarize this paragraph in one line.");
// model === "gpt-4o-mini"  (an easy request, so it takes the cheap model)

// orfora only decides which model. You make the call, with your own client:
// const answer = await openai.chat.completions.create({ model, messages });
```

## Custom routes

Routing is not limited to simple and complex. Define any routes you like, and the
same engine handles capability routing (coding, writing, vision) across any
providers:

```ts
import { createRouter } from "orfora";
import { openaiEmbedder } from "orfora/openai";

const router = createRouter({
  routes: {
    coding: { model: "claude-3-5-sonnet", seeds: ["write a function that...", "fix this bug..."] },
    chat: { model: "gpt-4o-mini", seeds: ["hi", "what's the weather like"] },
    vision: { model: "gpt-4o", seeds: ["describe this image"] },
  },
  fallback: "chat",
  embed: openaiEmbedder({ apiKey: process.env.OPENAI_API_KEY }),
  signals: {
    maxChars: 4000, // very long prompts escalate to the fallback route
    multiIntent: true, // several questions or tasks escalate too
    onModality: { image: "vision", video: "vision" }, // attachments go to the right model
  },
});

const decision = await router.route({
  prompt: "what's in this photo?",
  attachments: ["photo.png"],
});
// decision.route === "vision", decision.reason === "signal:modality:image"
```

`openaiEmbedder` takes a `baseURL`, so it also works with any OpenAI-compatible
provider (Together, OpenRouter, a local Ollama). Or bring your own embedder: any
object with `embed(texts: string[]): Promise<number[][]>` works.

## Run the model too (optional)

By default orfora returns a decision and you make the call. If you would rather it
call the model for you, give it a handler per model and use `run()`. orfora still
never imports a provider SDK, it only calls the function you supply:

```ts
const router = createRouter({
  routes: {
    chat: { model: "gpt-4o-mini", seeds: ["hi", "what's the weather like"] },
    reasoning: { model: "gpt-4o", seeds: ["prove that...", "design a system that..."] },
  },
  fallback: "reasoning",
  embed: openaiEmbedder({ apiKey: process.env.OPENAI_API_KEY }),
  handlers: {
    "gpt-4o-mini": (input) => callModel("gpt-4o-mini", input.prompt),
    "gpt-4o": (input) => callModel("gpt-4o", input.prompt),
  },
});

const answer = await router.run("Summarize this in one line.");
// orfora picks the model, calls your handler for it, and returns its result.
```

## Tuning

A few knobs decide how aggressive the routing is:

- **Seeds.** A handful per route is enough to start, five to ten each. The closer
  they are to your real traffic, the better it routes. Override the defaults any
  time with your own labelled examples.
- **threshold.** The minimum confidence needed to trust a match. Leave it at `0`
  to always take the nearest route, or raise it to fall back to the strong model
  more often when the router is unsure.
- **signals.** Deterministic guards that run before the embedding: escalate very
  long or multi-intent prompts, and send attachments to a model that can handle
  them.

## How it works

1. **Setup (once):** each route's seed examples are embedded to vectors.
2. **Per request:**
   - Deterministic signals run first (length, multi-intent, attachment modality).
     They can decide without any embedding, which is both a safety guard and a
     cost saving.
   - Otherwise the request is embedded and compared (cosine similarity) to the
     nearest seed, and the closest route wins.
   - If confidence is below `threshold`, or anything errors, orfora **fails open**
     to the fallback (strong) route, so quality is never sacrificed on a bad guess.

It routes by task complexity and intent, not by subject, so it generalises across
domains.

## Does it actually route well?

On a 40-example labelled set (kept separate from the seeds, embedded with
`text-embedding-3-small`), orfora scored:

- **95% accuracy**
- **100% complex-recall**: it never sent a hard request to the cheap model
- **90% simple-recall**: it sent 18 of 20 easy requests to the cheap model
- **45% of requests routed to the cheap model**

Complex-recall is the number that matters most. orfora is built never to trade
quality for cost, and on this set it never did. Reproduce it with `npm run eval`
using your own OpenAI-compatible key.

## Why orfora (vs LLM gateways)

orfora is not a gateway or proxy like LiteLLM or OpenRouter. It is a small
decision library, and that is the point:

- **No proxy in your request path.** No added latency on completions, and no
  single point of failure. orfora returns a decision, and your app calls the model.
- **No infrastructure.** `npm install`, runs in your process. No proxy, no
  Postgres, no Redis to operate.
- **No markup, your own keys.** orfora takes no cut and holds no credentials, so
  there is no central store of secrets to compromise.
- **Provider-agnostic and composable.** It returns a model id, so you can use it
  standalone or feed that decision into a gateway you already run.

It does one thing, pick the model. It is not a feature-for-feature gateway
replacement (no unified multi-provider API, no load balancing, no spend
dashboards), and it happily complements one. Its decision still costs one
embedding call, so use a local embedder if you want zero network.

## Playground

A no-key browser demo lives in `playground/` (it runs the local embedder in the
browser). Try it locally with `cd playground && npm install && npm run dev`.

## Roadmap

- Broader default seeds and domain presets (support bot, coding assistant, and so on)
- Auto-calibration that suggests thresholds from real traffic
- More embedding backends
- Optional feedback-based adjustment from real outcomes

## License

[MIT](./LICENSE)
