// Deterministic, pure image-processing helpers for the artgen pipeline:
// grayscale threshold, bbox crop and connected-component (island) analysis.
// Operate on a plain { width, height, data: Uint8Array } binary mask (1 = ink,
// 0 = background) so the logic is testable with tiny synthetic images, no
// file I/O or real PNGs required.

export interface BinaryMask {
  width: number;
  height: number;
  /** 1 = ink (foreground), 0 = background. Row-major, length width*height. */
  data: Uint8Array;
}

export interface RGBAImage {
  width: number;
  height: number;
  /** RGBA, length width*height*4. */
  data: Uint8Array | Uint8ClampedArray;
}

/** Threshold a grayscale/RGBA image into a binary ink mask. Dark pixels = ink. */
export function threshold(img: RGBAImage, level = 128): BinaryMask {
  const { width, height, data } = img;
  const out = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    const a = data.length > i * 4 + 3 ? data[i * 4 + 3]! : 255;
    const gray = (r + g + b) / 3;
    out[i] = a > 10 && gray < level ? 1 : 0;
  }
  return { width, height, data: out };
}

export interface BBox {
  x0: number;
  y0: number;
  x1: number; // exclusive
  y1: number; // exclusive
}

/** Tight bounding box of ink pixels. Returns null if the mask is empty. */
export function bbox(mask: BinaryMask): BBox | null {
  const { width, height, data } = mask;
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x]) {
        if (x < x0) x0 = x;
        if (x + 1 > x1) x1 = x + 1;
        if (y < y0) y0 = y;
        if (y + 1 > y1) y1 = y + 1;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Crop a mask to a bbox. */
export function crop(mask: BinaryMask, box: BBox): BinaryMask {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[y * w + x] = mask.data[(y + box.y0) * mask.width + (x + box.x0)]!;
    }
  }
  return { width: w, height: h, data: out };
}

export interface Island {
  size: number;
  bbox: BBox;
}

/** Find 4-connected components of ink pixels, largest first. */
export function connectedComponents(mask: BinaryMask): Island[] {
  const { width, height, data } = mask;
  const visited = new Uint8Array(width * height);
  const islands: Island[] = [];

  for (let start = 0; start < width * height; start++) {
    if (!data[start] || visited[start]) continue;
    const stack = [start];
    visited[start] = 1;
    let size = 0;
    let x0 = width,
      y0 = height,
      x1 = -1,
      y1 = -1;
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = Math.floor(idx / width);
      size++;
      if (x < x0) x0 = x;
      if (x + 1 > x1) x1 = x + 1;
      if (y < y0) y0 = y;
      if (y + 1 > y1) y1 = y + 1;
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx! < 0 || ny! < 0 || nx! >= width || ny! >= height) continue;
        const nidx = ny! * width + nx!;
        if (data[nidx] && !visited[nidx]) {
          visited[nidx] = 1;
          stack.push(nidx);
        }
      }
    }
    islands.push({ size, bbox: { x0, y0, x1, y1 } });
  }

  return islands.sort((a, b) => b.size - a.size);
}

/**
 * Keep only "significant" islands (size >= minFraction of the largest island's
 * size), dropping specks/noise. Returns the kept islands and the count of
 * dropped specks.
 */
export function significantIslands(islands: Island[], minFraction = 0.05): { kept: Island[]; dropped: number } {
  if (islands.length === 0) return { kept: [], dropped: 0 };
  const largest = islands[0]!.size;
  const kept = islands.filter((i) => i.size >= largest * minFraction);
  return { kept, dropped: islands.length - kept.length };
}

/** Mask out everything except the given islands (keep their pixels, zero the rest). */
export function maskToIslands(mask: BinaryMask, islands: Island[]): BinaryMask {
  const keepSet = new Set(islands.map((i) => `${i.bbox.x0},${i.bbox.y0},${i.bbox.x1},${i.bbox.y1},${i.size}`));
  // Re-run connected components to get pixel membership (islands don't carry pixel lists).
  const { width, height, data } = mask;
  const visited = new Uint8Array(width * height);
  const out = new Uint8Array(width * height);
  for (let start = 0; start < width * height; start++) {
    if (!data[start] || visited[start]) continue;
    const stack = [start];
    visited[start] = 1;
    const pixels = [start];
    let x0 = width,
      y0 = height,
      x1 = -1,
      y1 = -1;
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = Math.floor(idx / width);
      if (x < x0) x0 = x;
      if (x + 1 > x1) x1 = x + 1;
      if (y < y0) y0 = y;
      if (y + 1 > y1) y1 = y + 1;
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx! < 0 || ny! < 0 || nx! >= width || ny! >= height) continue;
        const nidx = ny! * width + nx!;
        if (data[nidx] && !visited[nidx]) {
          visited[nidx] = 1;
          stack.push(nidx);
          pixels.push(nidx);
        }
      }
    }
    const key = `${x0},${y0},${x1},${y1},${pixels.length}`;
    if (keepSet.has(key)) {
      for (const p of pixels) out[p] = 1;
    }
  }
  return { width, height, data: out };
}
