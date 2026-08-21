# Tier predictor pipeline

How `src/tierModel.ts` was built: a tier classifier LEARNED from real routing
outcomes, not hand-tuned. Seed-based tiering barely beats chance (35% on a balanced
3-tier set); this predictor reaches **56% under 5-fold cross-validation**.

The data is [`withmartian/routerbench`](https://huggingface.co/datasets/withmartian/routerbench)
(0-shot): 36k prompts, each with the per-model correctness of 11 LLMs. We bucket the
11 models into three tiers by cost and label every prompt with the **cheapest tier that
actually solved it**, then learn `prompt embedding -> tier`.

## Steps

Requires a Python venv with `pandas`, `numpy`, `scikit-learn`, and Node with the repo
installed.

```bash
# 1. Download the dataset (a pandas pickle; ~95 MB).
curl -sL -o /tmp/rb0.pkl \
  https://huggingface.co/datasets/withmartian/routerbench/resolve/main/routerbench_0shot.pkl

# 2. Label prompts with the cheapest sufficient tier, export a balanced JSONL.
#    rb_export.py loads the pickle through a RESTRICTED unpickler (rb_safe.py) that
#    only permits pandas/numpy classes, neutralising pickle's code-execution risk.
python scripts/tier/rb_export.py            # -> /tmp/rb_labeled.jsonl

# 3. Embed the prompts (and orfora's tier seeds) with the SAME local MiniLM the
#    router uses at runtime, so the weights live in the router's embedding space.
npx tsx scripts/fit-tier-embed.ts           # -> /tmp/rb_emb.json

# 4. Fit the logistic regression, print the baselines vs the learned CV accuracy,
#    and export the weights.
python scripts/tier/rb_fit.py               # -> /tmp/tier_model.json

# 5. /tmp/tier_model.json is transcribed into src/tierModel.ts (labels, coef, bias).
```

## Honesty notes

- The weights are specific to `Xenova/all-MiniLM-L6-v2`; `predictTier` returns null on
  a dimension mismatch so a different embedder falls back to seed tiering.
- Labels are a proxy (cheapest of three cost-bucketed tiers that solved the prompt), and
  tier is a genuinely fuzzy axis, so 56% is a stepping stone, not a solved problem. It is
  honest and measured, and it beats the seed baseline by ~21 points.
- A cascade / escalation variant (verify a cheap answer, escalate on failure) is the
  natural complement and remains future work.
