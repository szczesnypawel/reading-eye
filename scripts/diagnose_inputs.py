"""How much of people's word-by-word reading do simple word properties explain?

Fits linear regressions of the human per-word measures on word properties, using passages 1-40,
and reports the correlation with people on the held-out passages 41-55. Compare with the model's
per-word r (tools/score.ts) and the human split-half ceiling.

  A  the model's own inputs: length, frequency (Zipf), cloze predictability
  B  A plus curvature and interactions (length², Zipf², length×Zipf)
  C  B plus things E-Z Reader does not know: line start / line end, punctuation after the word,
     sentence end, and the previous and next word's length and frequency

usage: python -I scripts/diagnose_inputs.py public/data/provo [fit_last] [test_first] [test_last]
       (default: fit on 1-35, test on 46-55, the split of tools/fit_cma.ts)
"""
import json
import re
import sys
from pathlib import Path

import numpy as np

DIR = Path(sys.argv[1])
MEAS = ["skip", "ffd", "gd", "tt", "refix", "regout"]
FIT_LAST = int(sys.argv[2]) if len(sys.argv) > 2 else 35
TEST_FIRST = int(sys.argv[3]) if len(sys.argv) > 3 else 46
TEST_LAST = int(sys.argv[4]) if len(sys.argv) > 4 else 55
TRAIN = set(range(1, FIT_LAST + 1))
TESTSET = set(range(TEST_FIRST, TEST_LAST + 1))

rows = []
for f in sorted(DIR.glob("text*.json")):
    d = json.loads(f.read_text())
    ws = d["words"]
    preds = [w["pred"] for w in ws if w["pred"] is not None]
    mean_pred = float(np.mean(preds))
    for i, w in enumerate(ws):
        if i == 0:
            continue  # read from a fixation cross; left out as in score.ts
        word = w["w"]
        letters = len(re.sub(r"[^A-Za-z']", "", word)) or len(word)
        prev, nxt = ws[i - 1], ws[i + 1] if i + 1 < len(ws) else None
        rows.append(dict(
            text=d["id"],
            len=letters,
            zipf=max(w["zipf"], 1),
            pred=w["pred"] if w["pred"] is not None else mean_pred,
            line_start=float(prev["line"] != w["line"]),
            line_end=float(nxt is None or nxt["line"] != w["line"]),
            punct=float(bool(re.search(r"[,;:]$", word))),
            sent_end=float(bool(re.search(r"[.?!][\"')]*$", word))),
            prev_len=len(prev["w"]),
            prev_zipf=max(prev["zipf"], 1),
            next_len=len(nxt["w"]) if nxt else 0,
            next_zipf=max(nxt["zipf"], 1) if nxt else 0,
            human=w["human"],
            halves=w["halves"],
        ))


def design(r, which):
    a = [1.0, r["len"], r["zipf"], r["pred"]]
    if which in "BC":
        a += [r["len"] ** 2, r["zipf"] ** 2, r["len"] * r["zipf"]]
    if which == "C":
        a += [r["line_start"], r["line_end"], r["punct"], r["sent_end"],
              r["prev_len"], r["prev_zipf"], r["next_len"], r["next_zipf"]]
    return a


def r_of(a, b):
    return float(np.corrcoef(a, b)[0, 1])


print(f"fit on passages 1-{FIT_LAST}, tested on {TEST_FIRST}-{TEST_LAST}: correlation per word with people\n")
print(f"{'measure':8} {'A: len,freq,pred':>17} {'B: +curves':>11} {'C: +layout,punct,neighbours':>28} {'ceiling':>8}")
for mi, m in enumerate(MEAS):
    ok = [r for r in rows if r["human"][m] is not None]
    tr = [r for r in ok if r["text"] in TRAIN]
    te = [r for r in ok if r["text"] in TESTSET]
    out = []
    for which in "ABC":
        X = np.array([design(r, which) for r in tr])
        y = np.array([r["human"][m] for r in tr])
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
        pred = np.array([design(r, which) for r in te]) @ beta
        out.append(r_of(pred, [r["human"][m] for r in te]))
    hv = [r for r in te if r["halves"][0][mi] is not None and r["halves"][1][mi] is not None]
    s = r_of([r["halves"][0][mi] for r in hv], [r["halves"][1][mi] for r in hv])
    print(f"{m:8} {out[0]:17.3f} {out[1]:11.3f} {out[2]:28.3f} {2 * s / (1 + s):8.3f}")

# which of the extra properties matter for gaze duration and looking back (model C, standardised)
names = ["len", "zipf", "pred", "len²", "zipf²", "len×zipf", "line_start", "line_end", "punct",
         "sent_end", "prev_len", "prev_zipf", "next_len", "next_zipf"]
for m in ["gd", "regout", "skip"]:
    tr = [r for r in rows if r["text"] in TRAIN and r["human"][m] is not None]
    X = np.array([design(r, "C") for r in tr])[:, 1:]
    X = (X - X.mean(0)) / X.std(0)
    X = np.column_stack([np.ones(len(X)), X])
    y = np.array([r["human"][m] for r in tr])
    beta, *_ = np.linalg.lstsq(X, (y - y.mean()) / y.std(), rcond=None)
    top = sorted(zip(names, beta[1:]), key=lambda t: -abs(t[1]))[:6]
    print(f"\n{m}: largest standardised weights (model C, training passages)")
    for n, b in top:
        print(f"  {n:11} {b:+.2f}")
