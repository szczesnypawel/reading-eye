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
node tools/fit.ts 400 10             # refit on passages 1–40 (writes src/engine/fitted.ts)
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

E-Z Reader 10 (Reichle, Warren & McConnell, 2009), run in 1 ms steps (`src/engine/model.ts`):

- One word at a time gets attention. Its L1 (familiarity) time is
  `alpha1 − alpha2·ln(frequency per million) − alpha3·cloze`, gamma-distributed, and slowed by
  `eps` per character of mean letter distance from the point of fixation. L2 takes `delta` times
  that base time.
- L1 finishing starts a saccade program to the next word. L2 finishing moves attention on (after
  `A` ms) and starts integration.
- A saccade program has a labile stage (`M1`, can be cancelled and replaced) and a non-labile
  stage (`M2`), then the saccade (`S`). If word n+1 finishes L1 while the program to it is still
  labile, the program is replaced by one to n+2: a skip.
- Landing sites have a systematic range error toward `psi` characters and random error; landing
  off-centre can trigger a refixation (`lambda`).
- Integration fails with probability `pF`, or when a word is identified before the previous one
  is integrated; then attention and eye go back.
- Visual input from a new fixation arrives `V` ms after it starts.

Two additions that are not in E-Z Reader, both needed for multi-line passages and both fitted:
the landing point of return sweeps (`sweep`), and a corrective look-back (`pCorrect`) when the eye
lands past a word that attention has not yet recognised. Mind wandering (eyes on a timer, words
slowed) and a central scotoma are switches on the same machine.

The starting values in `params.ts` are the published E-Z Reader 10 values as we recall them;
check them against the paper before citing them.

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

RESULTS_PLACEHOLDER

## Layout

```
src/engine/   model, parameters, text layout, measures, scoring, readers (no DOM)
src/ui/       the page (canvas drawing and controls)
tools/        command-line scorer and fitter
scripts/      data preparation (Python)
public/data/  prepared Provo passages and the frequency lexicon
tests/        engine tests (node --test)
```
