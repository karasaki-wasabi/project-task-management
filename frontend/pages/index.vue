<!--
  Dashboard (task 17.1, design.md "Frontend/dashboard", Requirements
  11.1-11.6). Aggregates two existing, already-owned views (overdue
  deliveries from Frontend/deliveries' own progress logic, upcoming events
  from Frontend/events) into one landing screen, so the user does not need
  to open each detail screen separately to see what is currently at risk.
  No new backend endpoint: reuses listDeliveries/getDeliveryProgress/
  listEvents exactly like the existing deliveries/timeline pages.
-->
<script setup lang="ts">
interface DeliveryRow extends Delivery {
  progress: DeliveryProgress | null;
}

const DISPLAY_LIMIT = 5;

const api = useApiClient();
const overdueDeliveries = ref<DeliveryRow[]>([]);
const upcomingEvents = ref<AppEvent[]>([]);

const visibleOverdueDeliveries = computed(() => overdueDeliveries.value.slice(0, DISPLAY_LIMIT));
const visibleUpcomingEvents = computed(() => upcomingEvents.value.slice(0, DISPLAY_LIMIT));

async function load() {
  const deliveries = await api.listDeliveries();
  const withProgress = await Promise.all(
    deliveries.map(async (delivery) => ({ ...delivery, progress: await api.getDeliveryProgress(delivery.id) })),
  );
  overdueDeliveries.value = withProgress.filter((d) => d.progress?.isOverdueWithIncomplete);

  const events = await api.listEvents();
  const now = new Date().toISOString();
  upcomingEvents.value = events.filter((e) => e.occursAt >= now).sort((a, b) => a.occursAt.localeCompare(b.occursAt));
}

onMounted(load);
</script>

<template>
  <section>
    <h1>ダッシュボード</h1>

    <section class="dashboard-section overdue-section">
      <h2>期限超過・未完了の納品</h2>
      <p v-if="overdueDeliveries.length === 0" class="empty-state">期限超過の納品はありません。順調です。</p>
      <template v-else>
        <ul>
          <li v-for="delivery in visibleOverdueDeliveries" :key="delivery.id">
            <NuxtLink :to="`/tasks?deliveryId=${delivery.id}`">
              {{ delivery.name }}(納品期日: {{ delivery.dueDate.slice(0, 10) }})
              — {{ delivery.progress?.requiredCompleted }} / {{ delivery.progress?.requiredTotal }}
            </NuxtLink>
          </li>
        </ul>
        <NuxtLink v-if="overdueDeliveries.length > DISPLAY_LIMIT" to="/deliveries">
          すべての納品を見る({{ overdueDeliveries.length }}件)
        </NuxtLink>
      </template>
    </section>

    <section class="dashboard-section events-section">
      <h2>直近のイベント</h2>
      <p v-if="upcomingEvents.length === 0" class="empty-state">直近のイベントはありません。</p>
      <template v-else>
        <ul>
          <li v-for="event in visibleUpcomingEvents" :key="event.id">
            <NuxtLink to="/events">{{ event.title }} — {{ event.occursAt }}</NuxtLink>
          </li>
        </ul>
        <NuxtLink v-if="upcomingEvents.length > DISPLAY_LIMIT" to="/events">
          すべてのイベントを見る({{ upcomingEvents.length }}件)
        </NuxtLink>
      </template>
    </section>
  </section>
</template>

<style scoped>
.dashboard-section {
  margin-bottom: 2rem;
}
.overdue-section {
  background: #fff5f5;
  padding: 1rem;
  border-radius: 4px;
}
.overdue-section h2 {
  color: #c0392b;
}
.empty-state {
  color: #555;
}
</style>
