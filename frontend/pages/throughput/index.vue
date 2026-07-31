<!--
  Throughput dashboard (task 11.5, design.md "Frontend/throughput",
  Requirements 6.1-6.4). Shows past-period completed counts and, when
  enough history exists, a simple-moving-average forecast; otherwise an
  explicit "not enough data" message (Requirement 6.4).
-->
<script setup lang="ts">
const api = useApiClient();
const periodType = ref<PeriodType>("week");
const rangeCount = ref(4);
const summary = ref<ThroughputSummary | null>(null);

async function load() {
  summary.value = await api.getThroughput(periodType.value, rangeCount.value);
}

onMounted(load);
</script>

<template>
  <section>
    <h1>消化数ダッシュボード</h1>

    <form @submit.prevent="load">
      <label>
        期間種別
        <select v-model="periodType">
          <option value="week">週</option>
          <option value="month">月</option>
        </select>
      </label>
      <label>
        表示件数
        <input v-model.number="rangeCount" type="number" min="1" />
      </label>
      <button type="submit">表示</button>
    </form>

    <table v-if="summary">
      <thead>
        <tr>
          <th>期間開始</th>
          <th>期間終了</th>
          <th>完了数</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="period in summary.periods" :key="period.periodStart">
          <td>{{ period.periodStart.slice(0, 10) }}</td>
          <td>{{ period.periodEnd.slice(0, 10) }}</td>
          <td>{{ period.completedCount }}</td>
        </tr>
      </tbody>
    </table>

    <p v-if="summary && summary.forecastNextPeriodCount !== null">
      今後の目安: {{ summary.forecastNextPeriodCount }} 件/期間
    </p>
    <p v-else-if="summary">実績データ不足のため、今後の目安は表示できません。</p>
  </section>
</template>
