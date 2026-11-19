import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { decode } from "jpeg-js";
import { composeGrid, gridLayout, makeFaceThumb, TILE } from "@/lib/face-grid";
import { screenMatch, MATCH_CONFIDENCE } from "@/lib/face.server";

describe("compact school-wide face grid", () => {
  it("fits every section's students into one grid", () => {
    expect(gridLayout(106)).toEqual({ cols: 11, rows: 10 });
    expect(gridLayout(1)).toEqual({ cols: 1, rows: 1 });
  });

  it("builds one numbered image from many face tiles", () => {
    const logo = new Uint8Array(readFileSync("public/school-logo.jpg"));
    const tile = makeFaceThumb(logo);
    const t = decode(tile, { useTArray: true });
    expect([t.width, t.height]).toEqual([TILE, TILE]);
    const grid = composeGrid(Array.from({ length: 12 }, () => tile));
    const g = decode(grid.jpeg, { useTArray: true });
    expect(grid.cols).toBe(4);
    expect(g.width).toBe(4 * TILE + 5 * 4);
    expect(g.height).toBe(3 * TILE + 4 * 4);
  });

  it("blocks only a confident, named tile inside the grid", () => {
    expect(MATCH_CONFIDENCE).toBe(0.9);
    expect(screenMatch({ match: 12, same_person: true, confidence: 0.95 }, 106)).toBe(12);
    expect(screenMatch({ match: "#7", confidence: 0.92 }, 106)).toBe(7);
    expect(screenMatch({ match: 12, same_person: true, confidence: 0.85 }, 106)).toBeNull();
    expect(screenMatch({ match: 12, same_person: false, confidence: 0.99 }, 106)).toBeNull();
    expect(screenMatch({ match: 107, same_person: true, confidence: 1 }, 106)).toBeNull();
    expect(screenMatch({ match: null, confidence: 0 }, 106)).toBeNull();
  });
});
