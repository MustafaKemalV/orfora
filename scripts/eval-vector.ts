import { catalogDataset } from "../eval/catalogDataset";
import { evaluateCatalog } from "../src/evaluate";
import { createVectorRouter } from "../src/index";
import { openaiEmbedder } from "../src/openai";

/**
 * Evaluates the model-as-vector router (capability + tier) against real embeddings,
 * over the same labelled set as eval:catalog, so the new tier accuracy is directly
 * comparable to the old seed-tier number. Requires OPENAI_API_KEY (see .env.example).
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

  // evaluateCatalog reads decision.target; the vector router names it capability.
  const adapted = {
    route: async (input: string) => {
      const d = await router.route(input);
      return { target: d.capability, tier: d.tier };
    },
  };

  const report = await evaluateCatalog(adapted, catalogDataset);
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  console.log(`\norfora vector-router evaluation (${report.total} examples)\n`);
  console.log(`  capability accuracy: ${pct(report.capabilityAccuracy)}`);
  console.log(`  tier accuracy:       ${pct(report.tierAccuracy)}`);
  console.log(`  both correct:        ${pct(report.bothAccuracy)}\n`);

  console.log("  capability recall:");
  for (const [cap, r] of Object.entries(report.capabilityRecall)) {
    console.log(`    ${cap.padEnd(16)} ${pct(r)}`);
  }
  console.log("\n  tier recall:");
  for (const [tier, r] of Object.entries(report.tierRecall)) {
    console.log(`    ${tier.padEnd(16)} ${pct(r)}`);
  }
  console.log();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
