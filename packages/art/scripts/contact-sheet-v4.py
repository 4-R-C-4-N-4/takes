#!/usr/bin/env python3
"""Render docs/art/set-v4-{40,96}.png contact sheets and set-v4-board.png lineup
for the hand-drawn v3 piece overrides, plus a pairwise IoU distinctness report.
"""
import os, subprocess, tempfile, itertools, json
from PIL import Image

REPO = "/home/ivy/Work/takes-wt/art-v4"
PIECES_DIR = os.path.join(REPO, "packages/library/pieces")
OUT_DIR = os.path.join(REPO, "docs/art")
os.makedirs(OUT_DIR, exist_ok=True)

ORDER = ["pawn","triton","sai","worm","rose","vine","broom","knight","bishop","coroner","bullseye","impact","octopus","scarab","seal","halo","jester","turtle","prince","dancer","rook","azazel","queen","hierophant","bane","king"]

LIGHT_SQ = "#e2d5bd"
DARK_SQ = "#8d775f"
WHITE_FILL, WHITE_STROKE = "#f6f2ea", "#2b2620"
BLACK_FILL, BLACK_STROKE = "#2f2a25", "#ece4d6"

def load_svg(piece):
    path = os.path.join(PIECES_DIR, piece, "art.svg")
    with open(path) as f:
        return f.read()

def render(piece, size, fill, stroke, bg):
    raw = load_svg(piece)
    raw = raw.replace("var(--piece-fill)", fill).replace("var(--piece-stroke)", stroke)
    with tempfile.NamedTemporaryFile(suffix=".svg", mode="w", delete=False) as f:
        f.write(raw)
        svg_path = f.name
    png_path = svg_path.replace(".svg", ".png")
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), "-o", png_path, svg_path], check=True)
    img = Image.open(png_path).convert("RGBA")
    canvas = Image.new("RGBA", (size, size), bg)
    canvas.alpha_composite(img)
    os.unlink(svg_path); os.unlink(png_path)
    return canvas.convert("RGB")

def contact_sheet(size, path):
    rows = [
        (WHITE_FILL, WHITE_STROKE, LIGHT_SQ, "white/light"),
        (WHITE_FILL, WHITE_STROKE, DARK_SQ, "white/dark"),
        (BLACK_FILL, BLACK_STROKE, LIGHT_SQ, "black/light"),
        (BLACK_FILL, BLACK_STROKE, DARK_SQ, "black/dark"),
    ]
    pad = 6
    cell = size + pad
    sheet = Image.new("RGB", (cell * len(ORDER) + pad, cell * len(rows) + pad), "#ffffff")
    for r, (fill, stroke, bg, _label) in enumerate(rows):
        for c, piece in enumerate(ORDER):
            tile = render(piece, size, fill, stroke, bg)
            sheet.paste(tile, (pad + c * cell, pad + r * cell))
    sheet.save(path)
    print("wrote", path)

def board_lineup(path):
    sq = 80
    board = Image.new("RGB", (sq * 8, sq * 8), "#000000")
    back_rank = ["azazel","coroner","hierophant","bane","king","hierophant","coroner","azazel"]
    # second-from-back mixes several new pawn-tier pieces across both wings
    extra = ["triton","sai","worm","rose","vine","broom","halo","jester"]
    for row_idx, rank in enumerate([extra, back_rank]):
        is_black = row_idx == 0
        fill, stroke = (BLACK_FILL, BLACK_STROKE) if is_black else (WHITE_FILL, WHITE_STROKE)
        y = row_idx * sq
        for col, piece in enumerate(rank):
            bg = LIGHT_SQ if (row_idx + col) % 2 == 0 else DARK_SQ
            tile = render(piece, sq, fill, stroke, bg)
            board.paste(tile, (col * sq, y))
    # fill remaining 6 ranks with alternating empty squares
    for row_idx in range(2, 8):
        for col in range(8):
            bg = LIGHT_SQ if (row_idx + col) % 2 == 0 else DARK_SQ
            tile = Image.new("RGB", (sq, sq), bg)
            board.paste(tile, (col * sq, row_idx * sq))
    board.save(path)
    print("wrote", path)

def bbox_mask(piece, size=40):
    img = render(piece, size, "#000000", "#000000", "#ffffff")
    mask = img.convert("L").point(lambda p: 255 if p < 250 else 0)
    return list(mask.getdata())

def iou(m1, m2):
    inter = sum(1 for a, b in zip(m1, m2) if a and b)
    union = sum(1 for a, b in zip(m1, m2) if a or b)
    return inter / union if union else 0.0

def distinctness_report():
    masks = {p: bbox_mask(p) for p in ORDER}
    pairs = []
    for p1, p2 in itertools.combinations(ORDER, 2):
        v = iou(masks[p1], masks[p2])
        pairs.append((v, p1, p2))
    pairs.sort()
    report = {"pairs": [{"iou": v, "a": p1, "b": p2} for v, p1, p2 in pairs]}
    out_path = os.path.join(OUT_DIR, "set-v4-distinctness.json")
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)
    print("min IoU pair:", pairs[0])
    print("wrote", out_path)
    return pairs[0]

if __name__ == "__main__":
    contact_sheet(40, os.path.join(OUT_DIR, "set-v4-40.png"))
    contact_sheet(96, os.path.join(OUT_DIR, "set-v4-96.png"))
    board_lineup(os.path.join(OUT_DIR, "set-v4-board.png"))
    distinctness_report()
