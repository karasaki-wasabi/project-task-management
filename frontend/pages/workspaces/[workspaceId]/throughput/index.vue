<!--
  Throughput dashboard (velocity-dashboard 4.5, design.md Frontend/throughput,
  mock 1c/1d). Controls (periodType, rangeCount, CaseFilterSelect) +
  ThroughputTrendChart + forecast summary cards + CaseOutlookPanel when a
  case is selected. No workspace-empty-state — scoping is URL workspaceId
  and x-workspace-id (Requirements 4.1-4.3, 5.1-5.2, 6.3, 7.1-7.6).
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  useApiClient,
  type Case,
  type PeriodType,
  type ThroughputSummary,
} from "../../../../composables/useApiClient";
import { useCurrentWorkspace } from "../../../../composables/useCurrentWorkspace";
import CaseFilterSelect from "../../../../components/throughput/CaseFilterSelect.vue";
import CaseOutlookPanel from "../../../../components/throughput/CaseOutlookPanel.vue";
import ThroughputTrendChart from "../../../../components/throughput/ThroughputTrendChart.vue";

const FORECAST_INSUFFICIENT_MESSAGE =
  "実績データ不足のため、今後の目安（完了タスク数・完了ストーリーポイント）は表示できません。2 期間以上の実績が集まると表示されます。";

const api = useApiClient();
const { currentId } = useCurrentWorkspace();

const periodType = ref<PeriodType>("week");
const rangeCount = ref(4);
const selectedCaseId = ref<string | null>(null);
const cases = ref<Case[]>([]);
const summary = ref<ThroughputSummary | null>(null);

const selectedCase = computed(
  () => cases.value.find((item) => item.id === selectedCaseId.value) ?? null,
);

const caseOutlook = computed(() => summary.value?.caseOutlook ?? null);

const hasForecast = computed(() => {
  if (!summary.value) return false;
  return (
    summary.value.forecastNextPeriodCount !== null &&
    summary.value.forecastNextPeriodPoints !== null
  );
});

const periodUnitLabel = computed(() => (periodType.value === "month" ? "月" : "週"));

const endDateLabel = computed(() => {
  const endDate = selectedCase.value?.endDate;
  return endDate ? endDate.slice(0, 10) : undefined;
});

async function loadCases() {
  cases.value = await api.listCases();
}

async function load() {
  if (currentId.value === null) return;
  summary.value = selectedCaseId.value
    ? await api.getThroughput(periodType.value, rangeCount.value, selectedCaseId.value)
    : await api.getThroughput(periodType.value, rangeCount.value);
}

async function refresh() {
  if (currentId.value === null) return;
  await Promise.all([loadCases(), load()]);
}

watch(
  currentId,
  (id, previousId) => {
    if (id === null) {
      summary.value = null;
      cases.value = [];
      selectedCaseId.value = null;
      return;
    }
    // Clear case filter before refresh when switching workspaces so a stale
    // caseId from the previous workspace is not sent to getThroughput (400).
    if (previousId !== undefined && previousId !== null && previousId !== id) {
      selectedCaseId.value = null;
    }
    void refresh();
  },
  { immediate: true },
);

watch(selectedCaseId, () => {
  if (currentId.value === null) return;
  void load();
});
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold tracking-tight">消化数ダッシュボード</h1>

    <form
      class="flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 ring-1 ring-slate-200"
      @submit.prevent="load"
    >
      <label class="flex flex-col gap-1 text-sm text-slate-700">
        期間種別
        <select
          v-model="periodType"
          class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="week">週</option>
          <option value="month">月</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-sm text-slate-700">
        表示件数
        <input
          v-model.number="rangeCount"
          type="number"
          min="1"
          class="w-24 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
      </label>
      <CaseFilterSelect v-model="selectedCaseId" :cases="cases" />
      <button
        type="submit"
        class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
      >
        表示
      </button>
    </form>

    <section
      v-if="summary"
      class="rounded-lg bg-white p-4 ring-1 ring-slate-200"
    >
      <h2 class="mb-3 text-sm font-semibold text-slate-900">消化の推移</h2>
      <ThroughputTrendChart :periods="summary.periods" />
    </section>

    <template v-if="summary">
      <div
        v-if="hasForecast"
        class="grid gap-3 sm:grid-cols-2"
        data-testid="forecast-summary"
      >
        <div class="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <p class="text-xs font-medium text-blue-600">今後の目安（完了タスク数）</p>
          <p class="mt-1 text-lg font-semibold">
            {{ summary.forecastNextPeriodCount }}
            <span class="text-sm font-medium">件/{{ periodUnitLabel }}</span>
          </p>
        </div>
        <div class="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <p class="text-xs font-medium text-blue-600">今後の目安（完了ストーリーポイント）</p>
          <p class="mt-1 text-lg font-semibold">
            {{ summary.forecastNextPeriodPoints }}
            <span class="text-sm font-medium">pt/{{ periodUnitLabel }}</span>
          </p>
        </div>
      </div>
      <p
        v-else
        class="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600"
        data-testid="forecast-insufficient"
      >
        {{ FORECAST_INSUFFICIENT_MESSAGE }}
      </p>
    </template>

    <CaseOutlookPanel
      v-if="selectedCaseId && caseOutlook"
      :case-outlook="caseOutlook"
      :case-name="selectedCase?.name"
      :end-date-label="endDateLabel"
      :period-type="periodType"
    />
  </div>
</template>
