"""Recolour real app screenshots (2x) from coral and ink to South African colours: gold for coral, black for ink,
then big black buttons green (white words stay). Dark cards and small black shapes stay black."""
import sys, numpy as np
from PIL import Image
from scipy import ndimage

def hexrgb(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float) / 255
W = np.ones(3)
A = np.stack([hexrgb("#1F1D36") - W, hexrgb("#FF6A4D") - W], axis=1)
P = np.linalg.pinv(A)
B = np.stack([hexrgb("#161616") - W, hexrgb("#FFB81C") - W], axis=1)
G = hexrgb("#007749")

def lum(a): return a @ np.array([0.2126, 0.7152, 0.0722])

def run(src, dst, scale):
    im = np.asarray(Image.open(src).convert("RGB"), float) / 255
    d = im.reshape(-1, 3) - W
    ab = np.clip(d @ P.T, 0, None); s = ab.sum(1, keepdims=True); ab = np.where(s > 1, ab / s, ab)
    out = np.clip(W + ab @ B.T + (d - ab @ A.T), 0, 1).reshape(im.shape)
    # buttons: solid dark, wide, 44 to 72 px tall (at 1x), mostly filled
    dark = lum(out) < 0.12
    lab, n = ndimage.label(dark)
    greened = 0
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        comp = lab[sl] == i
        if not (32 * scale <= h <= 74 * scale and w >= 1.8 * h and comp.sum() / (h * w) >= 0.6):
            continue
        y0, y1 = max(sl[0].start - 2 * scale, 0), min(sl[0].stop + 2 * scale, out.shape[0])
        x0, x1 = max(sl[1].start - 2 * scale, 0), min(sl[1].stop + 2 * scale, out.shape[1])
        m = np.zeros(out.shape[:2], bool); m[sl] = comp
        filled = ndimage.binary_dilation(ndimage.binary_fill_holes(m[y0:y1, x0:x1]), iterations=2 * scale)
        reg = out[y0:y1, x0:x1]
        a = np.clip((1 - lum(reg)), 0, 1)[..., None]       # how dark: 1 on the button, 0 on white words
        new = reg * (1 - a) + (G * a)                        # dark parts take the green, light words stay light
        reg[filled] = new[filled]
        greened += 1
    Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(dst, optimize=True)
    return greened

if __name__ == "__main__":
    scale = int(sys.argv[1])
    for p in sys.argv[2:]:
        print(p, "buttons:", run(p, p, scale))
