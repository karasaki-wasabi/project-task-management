<!-- user-avatar 2.1 — generateUserAvatarPattern の結果を SVG として描画するだけ -->
<script setup lang="ts">
import { computed } from "vue";
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

// 角丸で四隅のセルが欠けないよう、グリッド単位で内側余白を取る（モック準拠）。
const GRID_PAD = 0.35;

const pattern = computed(() => generateUserAvatarPattern(props.userId));
const labeled = computed(() => Boolean(props.name));
const viewBox = computed(() => {
  const g = pattern.value.gridSize;
  return `${-GRID_PAD} ${-GRID_PAD} ${g + 2 * GRID_PAD} ${g + 2 * GRID_PAD}`;
});
const frameStyle = computed(() => ({
  borderRadius: `${props.size * 0.1875}px`,
  // レイアウト幅を増やさない内側ハイライト（design: inset highlight）
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
    <!--
      size が gridSize で割り切れないとき(例: 28px / 5)、隣接 1×1 rect の
      アンチエイリアスでセル間に細い隙間が見える。わずかに重ねて潰す。
    -->
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
