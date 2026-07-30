#!/usr/bin/env python3
"""Generates branded 1200x630 social preview cards for every token/asset
detail page into public/og/asset-<symbol>.jpg.

Run:  python3 scripts/gen-asset-og.py
Then: bun run gen:social-hashes   (refreshes the content hashes)

Token list is parsed from src/lib/mock-data.ts so the cards stay in sync
with the assets the app actually renders.
"""
import os
import re
import glob
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "og")
FONT_DIRS = glob.glob("/nix/store/*dejavu-fonts*/share/fonts/truetype")
FONT_DIR = FONT_DIRS[0] if FONT_DIRS else "/usr/share/fonts/truetype/dejavu"

BG = (26, 30, 38)
CARD = (33, 39, 50)
MINT = (52, 224, 161)
CYAN = (72, 190, 220)
TEXT = (240, 245, 250)
MUTED = (150, 162, 178)


def font(name, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)


def parse_assets():
    src = open(os.path.join(ROOT, "src", "lib", "mock-data.ts"), encoding="utf8").read()
    return re.findall(r'symbol:\s*"([A-Z0-9]+)",\s*\n\s*name:\s*"([^"]+)"', src)


def card(symbol, name):
    img = Image.new("RGB", (1200, 630), BG)
    d = ImageDraw.Draw(img)

    # subtle diagonal glow
    glow = Image.new("RGB", (1200, 630), BG)
    gd = ImageDraw.Draw(glow)
    for i in range(0, 630, 6):
        t = i / 630
        gd.line([(0, i), (1200, i - 300)], fill=(int(26 + 26 * t), int(30 + 40 * t), int(38 + 34 * t)), width=6)
    img = Image.blend(img, glow, 0.5)
    d = ImageDraw.Draw(img)

    d.rounded_rectangle([56, 56, 1144, 574], radius=32, fill=CARD, outline=(58, 68, 84), width=2)
    d.rounded_rectangle([56, 56, 68, 574], radius=6, fill=MINT)

    d.text((112, 108), "PUMPPILOT AI", font=font("DejaVuSans-Bold.ttf", 28), fill=MINT)
    d.text((112, 172), symbol, font=font("DejaVuSans-Bold.ttf", 124), fill=TEXT)
    d.text((112, 320), name, font=font("DejaVuSans.ttf", 48), fill=CYAN)
    d.text((112, 400), "Momentum score - chart - paper trading", font=font("DejaVuSans.ttf", 34), fill=MUTED)
    d.text((112, 460), "Spot momentum. Control risk. Trade smarter.", font=font("DejaVuSans-Bold.ttf", 30), fill=TEXT)
    d.text((112, 512), "Demo data only. Not financial advice.", font=font("DejaVuSans.ttf", 24), fill=MUTED)

    # momentum ring motif
    d.ellipse([880, 200, 1090, 410], outline=(58, 68, 84), width=14)
    d.arc([880, 200, 1090, 410], start=-90, end=140, fill=MINT, width=14)

    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"asset-{symbol.lower()}.jpg")
    img.save(path, "JPEG", quality=88, optimize=True)
    return path


if __name__ == "__main__":
    assets = parse_assets()
    for sym, name in assets:
        print("wrote", card(sym, name))
    print(f"{len(assets)} asset social cards generated")
