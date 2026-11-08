# Data licence

The files in this folder (`provo/*.json`, `lexicon.json`) are licensed under
**Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**:
https://creativecommons.org/licenses/by-sa/4.0/

They are adaptations of two sources:

1. **The Provo Corpus.** Luke, S. G., & Christianson, K. (2018). The Provo Corpus: A large
   eye-tracking corpus with predictability norms. *Behavior Research Methods*, 50, 826–833.
   Data: https://osf.io/sjefs/, licensed CC BY 4.0
   (https://creativecommons.org/licenses/by/4.0/).
   Changes made: the eye-tracking report, predictability norms and fixation report were
   reformatted into one JSON file per passage; per-word means of six reading measures (overall
   and for odd and even participants) were computed; fixations were reduced to position, start
   and duration; word frequencies from wordfreq were added. Produced by `scripts/prep_provo.py`.

2. **wordfreq.** Speer, R. wordfreq, https://github.com/rspeer/wordfreq. Its word-frequency data
   are licensed CC BY-SA 4.0, and draw on the sources listed in wordfreq's README.
   Changes made: Zipf frequencies were extracted for the 60,000 most frequent English words
   (letters and apostrophes only) and for every Provo word.

Because the wordfreq data are ShareAlike, these combined files are shared under CC BY-SA 4.0.
The code that reads them is under the MIT licence in the repository root.
