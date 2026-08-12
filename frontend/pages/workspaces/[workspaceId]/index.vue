<!--
  Scoped dashboard (workspace-url-routing task 3.1). Overdue-cases body moved
  from pages/index.vue. Membership is guaranteed by workspace-member middleware;
  the currentId === null empty-state is intentionally omitted.
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useApiClient, type Case, type CaseProgress } from "../../../composables/useApiClient";
import { useCurrentWorkspace } from "../../../composables/useCurrentWorkspace";
import { workspacePath } from "../../../utils/workspacePath";

interface CaseRow extends Case {
  progress: CaseProgress | null;
}

const DISPLAY_LIMIT = 5;

const api = useApiClient();
const { currentId } = useCurrentWorkspace();
const overdueCases = ref<CaseRow[]>([]);

const visibleOverdueCases = computed(() => overdueCases.value.slice(0, DISPLAY_LIMIT));

const casesPath = computed(() => {
  const id = currentId.value;
  // Middleware guarantees membership; currentId is synced from the route.
  return id ? workspacePath(id, "cases") : "#";
});

function caseTasksPath(caseId: string): string {
  const id = currentId.value;
  if (!id) return "#";
  return `${workspacePath(id, "tasks")}?caseId=${caseId}`;
}

async function load() {
  const cases = await api.listCases();
  const withProgress = await Promise.all(
    cases.map(async (case_) => ({ ...case_, progress: await api.getCaseProgress(case_.id) })),
  );
  overdueCases.value = withProgress.filter((c) => c.progress?.isOverdueWithIncomplete);
}

watch(
  currentId,
  (id) => {
    if (id === null) {
      overdueCases.value = [];
      return;
    }
    void load();
  },
  { immediate: true },
);
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
              :to="caseTasksPath(case_.id)"
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
          :to="casesPath"
          class="mt-3 inline-block text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
        >
          すべての案件を見る({{ overdueCases.length }}件)
        </NuxtLink>
      </template>
    </section>
  </div>
</template>
