<!--
  Case outlook panel for the throughput dashboard (velocity-dashboard 4.4).
  Shows open tasks/points, required/remaining periods, margin points,
  on-track badge, and progress bar. Requirements 7.1–7.5.
-->
<script setup lang="ts">
import { computed } from "vue";
import type { CaseOutlook } from "../../composables/useApiClient";

const UNAVAILABLE = "算出不可";

const props = withDefaults(
  defineProps<{
    caseOutlook: CaseOutlook | null;
    caseName?: string;
    endDateLabel?: string;
    periodType?: "week" | "month";
  }>(),
  {
    caseName: undefined,
    endDateLabel: undefined,
    periodType: "week",
  },
);

const periodUnit = computed(() => (props.periodType === "month" ? "月" : "週"));

type BadgeKind = "on_track" | "behind" | "unknown";

const badge = computed((): { kind: BadgeKind; label: string } => {
  const outlook = props.caseOutlook;
  if (!outlook) return { kind: "unknown", label: "目安なし" };

  const { remainingPeriods, requiredPeriods, openPoints } = outlook;

  if (remainingPeriods === null) {
    return { kind: "unknown", label: "目安なし" };
  }

  if (remainingPeriods === 0) {
    if (openPoints === 0) {
      return { kind: "on_track", label: "このペースなら間に合いそう" };
    }
    return { kind: "behind", label: "ペースが足りていません" };
  }

  if (requiredPeriods === null) {
    return { kind: "unknown", label: "目安なし" };
  }

  if (requiredPeriods <= remainingPeriods) {
    return { kind: "on_track", label: "このペースなら間に合いそう" };
  }
  return { kind: "behind", label: "ペースが足りていません" };
});

const progressPercent = computed((): number | null => {
  const outlook = props.caseOutlook;
  if (!outlook) return null;
  const { requiredPeriods, remainingPeriods } = outlook;
  if (requiredPeriods === null || remainingPeriods === null || remainingPeriods === 0) {
    return null;
  }
  return Math.min(100, Math.round((requiredPeriods / remainingPeriods) * 100));
});

function formatNullablePeriod(value: number | null): string {
  if (value === null) return UNAVAILABLE;
  const rounded =
    Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9
      ? String(Math.round(value))
      : value.toFixed(1);
  return `${rounded} ${periodUnit.value}`;
}

function formatMargin(value: number | null): string {
  if (value === null) return UNAVAILABLE;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} pt`;
}

const badgeClass = computed(() => {
  switch (badge.value.kind) {
    case "on_track":
      return "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700";
    case "behind":
      return "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800";
    default:
      return "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600";
  }
});
</script>

<template>
  <section
    v-if="caseOutlook"
    data-testid="case-outlook-panel"
    class="flex flex-col gap-4 rounded-md bg-white p-5 shadow-sm ring-1 ring-slate-200"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-slate-900">
        見通し
        <span v-if="caseName" class="font-semibold"> — {{ caseName }}</span>
        <span
          v-if="endDateLabel"
          class="ml-2 text-xs font-normal text-slate-500"
        >終了日 {{ endDateLabel }}</span>
      </h2>
      <span data-testid="outlook-badge" :class="badgeClass">{{ badge.label }}</span>
    </div>

    <div
      class="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-px overflow-hidden rounded-md bg-slate-100"
    >
      <div class="flex flex-col gap-1 bg-white px-3.5 py-3">
        <span class="text-xs font-medium text-slate-500">未完了タスク</span>
        <span
          data-testid="outlook-open-task-count"
          class="text-lg font-semibold text-slate-900"
        >{{ caseOutlook.openTaskCount }} 件</span>
      </div>
      <div class="flex flex-col gap-1 bg-white px-3.5 py-3">
        <span class="text-xs font-medium text-slate-500">未完了ポイント</span>
        <span
          data-testid="outlook-open-points"
          class="text-lg font-semibold text-slate-900"
        >{{ caseOutlook.openPoints }} pt</span>
      </div>
      <div class="flex flex-col gap-1 bg-white px-3.5 py-3">
        <span class="text-xs font-medium text-slate-500">必要期間数</span>
        <span
          data-testid="outlook-required-periods"
          :class="
            caseOutlook.requiredPeriods === null
              ? 'text-sm font-medium text-slate-400'
              : 'text-lg font-semibold text-slate-900'
          "
        >{{ formatNullablePeriod(caseOutlook.requiredPeriods) }}</span>
      </div>
      <div class="flex flex-col gap-1 bg-white px-3.5 py-3">
        <span class="text-xs font-medium text-slate-500">残期間数</span>
        <span
          data-testid="outlook-remaining-periods"
          :class="
            caseOutlook.remainingPeriods === null
              ? 'text-sm font-medium text-slate-400'
              : 'text-lg font-semibold text-slate-900'
          "
        >{{ formatNullablePeriod(caseOutlook.remainingPeriods) }}</span>
      </div>
      <div class="flex flex-col gap-1 bg-white px-3.5 py-3">
        <span class="text-xs font-medium text-slate-500">余力ポイント</span>
        <span
          data-testid="outlook-margin-points"
          :class="
            caseOutlook.marginPoints === null
              ? 'text-sm font-medium text-slate-400'
              : caseOutlook.marginPoints >= 0
                ? 'text-lg font-semibold text-emerald-700'
                : 'text-lg font-semibold text-amber-800'
          "
        >{{ formatMargin(caseOutlook.marginPoints) }}</span>
      </div>
    </div>

    <div data-testid="outlook-progress" class="flex flex-col gap-2">
      <template v-if="progressPercent !== null">
        <div class="flex justify-between text-xs text-slate-500">
          <span>
            必要 {{ formatNullablePeriod(caseOutlook.requiredPeriods) }}
            / 残り {{ formatNullablePeriod(caseOutlook.remainingPeriods) }}
          </span>
          <span>消化率の目安 {{ progressPercent }}%</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            data-testid="outlook-progress-bar"
            class="h-full bg-blue-700"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>
      </template>
      <p
        v-else
        class="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600"
      >
        消化率の目安は{{ UNAVAILABLE }}
      </p>
    </div>
  </section>
</template>
