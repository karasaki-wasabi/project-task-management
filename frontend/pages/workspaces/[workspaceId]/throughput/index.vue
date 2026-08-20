<script setup lang="ts">
const FORECAST_INSUFFICIENT_MESSAGE =
  "実績データ不足のため、今後の目安（完了タスク数・完了ストーリーポイント）は表示できません。2 期間以上の実績が集まると表示されます。";

const FORECAST_WINDOW = 4;

const RANGE_COUNT_DEBOUNCE_MS = 300;

const api = useApiClient();
const { currentId } = useCurrentWorkspace();

const periodType = ref<PeriodType>("week");
const rangeCount = ref(4);
const selectedCaseId = ref<string | null>(null);
const cases = ref<Case[]>([]);
const summary = ref<ThroughputSummary | null>(null);

let rangeCountTimer: ReturnType<typeof setTimeout> | null = null;

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

const forecastAverageCaption = computed(() => {
  const periodCount = summary.value?.periods.length ?? 0;
  const windowSize = Math.min(FORECAST_WINDOW, periodCount);
  return `直近${windowSize}期間の実績平均`;
});

const endDateLabel = computed(() => {
  const endDate = selectedCase.value?.endDate;
  return endDate ? endDate.slice(0, 10) : undefined;
});

function clearRangeCountTimer() {
  if (rangeCountTimer !== null) {
    clearTimeout(rangeCountTimer);
    rangeCountTimer = null;
  }
}

async function loadCases() {
  cases.value = await api.listCases();
}

async function load() {
  if (currentId.value === null) return;
  const count = Number.isFinite(rangeCount.value) && rangeCount.value >= 1
    ? Math.floor(rangeCount.value)
    : 1;
  summary.value = selectedCaseId.value
    ? await api.getThroughput(periodType.value, count, selectedCaseId.value)
    : await api.getThroughput(periodType.value, count);
}

async function refresh() {
  if (currentId.value === null) return;
  await Promise.all([loadCases(), load()]);
}

watch(
  currentId,
  (id, previousId) => {
    if (id === null) {
      clearRangeCountTimer();
      summary.value = null;
      cases.value = [];
      selectedCaseId.value = null;
      return;
    }
    if (previousId !== undefined && previousId !== null && previousId !== id) {
      selectedCaseId.value = null;
    }
    void refresh();
  },
  { immediate: true },
);

watch(periodType, () => {
  if (currentId.value === null) return;
  clearRangeCountTimer();
  void load();
});

watch(selectedCaseId, () => {
  if (currentId.value === null) return;
  clearRangeCountTimer();
  void load();
});

watch(rangeCount, () => {
  if (currentId.value === null) return;
  clearRangeCountTimer();
  rangeCountTimer = setTimeout(() => {
    rangeCountTimer = null;
    void load();
  }, RANGE_COUNT_DEBOUNCE_MS);
});

onBeforeUnmount(() => {
  clearRangeCountTimer();
});
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold tracking-tight">消化数ダッシュボード</h1>

    <div
      class="flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 ring-1 ring-slate-200"
    >
      <label class="flex flex-col gap-1">
        <span class="text-sm leading-5 text-slate-700">表示期間</span>
        <select
          v-model="periodType"
          class="h-10 min-w-[8.5rem] rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="week">週</option>
          <option value="month">月</option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-sm leading-5 text-slate-700">表示件数</span>
        <input
          v-model.number="rangeCount"
          type="number"
          min="1"
          class="h-10 w-28 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
      </label>
      <CaseFilterSelect v-model="selectedCaseId" :cases="cases" />
    </div>

    <ThroughputTrendChart
      v-if="summary"
      :periods="summary.periods"
      :case-name="selectedCase?.name ?? null"
    />

    <template v-if="summary">
      <div
        v-if="hasForecast"
        class="grid gap-3 sm:grid-cols-2"
        data-testid="forecast-summary"
      >
        <div class="rounded-lg bg-white px-4 py-4 shadow-sm ring-1 ring-slate-200">
          <p class="text-xs font-medium text-slate-500">今後の目安（タスク）</p>
          <p class="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">
            {{ summary.forecastNextPeriodCount }}
            <span class="text-sm font-medium text-slate-600">件 / {{ periodUnitLabel }}</span>
          </p>
          <p class="mt-1 text-xs text-slate-400">{{ forecastAverageCaption }}</p>
        </div>
        <div class="rounded-lg bg-white px-4 py-4 shadow-sm ring-1 ring-slate-200">
          <p class="text-xs font-medium text-slate-500">今後の目安（ポイント）</p>
          <p class="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">
            {{ summary.forecastNextPeriodPoints }}
            <span class="text-sm font-medium text-slate-600">pt / {{ periodUnitLabel }}</span>
          </p>
          <p class="mt-1 text-xs text-slate-400">{{ forecastAverageCaption }}</p>
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
