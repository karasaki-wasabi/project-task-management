<!--
  Delivery board / progress display (task 11.2, design.md
  "Frontend/deliveries", Requirements 3.1-3.7). Multiple deliveries are
  listed and browsed concurrently (Requirement 3.6); an overdue delivery
  with incomplete required tasks is highlighted (Requirement 3.5).
-->
<script setup lang="ts">
interface DeliveryRow extends Delivery {
  progress: DeliveryProgress | null;
}

const api = useApiClient();
const deliveries = ref<DeliveryRow[]>([]);
const newName = ref("");
const newDueDate = ref("");
const filterText = ref("");

const filteredDeliveries = computed(() =>
  deliveries.value.filter((d) => d.name.toLowerCase().includes(filterText.value.toLowerCase())),
);

async function load() {
  const list = await api.listDeliveries();
  const withProgress = await Promise.all(
    list.map(async (delivery) => ({ ...delivery, progress: await api.getDeliveryProgress(delivery.id) })),
  );
  deliveries.value = withProgress;
}

async function createDelivery() {
  await api.createDelivery({ name: newName.value, dueDate: newDueDate.value });
  newName.value = "";
  newDueDate.value = "";
  await load();
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold tracking-tight">納品ボード</h1>

    <form
      class="flex flex-wrap items-center gap-2 rounded-lg bg-white p-4 ring-1 ring-slate-200"
      @submit.prevent="createDelivery"
    >
      <input
        v-model="newName"
        placeholder="納品名"
        required
        class="min-w-40 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <input
        v-model="newDueDate"
        type="date"
        required
        class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
      >
        登録
      </button>
    </form>

    <input
      v-model="filterText"
      placeholder="納品名で絞り込み"
      class="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />

    <div class="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th class="px-3 py-2 font-medium">納品名</th>
            <th class="px-3 py-2 font-medium">納品期日</th>
            <th class="px-3 py-2 font-medium">必須タスク進捗</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="delivery in filteredDeliveries"
            :key="delivery.id"
            class="border-b border-slate-100 last:border-0"
            :class="delivery.progress?.isOverdueWithIncomplete ? 'bg-red-50' : ''"
          >
            <td class="px-3 py-2 font-medium text-slate-900">{{ delivery.name }}</td>
            <td class="px-3 py-2 text-slate-600">{{ delivery.dueDate.slice(0, 10) }}</td>
            <td v-if="delivery.progress" class="px-3 py-2">
              <span class="text-slate-700">{{ delivery.progress.requiredCompleted }} / {{ delivery.progress.requiredTotal }}</span>
              <Badge
                v-if="delivery.progress.isOverdueWithIncomplete"
                tone="danger"
                label="期日超過・未完了あり"
                class="ml-2"
              />
            </td>
            <td class="px-3 py-2">
              <NuxtLink :to="`/tasks?deliveryId=${delivery.id}`" class="font-medium text-blue-600 hover:text-blue-700 hover:underline">
                タスクを見る
              </NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
