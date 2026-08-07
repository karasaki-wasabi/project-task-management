<!--
  Dashboard (task 17.1, design.md "Frontend/dashboard", Requirements
  11.1-11.6). Aggregates the overdue-cases view (Frontend/cases' own
  progress logic) into a landing screen, so the user does not need
  to open the cases detail screen separately to see what is currently
  at risk. No new backend endpoint: reuses listCases/getCaseProgress
  exactly like the existing cases page.

  The non-task-event ("直近のイベント") section was removed in
  task-case-calendar task 2.2 as part of retiring the non-task-event
  feature entirely (Requirement 8.1); it is not replaced by anything
  on this page.
-->
<script setup lang="ts">
interface CaseRow extends Case {
  progress: CaseProgress | null;
}

const DISPLAY_LIMIT = 5;

const api = useApiClient();
const overdueCases = ref<CaseRow[]>([]);

const visibleOverdueCases = computed(() => overdueCases.value.slice(0, DISPLAY_LIMIT));

async function load() {
  const cases = await api.listCases();
  const withProgress = await Promise.all(
    cases.map(async (case_) => ({ ...case_, progress: await api.getCaseProgress(case_.id) })),
  );
  overdueCases.value = withProgress.filter((c) => c.progress?.isOverdueWithIncomplete);
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
              <span class="text-slate-500">(終了日: {{ case_.endDate ? case_.endDate.slice(0, 10) : "-" }})</span>
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
  </div>
</template>
