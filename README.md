# Reading Eye

**Live: https://szczesnypawel.github.io/reading-eye/**

A simulated reader you can watch from the inside. You give it any text; a model eye reads it,
fixation by fixation, while you see each word being recognised, attention moving one word at a
time, and saccade plans being made and cancelled. You can grab the mechanism while it runs, and
you can compare it, word by word, with 84 real people who read the same passages with an eye
tracker.

Inspired by [CHIMERA](https://github.com/jamesondh/chimera-vocal-synth), a physical-modelling
voice synthesizer that shows its insides as it runs. The two projects share no code.

## Background

When we read, the eyes move in jumps (saccades) of a few letters, with stops (fixations) of
about 200–250 ms in between. Many short words are skipped, and about one jump in six goes
backwards. Only the centre of vision is sharp, so a word can be read only when it is fixated or
close to the point of fixation.

E-Z Reader (Reichle and colleagues, first published in 1998) is a model of how the mind controls
these movements. Attention moves through the text one word at a time. Each word goes through two
stages: a quick familiarity check, which starts the planning of the next saccade, and full
recognition, after which attention moves to the next word. For a short time the saccade plan can
be cancelled, and if the next word is recognised from where the eye is, the plan changes and the
eye skips that word. Frequent, short and predictable words are processed faster. The model has
about twenty parameters, such as the base time of the familiarity check or the time needed to
plan a saccade.

The Provo Corpus (Luke & Christianson, 2018) has eye-tracking data from 84 adults reading 55 short
texts. For each word it gives how long readers looked at it, how often they skipped it and how
often they went back from it. It also gives cloze predictability: a separate group of people saw
each text up to a word and guessed the next one.

Running the model on the Provo texts lets us compare it with real readers word by word. The
published parameter values were estimated on other sentences and other readers, so we also fit
them to Provo: a search changes the parameters a little at a time and keeps a change when the
model's reading on 40 of the texts gets closer to the readers'. The remaining 15 texts are used
only to test the result.

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

### Results

Held-out passages 41–55 (753 words), 100 model runs per passage. "Regression" is a linear
regression of the human measure on word length, frequency and predictability (the model's own
inputs), fitted on passages 1–40 (`scripts/diagnose_inputs.py`). The ceiling is the human
split-half reliability.

| measure | people | E-Z Reader 10 values | fitted | r: E-Z Reader 10 | r: fitted | r: regression | ceiling |
|---|---|---|---|---|---|---|---|
| words skipped | 45% | 29% | 30% | 0.75 | 0.76 | 0.86 | 0.96 |
| first fixation | 210 ms | 233 ms | 216 ms | −0.05 | −0.15 | 0.35 | 0.67 |
| gaze duration | 244 ms | 256 ms | 244 ms | 0.33 | 0.33 | 0.65 | 0.89 |
| total time | 280 ms | 265 ms | 283 ms | 0.33 | 0.41 | 0.70 | 0.93 |
| refixations | 15% | 12% | 15% | 0.54 | 0.57 | 0.74 | 0.87 |
| looks back | 18% | 4% | 16% | 0.09 | 0.03 | 0.12 | 0.81 |

Loss on the held-out passages is 28.7 with the paper's values and 18.6 fitted; the fitted loss
on the training passages is 18.6.

Fitting brings the averages close to the readers', but the per-word correlations stay about where
the paper's values put them, and well below what a plain regression on the same three word
properties reaches. The model underestimates skipping, and its first-fixation durations correlate
slightly negatively with the readers'. Looking back is not predicted by either the model or the
regression: in the model, integration fails at random, and in the data it depends more on things
the model does not represent (sentence ends, the next word). Adding line position, punctuation and
the neighbouring words to the regression raises gaze duration to r 0.79 and looking back to 0.42.

An earlier version of the model had a bug that let the eye wait for seconds while attention
worked on a word far away. Results reported before that fix (commit 6692ef4) are not valid.

## Layout

```
src/engine/   model, parameters, text layout, measures, scoring, readers (no DOM)
src/ui/       the page (canvas drawing and controls)
tools/        command-line scorer and fitter
scripts/      data preparation (Python)
public/data/  prepared Provo passages and the frequency lexicon
tests/        engine tests (node --test)
```

## Licence

- Code: MIT (`LICENSE`).
- Prepared data in `public/data/`: CC BY-SA 4.0, because they combine the Provo Corpus
  (CC BY 4.0) with wordfreq frequencies (CC BY-SA 4.0). Attribution and the changes made are in
  `public/data/LICENSE.md`.
- E-Z Reader is a published scientific model; this is an independent implementation from its
  description in the papers cited above, with no code taken from its authors.
