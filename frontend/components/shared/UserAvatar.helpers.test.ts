import { describe, expect, it } from "vitest";
import {
  createMulberry32,
  fnv1aHash,
  generateUserAvatarPalette,
  generateUserAvatarPattern,
  generateUserAvatarPatternFromRng,
  userAvatarPaletteAt,
} from "./UserAvatar.helpers";
import type { UserAvatarAxis, UserAvatarCell, UserAvatarPattern } from "./UserAvatar.helpers";

const HSL_RE = /^hsl\((\d+), (\d+)%, (\d+)%\)$/;

function parseHsl(css: string): { h: number; s: number; l: number } {
  const match = css.match(HSL_RE);
  expect(match, `expected CSS hsl() string, got ${css}`).not.toBeNull();
  return { h: Number(match![1]), s: Number(match![2]), l: Number(match![3]) };
}

describe("fnv1aHash", () => {
  it("FNV-1a 32 ビットのテストベクトルを返す", () => {
    expect(fnv1aHash("")).toBe(0x811c9dc5);
    expect(fnv1aHash("a")).toBe(0xe40c292c);
    expect(fnv1aHash("foobar")).toBe(0xbf9cf968);
  });

  it("同じ文字列では決定的であり、空文字列と非 ASCII 文字列を含む", () => {
    expect(fnv1aHash("user-abc")).toBe(fnv1aHash("user-abc"));
    expect(fnv1aHash("")).toBe(fnv1aHash(""));
    expect(fnv1aHash("田中")).toBe(fnv1aHash("田中"));
  });

  it("UTF-8 バイトをハッシュするため、非 ASCII 文字列は ASCII のようなものと異なる", () => {
    expect(fnv1aHash("田中")).not.toBe(fnv1aHash("a"));
    expect(fnv1aHash("田中")).not.toBe(fnv1aHash(""));
  });
});

describe("createMulberry32", () => {
  it("[0, 1) の値を返し、同じシードでは決定的である", () => {
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

  it("異なるハッシュからシードされた場合、異なる値を返す", () => {
    const a = createMulberry32(fnv1aHash("user-a"));
    const b = createMulberry32(fnv1aHash("user-b"));
    expect(a()).not.toBe(b());
  });
});

describe("userAvatarPaletteAt (N=12 機械的なパレット)", () => {
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

  it("S/L ペアを hue ごとに割り当て", () => {
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
  it("同じuserId では同じインデックスとhsl() 色を返す", () => {
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

  it("FNV-1a シードの最初のmulberry32 のドローからパレットインデックスを選択する", () => {
    const userId = "user-abc";
    const rng = createMulberry32(fnv1aHash(userId));
    const expectedIndex = Math.floor(rng() * 12);
    expect(generateUserAvatarPalette(userId).index).toBe(expectedIndex);
  });

  it("空のuserId を受け入れ、パレットを返す", () => {
    const palette = generateUserAvatarPalette("");
    expect(palette.index).toBeGreaterThanOrEqual(0);
    expect(palette.index).toBeLessThan(12);
    expect(palette.mainColor).toMatch(HSL_RE);
  });

  it("異なるuserId を12 色に分散し、高い確率で異なる色を使用する", () => {
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
  it("同じ userId では同じグリッド、色、軸を返す", () => {
    for (const userId of ["user-abc", "user-0", "", "田中"]) {
      const first = generateUserAvatarPattern(userId);
      const second = generateUserAvatarPattern(userId);
      const third = generateUserAvatarPattern(userId);
      expect(second).toEqual(first);
      expect(third).toEqual(first);
      expect(first.gridSize).toBe(5);
      expect(AXES).toContain(first.axis);
      expect(second.cells).toEqual(first.cells);
      expect(second.axis).toBe(first.axis);
      expect(second.mainColor).toBe(first.mainColor);
      expect(second.altColor).toBe(first.altColor);
      expect(second.backgroundColor).toBe(first.backgroundColor);
    }
  });

  it("main または alt トーンのあるセルのみをリストし、座標が 0～4 である", () => {
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

  it("同じ userId では同じ hsl() 色を generateUserAvatarPalette と同じに使用する", () => {
    const userId = "user-abc";
    const palette = generateUserAvatarPalette(userId);
    const pattern = generateUserAvatarPattern(userId);
    expect(pattern.mainColor).toBe(palette.mainColor);
    expect(pattern.altColor).toBe(palette.altColor);
    expect(pattern.backgroundColor).toBe(palette.backgroundColor);
  });

  it("パレットインデックスの後の2番目の mulberry32 のドローから軸を選択する", () => {
    const userId = "user-abc";
    const rng = createMulberry32(fnv1aHash(userId));
    rng();
    const expectedAxis = AXES[Math.floor(rng() * AXES.length)];
    expect(generateUserAvatarPattern(userId).axis).toBe(expectedAxis);
  });

  it("選択された軸に沿って描画されたトーンを鏡像化し、点対称の中心を含む", () => {
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

  it("userId では独立領域の塗りカウントを 34%～74% の範囲内に保つ", () => {
    for (let i = 0; i < 50; i += 1) {
      const pattern = generateUserAvatarPattern(`user-${i}`);
      const regionSize = independentRegionSize(pattern.axis);
      const painted = paintedIndependentCount(pattern.cells, pattern.axis);
      expect(painted).toBeGreaterThanOrEqual(MIN_FILL_RATIO * regionSize);
      expect(painted).toBeLessThanOrEqual(MAX_FILL_RATIO * regionSize);
    }
  });

  it("空の userId を受け入れ、パターンを返す", () => {
    const pattern = generateUserAvatarPattern("");
    expect(pattern.gridSize).toBe(5);
    expect(AXES).toContain(pattern.axis);
    expect(pattern.mainColor).toMatch(HSL_RE);
  });

  it("表示名のような文字列を userId として渡した場合、異なるパターンを生成する", () => {
    expect(generateUserAvatarPattern.length).toBe(1);
    const userId = "user-abc";
    const displayName = "田中 太郎";
    const byUserId = generateUserAvatarPattern(userId);
    const byDisplayName = generateUserAvatarPattern(displayName);
    expect(byDisplayName).not.toEqual(byUserId);
    expect(generateUserAvatarPattern(userId)).toEqual(byUserId);
    const withIgnoredName = (generateUserAvatarPattern as (...a: unknown[]) => UserAvatarPattern)(
      userId,
      "表示名",
    );
    expect(withIgnoredName).toEqual(byUserId);
  });

  it("leftRight, topBottom, およびpoint をいくつかの userId に選択する", () => {
    const found = new Map<UserAvatarAxis, string>();
    for (let i = 0; i < 500 && found.size < AXES.length; i += 1) {
      const userId = `user-${i}`;
      const axis = generateUserAvatarPattern(userId).axis;
      if (!found.has(axis)) found.set(axis, userId);
    }
    expect([...found.keys()].sort()).toEqual([...AXES].sort());
  });

  it("点対称の中心を独立して選択し、180 度のセルをペアにする", () => {
    const pointPatterns: UserAvatarPattern[] = [];
    for (let i = 0; i < 400 && pointPatterns.length < 40; i += 1) {
      const pattern = generateUserAvatarPattern(`point-probe-${i}`);
      if (pattern.axis === "point") pointPatterns.push(pattern);
    }
    expect(pointPatterns.length).toBeGreaterThan(0);

    let paintedCenter = false;
    let blankCenter = false;
    for (const pattern of pointPatterns) {
      const map = paintedMap(pattern.cells);
      for (let y = 0; y <= GRID_LAST; y += 1) {
        for (let x = 0; x <= GRID_LAST; x += 1) {
          expect(map.get(cellKey(GRID_LAST - x, GRID_LAST - y))).toBe(map.get(cellKey(x, y)));
        }
      }
      const centerTone = map.get(cellKey(2, 2));
      if (centerTone !== undefined) {
        paintedCenter = true;
        expect(pattern.cells.some((cell) => cell.x === 2 && cell.y === 2 && cell.tone === centerTone)).toBe(
          true,
        );
      } else {
        blankCenter = true;
        expect(pattern.cells.some((cell) => cell.x === 2 && cell.y === 2)).toBe(false);
      }
    }
    expect(paintedCenter).toBe(true);
    expect(blankCenter).toBe(true);
  });

  it("1000 個のダミーuserId では衝突しない", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      const userId = `dummy-user-${i}`;
      const pattern = generateUserAvatarPattern(userId);
      const paletteIndex = generateUserAvatarPalette(userId).index;
      keys.add(`${paletteIndex}|${pattern.axis}|${JSON.stringify(pattern.cells)}`);
    }
    expect(keys.size).toBeGreaterThanOrEqual(995);
  });
});

const MAX_FILL_ATTEMPTS = 12;
const BLANK_ROLL = 0;
const MAIN_ROLL = 0.5;
const AXIS_ROLL: Record<UserAvatarAxis, number> = {
  leftRight: 0,
  topBottom: 0.4,
  point: 0.8,
};

type ScriptedRng = (() => number) & { unused(): number };

function scriptedNext(values: number[]): ScriptedRng {
  let index = 0;
  const next = (() => {
    if (index >= values.length) {
      throw new Error(`unexpected extra next() call at index ${index}`);
    }
    const value = values[index];
    index += 1;
    return value;
  }) as ScriptedRng;
  next.unused = () => values.length - index;
  return next;
}

function toneDraws(regionSize: number, paintedCount: number): number[] {
  return Array.from({ length: regionSize }, (_, i) => (i < paintedCount ? MAIN_ROLL : BLANK_ROLL));
}

function rngSequence(axis: UserAvatarAxis, paintedPerAttempt: number[]): number[] {
  const regionSize = independentRegionSize(axis);
  const values = [0, AXIS_ROLL[axis]];
  for (const painted of paintedPerAttempt) {
    values.push(...toneDraws(regionSize, painted));
  }
  return values;
}

function fillCountWouldBeInRange(count: number, regionSize: number): boolean {
  return count >= MIN_FILL_RATIO * regionSize && count <= MAX_FILL_RATIO * regionSize;
}

describe("generateUserAvatarPatternFromRng (塗りガードシーム)", () => {
  it("範囲外の塗りを再ロールし、独立領域が34%..74% の範囲内になるまで続ける", () => {
    const cases: Array<{ axis: UserAvatarAxis; outOfRange: number; inRange: number }> = [
      { axis: "leftRight", outOfRange: 0, inRange: 8 },
      { axis: "topBottom", outOfRange: 15, inRange: 6 },
      { axis: "point", outOfRange: 13, inRange: 5 },
    ];
    for (const { axis, outOfRange, inRange } of cases) {
      const regionSize = independentRegionSize(axis);
      const pattern = generateUserAvatarPatternFromRng(
        scriptedNext(rngSequence(axis, [outOfRange, inRange])),
      );
      expect(pattern.axis).toBe(axis);
      const painted = paintedIndependentCount(pattern.cells, axis);
      expect(painted).toBe(inRange);
      expect(painted).toBeGreaterThanOrEqual(MIN_FILL_RATIO * regionSize);
      expect(painted).toBeLessThanOrEqual(MAX_FILL_RATIO * regionSize);
    }
  });

  it("すべての試行が範囲外の場合、12 番目の塗りを保持する", () => {
    const cases: Array<{ axis: UserAvatarAxis; early: number; last: number }> = [
      { axis: "leftRight", early: 0, last: 15 },
      { axis: "topBottom", early: 15, last: 0 },
      { axis: "point", early: 2, last: 13 },
    ];
    for (const { axis, early, last } of cases) {
      const regionSize = independentRegionSize(axis);
      const attempts = [
        ...Array.from({ length: MAX_FILL_ATTEMPTS - 1 }, () => early),
        last,
      ];
      const next = scriptedNext(rngSequence(axis, attempts));
      const pattern = generateUserAvatarPatternFromRng(next);
      expect(pattern.axis).toBe(axis);
      expect(paintedIndependentCount(pattern.cells, axis)).toBe(last);
      expect(fillCountWouldBeInRange(early, regionSize)).toBe(false);
      expect(fillCountWouldBeInRange(last, regionSize)).toBe(false);
      expect(next.unused()).toBe(0);
    }
  });

  it("点対称の中心を独立して塗り、他のセルをコピーしない", () => {
    const regionSize = independentRegionSize("point");
    const centerOnlyDraws = Array.from({ length: regionSize }, (_, i) =>
      i === regionSize - 1 ? MAIN_ROLL : BLANK_ROLL,
    );
    const values = [0, AXIS_ROLL.point];
    for (let attempt = 0; attempt < MAX_FILL_ATTEMPTS; attempt += 1) {
      values.push(...centerOnlyDraws);
    }
    const next = scriptedNext(values);
    const pattern = generateUserAvatarPatternFromRng(next);
    expect(pattern.axis).toBe("point");
    expect(next.unused()).toBe(0);
    expect(pattern.cells).toEqual([{ x: 2, y: 2, tone: "main" }]);
  });
});
