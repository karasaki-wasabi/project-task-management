<!--
  Two-panel throughput trend chart (velocity-dashboard task 4.2, mock 1c).
  Top: completed task counts as bars with an independent y-axis.
  Bottom: completed story points as a line (+ area) with its own y-axis.
  X labels render only on the bottom panel; the same period columns align
  vertically. Hovering a period highlights both panels for that index.
  Inline SVG only — no chart library (design.md ThroughputTrendChart).
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import type { ThroughputPeriod } from "../../composables/useApiClient";
import {
  BAR_WIDTH,
  CHART_HEIGHT,
  CHART_WIDTH,
  COUNT_BASELINE,
  COUNT_TOP,
  POINTS_BASELINE,
  POINTS_TOP,
  PLOT_LEFT,
  PLOT_RIGHT,
  buildChartLayout,
  countTickY,
  pointsTickY,
} from "./ThroughputTrendChart.helpers";

const props = defineProps<{
  periods: ThroughputPeriod[];
}>();

const hoveredIndex = ref<number | null>(null);

const layout = computed(() => buildChartLayout(props.periods));

function onEnter(index: number) {
  hoveredIndex.value = index;
}

function onLeave() {
  hoveredIndex.value = null;
}

function highlightX(index: number): number | null {
  const point = layout.value.points[index];
  return point ? point.cx : null;
}
</script>

<template>
  <div
    data-testid="throughput-trend-chart"
    class="rounded-md bg-white p-5 ring-1 ring-slate-200 shadow-sm"
  >
    <div class="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
      <h2 class="text-sm font-semibold text-slate-900">期間別の消化推移</h2>
      <p class="text-xs text-slate-500">
        同じ期間が上下で縦に整列。指標ごとに独立した軸なので、2指標を重ねません。
      </p>
    </div>

    <svg
      :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
      class="block h-auto w-full"
      role="img"
      aria-label="期間別の完了タスク数と完了ストーリーポイントの推移"
    >
      <!-- Hover column bands (full height of both panels) -->
      <g v-if="hoveredIndex !== null && highlightX(hoveredIndex) !== null">
        <line
          data-testid="period-highlight"
          :data-period-index="hoveredIndex"
          :x1="highlightX(hoveredIndex)!"
          :x2="highlightX(hoveredIndex)!"
          :y1="COUNT_TOP"
          :y2="COUNT_BASELINE"
          stroke="#dbeafe"
          stroke-width="30"
        />
        <line
          data-testid="period-highlight"
          :data-period-index="hoveredIndex"
          :x1="highlightX(hoveredIndex)!"
          :x2="highlightX(hoveredIndex)!"
          :y1="POINTS_TOP"
          :y2="POINTS_BASELINE"
          stroke="#dbeafe"
          stroke-width="30"
        />
      </g>

      <!-- Top panel: completed count bars -->
      <text :x="PLOT_LEFT" y="11" font-size="12" fill="#64748b">完了タスク数（件）</text>
      <line
        v-for="tick in layout.countAxis.values"
        :key="`count-grid-${tick}`"
        :x1="PLOT_LEFT"
        :x2="PLOT_RIGHT"
        :y1="countTickY(tick, layout.countAxis.max)"
        :y2="countTickY(tick, layout.countAxis.max)"
        :stroke="tick === 0 ? '#cbd5e1' : '#f1f5f9'"
      />
      <text
        v-for="tick in layout.countAxis.values"
        :key="`count-tick-${tick}`"
        data-testid="count-y-tick"
        :x="PLOT_LEFT - 8"
        :y="countTickY(tick, layout.countAxis.max) + 4"
        font-size="11"
        fill="#94a3b8"
        text-anchor="end"
      >
        {{ tick }}
      </text>
      <rect
        v-for="point in layout.points"
        :key="`bar-${point.index}`"
        data-testid="count-bar"
        :data-value="point.count"
        :data-period-index="point.index"
        :x="point.barX"
        :y="point.barY"
        :width="BAR_WIDTH"
        :height="point.barHeight"
        rx="2"
        :fill="hoveredIndex === point.index ? '#94a3b8' : '#cbd5e1'"
      />
      <text
        v-for="point in layout.points"
        :key="`count-value-${point.index}`"
        :x="point.cx"
        :y="point.barY - 6"
        font-size="11"
        fill="#475569"
        text-anchor="middle"
      >
        {{ point.count }}
      </text>

      <!-- Bottom panel: completed points line -->
      <text :x="PLOT_LEFT" y="161" font-size="12" fill="#64748b">完了ストーリーポイント（pt）</text>
      <line
        v-for="tick in layout.pointsAxis.values"
        :key="`points-grid-${tick}`"
        :x1="PLOT_LEFT"
        :x2="PLOT_RIGHT"
        :y1="pointsTickY(tick, layout.pointsAxis.max)"
        :y2="pointsTickY(tick, layout.pointsAxis.max)"
        :stroke="tick === 0 ? '#cbd5e1' : '#f1f5f9'"
      />
      <text
        v-for="tick in layout.pointsAxis.values"
        :key="`points-tick-${tick}`"
        data-testid="points-y-tick"
        :x="PLOT_LEFT - 8"
        :y="pointsTickY(tick, layout.pointsAxis.max) + 4"
        font-size="11"
        fill="#94a3b8"
        text-anchor="end"
      >
        {{ tick }}
      </text>
      <polygon
        v-if="layout.areaPointsAttr"
        :points="layout.areaPointsAttr"
        fill="#eff6ff"
      />
      <polyline
        v-if="layout.linePointsAttr"
        data-testid="points-line"
        fill="none"
        stroke="#1d4ed8"
        stroke-width="2.5"
        :points="layout.linePointsAttr"
      />
      <circle
        v-for="point in layout.points"
        :key="`dot-${point.index}`"
        data-testid="points-dot"
        :data-value="point.points"
        :data-period-index="point.index"
        :cx="point.cx"
        :cy="point.lineY"
        :r="hoveredIndex === point.index ? 5 : 4"
        fill="#fff"
        stroke="#1d4ed8"
        stroke-width="2"
      />
      <text
        v-for="point in layout.points"
        :key="`points-value-${point.index}`"
        :x="point.cx"
        :y="point.lineY - 8"
        font-size="11"
        fill="#475569"
        text-anchor="middle"
      >
        {{ point.points }}
      </text>

      <!-- X labels (bottom panel only) -->
      <text
        v-for="point in layout.points"
        :key="`label-${point.index}`"
        data-testid="period-x-label"
        :x="point.cx"
        y="290"
        font-size="11"
        fill="#64748b"
        text-anchor="middle"
      >
        {{ point.label }}
      </text>

      <!-- Invisible hit targets spanning both panels -->
      <rect
        v-for="point in layout.points"
        :key="`hit-${point.index}`"
        data-testid="period-hit"
        :data-period-index="point.index"
        :x="point.cx - 15"
        :y="COUNT_TOP"
        :width="30"
        :height="POINTS_BASELINE - COUNT_TOP"
        fill="transparent"
        class="cursor-pointer"
        @mouseenter="onEnter(point.index)"
        @mouseleave="onLeave"
      />
    </svg>

    <div
      class="mt-2.5 flex items-start gap-2 border-t border-slate-100 pt-2.5 text-xs text-slate-500"
    >
      <svg
        class="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 9v5M10 6.2v.6" stroke-linecap="round" />
      </svg>
      <span>
        期間ラベルは下段に1回だけ。ホバーで上下段の同じ期間が同時にハイライトされ、件数と
        pt を突き合わせられる。
      </span>
    </div>
  </div>
</template>
