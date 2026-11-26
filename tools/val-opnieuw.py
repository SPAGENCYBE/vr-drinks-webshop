"""Bouwt een nieuwe val voor de VR Drinks-splash.

- Blik-sprite uit beeld 1 (vóór de val), vloerlijn apart.
- Nieuwe val: versnellend (zwaartekracht), licht kantelend, horizontale drift,
  bewegingsonscherpte via subframes.
- Vanaf het contactmoment de originele splashbeelden, met een korte
  uitdempende camerashock.
"""
import math, os, sys
import numpy as np
from PIL import Image

SRC = sys.argv[1]          # map met originele RGBA-beelden 0001.png ...
OUT = sys.argv[2]          # uitvoermap
os.makedirs(OUT, exist_ok=True)

W, H = 1280, 720
first = np.array(Image.open(f"{SRC}/0001.png")).astype(np.float32)

# Vloerlijn = alles onder rij 600 van beeld 1; blik = alles erboven.
floor = first.copy(); floor[:600] = 0
can = first.copy(); can[600:] = 0
ys, xs = np.where(can[..., 3] > 8)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
sprite = Image.fromarray(can[y0:y1, x0:x1].astype(np.uint8), "RGBA")
cx0 = (x0 + x1) / 2               # horizontale positie in het origineel
top0 = y0                          # bovenkant blik in beeld 1 (=26)
ch = y1 - y0

K = 31                             # eerste originele beeld met contact
TOP_END = 201                      # bovenkant blik in laatste valbeeld
TOP_START = -345                   # start grotendeels boven beeld
N = 15                             # valbeelden (0,25 s bij 60 fps)
SUB = 8                            # subframes voor bewegingsonscherpte

def premul(a):
    a = a.copy(); a[..., :3] *= a[..., 3:4] / 255.0; return a

def unpremul(a):
    out = a.copy(); al = a[..., 3:4]
    out[..., :3] = np.where(al > 0, a[..., :3] * 255.0 / np.maximum(al, 1e-3), 0)
    return np.clip(out, 0, 255)

def pose(u):
    """u in [0,1]: positie en hoek tijdens de val."""
    s = 0.28 * u + 0.72 * u * u                 # beginsnelheid + zwaartekracht
    top = TOP_START + (TOP_END - TOP_START) * s
    ease = 1 - (1 - u) ** 2
    angle = -12.0 + 10.5 * ease                 # graden, blik richt zich op
    dx = 46 * (1 - ease)                        # komt licht schuin binnen
    return top, angle, dx

def render_can(top, angle, dx):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rot = sprite.rotate(angle, resample=Image.BICUBIC, expand=True)
    cx = cx0 + dx
    cy = top + ch / 2
    layer.alpha_composite(rot, (int(round(cx - rot.width / 2)), int(round(cy - rot.height / 2))))
    return np.array(layer).astype(np.float32)

floor_p = premul(floor)
frames = []
for f in range(N):
    acc = np.zeros((H, W, 4), np.float32)
    for s in range(SUB):
        # sluiter van een halve beeldtijd vóór het beeldmoment
        u = max(0.0, (f - 0.5 * (1 - s / (SUB - 1)))) / (N - 1)
        acc += premul(render_can(*pose(min(u, 1.0))))
    acc /= SUB
    # vloer onder het blik
    out = acc + floor_p * (1 - acc[..., 3:4] / 255.0)
    frames.append(unpremul(out).astype(np.uint8))

def shift(img, dx, dy):
    im = Image.fromarray(img, "RGBA")
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(im, (int(round(dx)), int(round(dy))))
    return np.array(canvas)

total = len(sorted(p for p in os.listdir(SRC) if p.endswith(".png")))
for k, i in enumerate(range(K, total + 1)):
    img = np.array(Image.open(f"{SRC}/{i:04d}.png"))
    damp = math.exp(-k / 2.6)
    if damp > 0.03:
        img = shift(img, 3.0 * damp * math.sin(k * 2.7), 7.0 * damp * math.cos(k * 2.1))
    frames.append(img)

for n, fr in enumerate(frames):
    Image.fromarray(fr, "RGBA").save(f"{OUT}/{n:04d}.png")
print("beelden:", len(frames), "duur: %.2f s" % (len(frames) / 60))
