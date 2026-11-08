# Reading Eye

A simulated reader you can watch from the inside. You give it any text; a model eye reads it,
fixation by fixation, while you see each word being recognised, attention moving one word at a
time, and saccade plans being made and cancelled. You can grab the mechanism while it runs, and
you can compare it, word by word, with 84 real people who read the same passages with an eye
tracker.

It is the reading counterpart of [CHIMERA](https://github.com/jamesondh/chimera-vocal-synth):
CHIMERA makes a voice from a simulated airway; this makes eye movements from a simulated reader.
The same idea carries over: a mechanism, not a curve fit; every internal value on screen; one
engine for the live page and for the command-line scorer.

## Run it

Needs Node 23.6 or newer (it runs the TypeScript directly) and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev                  # http://127.0.0.1:5318
pnpm test                 # engine tests
node tools/score.ts fitted test 40   # score on the 15 held-out passages, 40 runs each
node tools/score.ts ezr10 test 40    # the same for the published E-Z Reader 10 values
node tools/score.ts check-humans     # our measure code on raw human fixations vs the study's report
node tools/fit.ts 400 10 ezr10       # refit on passages 1–40 from the paper's values (writes src/engine/fitted.ts if better)
```

The prepared data in `public/data/` are committed. To rebuild them, put the three Provo CSV files
from [osf.io/sjefs](https://osf.io/sjefs) into `data/raw/` (the fixation report saved as
`Provo_Fixation_Report.csv`) and run `python -I scripts/prep_provo.py data/raw public/data`
(needs pandas and wordfreq).

## What is on the page

- **The page.** The text as the Provo participants saw it (same layout, so real fixations line
  up). Under each word, an amber bar fills as L1 runs, then a teal bar for L2; a violet dot means
  the word is integrated into the sentence. The yellow box is attention. Dashed arcs are saccade
  plans that can still be cancelled; solid arcs are committed. The blue trail is the model's
  scanpath; the magenta dot replays a real reader on the same passage, on the same clock.
- **What reaches the eye.** The current line as the retina gets it: sharp at the centre, blurred
  and faded with distance, using the model's own acuity function.
- **Inside the reader.** A scrolling score of the last 2.5 seconds: which word the eye is on,
  attention shifts, L1, L2, integration, and saccade plans (pale = cancelled). A skip shows up
  as a plan to word n+1 cancelled because word n+1 finished L1 early.
- **Against people.** For Provo passages: per-word measures from 60 model runs against the human
  means, and gaze duration per word as two lines. It updates as you move the controls.
- **Kinds of reader.** Only the skilled adult is fitted. The child, dyslexic, second-language,
  skimmer, blind-centre and mind-wandering readers are illustrative changes to it, labelled as
  such on the page.

Click a word to send the eye there. Space pauses.

## The model

E-Z Reader 10 (Reichle, Warren & McConnell, 2009, *Psychonomic Bulletin & Review* 16(1), 1–21;
[PMC2629133](https://pmc.ncbi.nlm.nih.gov/articles/PMC2629133/)), run in 1 ms steps
(`src/engine/model.ts`):

- One word at a time gets attention. Its L1 (familiarity check) time is gamma-distributed with
  mean `alpha1 − alpha2·ln(frequency per million) − alpha3·predictability`, and slowed by
  `eps` raised to the mean letter distance from the point of fixation. With probability equal
  to its predictability the word is guessed and L1 takes no time. Predictability only counts if
  the previous word is already integrated. L2 (lexical access) takes `delta` times the L1 base
  time and does not depend on acuity.
- L1 finishing starts a saccade program to the next word. L2 finishing starts the word's
  integration (`I`) and shifts attention to the next word (`A`, gamma-distributed).
- A saccade program has a labile stage (`M1`, cancellable) and a non-labile stage (`M2`), then
  the saccade (`S`). If word n+1 finishes L1 while the program to it is still labile, the program
  is replaced by one to n+2: a skip. Programs aim at word centres; landing has a systematic
  range error toward `psi` that depends on the launch fixation's duration (`omega1`, `omega2`)
  and random error (`eta1`, `eta2`). Landing off-centre can trigger a refixation (`lambda`).
- Integration fails with probability `pF`, or when a word is identified before the previous one
  is integrated. Then eyes and attention go back to that word (probability `pN`) or the one
  before, and the words are processed again. Regressive saccades take `regExtra` ms longer to
  program.
- Visual input from a new fixation arrives `V` ms after it starts.

`EZR10` in `src/engine/params.ts` holds the paper's values (α1 98, α2 2, α3 27, Δ 0.25,
ε 1.15, A 50, I 25, M1 125, M2 25, S 25, Ψ 7, Ω1 7.3, Ω2 3, η1 0.5, η2 0.15, λ 0.05, V 50,
30 ms extra for regressions). The 2009 paper does not fix `pF` and `pN` to single values; we
use 0.05 and 0.5 from Reichle, Rayner & Pollatsek (2012, *Visual Cognition*, Table 1). The
paper's frequencies came from the Francis & Kučera (1982) norms; ours come from wordfreq, and
Provo passages run over several lines where the paper used single sentences. So `ezr10` here
means the paper's values run on Provo, not a check that we reproduce the paper's results.

Two additions that are not in E-Z Reader, both needed for multi-line passages and both fitted:
the landing point of return sweeps (`sweep`), and a corrective look-back (`pCorrect`) when the eye
lands past a word that attention has not yet recognised. Mind wandering (eyes on a timer, words
slowed) and a central scotoma (with saccades aimed beside words, as patients learn to do) are
switches on the same machine.

## Data and scoring

The Provo Corpus (Luke & Christianson, 2018; CC-BY 4.0): 55 short passages, 84 adult readers,
eye tracking plus cloze predictability for every word. Word frequencies come from wordfreq
(CC-BY-SA 4.0). For typed text, predictability is a guess (Provo's average cloze for that word,
or for content or function words), so only Provo passages are scored.

The six per-word measures (skip, first fixation, gaze duration, total time, refixation, looking
back) follow the study's interest-area definitions. `node tools/score.ts check-humans` recomputes
them from the raw human fixations with our own code and matches the study's report (r ≥ 0.999).
The ceiling column is the human split-half reliability (odd vs even participants,
Spearman–Brown), the most any model could reach.

Passages 1–40 are used for fitting; 41–55 are held out.

### Results (held-out passages 41–55, 753 words, 40 model runs per passage)

| measure | people | E-Z Reader 10 values | fitted | r per word: E-Z Reader 10 | r per word: fitted | ceiling |
|---|---|---|---|---|---|---|
| words skipped | 45% | 33% | 34% | 0.70 | 0.74 | 0.96 |
| first fixation | 210 ms | 270 ms | 220 ms | −0.07 | −0.12 | 0.67 |
| gaze duration | 244 ms | 295 ms | 246 ms | 0.21 | 0.15 | 0.89 |
| total time | 280 ms | 303 ms | 276 ms | 0.19 | 0.15 | 0.93 |
| refixations | 15% | 11% | 14% | 0.53 | 0.37 | 0.87 |
| looks back | 18% | 3% | 17% | 0.00 | 0.02 | 0.81 |

Loss: 41.3 with the paper's values, 20.2 fitted (training loss 20.6, so no sign of
overfitting).

What this says:

- Fitting fixes the averages: fixation times, skipping and looking back come close to people's.
- Fitting does not fix the word-by-word pattern. Only skipping tracks people well (r 0.74 of a
  possible 0.96). Gaze duration and total time barely track which words people linger on, and
  looking back does not track them at all. Here the model is far below the human ceiling.
- The model's frequency effect is flatter than people's (gaze 329 → 232 ms from rare to common
  words, people 380 → 216 ms), and a stronger frequency parameter does not raise the per-word
  correlation.
- Per-word model means from 10 runs (as used in fitting) are noisy, which lowers the per-word
  correlation the fitter sees. Fitting with more runs, and asking why gaze duration does not
  follow the words, are the next steps.


## Layout

```
src/engine/   model, parameters, text layout, measures, scoring, readers (no DOM)
src/ui/       the page (canvas drawing and controls)
tools/        command-line scorer and fitter
scripts/      data preparation (Python)
public/data/  prepared Provo passages and the frequency lexicon
tests/        engine tests (node --test)
```
