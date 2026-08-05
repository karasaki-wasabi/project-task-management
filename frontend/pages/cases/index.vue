<!--
  Cases index page (task 6.1, design.md "Frontend / cases > cases index
  page", Requirements 1.1, 7.1, 7.2, 7.3). Replaces
  frontend/pages/deliveries/index.vue (that page is removed once 6.1/6.2/
  6.3/8.1 are all done and the old registration form is no longer the only
  entry point — not yet, per this task's scope).

  Visual language follows kanban/index.vue per Requirement 9.1: same
  slate/primary palette, Badge/StatusBadge-style pills, ring-1 card
  chrome. Status chips (すべて/進行中/完了/期限超過, with counts) are an
  addition beyond Requirement 7's plain name search, confirmed via
  claude-design mockups (research.md section 6) — computed client-side
  from listCases + a Promise.all of getCaseProgress per case (design.md:
  "追加APIは不要"), same pattern as the old deliveries page's progress
  fetch.

  Registration ("案件を登録") and per-row navigation to a detail/edit popup
  are wired here (task 8.1) into CaseFormModal (task 6.2) and
  CaseDetailModal (task 6.3), following kanban/index.vue's TaskDetailModal
  wiring pattern: a nullable `activeCaseId` ref controls the detail modal,
  and both modals share this page's `load()` for post-mutation refresh.

  CaseFormModal's `created` event fires right after `createCase` succeeds,
  before its per-task association calls run — the modal deliberately stays
  open afterward to show association errors and a retry action (task 6.2:
  "失敗したタスクがあってもモーダルを閉じずエラーを表示する"). So `created`
  only triggers a list reload here (so the new case appears while the
  modal keeps showing association progress/errors); the modal closes
  itself by emitting `close` once every association has succeeded (or the
  user cancels/closes manually), which this page handles the same way as
  any other `close`.

  CaseDetailModal's `saved` mirrors TaskDetailModal's `onTaskDetailSaved`:
  the modal returns to view mode internally without emitting `close`, so
  this page only reloads data and leaves the modal open. `deleted` closes
  the modal (the case no longer exists) and reloads so the row disappears.
-->
<script setup lang="ts">
import { computeStatusCounts, filterCases, type CaseRow, type CaseStatusFilter } from "./index.helpers";

const api = useApiClient();
const cases = ref<CaseRow[]>([]);
const loaded = ref(false);
const error = ref<string | null>(null);

const showCreateModal = ref(false);
const activeCaseId = ref<string | null>(null);

const searchText = ref("");
const statusFilter = ref<CaseStatusFilter>("all");

const statusCounts = computed(() => computeStatusCounts(cases.value));
const filteredCases = computed(() => filterCases(cases.value, searchText.value, statusFilter.value));

const chips: { key: CaseStatusFilter; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "in_progress", label: "進行中" },
  { key: "completed", label: "完了" },
  { key: "overdue", label: "期限超過" },
];

function requiredProgressLabel(progress: CaseProgress | null): string {
  if (!progress) return "-";
  return `${progress.requiredCompleted} / ${progress.requiredTotal}`;
}

function requiredProgressRatio(progress: CaseProgress | null): number {
  if (!progress || progress.requiredTotal === 0) return 0;
  return Math.round((progress.requiredCompleted / progress.requiredTotal) * 100);
}

async function load() {
  error.value = null;
  try {
    const list = await api.listCases();
    const withProgress = await Promise.all(
      list.map(async (item) => ({ ...item, progress: await api.getCaseProgress(item.id) })),
    );
    cases.value = withProgress;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loaded.value = true;
  }
}

onMounted(load);

function openCreateModal() {
  showCreateModal.value = true;
}

// `close` can fire after per-task associations have already succeeded
// (the modal auto-closes once `runAssociations()` finishes), which happens
// after `created` already refreshed the list — so the list's snapshot can
// be stale (e.g. showing 0/0 progress) by the time `close` fires. Reload
// here too; for the plain-cancel-with-nothing-created path this is just a
// harmless no-op refresh of already-current data.
async function closeCreateModal() {
  showCreateModal.value = false;
  await load();
}

// The case already exists in the backend by the time `created` fires; the
// modal itself stays open to surface per-task association errors/retry, so
// this only refreshes the list — closing is driven by the modal's own
// `close` emit (see header comment).
async function onCaseCreated() {
  await load();
}

function openCaseDetail(caseId: string) {
  activeCaseId.value = caseId;
}

function closeCaseDetail() {
  activeCaseId.value = null;
}

// CaseDetailModal returns to view mode internally after a save without
// emitting `close` (same pattern as kanban's TaskDetailModal) — keep it
// open and just refresh the list/progress.
async function onCaseSaved() {
  await load();
}

async function onCaseDeleted() {
  activeCaseId.value = null;
  await load();
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <h1 class="text-xl font-semibold tracking-tight text-slate-900">案件一覧</h1>
      <button
        type="button"
        class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
        @click="openCreateModal"
      >
        案件を登録
      </button>
    </div>

    <ErrorAlert v-if="error" :message="error" />

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="chip in chips"
          :key="chip.key"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors"
          :class="
            statusFilter === chip.key
              ? 'bg-primary-600 text-white ring-primary-600'
              : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
          "
          @click="statusFilter = chip.key"
        >
          {{ chip.label }}
          <span
            class="inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs"
            :class="statusFilter === chip.key ? 'bg-white/20' : 'bg-slate-100'"
          >
            {{ statusCounts[chip.key] }}
          </span>
        </button>
      </div>

      <input
        v-model="searchText"
        type="search"
        placeholder="案件名で絞り込み"
        class="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </div>

    <p v-if="loaded && cases.length === 0" class="rounded-lg bg-white p-6 text-center text-sm text-slate-600 ring-1 ring-slate-200">
      案件がまだありません。「案件を登録」から最初の案件を作成してください。
    </p>

    <p
      v-else-if="loaded && filteredCases.length === 0"
      class="rounded-lg bg-white p-6 text-center text-sm text-slate-600 ring-1 ring-slate-200"
    >
      条件に一致する案件がありません。検索文字列やステータスの絞り込みを見直してください。
    </p>

    <div v-else class="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th class="px-3 py-2 font-medium">案件名</th>
            <th class="px-3 py-2 font-medium">開始日</th>
            <th class="px-3 py-2 font-medium">終了日</th>
            <th class="px-3 py-2 font-medium">完了状態</th>
            <th class="px-3 py-2 font-medium">必須タスク</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in filteredCases"
            :key="item.id"
            tabindex="0"
            role="button"
            :aria-label="`${item.name} の詳細を開く`"
            class="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
            :class="item.progress?.isOverdueWithIncomplete ? 'bg-red-50' : ''"
            @click="openCaseDetail(item.id)"
            @keydown.enter="openCaseDetail(item.id)"
          >
            <td class="px-3 py-2 font-medium text-slate-900">{{ item.name }}</td>
            <td class="px-3 py-2 text-slate-600">{{ item.startDate ? item.startDate.slice(0, 10) : "-" }}</td>
            <td class="px-3 py-2 text-slate-600">{{ item.endDate ? item.endDate.slice(0, 10) : "-" }}</td>
            <td class="px-3 py-2">
              <Badge v-if="item.isCompleted" tone="success" label="完了" />
              <Badge v-else-if="item.progress?.isOverdueWithIncomplete" tone="danger" label="期限超過" />
              <Badge v-else tone="info" label="進行中" />
            </td>
            <td class="px-3 py-2">
              <div class="flex items-center gap-2">
                <span class="text-slate-700">{{ requiredProgressLabel(item.progress) }}</span>
                <div class="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                  <div
                    class="h-full rounded-full bg-primary-500"
                    :style="{ width: `${requiredProgressRatio(item.progress)}%` }"
                  />
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <CaseFormModal :open="showCreateModal" @close="closeCreateModal" @created="onCaseCreated" />

    <CaseDetailModal :case-id="activeCaseId" @close="closeCaseDetail" @saved="onCaseSaved" @deleted="onCaseDeleted" />
  </div>
</template>
