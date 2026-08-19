import { adversarialDataset } from "../eval/adversarialDataset";
import { catalogDataset } from "../eval/catalogDataset";
import type { Capability } from "../src/catalog";
import type { CatalogLabeledExample } from "../src/evaluate";
import {
  createVectorRouter,
  defaultVectorCatalog,
  fitness,
} from "../src/index";
import { openaiEmbedder } from "../src/openai";

/**
 * Evaluates the model-as-vector router in one pass: capability + tier accuracy AND
 * the cost-vs-quality trade-off. Cost/quality is the RIGHT-FIT lens (does orfora
 * keep the quality of always using the flagship, at lower cost?), not a cheap-ratio.
 * Requires OPENAI_API_KEY (see .env.example).
 */
async function main() {
  try {
    process.loadEnvFile();
  } catch {
    // no .env file; use the ambient environment
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      "Set OPENAI_API_KEY to run the evaluation (see .env.example).",
    );
    process.exitCode = 1;
    return;
  }

  const router = createVectorRouter({
    embed: openaiEmbedder({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_EMBED_MODEL,
    }),
  });

  const byId = new Map(defaultVectorCatalog.map((m) => [m.id, m]));
  // The "always use the top flagship" baseline: the priciest WELL-CHARACTERISED
  // model, so a niche model with little benchmark data cannot stand in for it.
  const flagship = defaultVectorCatalog
    .filter((m) => m.modelClass === "chat" && Object.keys(m.scores).length >= 3)
    .reduce((a, b) => (b.pricePerMTokens > a.pricePerMTokens ? b : a));
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const usd = (n: number) => `$${n.toFixed(2)}`;

  async function evalSet(name: string, data: CatalogLabeledExample[]) {
    let capHit = 0;
    let tierHit = 0;
    let priceSum = 0;
    let chosenFitSum = 0;
    let chosenFitN = 0;
    let flagFitSum = 0;
    let flagFitN = 0;

    for (const ex of data) {
      const d = await router.route(ex.input);
      if (d.capability === ex.capability) capHit++;
      if (d.tier === ex.tier) tierHit++;
      priceSum += byId.get(d.model)?.pricePerMTokens ?? 0;
      if (typeof d.fitness === "number") {
        chosenFitSum += d.fitness;
        chosenFitN++;
      }
      const ff = fitness(flagship, ex.capability as Capability);
      if (typeof ff === "number") {
        flagFitSum += ff;
        flagFitN++;
      }
    }

    const n = data.length || 1;
    const avgPrice = priceSum / n;
    const chosenFit = chosenFitN ? chosenFitSum / chosenFitN : 0;
    const flagFit = flagFitN ? flagFitSum / flagFitN : 0;

    console.log(`\n${name} (${data.length} examples)`);
    console.log(`  capability accuracy: ${pct(capHit / n)}`);
    console.log(`  tier accuracy:       ${pct(tierHit / n)}`);
    console.log(
      `  cost:    ${usd(avgPrice)}/M chosen vs ${usd(flagship.pricePerMTokens)}/M always-flagship  (${pct(avgPrice / flagship.pricePerMTokens)} of flagship cost)`,
    );
    console.log(
      `  quality: fitness ${chosenFit.toFixed(3)} chosen vs ${flagFit.toFixed(3)} flagship  (${pct(flagFit ? chosenFit / flagFit : 0)} of flagship quality)`,
    );
  }

  console.log(`\norfora vector-router evaluation  (flagship = ${flagship.id})`);
  await evalSet("main", catalogDataset);
  await evalSet("adversarial", adversarialDataset);
  console.log();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
