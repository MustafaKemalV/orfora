# orfora

> Route each LLM request to the right-sized model. Cut cost, keep quality.

**orfora** — *Optimal Routes For All* — is a lightweight semantic router for LLM apps.
It cuts your LLM bill by sending each request to the right-sized model — a cheap model
for trivial requests, a strong model for the ones that actually need reasoning — decided
by **meaning** rather than by message length.

> ⚠️ **Status: early development.** The API below is the target design and is being
> built incrementally. Not published to npm yet.

## How it works

1. **Setup (once):** give it a handful of labeled examples of your app's "simple" vs
   "complex" requests, or use the built-in defaults. They are turned into vectors once.
2. **Runtime (per request):** the incoming request is turned into a vector and compared
   (cosine similarity) to the nearest labeled examples, plus a few deterministic signals
   (length, multiple intents, attachments). It decides the tier and returns which model
   to use. If it is unsure, it defaults to the strong model, so quality is never
   sacrificed.

The routing decision is pure math plus a small embedding model — **no LLM call is made
just to decide**, so it is fast (milliseconds) and adds negligible cost. It routes by
task complexity and intent, not by subject, so it works across any domain.

## Planned API

```ts
import { createRouter } from "orfora";

const router = createRouter({
  tiers: {
    simple: "gpt-4o-mini",
    complex: "gpt-4o",
  },
});

const { model, tier } = await router.route("Summarize this paragraph in one line.");
// → { tier: "simple", model: "gpt-4o-mini" }
```

## Roadmap

- Broader default seeds
- Domain presets (support bot, coding assistant, writing assistant, …)
- Auto-calibration helper that suggests thresholds from real traffic
- More embedding backends
- Optional feedback-based adjustment

## License

[MIT](./LICENSE)
