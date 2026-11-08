"""Turn the Provo Corpus (Luke & Christianson 2018, osf.io/sjefs, CC-BY 4.0) into compact JSON
for the reading eye: per text, the words as shown on screen (pixel boxes), their frequency and
cloze predictability, the human per-word reading measures, and every reader's real fixations.

Also writes the English frequency lexicon used for any typed text (wordfreq, CC-BY-SA 4.0).

usage: python -I scripts/prep_provo.py data/raw public/data
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from wordfreq import top_n_list, zipf_frequency

RAW, OUT = Path(sys.argv[1]), Path(sys.argv[2])
(OUT / "provo").mkdir(parents=True, exist_ok=True)


def clean(w: str) -> str:
    return re.sub(r"[^a-z']", "", w.lower())


e = pd.read_csv(RAW / "Provo_Corpus-Eyetracking_Data.csv", encoding="latin1", low_memory=False)
e["label"] = e.IA_LABEL.astype(str).str.rstrip()

# --- human per-word measures (definitions mirror src/engine/measures.ts) -----------------
first_pass = (e.IA_SKIP == 0) & (e.IA_FIRST_FIX_PROGRESSIVE == 1)
e["fp"] = first_pass
e["ffd"] = np.where(first_pass, e.IA_FIRST_FIXATION_DURATION, np.nan)
e["gd"] = np.where(first_pass, e.IA_FIRST_RUN_DWELL_TIME, np.nan)
e["tt"] = np.where(e.IA_DWELL_TIME > 0, e.IA_DWELL_TIME, np.nan)
e["refix"] = np.where(first_pass, (e.IA_FIRST_RUN_FIXATION_COUNT > 1).astype(float), np.nan)
e["regout"] = np.where(first_pass, e.IA_REGRESSION_OUT.astype(float), np.nan)
e["skip"] = e.IA_SKIP.astype(float)
MEAS = ["skip", "ffd", "gd", "tt", "refix", "regout"]
pid = e.Participant_ID.str.extract(r"(\d+)")[0].astype(int)
e["half"] = pid % 2


def measures(df):
    g = df.groupby("IA_ID")[MEAS].mean()
    return g


# --- fixations ------------------------------------------------------------------------
trial_map = (e.groupby(["RECORDING_SESSION_LABEL", "TRIAL_INDEX"]).Text_ID.first().to_dict())
fx = pd.read_csv(
    RAW / "Provo_Fixation_Report.csv", encoding="latin1", low_memory=False,
    usecols=["RECORDING_SESSION_LABEL", "TRIAL_INDEX", "CURRENT_FIX_X", "CURRENT_FIX_Y",
             "CURRENT_FIX_START", "CURRENT_FIX_DURATION", "CURRENT_FIX_INDEX"],
)
fx["Text_ID"] = [trial_map.get(k) for k in zip(fx.RECORDING_SESSION_LABEL, fx.TRIAL_INDEX)]
fx = fx.dropna(subset=["Text_ID"])
fx["Text_ID"] = fx.Text_ID.astype(int)
sess_pid = e.groupby("RECORDING_SESSION_LABEL").Participant_ID.first().to_dict()

# --- lexicon --------------------------------------------------------------------------
words = top_n_list("en", 60000)
lex = {w: round(zipf_frequency(w, "en"), 2) for w in words if re.fullmatch(r"[a-z']+", w)}

cls = e.dropna(subset=["Word_Content_Or_Function"])
pred_by_class = cls.groupby("Word_Content_Or_Function").OrthographicMatch.mean().round(3).to_dict()
pred_by_word = (cls.assign(c=cls.Word.astype(str).map(clean)).groupby("c").OrthographicMatch
                .agg(["mean", "size"]))
pred_by_word = pred_by_word[pred_by_word["size"] >= 84 * 2]["mean"].round(3).to_dict()

index = []
for tid, t in e.groupby("Text_ID"):
    ia = t.groupby("IA_ID").agg(
        w=("label", "first"), x0=("IA_LEFT", "first"), x1=("IA_RIGHT", "first"),
        y0=("IA_TOP", "first"), y1=("IA_BOTTOM", "first"),
        pred=("OrthographicMatch", "first"), cf=("Word_Content_Or_Function", "first"),
    )
    tops = sorted(ia.y0.unique())
    all_m, h0, h1 = measures(t), measures(t[t.half == 0]), measures(t[t.half == 1])
    ws = []
    for iid, r in ia.iterrows():
        c = clean(r.w)
        z = zipf_frequency(c, "en") if c else 0.0
        ws.append(dict(
            w=r.w, box=[int(r.x0), int(r.y0), int(r.x1), int(r.y1)], line=tops.index(r.y0),
            zipf=round(z, 2),
            pred=None if pd.isna(r.pred) else round(float(r.pred), 3),
            human={m: (None if pd.isna(all_m.loc[iid, m]) else round(float(all_m.loc[iid, m]), 3))
                   for m in MEAS},
            halves=[[None if pd.isna(h.loc[iid, m]) else round(float(h.loc[iid, m]), 3)
                     for m in MEAS] for h in (h0, h1)],
        ))
    # character width: median over words of box width / (letters + trailing space)
    ppc = float(np.median([(w["box"][2] - w["box"][0]) / (len(w["w"]) + 1) for w in ws[1:]]))
    readers = []
    for sess, f in fx[fx.Text_ID == tid].groupby("RECORDING_SESSION_LABEL"):
        f = f.sort_values("CURRENT_FIX_INDEX")
        readers.append(dict(
            id=sess_pid.get(sess, str(sess)),
            fix=[[round(float(x), 1), round(float(y), 1), int(s), int(d)] for x, y, s, d in
                 zip(f.CURRENT_FIX_X, f.CURRENT_FIX_Y, f.CURRENT_FIX_START, f.CURRENT_FIX_DURATION)],
        ))
    doc = dict(id=int(tid), ppc=round(ppc, 3), lineTops=[int(v) for v in tops],
               measures=MEAS, words=ws, readers=readers)
    (OUT / "provo" / f"text{tid:02d}.json").write_text(json.dumps(doc, separators=(",", ":")))
    index.append(dict(id=int(tid), words=len(ws), readers=len(readers),
                      preview=" ".join(w["w"] for w in ws[:10]) + " …"))

(OUT / "provo" / "index.json").write_text(json.dumps(index, separators=(",", ":")))
(OUT / "lexicon.json").write_text(json.dumps(dict(
    source="wordfreq (CC-BY-SA 4.0), Zipf scale",
    predByClass=pred_by_class, predByWord=pred_by_word, zipf=lex,
), separators=(",", ":")))
print(f"{len(index)} texts, {sum(i['words'] for i in index)} words, "
      f"{sum(i['readers'] for i in index)} reader-texts, lexicon {len(lex)} words")
print("pred by class", pred_by_class, "| words with own pred", len(pred_by_word))
