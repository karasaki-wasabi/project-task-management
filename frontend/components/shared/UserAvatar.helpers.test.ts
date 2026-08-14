// user-avatar 1.1 / 1.2 — FNV-1a / mulberry32 / palette / symmetric grid
// (Requirements 1.1, 1.2, 1.3, 1.4; design.md UserAvatar.helpers.ts Service Interface).
import { describe, expect, it } from "vitest";
import {
  createMulberry32,
  fnv1aHash,
  generateUserAvatarPalette,
  generateUserAvatarPattern,
  userAvatarPaletteAt,
} from "./UserAvatar.helpers";
import type { UserAvatarAxis, UserAvatarCell } from "./UserAvatar.helpers";

const HSL_RE = /^hsl\((\d+), (\d+)%, (\d+)%\)$/;

function parseHsl(css: string): { h: number; s: number; l: number } {
  const match = css.match(HSL_RE);
  expect(match, `expected CSS hsl() string, got ${css}`).not.toBeNull();
  return { h: Number(match![1]), s: Number(match![2]), l: Number(match![3]) };
}

describe("fnv1aHash", () => {
  it("returns the FNV-1a 32-bit test vectors", () => {
    expect(fnv1aHash("")).toBe(0x811c9dc5);
    expect(fnv1aHash("a")).toBe(0xe40c292c);
    expect(fnv1aHash("foobar")).toBe(0xbf9cf968);
  });

  it("is deterministic for the same string, including empty and non-ASCII", () => {
    expect(fnv1aHash("user-abc")).toBe(fnv1aHash("user-abc"));
    expect(fnv1aHash("")).toBe(fnv1aHash(""));
    expect(fnv1aHash("田中")).toBe(fnv1aHash("田中"));
  });

  it("hashes UTF-8 bytes so non-ASCII strings differ from ASCII lookalikes", () => {
    expect(fnv1aHash("田中")).not.toBe(fnv1aHash("a"));
    expect(fnv1aHash("田中")).not.toBe(fnv1aHash(""));
  });
});

describe("createMulberry32", () => {
  it("returns values in [0, 1) and is deterministic for the same seed", () => {
    const a = createMulberry32(0x811c9dc5);
    const b = createMulberry32(0x811c9dc5);
    const sequenceA = [a(), a(), a(), a()];
    const sequenceB = [b(), b(), b(), b()];
    expect(sequenceA).toEqual(sequenceB);
    for (const value of sequenceA) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(new Set(sequenceA).size).toBe(4);
  });

  it("diverges when seeded from different hashes", () => {
    const a = createMulberry32(fnv1aHash("user-a"));
    const b = createMulberry32(fnv1aHash("user-b"));
    expect(a()).not.toBe(b());
  });
});

describe("userAvatarPaletteAt (N=12 mechanical palette)", () => {
  it("uses 30-degree hue steps and CSS hsl() strings for main/alt/background", () => {
    for (let index = 0; index < 12; index += 1) {
      const palette = userAvatarPaletteAt(index);
      expect(palette.index).toBe(index);
      const main = parseHsl(palette.mainColor);
      const alt = parseHsl(palette.altColor);
      const background = parseHsl(palette.backgroundColor);
      expect(main.h).toBe(index * 30);
      expect(background.h).toBe(main.h);
      expect(background.s).toBe(30);
      expect(background.l).toBe(96);
      expect(alt.h).toBe((main.h + 32) % 360);
      expect(alt.s).toBe(main.s - 10);
      expect(alt.l).toBe(main.l + 14);
    }
  });

  it("assigns one fixed S/L pair per hue band, not per-hue tuning", () => {
    const sl = (index: number) => {
      const { s, l } = parseHsl(userAvatarPaletteAt(index).mainColor);
      return `${s}/${l}`;
    };
    expect(sl(0)).toBe(sl(1));
    expect(sl(1)).toBe(sl(2));
    expect(sl(3)).toBe(sl(4));
    expect(sl(4)).toBe(sl(5));
    expect(sl(6)).toBe(sl(7));
    expect(sl(7)).toBe(sl(8));
    expect(sl(9)).toBe(sl(10));
    expect(sl(10)).toBe(sl(11));
    expect(new Set([sl(0), sl(3), sl(6), sl(9)]).size).toBe(4);
  });
});

describe("generateUserAvatarPalette", () => {
  it("returns the same index and hsl() colors for the same userId", () => {
    const first = generateUserAvatarPalette("user-abc");
    const second = generateUserAvatarPalette("user-abc");
    expect(first).toEqual(second);
    expect(first.index).toBeGreaterThanOrEqual(0);
    expect(first.index).toBeLessThan(12);
    expect(first.mainColor).toMatch(HSL_RE);
    expect(first.altColor).toMatch(HSL_RE);
    expect(first.backgroundColor).toMatch(HSL_RE);
    expect(first).toEqual(userAvatarPaletteAt(first.index));
  });

  it("selects the palette index from the first mulberry32 draw of the FNV-1a seed", () => {
    const userId = "user-abc";
    const rng = createMulberry32(fnv1aHash(userId));
    const expectedIndex = Math.floor(rng() * 12);
    expect(generateUserAvatarPalette(userId).index).toBe(expectedIndex);
  });

  it("accepts an empty userId without throwing and still returns a palette", () => {
    const palette = generateUserAvatarPalette("");
    expect(palette.index).toBeGreaterThanOrEqual(0);
    expect(palette.index).toBeLessThan(12);
    expect(palette.mainColor).toMatch(HSL_RE);
  });

  it("spreads distinct userIds across the 12 hues with high probability", () => {
    const indices = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      indices.add(generateUserAvatarPalette(`user-${i}`).index);
    }
    expect(indices.size).toBe(12);
  });
});

const AXES: UserAvatarAxis[] = ["leftRight", "topBottom", "point"];
const GRID_LAST = 4;
const MIN_FILL_RATIO = 0.34;
const MAX_FILL_RATIO = 0.74;

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function paintedMap(cells: UserAvatarCell[]): Map<string, "main" | "alt"> {
  const map = new Map<string, "main" | "alt">();
  for (const cell of cells) {
    map.set(cellKey(cell.x, cell.y), cell.tone);
  }
  return map;
}

function mirrorOf(axis: UserAvatarAxis, x: number, y: number): { x: number; y: number } {
  if (axis === "leftRight") return { x: GRID_LAST - x, y };
  if (axis === "topBottom") return { x, y: GRID_LAST - y };
  return { x: GRID_LAST - x, y: GRID_LAST - y };
}

function isIndependentCell(axis: UserAvatarAxis, x: number, y: number): boolean {
  const mirror = mirrorOf(axis, x, y);
  if (axis === "leftRight") return x <= mirror.x;
  if (axis === "topBottom") return y <= mirror.y;
  return y < mirror.y || (y === mirror.y && x <= mirror.x);
}

function independentRegionSize(axis: UserAvatarAxis): number {
  return axis === "point" ? 13 : 15;
}

function paintedIndependentCount(cells: UserAvatarCell[], axis: UserAvatarAxis): number {
  return cells.filter((cell) => isIndependentCell(axis, cell.x, cell.y)).length;
}

describe("generateUserAvatarPattern", () => {
  it("returns the same grid, colors, and axis for the same userId", () => {
    const first = generateUserAvatarPattern("user-abc");
    const second = generateUserAvatarPattern("user-abc");
    expect(first).toEqual(second);
    expect(first.gridSize).toBe(5);
    expect(AXES).toContain(first.axis);
  });

  it("lists only painted cells with main or alt tones and coords in 0..4", () => {
    const pattern = generateUserAvatarPattern("user-abc");
    const seen = new Set<string>();
    for (const cell of pattern.cells) {
      expect(cell.tone === "main" || cell.tone === "alt").toBe(true);
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.x).toBeLessThanOrEqual(GRID_LAST);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeLessThanOrEqual(GRID_LAST);
      const key = cellKey(cell.x, cell.y);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("uses the same hsl() colors as generateUserAvatarPalette for the same userId", () => {
    const userId = "user-abc";
    const palette = generateUserAvatarPalette(userId);
    const pattern = generateUserAvatarPattern(userId);
    expect(pattern.mainColor).toBe(palette.mainColor);
    expect(pattern.altColor).toBe(palette.altColor);
    expect(pattern.backgroundColor).toBe(palette.backgroundColor);
  });

  it("selects the axis from the second mulberry32 draw after the palette index", () => {
    const userId = "user-abc";
    const rng = createMulberry32(fnv1aHash(userId));
    rng();
    const expectedAxis = AXES[Math.floor(rng() * AXES.length)];
    expect(generateUserAvatarPattern(userId).axis).toBe(expectedAxis);
  });

  it("mirrors painted tones across the chosen axis, including the point-symmetry center", () => {
    const userIds = ["user-abc", "user-0", "user-1", "user-2", "user-3", ""];
    for (const userId of userIds) {
      const pattern = generateUserAvatarPattern(userId);
      const map = paintedMap(pattern.cells);
      for (let y = 0; y <= GRID_LAST; y += 1) {
        for (let x = 0; x <= GRID_LAST; x += 1) {
          const tone = map.get(cellKey(x, y));
          const mirror = mirrorOf(pattern.axis, x, y);
          expect(map.get(cellKey(mirror.x, mirror.y))).toBe(tone);
        }
      }
    }
  });

  it("keeps independent-region fill count within 34%..74% for typical userIds", () => {
    for (let i = 0; i < 50; i += 1) {
      const pattern = generateUserAvatarPattern(`user-${i}`);
      const regionSize = independentRegionSize(pattern.axis);
      const painted = paintedIndependentCount(pattern.cells, pattern.axis);
      expect(painted).toBeGreaterThanOrEqual(MIN_FILL_RATIO * regionSize);
      expect(painted).toBeLessThanOrEqual(MAX_FILL_RATIO * regionSize);
    }
  });

  it("accepts an empty userId without throwing and still returns a pattern", () => {
    const pattern = generateUserAvatarPattern("");
    expect(pattern.gridSize).toBe(5);
    expect(AXES).toContain(pattern.axis);
    expect(pattern.mainColor).toMatch(HSL_RE);
  });

  it("does not change the pattern when only a display-name-like string differs from the userId", () => {
    const byId = generateUserAvatarPattern("user-abc");
    const byName = generateUserAvatarPattern("田中");
    expect(byId).not.toEqual(byName);
    expect(generateUserAvatarPattern("user-abc")).toEqual(byId);
  });
});
