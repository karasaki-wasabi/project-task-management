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

const props = withDefaults(
  defineProps<{
    periods: ThroughputPeriod[];
    /** 案件選択時は見出しに「— 案件名」を付ける（モック 1d）。 */
    caseName?: string | null;
  }>(),
  {
    caseName: null,
  },
);

const hoveredIndex = ref<number | null>(null);

const layout = computed(() => buildChartLayout(props.periods));

const chartTitle = computed(() =>
  props.caseName ? `期間別の消化推移 — ${props.caseName}` : "期間別の消化推移",
);

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
    <h2 class="mb-2.5 text-sm font-semibold text-slate-900">{{ chartTitle }}</h2>

    <!--
      系列ラベルは SVG 外の HTML にする。viewBox スケールで font-size="12" が
      見出し(14px)より大きく見えるのを防ぐ。
    -->
    <div class="relative">
      <p
        class="pointer-events-none absolute z-10 text-xs font-medium leading-none text-slate-500"
        :style="{
          left: `${(PLOT_LEFT / CHART_WIDTH) * 100}%`,
          top: `${(11 / CHART_HEIGHT) * 100}%`,
          transform: 'translateY(-50%)',
        }"
      >
        完了タスク数（件）
      </p>
      <p
        class="pointer-events-none absolute z-10 text-xs font-medium leading-none text-slate-500"
        :style="{
          left: `${(PLOT_LEFT / CHART_WIDTH) * 100}%`,
          top: `${(161 / CHART_HEIGHT) * 100}%`,
          transform: 'translateY(-50%)',
        }"
      >
        完了ストーリーポイント（pt）
      </p>

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
    </div>
  </div>
</template>
