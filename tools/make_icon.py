# Draws images/icon.png (128x128): a page with an arrow leaving it.
# Usage: uv run --with pillow python tools/make_icon.py
from pathlib import Path

from PIL import Image, ImageDraw

S = 4  # draw large, then shrink for smooth edges
W = 128 * S
img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

d.rounded_rectangle([0, 0, W - 1, W - 1], radius=24 * S, fill=(37, 99, 160, 255))

# page with a folded corner
x0, y0, x1, y1, fold = 26 * S, 22 * S, 78 * S, 106 * S, 16 * S
d.polygon([(x0, y0), (x1 - fold, y0), (x1, y0 + fold), (x1, y1), (x0, y1)], fill=(245, 247, 250, 255))
d.polygon([(x1 - fold, y0), (x1 - fold, y0 + fold), (x1, y0 + fold)], fill=(190, 205, 222, 255))
for i in range(4):
    yy = (50 + i * 13) * S
    d.rounded_rectangle([34 * S, yy, (66 - (i % 2) * 10) * S, yy + 4 * S], radius=2 * S, fill=(160, 178, 198, 255))

# arrow leaving the page to the upper right
c = (255, 196, 61, 255)
d.line([(58 * S, 78 * S), (100 * S, 36 * S)], fill=c, width=11 * S)
d.polygon([(108 * S, 28 * S), (108 * S, 64 * S), (72 * S, 28 * S)], fill=c)

out = Path(__file__).resolve().parent.parent / "images" / "icon.png"
out.parent.mkdir(exist_ok=True)
img.resize((128, 128), Image.LANCZOS).save(out)
print(out)
