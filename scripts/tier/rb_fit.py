"""Step 2: fit the tier predictor on MiniLM embeddings of the RouterBench-labelled
prompts. Reports the majority baseline, orfora's current tier-seed baseline, and the
learned logistic regression under 5-fold cross-validation, then exports the weights.
"""

import json

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
)
from sklearn.model_selection import StratifiedKFold, cross_val_predict

import warnings

warnings.filterwarnings("ignore")
np.seterr(all="ignore")

d = json.load(open("/tmp/rb_emb.json"))
X = np.asarray(d["emb"], dtype=np.float64)
y = np.asarray(d["labels"])
TIERS = ["cheap", "mid", "premium"]

finite = np.isfinite(X).all(axis=1)
if not finite.all():
    print("dropping %d non-finite embeddings" % int((~finite).sum()))
    X, y = X[finite], y[finite]
print("X", X.shape, "dist", {t: int((y == t).sum()) for t in TIERS})

# Baseline 1: always predict the majority class.
maj = max(TIERS, key=lambda t: (y == t).sum())
print("majority baseline acc:   %.3f" % accuracy_score(y, [maj] * len(y)))

# Baseline 2: orfora's current mechanism, nearest tier-seed centroid (cosine).
cent = {}
for t in TIERS:
    vs = np.asarray([s["vec"] for s in d["seeds"] if s["tier"] == t])
    cent[t] = vs.mean(axis=0)
C = np.asarray([cent[t] for t in TIERS])
Xn = X / (np.linalg.norm(X, axis=1, keepdims=True) + 1e-9)
Cn = C / (np.linalg.norm(C, axis=1, keepdims=True) + 1e-9)
seed_pred = np.asarray(TIERS)[np.argmax(Xn @ Cn.T, axis=1)]
print("tier-seed baseline acc:  %.3f" % accuracy_score(y, seed_pred))

# Learned: multinomial logistic regression under 5-fold stratified CV.
clf = LogisticRegression(max_iter=3000, C=1.0)
skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=0)
cv_pred = cross_val_predict(clf, X, y, cv=skf)
print("learned LR 5-fold CV acc: %.3f" % accuracy_score(y, cv_pred))
print(classification_report(y, cv_pred, labels=TIERS, digits=3))
print("confusion (rows=true cheap/mid/premium):")
print(confusion_matrix(y, cv_pred, labels=TIERS))

# Fit on all data and export weights aligned to TIERS order.
clf.fit(X, y)
classes = list(clf.classes_)
coef = np.zeros((3, X.shape[1]))
inter = np.zeros(3)
for i, t in enumerate(TIERS):
    j = classes.index(t)
    coef[i] = clf.coef_[j]
    inter[i] = clf.intercept_[j]
json.dump(
    {
        "labels": TIERS,
        "dim": int(X.shape[1]),
        "coef": coef.tolist(),
        "intercept": inter.tolist(),
        "embedder": "Xenova/all-MiniLM-L6-v2",
        "source": "withmartian/routerbench 0shot; label = cheapest tier that solves the prompt; balanced 2200/tier",
    },
    open("/tmp/tier_model.json", "w"),
)
print("exported /tmp/tier_model.json")
