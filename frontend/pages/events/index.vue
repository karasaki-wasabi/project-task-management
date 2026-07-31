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
  <section>
    <h1>タスク・イベント タイムライン</h1>

    <AssigneeFilter v-model="assigneeUserId" />

    <form @submit.prevent="createEvent">
      <input v-model="newEventTitle" placeholder="イベント名" required />
      <input v-model="newEventOccursAt" type="datetime-local" required />
      <button type="submit">イベント登録</button>
    </form>

    <ul>
      <li v-for="entry in entries" :key="`${entry.kind}-${entry.id}`" :data-kind="entry.kind">
        <span class="entry-kind">{{ entry.kind === "task" ? "タスク" : "イベント" }}</span>
        <time>{{ entry.at }}</time>
        <span>{{ entry.title }}</span>
        <span v-if="entry.status">({{ entry.status }})</span>
      </li>
    </ul>
  </section>
</template>
