"""Generate YPFG Academy app icons from code: black square, white lowercase "ya" in Outfit Bold."""
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "node_modules/@fontsource/outfit/files/outfit-latin-700-normal.woff")
OUT = os.path.join(ROOT, "public/icons")


def icon(size, scale, name):
    img = Image.new("RGB", (size, size), "#000000")
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, int(size * scale))
    l, t, r, b = d.textbbox((0, 0), "ya", font=font)
    x = (size - (r - l)) / 2 - l
    y = (size - (b - t)) / 2 - t
    d.text((x, y), "ya", font=font, fill="#FFFFFF")
    img.save(os.path.join(OUT, name), optimize=True)


os.makedirs(OUT, exist_ok=True)
icon(192, 0.52, "icon-192.png")
icon(512, 0.52, "icon-512.png")
# Maskable: keep glyphs inside the 80% safe zone.
icon(512, 0.38, "icon-maskable-512.png")
icon(180, 0.52, "apple-touch-icon.png")
icon(32, 0.6, "favicon-32.png")
print("icons written to", OUT)
