// user-avatar 1.1 — userId から決定的に配色を導出する純粋関数
// (Requirements 1.1, 1.4; design.md UserAvatar.helpers.ts Service Interface).
// グリッド塗り分け・対称軸・reroll は 1.2。Vue 非依存。

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const USER_AVATAR_HUE_COUNT = 12;
const HUE_STEP_DEG = 30;
const ALT_HUE_OFFSET_DEG = 32;
const ALT_S_DELTA = -10;
const ALT_L_DELTA = 14;
const BACKGROUND_S = 30;
const BACKGROUND_L = 96;

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

function saturationLightnessForHue(hue: number): { s: number; l: number } {
  if (hue <= 60) return BAND_WARM;
  if (hue <= 150) return BAND_GREEN_OLIVE;
  if (hue <= 240) return BAND_CYAN_BLUE;
  return BAND_PURPLE_PINK;
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h}, ${s}%, ${l}%)`;
}
