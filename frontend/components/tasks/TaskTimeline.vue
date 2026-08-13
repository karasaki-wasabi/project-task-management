<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import CommentComposer from "../comments/CommentComposer.vue";
import {
  useApiClient,
  type Case,
  type Comment,
  type DevelopmentStage,
  type Task,
  type TaskTimelineChange,
  type TaskTimelineEntry,
  type TaskTimelineFilter,
  type User,
} from "../../composables/useApiClient";

const props = withDefaults(
  defineProps<{
    taskId: string;
    currentUserId: string;
    readOnly?: boolean;
    users?: User[];
    cases?: Case[];
    stages?: DevelopmentStage[];
    tasks?: Task[];
  }>(),
  {
    readOnly: false,
    users: () => [],
    cases: () => [],
    stages: () => [],
    tasks: () => [],
  },
);

const api = useApiClient();
const filter = ref<TaskTimelineFilter>("all");
const items = ref<TaskTimelineEntry[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const deletingCommentId = ref<string | null>(null);
const editingCommentId = ref<string | null>(null);
const error = ref<string | null>(null);
let requestSequence = 0;

const tabs: ReadonlyArray<{ value: TaskTimelineFilter; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "comments", label: "コメント" },
  { value: "changes", label: "変更履歴" },
];

function userLabel(userId: string | null | undefined): string | null {
  if (userId == null) return null;
  return props.users.find((user) => user.id === userId)?.name ?? userId;
}

function caseLabel(caseId: string | null | undefined): string | null {
  if (caseId == null) return null;
  return props.cases.find((item) => item.id === caseId)?.name ?? caseId;
}

function stageLabel(stageId: string | null | undefined): string | null {
  if (stageId == null) return null;
  return props.stages.find((stage) => stage.id === stageId)?.name ?? stageId;
}

function taskLabel(taskId: string | null | undefined): string | null {
  if (taskId == null) return null;
  return props.tasks.find((task) => task.id === taskId)?.title ?? taskId;
}

function authorLabel(authorUserId: string): string {
  return userLabel(authorUserId) ?? authorUserId;
}

function actorLabel(change: TaskTimelineChange): string {
  if (change.actorUserId) return userLabel(change.actorUserId) ?? change.actorUserId;
  if (change.actorSourceLabel) return `システム（${change.actorSourceLabel}）`;
  return "システム";
}

function fieldValueLabel(
  fieldName: TaskTimelineChange["fieldName"],
  value: string | null,
): string {
  if (value == null) return "未設定";
  switch (fieldName) {
    case "assignee":
      return userLabel(value) ?? value;
    case "case":
      return caseLabel(value) ?? value;
    case "developmentStage":
      return stageLabel(value) ?? value;
    case "parentTask":
      return taskLabel(value) ?? value;
    default:
      return value;
  }
}

function changeMessage(change: TaskTimelineChange): string {
  const actor = actorLabel(change);
  const before = fieldValueLabel(change.fieldName, change.beforeValue);
  const after = fieldValueLabel(change.fieldName, change.afterValue);

  switch (change.fieldName) {
    case "title":
      return `${actor} がタイトルを ${before} から ${after} に変更しました`;
    case "status":
      return `${actor} がステータスを ${before} から ${after} に変更しました`;
    case "priority":
      return `${actor} が優先度を ${before} から ${after} に変更しました`;
    case "detail":
      return `${actor} が詳細を更新しました`;
    case "assignee":
      return `${actor} が担当者を ${before} から ${after} に変更しました`;
    case "case":
      return `${actor} が案件を ${before} から ${after} に変更しました`;
    case "isRequiredForCase":
      return change.afterValue === "true"
        ? `${actor} がこのタスクを必須タスクに設定しました`
        : `${actor} が必須タスクの設定を解除しました`;
    case "developmentStage":
      return `${actor} が開発段階を ${before} から ${after} に移しました`;
    case "parentTask":
      return `${actor} が親タスクを ${before} から ${after} に変更しました`;
    case "scheduledEndDate":
      return `${actor} が終了予定日を ${before} から ${after} に変更しました`;
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function caughtMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

async function loadTimeline(options: { append?: boolean } = {}) {
  const append = options.append === true;
  const cursor = append ? nextCursor.value : null;
  if (append && !cursor) return;

  const sequence = ++requestSequence;
  error.value = null;
  if (append) {
    loadingMore.value = true;
  } else {
    loading.value = true;
    editingCommentId.value = null;
    items.value = [];
    nextCursor.value = null;
  }

  try {
    const page = await api.getTaskTimeline(
      props.taskId,
      cursor ? { filter: filter.value, cursor } : { filter: filter.value },
    );
    if (sequence !== requestSequence) return;

    items.value = append ? [...items.value, ...page.items] : page.items;
    nextCursor.value = page.nextCursor;
  } catch (caught) {
    if (sequence !== requestSequence) return;
    error.value = caughtMessage(caught);
  } finally {
    if (sequence === requestSequence) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

function selectFilter(selected: TaskTimelineFilter) {
  filter.value = selected;
  void loadTimeline();
}

function startEditing(commentId: string) {
  error.value = null;
  editingCommentId.value = commentId;
}

function cancelEditing() {
  editingCommentId.value = null;
}

async function onEditSuccess(_comment: Comment) {
  editingCommentId.value = null;
  await loadTimeline();
}

async function removeComment(commentId: string) {
  error.value = null;
  deletingCommentId.value = commentId;
  try {
    await api.deleteComment(props.taskId, commentId);
    await loadTimeline();
  } catch (caught) {
    error.value = caughtMessage(caught);
  } finally {
    deletingCommentId.value = null;
  }
}

watch(
  () => props.taskId,
  () => {
    void loadTimeline();
  },
);

onMounted(() => {
  void loadTimeline();
});
</script>

<template>
  <section aria-labelledby="task-timeline-heading" class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 id="task-timeline-heading" class="text-lg font-semibold text-slate-900">
        タイムライン
      </h2>

      <div
        role="tablist"
        aria-label="タイムラインの表示対象"
        class="inline-flex rounded-lg bg-slate-100 p-1"
      >
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          role="tab"
          :data-filter="tab.value"
          :aria-selected="filter === tab.value"
          class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          :class="
            filter === tab.value
              ? 'bg-white text-primary-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          "
          @click="selectFilter(tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <p
      v-if="error"
      role="alert"
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ error }}
    </p>

    <p v-if="loading" aria-live="polite" class="py-6 text-center text-sm text-slate-500">
      読み込み中...
    </p>

    <p
      v-else-if="items.length === 0"
      class="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500"
    >
      表示する項目がありません
    </p>

    <ol v-else class="space-y-3">
      <li v-for="entry in items" :key="`${entry.type}-${entry.id}`">
        <article
          v-if="entry.type === 'comment'"
          class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span class="font-medium text-slate-700">{{ authorLabel(entry.authorUserId) }}</span>
              <time :datetime="entry.occurredAt">{{ formatDateTime(entry.occurredAt) }}</time>
              <span v-if="entry.editedAt" class="rounded bg-slate-100 px-1.5 py-0.5">
                編集済み
              </span>
            </div>

            <div
              v-if="
                !readOnly &&
                entry.authorUserId === currentUserId &&
                editingCommentId !== entry.id
              "
              class="flex items-center gap-2"
            >
              <button
                type="button"
                aria-label="自分のコメントを編集"
                class="text-xs font-medium text-primary-700 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                @click="startEditing(entry.id)"
              >
                編集
              </button>
              <button
                type="button"
                aria-label="自分のコメントを削除"
                :disabled="deletingCommentId === entry.id"
                class="text-xs font-medium text-red-600 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                @click="removeComment(entry.id)"
              >
                {{ deletingCommentId === entry.id ? "削除中..." : "削除" }}
              </button>
            </div>
          </div>

          <div v-if="editingCommentId === entry.id" class="space-y-2">
            <CommentComposer
              :taskId="taskId"
              mode="edit"
              :commentId="entry.id"
              :initialBody="entry.body"
              @success="onEditSuccess"
            />
            <button
              type="button"
              class="text-sm text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
              @click="cancelEditing"
            >
              キャンセル
            </button>
          </div>
          <p v-else class="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
            {{ entry.body }}
          </p>
        </article>

        <div v-else class="flex gap-3 py-2 text-sm text-slate-600">
          <span
            aria-hidden="true"
            class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-400"
          />
          <div class="min-w-0">
            <p>{{ changeMessage(entry) }}</p>
            <time :datetime="entry.occurredAt" class="mt-0.5 block text-xs text-slate-400">
              {{ formatDateTime(entry.occurredAt) }}
            </time>
          </div>
        </div>
      </li>
    </ol>

    <div v-if="nextCursor && !loading" class="flex justify-center">
      <button
        type="button"
        aria-label="続きを読み込む"
        :disabled="loadingMore"
        class="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        @click="loadTimeline({ append: true })"
      >
        {{ loadingMore ? "読み込み中..." : "さらに表示" }}
      </button>
    </div>
  </section>
</template>
