#!/usr/bin/env python3
"""Generate the macOS DMG installer background (660x400 points).

Usage: python3 scripts/generate-dmg-background.py
Requires Pillow. Output: apps/launcher/src-tauri/dmg/background.png
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, S = 660, 400, 4  # points, supersampling
OUT = Path(__file__).resolve().parent.parent / "apps/launcher/src-tauri/dmg/background.png"
ORANGE = (240, 118, 30)
INK = (46, 48, 52)
MUTED = (122, 118, 112)

def font(path, size):
    return ImageFont.truetype(path, size * S)

img = Image.new("RGB", (W * S, H * S))
px = img.load()
# warm diagonal gradient
for y in range(H * S):
    for x in range(W * S):
        t = (x / (W * S) * 0.5 + y / (H * S) * 0.5)
        px[x, y] = (
            int(252 - 8 * t), int(249 - 14 * t), int(244 - 26 * t))

# soft decorative orange glow, top right
glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse(
    ((W - 120) * S, -140 * S, (W + 160) * S, 140 * S), fill=(*ORANGE, 40))
glow = glow.filter(ImageFilter.GaussianBlur(40 * S))
img = Image.alpha_composite(img.convert("RGBA"), glow)

d = ImageDraw.Draw(img)

# dashed drag arrow between icon slots (icon centers at y=170)
y = 170 * S
x0, x1 = 262 * S, 398 * S
dash, gap = 12 * S, 8 * S
x = x0
while x < x1 - 14 * S:
    d.line((x, y, min(x + dash, x1 - 14 * S), y), fill=(*ORANGE, 255), width=4 * S)
    x += dash + gap
d.polygon([(x1, y), (x1 - 18 * S, y - 12 * S), (x1 - 18 * S, y + 12 * S)], fill=(*ORANGE, 255))

bold = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
reg = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"
def centered(text, cy, f, fill):
    w = d.textlength(text, font=f)
    d.text(((W * S - w) / 2, cy * S), text, font=f, fill=fill)

centered("HomeInventory Launcher'ı Applications'a sürükleyin", 306, font(bold, 17), INK)
centered("Drag HomeInventory Launcher to Applications", 334, font(reg, 13), MUTED)

img.convert("RGB").resize((W, H), Image.LANCZOS).save(OUT, optimize=True)
print("wrote", OUT)
