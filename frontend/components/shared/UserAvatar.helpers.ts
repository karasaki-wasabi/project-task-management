const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const USER_AVATAR_HUE_COUNT = 12;
const HUE_STEP_DEG = 30;
const ALT_HUE_OFFSET_DEG = 32;
const ALT_S_DELTA = -10;
const ALT_L_DELTA = 14;
const BACKGROUND_S = 30;
const BACKGROUND_L = 96;

const GRID_SIZE = 5 as const;
const GRID_LAST = GRID_SIZE - 1;
const AXES = ["leftRight", "topBottom", "point"] as const;
const BLANK_PROBABILITY = 0.42;
const MAIN_PROBABILITY = 0.36;
const MIN_FILL_RATIO = 0.34;
const MAX_FILL_RATIO = 0.74;
const MAX_FILL_ATTEMPTS = 12;

// 4色相帯の S/L 代表値。帯内は共通で、色相ごとの例外テーブルは持たない。
const BAND_WARM = { s: 70, l: 50 } as const;
const BAND_GREEN_OLIVE = { s: 55, l: 42 } as const;
const BAND_CYAN_BLUE = { s: 62, l: 46 } as const;
const BAND_PURPLE_PINK = { s: 58, l: 50 } as const;

export interface UserAvatarPalette {
  index: number;
  mainColor: string;
  altColor: string;
  backgroundColor: string;
}

export type UserAvatarAxis = (typeof AXES)[number];

export interface UserAvatarCell {
  x: number;
  y: number;
  tone: "main" | "alt";
}

export interface UserAvatarPattern {
  gridSize: 5;
  cells: UserAvatarCell[];
  backgroundColor: string;
  mainColor: string;
  altColor: string;
  axis: UserAvatarAxis;
}

type CellTone = "blank" | "main" | "alt";

export function fnv1aHash(input: string): number {
  const bytes = new TextEncoder().encode(input);
  let hash = FNV_OFFSET;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash;
}

export function createMulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function userAvatarPaletteAt(index: number): UserAvatarPalette {
  const wrapped = ((index % USER_AVATAR_HUE_COUNT) + USER_AVATAR_HUE_COUNT) % USER_AVATAR_HUE_COUNT;
  const hue = wrapped * HUE_STEP_DEG;
  const { s, l } = saturationLightnessForHue(hue);
  return {
    index: wrapped,
    mainColor: hsl(hue, s, l),
    altColor: hsl((hue + ALT_HUE_OFFSET_DEG) % 360, s + ALT_S_DELTA, l + ALT_L_DELTA),
    backgroundColor: hsl(hue, BACKGROUND_S, BACKGROUND_L),
  };
}

export function generateUserAvatarPalette(userId: string): UserAvatarPalette {
  const next = createMulberry32(fnv1aHash(userId));
  const index = Math.floor(next() * USER_AVATAR_HUE_COUNT);
  return userAvatarPaletteAt(index);
}

export function generateUserAvatarPattern(userId: string): UserAvatarPattern {
  return generateUserAvatarPatternFromRng(createMulberry32(fnv1aHash(userId)));
}

export function generateUserAvatarPatternFromRng(next: () => number): UserAvatarPattern {
  const palette = userAvatarPaletteAt(Math.floor(next() * USER_AVATAR_HUE_COUNT));
  const axis = AXES[Math.floor(next() * AXES.length)] ?? AXES[0];
  const regionSize = axis === "point" ? 13 : 15;

  let grid = paintIndependentRegion(next, axis);
  for (let attempt = 1; attempt < MAX_FILL_ATTEMPTS; attempt += 1) {
    if (fillCountInRange(paintedIndependentCount(grid, axis), regionSize)) break;
    grid = paintIndependentRegion(next, axis);
  }

  const cells: UserAvatarCell[] = [];
  for (let y = 0; y < GRID_SIZE; y += 1) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const tone = row[x];
      if (tone === undefined || tone === "blank") continue;
      cells.push({ x, y, tone });
    }
  }

  return {
    gridSize: GRID_SIZE,
    cells,
    backgroundColor: palette.backgroundColor,
    mainColor: palette.mainColor,
    altColor: palette.altColor,
    axis,
  };
}

function paintIndependentRegion(next: () => number, axis: UserAvatarAxis): CellTone[][] {
  const grid: CellTone[][] = Array.from({ length: GRID_SIZE }, () =>
    Array<CellTone>(GRID_SIZE).fill("blank"),
  );
  for (let y = 0; y < GRID_SIZE; y += 1) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (!isIndependentCell(axis, x, y)) continue;
      const tone = drawTone(next);
      row[x] = tone;
      const mirror = mirrorOf(axis, x, y);
      if (mirror.x !== x || mirror.y !== y) {
        const mirrorRow = grid[mirror.y];
        if (mirrorRow) mirrorRow[mirror.x] = tone;
      }
    }
  }
  return grid;
}

function drawTone(next: () => number): CellTone {
  const roll = next();
  if (roll < BLANK_PROBABILITY) return "blank";
  if (roll < BLANK_PROBABILITY + MAIN_PROBABILITY) return "main";
  return "alt";
}

function isIndependentCell(axis: UserAvatarAxis, x: number, y: number): boolean {
  const mirror = mirrorOf(axis, x, y);
  if (axis === "leftRight") return x <= mirror.x;
  if (axis === "topBottom") return y <= mirror.y;
  return y < mirror.y || (y === mirror.y && x <= mirror.x);
}

function mirrorOf(axis: UserAvatarAxis, x: number, y: number): { x: number; y: number } {
  if (axis === "leftRight") return { x: GRID_LAST - x, y };
  if (axis === "topBottom") return { x, y: GRID_LAST - y };
  return { x: GRID_LAST - x, y: GRID_LAST - y };
}

function paintedIndependentCount(grid: CellTone[][], axis: UserAvatarAxis): number {
  let count = 0;
  for (let y = 0; y < GRID_SIZE; y += 1) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (!isIndependentCell(axis, x, y)) continue;
      const tone = row[x];
      if (tone !== undefined && tone !== "blank") count += 1;
    }
  }
  return count;
}

function fillCountInRange(count: number, regionSize: number): boolean {
  return count >= MIN_FILL_RATIO * regionSize && count <= MAX_FILL_RATIO * regionSize;
}

function saturationLightnessForHue(hue: number): { s: number; l: number } {
  if (hue <= 60) return BAND_WARM;
  if (hue <= 150) return BAND_GREEN_OLIVE;
  if (hue <= 240) return BAND_CYAN_BLUE;
  return BAND_PURPLE_PINK;
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h}, ${s}%, ${l}%)`;
}
