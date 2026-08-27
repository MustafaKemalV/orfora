# Changelog

All notable changes to orfora are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/). The project is pre-1.0, so the API may
still change.

## [0.1.1] - 2026-08-27

### Fixed
- The README shown on npm now reflects the published status (`npm install orfora`) and
  reconciles the "no proxy / holds no credentials" framing with the opt-in gateway.
  0.1.0's tarball had frozen the pre-publish README.

## [0.1.0] - 2026-08-27

First npm release.

### Added

- `orfora/gateway`: a drop-in, OpenAI-compatible layer, the `createOrforaClient` SDK and
  the `orforaHandler` proxy, with streaming, two forwarding modes, and `x-orfora-*`
  routing metadata.
- `orfora/node`: `toNodeHandler` to mount the gateway on Node (`http.createServer`,
  Express, Fastify), streaming included.
- Gateway hardening: an `authorize` hook (401), a request body-size cap (413), an
  `allowedModels` allowlist for pinned models, and a bounded SSE parse buffer.
- A generative branch (`createMultimodalRouter`) and a cascade / escalation planner.

### Changed

- Fitness shrinks toward the prior by axis coverage, so a single benchmark number cannot
  win on thin data.
- Premium and ultra tiers select the strongest model, not the cheapest that clears the
  bar, so the tiers actually differentiate.
- Capability is detected from the instruction span, not the whole pasted body.
- Catalog: `math_reasoning` sources AIME first (GPQA a labelled STEM proxy);
  `general_knowledge` is on one consistent, catalog-relative scale.
- Fail-open is configurable (`fallback: "strongest" | "cheapest" | <id>`), still
  defaulting to the strongest model so a bad guess never trades quality.
