# Makes the Neon OS app icons in icons/: a ring of glowing orbs on dark metal.
# Run from the repo root: python tools/make-icons.py  (needs Pillow)
import math
from PIL import Image, ImageDraw, ImageFilter

ORB = (0xff, 0x3d, 0xe8)   # magenta
BG = (7, 5, 12)

def orb_layer(size, scale):
    S = size * 4  # draw large, shrink for smooth edges
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    core = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    g, c = ImageDraw.Draw(glow), ImageDraw.Draw(core)
    cx = cy = S / 2
    R = S * 0.27 * scale
    for i in range(12):
        a = i * math.tau / 12 - math.pi / 2
        x, y = cx + math.cos(a) * R, cy + math.sin(a) * R
        r = S * (0.052 + 0.012 * math.sin(i * 1.7)) * scale
        g.ellipse([x - r * 2.4, y - r * 2.4, x + r * 2.4, y + r * 2.4], fill=ORB + (90,))
        c.ellipse([x - r, y - r, x + r, y + r], fill=ORB + (255,))
        h = r * 0.45
        c.ellipse([x - h, y - h, x + h, y + h], fill=(255, 235, 252, 255))
    # the sleeping centre
    r = S * 0.07 * scale
    g.ellipse([cx - r * 3, cy - r * 3, cx + r * 3, cy + r * 3], fill=ORB + (70,))
    c.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ORB + (200,))
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.03))
    out = Image.alpha_composite(glow, core.filter(ImageFilter.GaussianBlur(S * 0.002)))
    return out.resize((size, size), Image.LANCZOS)

def background(size, rounded):
    S = size * 4
    bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    grad = Image.new("RGBA", (S, S))
    gd = ImageDraw.Draw(grad)
    for yy in range(S):
        t = yy / S
        col = tuple(int(a + (b - a) * t) for a, b in zip((34, 14, 44), BG))
        gd.line([(0, yy), (S, yy)], fill=col + (255,))
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    if rounded: md.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=255)
    else: md.rectangle([0, 0, S, S], fill=255)
    bg.paste(grad, (0, 0), mask)
    return bg.resize((size, size), Image.LANCZOS)

def icon(size, rounded=True, scale=1.0):
    return Image.alpha_composite(background(size, rounded), orb_layer(size, scale))

icon(192).save("icons/icon-192.png")
icon(512).save("icons/icon-512.png")
icon(192, rounded=False, scale=0.78).save("icons/maskable-192.png")   # safe zone for masked icons
icon(512, rounded=False, scale=0.78).save("icons/maskable-512.png")
icon(180, rounded=False).save("icons/apple-touch-icon.png")
icon(64).save("icons/favicon-64.png")
icon(1024).save("icons/icon-1024.png")  # the desktop app builds its Windows, macOS and Linux icons from this
print("icons written")
