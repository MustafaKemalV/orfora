"""Label RouterBench prompts with the cheapest tier that solves them, then export
a compact, tier-balanced JSONL for training a query -> tier predictor.
"""

import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rb_safe import load  # restricted unpickler

df = load("/tmp/rb0.pkl")

MODELS = [
    "WizardLM/WizardLM-13B-V1.2",
    "claude-instant-v1",
    "claude-v1",
    "claude-v2",
    "gpt-3.5-turbo-1106",
    "gpt-4-1106-preview",
    "meta/code-llama-instruct-34b-chat",
    "meta/llama-2-70b-chat",
    "mistralai/mistral-7b-chat",
    "mistralai/mixtral-8x7b-chat",
    "zero-one-ai/Yi-34B-Chat",
]

scores = {m: pd.to_numeric(df[m], errors="coerce").fillna(0).values for m in MODELS}
costs = {m: pd.to_numeric(df[m + "|total_cost"], errors="coerce") for m in MODELS}
mean_cost = {m: float(costs[m].mean()) for m in MODELS}

# Bucket the 11 models into three tiers by mean cost (cheapest 4 / next 4 / top 3).
order = sorted(MODELS, key=lambda m: mean_cost[m])
cheap, mid, premium = set(order[:4]), set(order[4:8]), set(order[8:])
print("cost order:", [(m, round(mean_cost[m], 6)) for m in order])
print("cheap:", sorted(cheap))
print("mid:", sorted(mid))
print("premium:", sorted(premium))


def any_correct(group):
    m = np.zeros(len(df), dtype=bool)
    for name in group:
        m = m | (scores[name] >= 0.5)
    return m


c_ok, m_ok, p_ok = any_correct(cheap), any_correct(mid), any_correct(premium)
# Cheapest tier that solves it; if none solves it, the strongest is the best shot.
tier = np.where(c_ok, "cheap", np.where(m_ok, "mid", "premium"))

labeled = pd.DataFrame(
    {"prompt": df["prompt"].astype(str), "eval": df["eval_name"].astype(str), "tier": tier}
)
# Drop degenerate prompts.
labeled = labeled[labeled["prompt"].str.len() >= 8]
print("full label distribution:", labeled["tier"].value_counts().to_dict())

# Tier-balanced subsample so the predictor is not dominated by easy prompts.
N_PER = 2200
parts = []
for t in ["cheap", "mid", "premium"]:
    sub = labeled[labeled["tier"] == t]
    parts.append(sub.sample(min(N_PER, len(sub)), random_state=0))
out = pd.concat(parts).sample(frac=1, random_state=0)
print("sampled distribution:", out["tier"].value_counts().to_dict())

with open("/tmp/rb_labeled.jsonl", "w") as f:
    for _, r in out.iterrows():
        f.write(
            json.dumps({"prompt": r["prompt"], "tier": r["tier"], "eval": r["eval"]})
            + "\n"
        )
print("wrote", len(out), "rows to /tmp/rb_labeled.jsonl")
