import { catalogDataset } from "../eval/catalogDataset";
import { evaluateCatalog } from "../src/evaluate";
import { createCatalogRouter } from "../src/index";
import { openaiEmbedder } from "../src/openai";

/**
 * Evaluates the catalog router (capability and tier) against real embeddings.
 * Requires OPENAI_API_KEY (see .env.example); it uses your own key, locally, and
 * costs a few cents. Point it at any OpenAI-compatible provider via env. This is a
 * dev script, not part of the automated test suite.
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

  const router = createCatalogRouter({
    embed: openaiEmbedder({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_EMBED_MODEL,
    }),
  });

  const report = await evaluateCatalog(router, catalogDataset);
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  console.log(`\norfora catalog evaluation (${report.total} examples)\n`);
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
  console.log("\n  capability confusion (expected -> predicted):");
  for (const [expected, row] of Object.entries(report.capabilityConfusion)) {
    for (const [predicted, count] of Object.entries(row)) {
      if (predicted !== expected) {
        console.log(`    ${expected} -> ${predicted}: ${count}`);
      }
    }
  }
  console.log();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
