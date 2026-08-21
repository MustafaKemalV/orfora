import { readFileSync, writeFileSync } from "node:fs";
import { tierSeeds } from "../src/catalogSeeds";
import { localEmbedder } from "../src/local";

/**
 * Step 1 of the tier-predictor pipeline: embed the RouterBench-labelled prompts and
 * orfora's own tier seeds with the SAME local MiniLM the router uses at runtime, so
 * the learned weights live in the router's embedding space. Reads /tmp/rb_labeled.jsonl
 * (prompt + tier + eval), writes /tmp/rb_emb.json. Fitting happens in the Python step.
 */

interface Row {
  prompt: string;
  tier: string;
  eval: string;
}

const rows: Row[] = readFileSync("/tmp/rb_labeled.jsonl", "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l));

const embedder = localEmbedder();
const cap = (s: string) => s.slice(0, 2000);

async function embedAll(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  const batch = 64;
  for (let i = 0; i < texts.length; i += batch) {
    const vecs = await embedder.embed(texts.slice(i, i + batch).map(cap));
    out.push(...vecs);
    if (i % 640 === 0) console.error(`  embedded ${i}/${texts.length}`);
  }
  return out;
}

const seedRows: Array<{ tier: string; text: string }> = [
  ...tierSeeds.cheap.map((t) => ({ tier: "cheap", text: t })),
  ...tierSeeds.mid.map((t) => ({ tier: "mid", text: t })),
  ...tierSeeds.premium.map((t) => ({ tier: "premium", text: t })),
];

console.error(`embedding ${rows.length} prompts...`);
const emb = await embedAll(rows.map((r) => r.prompt));
console.error("embedding tier seeds...");
const seedEmb = await embedAll(seedRows.map((s) => s.text));

writeFileSync(
  "/tmp/rb_emb.json",
  JSON.stringify({
    labels: rows.map((r) => r.tier),
    evals: rows.map((r) => r.eval),
    emb,
    seeds: seedRows.map((s, i) => ({ tier: s.tier, vec: seedEmb[i] })),
  }),
);
console.error(
  `wrote /tmp/rb_emb.json: ${emb.length} vecs, dim ${emb[0]?.length}`,
);
