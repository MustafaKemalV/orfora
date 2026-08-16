import { evalDataset } from "../eval/dataset";
import { evaluate } from "../src/evaluate";
import { complexityRouter } from "../src/index";
import { openaiEmbedder } from "../src/openai";

/**
 * Runs the evaluation against real embeddings. Requires OPENAI_API_KEY in the
 * environment (see .env.example); it uses your own key, locally, and costs a few
 * cents. This is a dev script, not part of the automated test suite.
 */
async function main() {
  // Load a local .env if present, so `npm run eval` works after you copy
  // .env.example. Falls back to the ambient environment when there is no file.
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

  const router = complexityRouter({
    simple: "gpt-4o-mini",
    complex: "gpt-4o",
    embed: openaiEmbedder({ apiKey }),
  });

  const report = await evaluate(router, evalDataset);
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const cheapShare =
    report.results.filter((r) => r.predicted === "simple").length /
    (report.total || 1);

  console.log(`\norfora evaluation (${report.total} examples)\n`);
  console.log(`  accuracy:        ${pct(report.accuracy)}`);
  console.log(
    `  complex recall:  ${pct(report.recallByRoute.complex ?? 0)}  (safety: hard requests kept on the strong model)`,
  );
  console.log(
    `  simple recall:   ${pct(report.recallByRoute.simple ?? 0)}  (cost: easy requests sent to the cheap model)`,
  );
  console.log(`  routed to cheap: ${pct(cheapShare)}\n`);
  console.log("  confusion (expected -> predicted):");
  for (const [expected, row] of Object.entries(report.confusion)) {
    for (const [predicted, count] of Object.entries(row)) {
      console.log(`    ${expected} -> ${predicted}: ${count}`);
    }
  }
  console.log();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
