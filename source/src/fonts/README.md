# Typefaces

The app self-hosts variable web fonts from the official Google Fonts `google/fonts` repository:

| File | Source | Range | Role |
| --- | --- | --- | --- |
| `Unbounded.woff2` | [`ofl/unbounded/Unbounded[wght].ttf`](https://github.com/google/fonts/blob/main/ofl/unbounded/Unbounded%5Bwght%5D.ttf) | 200–900 | Product mark and selective display accents |
| `Onest.woff2` | [`ofl/onest/Onest[wght].ttf`](https://github.com/google/fonts/blob/main/ofl/onest/Onest%5Bwght%5D.ttf) | 100–900 | Interface and navigation |
| `Literata.woff2`, `Literata-Italic.woff2` | [`ofl/literata`](https://github.com/google/fonts/tree/main/ofl/literata) variable TTFs | 200–900, optical size 7–72 | Long-form source reading |

Downloaded on 2026-10-23 from Google Fonts and converted from original TTF to WOFF2 with fontTools 4.61.1. All four web fonts contain Cyrillic glyphs, verified against the Russian alphabet in the font cmap. The fonts are distributed under SIL Open Font License 1.1; the complete copyright notices and license texts are in `onest-OFL.txt`, `unbounded-OFL.txt`, and `literata-OFL.txt`.

The CSS loads fonts locally and uses `font-display: swap`; no font API request is needed at runtime. PDF pages retain the typography in their embedded artwork.
