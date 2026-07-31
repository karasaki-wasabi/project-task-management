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
  <section>
    <h1>繰り返しタスクテンプレート</h1>

    <form @submit.prevent="registerTemplate">
      <input v-model="templateTitle" placeholder="テンプレート名" required />
      <select v-model="templatePriority">
        <option value="high">高</option>
        <option value="medium">中</option>
        <option value="low">低</option>
      </select>
      <select v-model="templateKind">
        <option value="fixed_interval">固定間隔</option>
        <option value="delivery_relative">納品連動</option>
      </select>

      <template v-if="templateKind === 'fixed_interval'">
        <select v-model="intervalUnit">
          <option value="day">日</option>
          <option value="week">週</option>
          <option value="month">月</option>
        </select>
        <input v-model.number="intervalValue" type="number" min="1" />
      </template>
      <template v-else>
        <input v-model.number="deliveryOffsetDays" type="number" min="0" placeholder="納品日からのオフセット日数" />
      </template>

      <input v-model="defaultMemo" placeholder="既定メモ" />

      <select v-model="nonBusinessDayPolicy">
        <option value="as_is">非営業日でもそのまま登録</option>
        <option value="skip">非営業日なら登録しない</option>
        <option value="next_business_day">次営業日に登録</option>
        <option value="previous_business_day">前営業日に登録</option>
      </select>

      <button type="submit">テンプレート登録</button>
    </form>

    <button type="button" @click="generateDue">今すぐ生成</button>
    <p v-if="generateResult">{{ generateResult }}</p>

    <table>
      <thead>
        <tr>
          <th>名前</th>
          <th>種別</th>
          <th>状態</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="template in templates" :key="template.id">
          <td>{{ template.title }}</td>
          <td>{{ template.kind }}</td>
          <td>{{ template.isActive ? "有効" : "停止中" }}</td>
          <td>
            <button type="button" :disabled="!template.isActive" @click="stopTemplate(template.id)">停止</button>
            <button type="button" @click="deleteTemplate(template.id)">削除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <h2>非営業日マスタ</h2>

    <form @submit.prevent="registerHoliday">
      <input v-model="holidayDate" type="date" required />
      <input v-model="holidayLabel" placeholder="ラベル(祝日名など)" />
      <button type="submit">登録</button>
    </form>

    <button type="button" @click="syncHolidays">祝日を取得</button>
    <p v-if="syncResult">{{ syncResult }}</p>

    <table>
      <thead>
        <tr>
          <th>日付</th>
          <th>ラベル</th>
          <th>取得元</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="holiday in holidays" :key="holiday.id">
          <td>{{ holiday.date }}</td>
          <td>{{ holiday.label }}</td>
          <td>{{ holiday.source }}</td>
          <td><button type="button" @click="deleteHoliday(holiday.id)">削除</button></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
