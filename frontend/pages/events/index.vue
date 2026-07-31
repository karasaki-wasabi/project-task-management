<!--
  Tasks + Events integrated timeline (task 11.3, design.md
  "Frontend/events", Requirements 4.1-4.3). design.md Implementation Notes:
  "TasksとEventsの2つのAPIレスポンスをクライアント側でマージする(バック
  エンドに統合エンドポイントは設けない)" — merged and sorted here.
-->
<script setup lang="ts">
interface TimelineEntry {
  kind: "task" | "event";
  id: string;
  title: string;
  at: string;
  status?: TaskStatus;
}

const api = useApiClient();
const entries = ref<TimelineEntry[]>([]);
const newEventTitle = ref("");
const newEventOccursAt = ref("");
const assigneeUserId = ref("");

async function load() {
  const filter = { assigneeUserId: assigneeUserId.value || undefined };
  const [tasks, events] = await Promise.all([api.listTasks(filter), api.listEvents(filter)]);
  const taskEntries: TimelineEntry[] = tasks
    .filter((task) => task.scheduledDate || task.completedAt)
    .map((task) => ({
      kind: "task",
      id: task.id,
      title: task.title,
      at: task.scheduledDate ?? task.completedAt ?? task.createdAt,
      status: task.status,
    }));
  const eventEntries: TimelineEntry[] = events.map((event) => ({
    kind: "event",
    id: event.id,
    title: event.title,
    at: event.occursAt,
  }));
  entries.value = [...taskEntries, ...eventEntries].sort((a, b) => a.at.localeCompare(b.at));
}

async function createEvent() {
  await api.createEvent({ title: newEventTitle.value, occursAt: newEventOccursAt.value });
  newEventTitle.value = "";
  newEventOccursAt.value = "";
  await load();
}

watch(assigneeUserId, load);
onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold tracking-tight">タスク・イベント タイムライン</h1>

    <AssigneeFilter v-model="assigneeUserId" />

    <form
      class="flex flex-wrap items-center gap-2 rounded-lg bg-white p-4 ring-1 ring-slate-200"
      @submit.prevent="createEvent"
    >
      <input
        v-model="newEventTitle"
        placeholder="イベント名"
        required
        class="min-w-40 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <input
        v-model="newEventOccursAt"
        type="datetime-local"
        required
        class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
      >
        イベント登録
      </button>
    </form>

    <ul class="space-y-1.5">
      <li
        v-for="entry in entries"
        :key="`${entry.kind}-${entry.id}`"
        :data-kind="entry.kind"
        class="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200"
      >
        <Badge :tone="entry.kind === 'task' ? 'info' : 'neutral'" :label="entry.kind === 'task' ? 'タスク' : 'イベント'" />
        <time class="text-slate-500">{{ entry.at }}</time>
        <span class="font-medium text-slate-900">{{ entry.title }}</span>
        <StatusBadge v-if="entry.status" :status="entry.status" />
      </li>
    </ul>
  </div>
</template>
