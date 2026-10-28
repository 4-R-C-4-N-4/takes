"""Split a Codex concept sheet into per-piece binary crops (generated plinth removed), ready for potrace.
Usage: python split_sheet.py sheet.png outdir id1,id2,...  (ids in row-major grid order)"""
import sys, os
import numpy as np
from PIL import Image

sheet, outdir, ids = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
os.makedirs(outdir, exist_ok=True)
img = np.asarray(Image.open(sheet).convert('L'))
ink = img < 128

def runs(mask_1d, min_gap):
    """Contiguous inked spans separated by >= min_gap blank lines."""
    spans, start, gap = [], None, 0
    for i, v in enumerate(mask_1d):
        if v:
            if start is None: start = i
            gap, end = 0, i
        elif start is not None:
            gap += 1
            if gap >= min_gap: spans.append((start, end)); start = None
    if start is not None: spans.append((start, end))
    return spans

rows = runs(ink.any(axis=1), 12)
cells = []
for (r0, r1) in rows:
    band = ink[r0:r1 + 1]
    for (c0, c1) in runs(band.any(axis=0), 12):
        cells.append((r0, r1, c0, c1))
assert len(cells) == len(ids), f'found {len(cells)} cells for {len(ids)} ids: {[(r[1]-r[0], r[3]-r[2]) for r in cells]}'

def plinth_height(cell):
    """Rows of the bottom plinth: skip the rounded bottom edge, then climb while rows stay wide."""
    widths = cell.sum(axis=1); h = len(widths)
    pw = widths[int(h * 0.85):].max()
    y = h - 1
    while y > 0 and widths[y] < 0.6 * pw: y -= 1
    while y > 0 and widths[y] >= 0.6 * pw: y -= 1
    return h - 1 - y

crops = [ink[r0:r1 + 1, c0:c1 + 1] for (r0, r1, c0, c1) in cells]
# Plinths are drawn identically; figures that are as wide as their plinth (turtle, crown) would be
# eaten by a per-cell measure, so cut every cell at the median plinth height (+3px of neck/seam).
cut = int(np.median([plinth_height(c) for c in crops])) + 3
print('plinth height', cut)
for pid, cell in zip(ids, crops):
    h = cell.shape[0]; plinth_top = h - cut
    fig = cell[:plinth_top]
    ys = np.where(fig.any(axis=1))[0]; xs = np.where(fig.any(axis=0))[0]
    fig = fig[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]
    pad = 8
    canvas = np.zeros((fig.shape[0] + 2 * pad, fig.shape[1] + 2 * pad), bool)
    canvas[pad:-pad, pad:-pad] = fig
    Image.fromarray(np.where(canvas, 0, 255).astype('uint8')).save(f'{outdir}/{pid}.png')
    print(pid, 'figure', fig.shape, 'plinth rows removed', h - plinth_top)
