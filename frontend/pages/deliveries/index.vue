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
  <section>
    <h1>納品ボード</h1>

    <form @submit.prevent="createDelivery">
      <input v-model="newName" placeholder="納品名" required />
      <input v-model="newDueDate" type="date" required />
      <button type="submit">登録</button>
    </form>

    <input v-model="filterText" placeholder="納品名で絞り込み" />

    <table>
      <thead>
        <tr>
          <th>納品名</th>
          <th>納品期日</th>
          <th>必須タスク進捗</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="delivery in filteredDeliveries"
          :key="delivery.id"
          :class="{ overdue: delivery.progress?.isOverdueWithIncomplete }"
        >
          <td>{{ delivery.name }}</td>
          <td>{{ delivery.dueDate.slice(0, 10) }}</td>
          <td v-if="delivery.progress">
            {{ delivery.progress.requiredCompleted }} / {{ delivery.progress.requiredTotal }}
            <strong v-if="delivery.progress.isOverdueWithIncomplete" class="overdue-badge">
              期日超過・未完了あり
            </strong>
          </td>
          <td>
            <NuxtLink :to="`/tasks?deliveryId=${delivery.id}`">タスクを見る</NuxtLink>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.overdue {
  background: #fff0f0;
}
.overdue-badge {
  color: #c0392b;
}
</style>
