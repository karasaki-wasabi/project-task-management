<script setup lang="ts">
import {
  formatSyncResult,
  holidayDisplayLabel,
  holidaySourceBadge,
  sortHolidaysByDate,
} from "./index.helpers";

const api = useApiClient();
const { currentId } = useCurrentWorkspace();

const holidays = ref<NonBusinessDay[]>([]);
const holidayDate = ref("");
const holidayLabel = ref("");
const syncResult = ref<string | null>(null);
const error = ref<string | null>(null);

const sortedHolidays = computed(() => sortHolidaysByDate(holidays.value));

async function loadHolidays() {
  if (currentId.value === null) return;
  holidays.value = await api.listHolidays();
}

async function registerHoliday() {
  error.value = null;
  try {
    await api.registerHoliday({
      date: holidayDate.value,
      label: holidayLabel.value || undefined,
    });
    holidayDate.value = "";
    holidayLabel.value = "";
    syncResult.value = null;
    await loadHolidays();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function deleteHoliday(id: string) {
  error.value = null;
  try {
    await api.deleteHoliday(id);
    await loadHolidays();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function syncHolidays() {
  error.value = null;
  try {
    const result = await api.syncHolidays();
    syncResult.value = formatSyncResult(result.added.length, result.skippedExisting);
    await loadHolidays();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

watch(
  currentId,
  (id) => {
    if (id === null) {
      holidays.value = [];
      syncResult.value = null;
      error.value = null;
      return;
    }
    loadHolidays().catch((e) => {
      error.value = e instanceof Error ? e.message : String(e);
    });
  },
  { immediate: true },
);
</script>

<template>
  <div class="space-y-6">
      <h1 class="text-xl font-semibold tracking-tight">休日マスタ</h1>

      <div class="space-y-4 rounded-lg bg-white p-4 ring-1 ring-slate-200 sm:p-5">
        <form class="flex flex-wrap items-end gap-3" @submit.prevent="registerHoliday">
          <div class="flex flex-col gap-1.5">
            <label for="holiday-date" class="text-xs text-slate-500">日付</label>
            <input
              id="holiday-date"
              v-model="holidayDate"
              type="date"
              required
              class="w-44 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div class="flex min-w-60 flex-1 flex-col gap-1.5">
            <label for="holiday-label" class="text-xs text-slate-500">ラベル</label>
            <input
              id="holiday-label"
              v-model="holidayLabel"
              type="text"
              placeholder="ラベル(祝日名など)"
              class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            class="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          >
            登録
          </button>
        </form>

        <div class="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            @click="syncHolidays"
          >
            祝日を取得
          </button>
          <p v-if="syncResult" class="text-sm text-slate-600">{{ syncResult }}</p>
        </div>
      </div>

      <ErrorAlert v-if="error" :message="error" />

      <div class="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              <th class="px-5 py-2.5">日付</th>
              <th class="px-5 py-2.5">ラベル</th>
              <th class="px-5 py-2.5">取得元</th>
              <th class="px-5 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="holiday in sortedHolidays"
              :key="holiday.id"
              class="border-b border-slate-100 last:border-0"
            >
              <td data-testid="holiday-date" class="px-5 py-3 font-medium tabular-nums text-slate-900">
                {{ holiday.date }}
              </td>
              <td class="px-5 py-3 text-slate-700">{{ holidayDisplayLabel(holiday.label) }}</td>
              <td class="px-5 py-3">
                <Badge
                  :tone="holidaySourceBadge(holiday.source).tone"
                  :label="holidaySourceBadge(holiday.source).label"
                />
              </td>
              <td class="px-5 py-3 text-right">
                <button
                  type="button"
                  class="rounded-md border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                  @click="deleteHoliday(holiday.id)"
                >
                  削除
                </button>
              </td>
            </tr>
            <tr v-if="sortedHolidays.length === 0">
              <td colspan="4" class="px-5 py-11 text-center text-sm text-slate-400">
                登録済みの非営業日はありません
              </td>
            </tr>
          </tbody>
        </table>
      </div>
  </div>
</template>
