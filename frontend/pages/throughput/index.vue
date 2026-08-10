<!--
  Throughput dashboard (task 11.5, design.md "Frontend/throughput",
  Requirements 6.1-6.4). Shows past-period completed counts and, when
  enough history exists, a simple-moving-average forecast; otherwise an
  explicit "not enough data" message (Requirement 6.4).

  workspace-resource-scope task 7.2: empty state only when currentId is
  null (Requirements 2.1, 2.2). API scoping for /api/throughput is owned
  by velocity-dashboard — selected workspace still uses the global API.
-->
<script setup lang="ts">
import { ref, watch } from "vue";
import {
  useApiClient,
  type PeriodType,
  type ThroughputSummary,
} from "../../composables/useApiClient";
import { useCurrentWorkspace } from "../../composables/useCurrentWorkspace";

const api = useApiClient();
const { currentId } = useCurrentWorkspace();
const periodType = ref<PeriodType>("week");
const rangeCount = ref(4);
const summary = ref<ThroughputSummary | null>(null);

async function load() {
  if (currentId.value === null) return;
  summary.value = await api.getThroughput(periodType.value, rangeCount.value);
}

watch(
  currentId,
  (id) => {
    if (id === null) {
      summary.value = null;
      return;
    }
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <div class="space-y-6">
    <div
      v-if="currentId === null"
      data-testid="workspace-empty-state"
      class="rounded-lg bg-white p-8 text-center ring-1 ring-slate-200"
    >
      <h1 class="text-xl font-semibold tracking-tight text-slate-900">ワークスペースがありません</h1>
      <p class="mt-2 text-sm text-slate-600">
        最初のワークスペースを作成すると、メンバーを追加して共有の可視境界を持てます。
      </p>
      <NuxtLink
        to="/workspaces"
        class="mt-5 inline-block rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
      >
        ワークスペースを作成
      </NuxtLink>
    </div>

    <template v-else>
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
          />
        </label>
        <button
          type="submit"
          class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        >
          表示
        </button>
      </form>

      <div v-if="summary" class="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th class="px-3 py-2 font-medium">期間開始</th>
              <th class="px-3 py-2 font-medium">期間終了</th>
              <th class="px-3 py-2 font-medium">完了数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="period in summary.periods" :key="period.periodStart" class="border-b border-slate-100 last:border-0">
              <td class="px-3 py-2 text-slate-600">{{ period.periodStart.slice(0, 10) }}</td>
              <td class="px-3 py-2 text-slate-600">{{ period.periodEnd.slice(0, 10) }}</td>
              <td class="px-3 py-2 font-medium text-slate-900">{{ period.completedCount }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="summary && summary.forecastNextPeriodCount !== null" class="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
        今後の目安: <span class="font-semibold">{{ summary.forecastNextPeriodCount }}</span> 件/期間
      </p>
      <p v-else-if="summary" class="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">
        実績データ不足のため、今後の目安は表示できません。
      </p>
    </template>
  </div>
</template>
