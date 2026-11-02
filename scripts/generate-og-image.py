#!/usr/bin/env python3
"""Generate the 5DO OG share images (1200x630) for the landing pages.

Usage:
    pip3 install --user Pillow
    python3 scripts/generate-og-image.py          # both languages
    python3 scripts/generate-og-image.py ko       # just one

Writes public/landing/og-1200x630.png (ko) and og-en-1200x630.png (en).

WHY TWO IMAGES: both landing pages used to point at the single Korean card —
Korean tagline, Korean pills, and a "5do.co.kr" stamp in the corner. That is
what an English speaker saw in their Facebook/X timeline before deciding
whether to click, and it reads as "not for me" at a glance. The English card
carries English text and stamps 5do.app, the domain overseas users actually
land on.

When bumping versions / featured releases, edit COMMON and LANGS below and
re-run. Don't forget to bump the ?v= cache-buster on every
<meta property="og:image"> / <meta name="twitter:image"> so the social
scrapers re-fetch — they cache aggressively and will otherwise keep serving
the old card for weeks.
"""
import sys
from PIL import Image, ImageDraw, ImageFont
import random

W, H = 1200, 630
OUT_DIR = "/Users/paulkpark/dev/5do-app/public/landing"

# ─── Fonts ────────────────────────────────────────
SF = "/System/Library/Fonts/SFNS.ttf"
SF_MONO = "/System/Library/Fonts/SFNSMono.ttf"
KR = "/System/Library/Fonts/AppleSDGothicNeo.ttc"

def f(path, size, idx=0):
    try: return ImageFont.truetype(path, size, index=idx)
    except: return ImageFont.truetype(path, size)

# ─── Content ──────────────────────────────────────
# The version chip and hero must match what the landing pages advertise.
# They drifted once: the pages said v4.6 / natal reading while this image
# still said v4.4 / DEEP FIELD.
VERSION = "v4.6"

LANGS = {
    "ko": dict(
        out="og-1200x630.png",
        subtitle="Resonance Wellness Platform",
        hero="천궁도 리딩",
        hero_font=lambda s: f(KR, s),
        hero_size=54,
        tagline="검증된 천체력으로 계산 · AI 는 해석만",
        tagline_font=lambda s: f(KR, s),
        pills=[("200+ Tracks", False), ("바이오필드", True), ("소울 코드 AI", True),
               ("Cymatics", False), ("가이드 명상", True)],
        url="5do.co.kr",
    ),
    "en": dict(
        out="og-en-1200x630.png",
        subtitle="Resonance Wellness Platform",
        hero="NATAL READING",
        hero_font=lambda s: f(SF, s),
        hero_size=56,
        tagline="Computed from a real ephemeris — AI only interprets",
        tagline_font=lambda s: f(SF, s),
        pills=[("200+ Tracks", False), ("Biofield", False), ("Soul Code AI", False),
               ("Cymatics", False), ("Guided Meditation", False)],
        url="5do.app",
    ),
}

PANEL_W = 620
PANEL_INNER = PANEL_W - 44  # text inset on both sides


def fit(draw, text, make_font, size, max_w):
    """Shrink until it fits. 'NATAL READING' and '천궁도 리딩' are different
    widths at the same point size, and a hero that overflows the panel is
    worse than one a few points smaller."""
    font = make_font(size)
    while size > 20 and draw.textlength(text, font=font) > max_w:
        size -= 2
        font = make_font(size)
    return font


def build(lang):
    cfg = LANGS[lang]
    font_title    = f(SF, 156)
    font_subtitle = f(SF, 28)
    font_chip     = f(SF_MONO, 19)
    font_pill     = f(SF, 18)
    font_pill_kr  = f(KR, 18)
    font_url      = f(SF_MONO, 22)

    img = Image.new("RGB", (W, H), (10, 10, 15))
    draw = ImageDraw.Draw(img, "RGBA")

    # ─── Background gradient (cosmic dark) ─────────
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

    # ─── Cosmic motif (left side) ───────────────────
    cx, cy = 280, H // 2 + 8
    for i, alpha in enumerate([18, 28, 40, 60, 95]):
        rx = 230 - i * 18
        ry = 50 - i * 4
        draw.ellipse([cx-rx, cy-ry, cx+rx, cy+ry], outline=(140, 90, 220, alpha), width=2)
    draw.ellipse([cx-95, cy-95, cx+95, cy+95], outline=(140, 220, 255, 200), width=3)
    draw.ellipse([cx-98, cy-98, cx+98, cy+98], outline=(140, 220, 255, 70), width=6)
    draw.ellipse([cx-80, cy-80, cx+80, cy+80], fill=(8, 8, 14))
    for sx, sy, sa in [(cx-130, cy-12, 220), (cx+155, cy+10, 180), (cx-115, cy+95, 130)]:
        draw.ellipse([sx-1, sy-1, sx+2, sy+2], fill=(255, 255, 255, sa))

    # ─── Right block: branding + featured callout ───
    RIGHT_X = 510
    draw.text((RIGHT_X, 100), "5DO", font=font_title, fill=(245, 248, 255))
    draw.text((RIGHT_X + 6, 280), cfg["subtitle"], font=font_subtitle, fill=(170, 195, 215))

    panel_x, panel_y = RIGHT_X, 332
    panel_h = 158
    for i in range(5):
        a = 35 - i * 6
        draw.rounded_rectangle(
            [panel_x - i, panel_y - i, panel_x + PANEL_W + i, panel_y + panel_h + i],
            radius=18 + i, outline=(87, 217, 255, a), width=1
        )
    draw.rounded_rectangle(
        [panel_x, panel_y, panel_x + PANEL_W, panel_y + panel_h],
        radius=16, fill=(20, 28, 42, 180), outline=(87, 217, 255, 110), width=2
    )

    chip_x, chip_y = panel_x + 22, panel_y + 18
    chip_text = "NEW · " + VERSION
    chip_w = draw.textlength(chip_text, font=font_chip)
    draw.rounded_rectangle(
        [chip_x, chip_y, chip_x + chip_w + 22, chip_y + 30],
        radius=8, fill=(87, 217, 255, 35), outline=(87, 217, 255, 180), width=1
    )
    draw.text((chip_x + 11, chip_y + 4), chip_text, font=font_chip, fill=(180, 235, 255))

    hero_font = fit(draw, cfg["hero"], cfg["hero_font"], cfg["hero_size"], PANEL_INNER)
    draw.text((panel_x + 22, panel_y + 52), cfg["hero"], font=hero_font, fill=(235, 248, 255))

    tag_font = fit(draw, cfg["tagline"], cfg["tagline_font"], 24, PANEL_INNER)
    draw.text((panel_x + 22, panel_y + 120), cfg["tagline"], font=tag_font, fill=(140, 200, 230))

    # ─── Bottom pills row ────────────────────────────
    pill_y = 548
    pill_x = RIGHT_X
    pad_x, gap = 14, 9
    for label, korean in cfg["pills"]:
        font_obj = font_pill_kr if korean else font_pill
        tw = draw.textlength(label, font=font_obj)
        pw = tw + pad_x * 2
        if pill_x + pw > W - 36:   # never run under the URL stamp
            break
        draw.rounded_rectangle(
            [pill_x, pill_y, pill_x + pw, pill_y + 32],
            radius=10, fill=(35, 42, 64, 200), outline=(80, 100, 140, 140), width=1
        )
        draw.text((pill_x + pad_x, pill_y + (4 if korean else 6)), label,
                  font=font_obj, fill=(195, 215, 235))
        pill_x += pw + gap

    # ─── Bottom-right corner: the domain this card is for ─────────
    uw = draw.textlength(cfg["url"], font=font_url)
    draw.text((W - 36 - uw, H - 50), cfg["url"], font=font_url, fill=(140, 165, 195))

    path = f"{OUT_DIR}/{cfg['out']}"
    img.save(path, "PNG", optimize=True)
    print(f"OK -> {path}  ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    targets = sys.argv[1:] or list(LANGS)
    for t in targets:
        if t not in LANGS:
            sys.exit(f"unknown lang {t!r} — expected one of {', '.join(LANGS)}")
        build(t)
