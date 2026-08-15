# orfora

> Route each LLM request to the right-sized model. Cut cost, keep quality.

**orfora** (*Optimal Routes For All*) is a lightweight semantic router for LLM
apps. It sends each request to the right-sized model, a cheap model for trivial
requests and a strong one for the requests that actually need reasoning, decided
by **meaning** rather than by message length.

The decision is pure math plus a small embedding, so no extra LLM call is made
just to route. It is fast (milliseconds) and adds negligible cost. orfora returns
a *decision*, so it never sits in front of your model calls: no proxy hop, no
single point of failure.

> ⚠️ **Status: early development.** The core works and is tested, but the API may
> still change and it is not published to npm yet.

## Quickstart

The headline case, two-tier cost routing with built-in seeds:

```ts
import { complexityRouter } from "orfora";
import { openaiEmbedder } from "orfora/openai";

const router = complexityRouter({
  simple: "gpt-4o-mini",
  complex: "gpt-4o",
  embed: openaiEmbedder({ apiKey: process.env.OPENAI_API_KEY }),
});

const { model, route } = await router.route("Summarize this paragraph in one line.");
// returns { route: "simple", model: "gpt-4o-mini", score: ..., fallback: false }

// orfora decided WHICH model. You make the actual call, with your own client:
// const answer = await openai.chat.completions.create({ model, messages: [...] });
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
// returns { route: "vision", model: "gpt-4o", reason: "signal:modality:image", fallback: false }
```

`openaiEmbedder` takes a `baseURL`, so it also works with any OpenAI-compatible
provider (Together, OpenRouter, a local Ollama). Or bring your own embedder: any
`{ embed(texts: string[]): Promise<number[][]> }` works.

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

**Honest scope:** orfora does one thing, pick the model. It is not a
feature-for-feature gateway replacement (no unified multi-provider API, no
load-balancing, no spend dashboards), and it happily complements one. Its decision
still costs one embedding call, so use a local embedder if you want zero network.

## Roadmap

- Broader default seeds and domain presets (support bot, coding assistant, and so on)
- A local, no-API-key embedding backend (`orfora/local`)
- An optional bridge that runs the chosen model via handlers you provide
- Auto-calibration that suggests thresholds from real traffic
- A small web playground

## License

[MIT](./LICENSE)
