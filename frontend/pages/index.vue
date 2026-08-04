<!--
  Dashboard (task 17.1, design.md "Frontend/dashboard", Requirements
  11.1-11.6). Aggregates two existing, already-owned views (overdue
  cases from Frontend/cases' own progress logic, upcoming events
  from Frontend/events) into one landing screen, so the user does not need
  to open each detail screen separately to see what is currently at risk.
  No new backend endpoint: reuses listCases/getCaseProgress/
  listEvents exactly like the existing cases/timeline pages.
-->
<script setup lang="ts">
interface CaseRow extends Case {
  progress: CaseProgress | null;
}

const DISPLAY_LIMIT = 5;

const api = useApiClient();
const overdueCases = ref<CaseRow[]>([]);
const upcomingEvents = ref<AppEvent[]>([]);

const visibleOverdueCases = computed(() => overdueCases.value.slice(0, DISPLAY_LIMIT));
const visibleUpcomingEvents = computed(() => upcomingEvents.value.slice(0, DISPLAY_LIMIT));

async function load() {
  const cases = await api.listCases();
  const withProgress = await Promise.all(
    cases.map(async (case_) => ({ ...case_, progress: await api.getCaseProgress(case_.id) })),
  );
  overdueCases.value = withProgress.filter((c) => c.progress?.isOverdueWithIncomplete);

  const events = await api.listEvents();
  const now = new Date().toISOString();
  upcomingEvents.value = events.filter((e) => e.occursAt >= now).sort((a, b) => a.occursAt.localeCompare(b.occursAt));
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold tracking-tight">ダッシュボード</h1>

    <section class="rounded-lg bg-red-50 p-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-red-700">期限超過・未完了の案件</h2>
      <p v-if="overdueCases.length === 0" class="mt-2 text-sm text-slate-600">
        期限超過の案件はありません。順調です。
      </p>
      <template v-else>
        <ul class="mt-3 space-y-2">
          <li v-for="case_ in visibleOverdueCases" :key="case_.id">
            <NuxtLink
              :to="`/tasks?caseId=${case_.id}`"
              class="block rounded-md bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-red-100 hover:ring-red-300"
            >
              <span class="font-medium text-slate-900">{{ case_.name }}</span>
              <span class="text-slate-500">(終了日: {{ case_.endDate.slice(0, 10) }})</span>
              <span class="ml-2 text-red-700"
                >{{ case_.progress?.requiredCompleted }} / {{ case_.progress?.requiredTotal }}</span
              >
            </NuxtLink>
          </li>
        </ul>
        <NuxtLink
          v-if="overdueCases.length > DISPLAY_LIMIT"
          to="/cases"
          class="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          すべての案件を見る({{ overdueCases.length }}件)
        </NuxtLink>
      </template>
    </section>

    <section class="rounded-lg bg-white p-4 ring-1 ring-slate-200">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">直近のイベント</h2>
      <p v-if="upcomingEvents.length === 0" class="mt-2 text-sm text-slate-600">直近のイベントはありません。</p>
      <template v-else>
        <ul class="mt-3 space-y-2">
          <li v-for="event in visibleUpcomingEvents" :key="event.id">
            <NuxtLink
              to="/events"
              class="block rounded-md px-3 py-2 text-sm hover:bg-slate-50"
            >
              <span class="font-medium text-slate-900">{{ event.title }}</span>
              <span class="ml-2 text-slate-500">{{ event.occursAt }}</span>
            </NuxtLink>
          </li>
        </ul>
        <NuxtLink
          v-if="upcomingEvents.length > DISPLAY_LIMIT"
          to="/events"
          class="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          すべてのイベントを見る({{ upcomingEvents.length }}件)
        </NuxtLink>
      </template>
    </section>
  </div>
</template>
