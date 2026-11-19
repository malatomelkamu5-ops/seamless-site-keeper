import { decode, encode } from "jpeg-js";

/**
 * Compact school-wide face grid: every registered face becomes one small numbered tile,
 * so a single AI request can screen a new registration against the whole school.
 * Pure JavaScript (no canvas or native image libraries) so it runs on the server runtime.
 */

/** Tile edge in pixels; registration photos are 480x480 with the face in the upper centre. */
export const TILE = 144;
/** Crop of the 480px photo that holds the face (head and shoulders), as fractions of width/height. */
const CROP = { x: 0.125, y: 0.04, size: 0.75 };

type Rgb = { width: number; height: number; data: Uint8Array };

function toRgb(jpegBytes: Uint8Array): Rgb {
  const img = decode(jpegBytes, { useTArray: true, formatAsRGBA: false, maxResolutionInMP: 12, maxMemoryUsageInMB: 128 });
  return { width: img.width, height: img.height, data: img.data };
}

/** Area-averaging resize of a square crop of `src` into a TILE x TILE RGB tile. */
function cropResize(src: Rgb, sx: number, sy: number, size: number, out = TILE): Uint8Array {
  const dst = new Uint8Array(out * out * 3);
  const scale = size / out;
  for (let y = 0; y < out; y++) {
    const y0 = Math.floor(sy + y * scale), y1 = Math.max(y0 + 1, Math.floor(sy + (y + 1) * scale));
    for (let x = 0; x < out; x++) {
      const x0 = Math.floor(sx + x * scale), x1 = Math.max(x0 + 1, Math.floor(sx + (x + 1) * scale));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        if (yy < 0 || yy >= src.height) continue;
        for (let xx = x0; xx < x1; xx++) {
          if (xx < 0 || xx >= src.width) continue;
          const i = (yy * src.width + xx) * 3;
          r += src.data[i]!; g += src.data[i + 1]!; b += src.data[i + 2]!; n++;
        }
      }
      const o = (y * out + x) * 3;
      if (n) { dst[o] = r / n; dst[o + 1] = g / n; dst[o + 2] = b / n; }
    }
  }
  return dst;
}

const toRgba = (rgb: Uint8Array, w: number, h: number) => {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) { rgba[j] = rgb[i]!; rgba[j + 1] = rgb[i + 1]!; rgba[j + 2] = rgb[i + 2]!; rgba[j + 3] = 255; }
  return rgba;
};

/** Turns a full registration photo (JPEG) into a small face tile (JPEG), stored once per student. */
export function makeFaceThumb(jpegBytes: Uint8Array): Uint8Array {
  const src = toRgb(jpegBytes);
  const side = Math.min(src.width, src.height);
  const size = Math.round(side * CROP.size);
  const sx = Math.round((src.width - side) / 2 + side * CROP.x);
  const sy = Math.round((src.height - side) / 2 + side * CROP.y);
  const tile = cropResize(src, sx, sy, size);
  return new Uint8Array(encode({ width: TILE, height: TILE, data: toRgba(tile, TILE, TILE) }, 85).data);
}

/** Columns and rows for n tiles: as square as possible. */
export function gridLayout(n: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  return { cols, rows: Math.max(1, Math.ceil(n / cols)) };
}

// 3x5 bitmap digits for the tile numbers.
const DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111"];

function drawLabel(px: Uint8Array, width: number, left: number, top: number, label: number) {
  const s = 4; // pixel scale of the bitmap font
  const text = String(label);
  const w = text.length * 4 * s + s, h = 7 * s;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((top + y) * width + left + x) * 3;
    px[i] = 0; px[i + 1] = 0; px[i + 2] = 0;
  }
  [...text].forEach((ch, k) => {
    const bits = DIGITS[Number(ch)] ?? "";
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (bits[r * 3 + c] !== "1") continue;
      for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
        const x = left + s + k * 4 * s + c * s + xx, y = top + s + r * s + yy;
        const i = (y * width + x) * 3;
        px[i] = 255; px[i + 1] = 255; px[i + 2] = 0;
      }
    }
  });
}

/**
 * Builds one JPEG grid from face tiles. Tile k (0-based) carries the label k + 1 in its top-left corner.
 * Tiles that fail to decode are left grey so numbering never shifts.
 */
export function composeGrid(tiles: Uint8Array[]): { jpeg: Uint8Array; cols: number; rows: number } {
  const { cols, rows } = gridLayout(tiles.length);
  const gap = 4;
  const width = cols * TILE + (cols + 1) * gap, height = rows * TILE + (rows + 1) * gap;
  const px = new Uint8Array(width * height * 3).fill(255);
  tiles.forEach((bytes, k) => {
    const left = gap + (k % cols) * (TILE + gap), top = gap + Math.floor(k / cols) * (TILE + gap);
    let tile: Rgb | null = null;
    try { tile = toRgb(bytes); } catch { tile = null; }
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const o = ((top + y) * width + left + x) * 3;
      if (tile && x < tile.width && y < tile.height) {
        const i = (y * tile.width + x) * 3;
        px[o] = tile.data[i]!; px[o + 1] = tile.data[i + 1]!; px[o + 2] = tile.data[i + 2]!;
      } else { px[o] = 128; px[o + 1] = 128; px[o + 2] = 128; }
    }
    drawLabel(px, width, left, top, k + 1);
  });
  return { jpeg: new Uint8Array(encode({ width, height, data: toRgba(px, width, height) }, 82).data), cols, rows };
}

export const bytesToDataUrl = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(bin)}`;
};
