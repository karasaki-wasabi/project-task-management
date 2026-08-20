<!-- user-avatar 2.1 — generateUserAvatarPattern の結果を SVG として描画するだけ -->
<script setup lang="ts">
import { generateUserAvatarPattern } from "./UserAvatar.helpers";

const props = withDefaults(
  defineProps<{
    userId: string;
    size?: 20 | 24 | 28 | 32 | 64;
    name?: string;
  }>(),
  {
    size: 24,
  },
);

const GRID_PAD = 0.35;

const pattern = computed(() => generateUserAvatarPattern(props.userId));
const labeled = computed(() => Boolean(props.name));
const viewBox = computed(() => {
  const g = pattern.value.gridSize;
  return `${-GRID_PAD} ${-GRID_PAD} ${g + 2 * GRID_PAD} ${g + 2 * GRID_PAD}`;
});
const frameStyle = computed(() => ({
  borderRadius: `${props.size * 0.1875}px`,
  boxShadow: "inset 0 0 0 1px rgba(15,23,42,.10)",
  display: "block",
  overflow: "hidden",
}));
</script>

<template>
  <svg
    :width="size"
    :height="size"
    :viewBox="viewBox"
    shape-rendering="crispEdges"
    :style="frameStyle"
    :role="labeled ? 'img' : undefined"
    :aria-label="labeled ? name : undefined"
    :title="labeled ? name : undefined"
    :aria-hidden="labeled ? undefined : 'true'"
  >
    <rect
      :x="-GRID_PAD"
      :y="-GRID_PAD"
      :width="pattern.gridSize + 2 * GRID_PAD"
      :height="pattern.gridSize + 2 * GRID_PAD"
      :fill="pattern.backgroundColor"
    />
    <rect
      v-for="cell in pattern.cells"
      :key="`${cell.x}-${cell.y}`"
      :x="cell.x - 0.02"
      :y="cell.y - 0.02"
      width="1.04"
      height="1.04"
      :fill="cell.tone === 'main' ? pattern.mainColor : pattern.altColor"
    />
  </svg>
</template>
