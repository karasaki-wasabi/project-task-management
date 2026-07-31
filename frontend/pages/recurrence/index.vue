<!--
  Recurring template registration + non-business-day master management
  (task 11.4, design.md "Frontend/recurrence", Requirements 5.1, 5.2, 5.6,
  5.7, 8.1, 8.2, 8.3, 8.8, 8.9).
-->
<script setup lang="ts">
const api = useApiClient();

const templates = ref<RecurringTaskTemplate[]>([]);
const holidays = ref<NonBusinessDay[]>([]);

const templateTitle = ref("");
const templatePriority = ref<Priority>("medium");
const templateKind = ref<RecurrenceKind>("fixed_interval");
const intervalUnit = ref<IntervalUnit>("week");
const intervalValue = ref(1);
const deliveryOffsetDays = ref(0);
const defaultMemo = ref("");
const nonBusinessDayPolicy = ref<NonBusinessDayPolicy>("as_is");

const holidayDate = ref("");
const holidayLabel = ref("");

async function loadTemplates() {
  templates.value = await api.listRecurringTemplates();
}
async function loadHolidays() {
  holidays.value = await api.listHolidays();
}

async function registerTemplate() {
  await api.registerRecurringTemplate({
    title: templateTitle.value,
    priority: templatePriority.value,
    kind: templateKind.value,
    intervalUnit: templateKind.value === "fixed_interval" ? intervalUnit.value : undefined,
    intervalValue: templateKind.value === "fixed_interval" ? intervalValue.value : undefined,
    deliveryOffsetDays: templateKind.value === "delivery_relative" ? deliveryOffsetDays.value : undefined,
    defaultMemo: defaultMemo.value || undefined,
    nonBusinessDayPolicy: nonBusinessDayPolicy.value,
  });
  templateTitle.value = "";
  defaultMemo.value = "";
  await loadTemplates();
}

async function stopTemplate(id: string) {
  await api.stopRecurringTemplate(id);
  await loadTemplates();
}

async function deleteTemplate(id: string) {
  await api.deleteRecurringTemplate(id);
  await loadTemplates();
}

async function registerHoliday() {
  await api.registerHoliday({ date: holidayDate.value, label: holidayLabel.value || undefined });
  holidayDate.value = "";
  holidayLabel.value = "";
  await loadHolidays();
}

async function deleteHoliday(id: string) {
  await api.deleteHoliday(id);
  await loadHolidays();
}

const syncResult = ref<string | null>(null);
async function syncHolidays() {
  const result = await api.syncHolidays();
  syncResult.value = `新規追加: ${result.added.length}件 / スキップ: ${result.skippedExisting}件`;
  await loadHolidays();
}

const generateResult = ref<string | null>(null);
async function generateDue() {
  const result = await api.generateDueInstances();
  generateResult.value = `${result.length}件のタスクを生成しました`;
}

onMounted(() => {
  loadTemplates();
  loadHolidays();
});
</script>

<template>
  <div class="space-y-8">
    <section class="space-y-4">
      <h1 class="text-xl font-semibold tracking-tight">繰り返しタスクテンプレート</h1>

      <form
        class="flex flex-wrap items-center gap-2 rounded-lg bg-white p-4 ring-1 ring-slate-200"
        @submit.prevent="registerTemplate"
      >
        <input
          v-model="templateTitle"
          placeholder="テンプレート名"
          required
          class="min-w-40 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          v-model="templatePriority"
          class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
        <select
          v-model="templateKind"
          class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="fixed_interval">固定間隔</option>
          <option value="delivery_relative">納品連動</option>
        </select>

        <template v-if="templateKind === 'fixed_interval'">
          <select
            v-model="intervalUnit"
            class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="day">日</option>
            <option value="week">週</option>
            <option value="month">月</option>
          </select>
          <input
            v-model.number="intervalValue"
            type="number"
            min="1"
            class="w-20 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </template>
        <template v-else>
          <input
            v-model.number="deliveryOffsetDays"
            type="number"
            min="0"
            placeholder="納品日からのオフセット日数"
            class="w-48 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </template>

        <input
          v-model="defaultMemo"
          placeholder="既定メモ"
          class="min-w-32 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <select
          v-model="nonBusinessDayPolicy"
          class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="as_is">非営業日でもそのまま登録</option>
          <option value="skip">非営業日なら登録しない</option>
          <option value="next_business_day">次営業日に登録</option>
          <option value="previous_business_day">前営業日に登録</option>
        </select>

        <button
          type="submit"
          class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        >
          テンプレート登録
        </button>
      </form>

      <div class="flex items-center gap-3">
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="generateDue"
        >
          今すぐ生成
        </button>
        <p v-if="generateResult" class="text-sm text-slate-600">{{ generateResult }}</p>
      </div>

      <div class="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th class="px-3 py-2 font-medium">名前</th>
              <th class="px-3 py-2 font-medium">種別</th>
              <th class="px-3 py-2 font-medium">状態</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="template in templates" :key="template.id" class="border-b border-slate-100 last:border-0">
              <td class="px-3 py-2 font-medium text-slate-900">{{ template.title }}</td>
              <td class="px-3 py-2 text-slate-600">{{ template.kind === "fixed_interval" ? "固定間隔" : "納品連動" }}</td>
              <td class="px-3 py-2">
                <Badge :tone="template.isActive ? 'success' : 'neutral'" :label="template.isActive ? '有効' : '停止中'" />
              </td>
              <td class="space-x-2 px-3 py-2">
                <button
                  type="button"
                  :disabled="!template.isActive"
                  class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  @click="stopTemplate(template.id)"
                >
                  停止
                </button>
                <button
                  type="button"
                  class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  @click="deleteTemplate(template.id)"
                >
                  削除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="space-y-4">
      <h2 class="text-lg font-semibold tracking-tight">非営業日マスタ</h2>

      <form
        class="flex flex-wrap items-center gap-2 rounded-lg bg-white p-4 ring-1 ring-slate-200"
        @submit.prevent="registerHoliday"
      >
        <input
          v-model="holidayDate"
          type="date"
          required
          class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          v-model="holidayLabel"
          placeholder="ラベル(祝日名など)"
          class="min-w-40 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        >
          登録
        </button>
      </form>

      <div class="flex items-center gap-3">
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="syncHolidays"
        >
          祝日を取得
        </button>
        <p v-if="syncResult" class="text-sm text-slate-600">{{ syncResult }}</p>
      </div>

      <div class="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th class="px-3 py-2 font-medium">日付</th>
              <th class="px-3 py-2 font-medium">ラベル</th>
              <th class="px-3 py-2 font-medium">取得元</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="holiday in holidays" :key="holiday.id" class="border-b border-slate-100 last:border-0">
              <td class="px-3 py-2 text-slate-600">{{ holiday.date }}</td>
              <td class="px-3 py-2 text-slate-900">{{ holiday.label }}</td>
              <td class="px-3 py-2 text-slate-600">{{ holiday.source }}</td>
              <td class="px-3 py-2">
                <button
                  type="button"
                  class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  @click="deleteHoliday(holiday.id)"
                >
                  削除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
