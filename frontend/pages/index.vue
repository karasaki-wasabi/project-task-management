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
  <div class="space-y-6">
    <h1 class="text-xl font-semibold tracking-tight">ダッシュボード</h1>

    <section class="rounded-lg bg-red-50 p-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-red-700">期限超過・未完了の納品</h2>
      <p v-if="overdueDeliveries.length === 0" class="mt-2 text-sm text-slate-600">
        期限超過の納品はありません。順調です。
      </p>
      <template v-else>
        <ul class="mt-3 space-y-2">
          <li v-for="delivery in visibleOverdueDeliveries" :key="delivery.id">
            <NuxtLink
              :to="`/tasks?deliveryId=${delivery.id}`"
              class="block rounded-md bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-red-100 hover:ring-red-300"
            >
              <span class="font-medium text-slate-900">{{ delivery.name }}</span>
              <span class="text-slate-500">(納品期日: {{ delivery.dueDate.slice(0, 10) }})</span>
              <span class="ml-2 text-red-700"
                >{{ delivery.progress?.requiredCompleted }} / {{ delivery.progress?.requiredTotal }}</span
              >
            </NuxtLink>
          </li>
        </ul>
        <NuxtLink
          v-if="overdueDeliveries.length > DISPLAY_LIMIT"
          to="/deliveries"
          class="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          すべての納品を見る({{ overdueDeliveries.length }}件)
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
