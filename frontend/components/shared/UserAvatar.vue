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

const pattern = computed(() => generateUserAvatarPattern(props.userId));
const labeled = computed(() => Boolean(props.name));
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
    :viewBox="`0 0 ${pattern.gridSize} ${pattern.gridSize}`"
    :style="frameStyle"
    :role="labeled ? 'img' : undefined"
    :aria-label="labeled ? name : undefined"
    :title="labeled ? name : undefined"
    :aria-hidden="labeled ? undefined : 'true'"
  >
    <rect
      :width="pattern.gridSize"
      :height="pattern.gridSize"
      :fill="pattern.backgroundColor"
    />
    <rect
      v-for="cell in pattern.cells"
      :key="`${cell.x}-${cell.y}`"
      :x="cell.x"
      :y="cell.y"
      width="1"
      height="1"
      :fill="cell.tone === 'main' ? pattern.mainColor : pattern.altColor"
    />
  </svg>
</template>
