# Typefaces

Local variable WOFF2 fonts from the official Google Fonts repository, downloaded 2026-10-23. Complete original SIL OFL 1.1 licenses and copyright notices accompany each family.

| File | Official source | Role |
| --- | --- | --- |
| `IBMPlexSans.woff2` | https://github.com/google/fonts/tree/main/ofl/ibmplexsans | Interface, controls and working headings; weight 100–700, default width 100 |
| `Manrope.woff2` | https://github.com/google/fonts/tree/main/ofl/manrope | Page headings and product mark; weight 200–800 |
| `Literata.woff2`, `Literata-Italic.woff2` | https://github.com/google/fonts/tree/main/ofl/literata | Book titles and long reading; weight 200–900 |

Manrope, IBM Plex Sans, Inter and the previous Onest were compared in Chromium using identical Russian headings, labels, prose, Cyrillic letterforms and numbers. IBM Plex Sans was selected for compact interface text, Manrope for the larger hierarchy, Literata for continuous reading. This is a visual design judgment, not a performance benchmark.

Full Russian character coverage (including both forms of е/ё, quotation marks and punctuation) was checked in each cmap. The original variable TTFs were converted to WOFF2 using fontTools. No external font request is made at runtime. PDF typography is unchanged.

The previous Onest and Unbounded license notices are retained for older hashed font assets kept available to existing browser tabs. These families are no longer used by the current interface.
