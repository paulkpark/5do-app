# Fonts for the natal PDF export

`GothicA1-KR-Regular.ttf`, `GothicA1-KR-Bold.ttf`

Gothic A1 (SIL Open Font License 1.1 — see OFL.txt), subset for this use:
all 11,172 Hangul syllables plus Latin and common punctuation, with GSUB/GPOS,
hinting and vertical-metrics tables dropped.

Why these are checked in rather than fetched: Korean text in a PDF only renders
if the font travels inside the document, and the reading is generated per user,
so there is no way to know in advance which syllables it will contain — the whole
syllable block has to be there.

Why Gothic A1: measured against the alternatives at the same coverage, it is the
one that survives PDF compression smallest, which is the whole point of moving
the reading off images.

    Gothic A1      1,545 KB  ->  ~379 KB in the PDF
    Nanum Gothic   1,865 KB  ->  ~602 KB
    Noto Sans KR   2,291 KB  ->  ~828 KB

Regenerate with fontTools:

    pyftsubset GothicA1-Regular.ttf \
      --unicodes=U+0020-007E,U+AC00-D7A3,U+00B7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2026,U+00B0,U+2032,U+2033,U+00D7,U+00F7,U+00B1,U+2248,U+2192,U+2190,U+2194,U+2022 \
      --drop-tables+=BASE,JSTF,DSIG,EBDT,EBLC,GSUB,GPOS,vmtx,vhea,VORG \
      --output-file=GothicA1-KR-Regular.ttf

Note these carry no astrological symbols (no zodiac signs, no planet glyphs).
That is deliberate and why the chart block stays an image: those symbols appear
only there, and the written reading has none.
