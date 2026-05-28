#!/usr/bin/env python3
"""Generate the 5DO OG share image (1200x630) for landing pages.

Usage:
    pip3 install --user Pillow
    python3 scripts/generate-og-image.py

Writes to public/landing/og-1200x630.png.
When bumping versions / featured releases, edit the constants below
(version chip text, hero feature name + tagline, pills) and re-run.
Don't forget to bump the ?v= cache-buster on <meta property="og:image">
so social-media scrapers re-fetch.
"""
from PIL import Image, ImageDraw, ImageFont
import random

W, H = 1200, 630
OUT = "/Users/paulkpark/dev/5do-app/public/landing/og-1200x630.png"

# ─── Fonts ────────────────────────────────────────
SF = "/System/Library/Fonts/SFNS.ttf"
SF_MONO = "/System/Library/Fonts/SFNSMono.ttf"
KR = "/System/Library/Fonts/AppleSDGothicNeo.ttc"

def f(path, size, idx=0):
    try: return ImageFont.truetype(path, size, index=idx)
    except: return ImageFont.truetype(path, size)

font_title       = f(SF, 156)          # "5DO"
font_subtitle    = f(SF, 28)           # "Frequency Healing Platform"
font_new_label   = f(SF_MONO, 19)      # "NEW · v4.4"
font_deepfield   = f(SF, 56)           # "DEEP FIELD"
font_tagline_kr  = f(KR, 24)           # "시네마틱 코스믹 명상 · 3관문"
font_pill        = f(SF, 18)
font_pill_kr     = f(KR, 18)
font_url         = f(SF_MONO, 22)
font_version     = f(SF_MONO, 18)

# ─── Canvas ───────────────────────────────────────
img = Image.new("RGB", (W, H), (10, 10, 15))
draw = ImageDraw.Draw(img, "RGBA")

# ─── Background gradient (cosmic dark) ─────────
# Vertical gradient: deep navy → near black
for y in range(H):
    t = y / H
    r = int(8  + 4 * (1 - t))
    g = int(10 + 8 * (1 - t))
    b = int(20 + 16 * (1 - t))
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# ─── Subtle starfield ────────────────────────────
random.seed(42)
for _ in range(160):
    x = random.randint(0, W)
    y = random.randint(0, H)
    s = random.choice([1, 1, 1, 2])
    a = random.randint(40, 200)
    draw.ellipse([x-s, y-s, x+s, y+s], fill=(255, 255, 255, a))

# ─── DEEP FIELD black hole motif (left side) ────
# A subtle accretion disc + photon ring + event horizon
cx, cy = 280, H // 2 + 8
# Faint outer accretion (warm purple → cyan oval)
for i, alpha in enumerate([18, 28, 40, 60, 95]):
    rx = 230 - i * 18
    ry = 50 - i * 4
    draw.ellipse([cx-rx, cy-ry, cx+rx, cy+ry], outline=(140, 90, 220, alpha), width=2)
# Photon ring (bright cyan)
draw.ellipse([cx-95, cy-95, cx+95, cy+95], outline=(140, 220, 255, 200), width=3)
draw.ellipse([cx-98, cy-98, cx+98, cy+98], outline=(140, 220, 255, 70), width=6)
# Event horizon
draw.ellipse([cx-80, cy-80, cx+80, cy+80], fill=(8, 8, 14))
# Tiny distant stars near rings
for sx, sy, sa in [(cx-130, cy-12, 220), (cx+155, cy+10, 180), (cx-115, cy+95, 130)]:
    draw.ellipse([sx-1, sy-1, sx+2, sy+2], fill=(255, 255, 255, sa))

# ─── Right block: branding + DEEP FIELD callout ─
RIGHT_X = 510

# 5DO wordmark
draw.text((RIGHT_X, 100), "5DO", font=font_title, fill=(245, 248, 255))
# Subtitle
draw.text((RIGHT_X + 6, 280), "Frequency Healing Platform",
          font=font_subtitle, fill=(170, 195, 215))

# DEEP FIELD callout panel (rounded rect with soft glow)
panel_x, panel_y = RIGHT_X, 332
panel_w, panel_h = 620, 158
# Soft outer glow rect (multiple)
for i in range(5):
    a = 35 - i * 6
    draw.rounded_rectangle(
        [panel_x - i, panel_y - i, panel_x + panel_w + i, panel_y + panel_h + i],
        radius=18 + i, outline=(87, 217, 255, a), width=1
    )
# Main panel fill
draw.rounded_rectangle(
    [panel_x, panel_y, panel_x + panel_w, panel_y + panel_h],
    radius=16, fill=(20, 28, 42, 180), outline=(87, 217, 255, 110), width=2
)

# NEW · v4.4 chip
chip_x, chip_y = panel_x + 22, panel_y + 18
chip_text = "NEW · v4.4"
chip_w = draw.textlength(chip_text, font=font_new_label)
draw.rounded_rectangle(
    [chip_x, chip_y, chip_x + chip_w + 22, chip_y + 30],
    radius=8, fill=(87, 217, 255, 35), outline=(87, 217, 255, 180), width=1
)
draw.text((chip_x + 11, chip_y + 4), chip_text, font=font_new_label, fill=(180, 235, 255))

# DEEP FIELD title
draw.text((panel_x + 22, panel_y + 54), "DEEP FIELD", font=font_deepfield, fill=(235, 248, 255))

# Korean tagline INSIDE the panel
draw.text((panel_x + 22, panel_y + 120),
          "시네마틱 코스믹 명상 · 펄서 → 은하 → 블랙홀", font=font_tagline_kr,
          fill=(140, 200, 230))

# ─── Bottom pills row ────────────────────────────
pills = [
    ("150+ Tracks", font_pill, False),
    ("Biofield",    font_pill, False),
    ("Akashic AI",  font_pill, False),
    ("Cymatics",    font_pill, False),
    ("가이드 명상", font_pill_kr, True),
]
pill_y = 548
pill_x = RIGHT_X
pad_x  = 14
gap    = 9
for label, font_obj, korean in pills:
    tw = draw.textlength(label, font=font_obj)
    pw = tw + pad_x * 2
    ph = 32
    draw.rounded_rectangle(
        [pill_x, pill_y, pill_x + pw, pill_y + ph],
        radius=10, fill=(35, 42, 64, 200), outline=(80, 100, 140, 140), width=1
    )
    text_y = pill_y + (4 if korean else 6)
    draw.text((pill_x + pad_x, text_y), label, font=font_obj, fill=(195, 215, 235))
    pill_x += pw + gap

# ─── Bottom-right corner: URL + version ─────────
url = "5do.co.kr"
uw = draw.textlength(url, font=font_url)
draw.text((W - 36 - uw, H - 50), url, font=font_url, fill=(140, 165, 195))

img.save(OUT, "PNG", optimize=True)
print(f"OK -> {OUT}")
print(f"size: {img.size}")
