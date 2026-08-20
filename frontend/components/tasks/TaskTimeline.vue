<script setup lang="ts">
import {
  changeMessageSegments,
  formatTimelineTime,
  groupTimelineByDate,
  timelineChipClass,
  type ChangeMessageSegment,
} from "./TaskTimeline.helpers";

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
const confirmingDeleteId = ref<string | null>(null);
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
  value: string,
): string {
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

function changeSegments(change: TaskTimelineChange): ChangeMessageSegment[] {
  return changeMessageSegments(change, actorLabel(change), fieldValueLabel);
}

const groupedItems = computed(() => groupTimelineByDate(items.value));

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
  confirmingDeleteId.value = null;
  editingCommentId.value = commentId;
}

function requestDeleteComment(commentId: string) {
  error.value = null;
  editingCommentId.value = null;
  confirmingDeleteId.value = commentId;
}

function cancelDeleteComment() {
  confirmingDeleteId.value = null;
}

function cancelEditing() {
  editingCommentId.value = null;
}

async function onEditSuccess(_comment: TaskComment) {
  editingCommentId.value = null;
  await loadTimeline();
}

async function onCreateSuccess(_comment: TaskComment) {
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
    confirmingDeleteId.value = null;
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
  <section
    aria-labelledby="task-timeline-heading"
    data-testid="task-timeline"
    class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
  >
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
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

    <div
      v-if="!readOnly"
      class="border-b border-slate-200 px-4 py-3 sm:px-5"
    >
      <CommentComposer
        :taskId="taskId"
        mode="create"
        @success="onCreateSuccess"
      />
    </div>

    <div class="space-y-4 px-4 py-4 sm:px-5">
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
        {{ filter === "comments" ? "まだコメントはありません" : "表示する項目がありません" }}
      </p>

      <div v-else class="flex flex-col">
        <section
          v-for="(group, groupIndex) in groupedItems"
          :key="group.date"
        >
          <h3
            data-testid="timeline-date-heading"
            class="text-xs font-medium text-slate-400"
            :class="groupIndex === 0 ? 'py-1.5' : 'mt-2 border-t border-slate-100 pb-1.5 pt-3.5'"
          >
            {{ group.date }}
          </h3>

          <ol>
            <li v-for="entry in group.items" :key="`${entry.type}-${entry.id}`">
              <div
                v-if="entry.type === 'comment'"
                class="flex items-start gap-2.5 py-1.5"
              >
                <UserAvatar
                  class="shrink-0"
                  :userId="entry.authorUserId"
                  :size="32"
                />
                <div
                  v-if="editingCommentId === entry.id"
                  class="min-w-0 flex-1"
                >
                  <CommentComposer
                    :taskId="taskId"
                    mode="edit"
                    :commentId="entry.id"
                    :initialBody="entry.body"
                    @success="onEditSuccess"
                    @cancel="cancelEditing"
                  />
                </div>
                <div v-else class="min-w-0 flex-1">
                  <article class="rounded-md border border-slate-200 p-2.5">
                    <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span class="text-sm font-semibold text-slate-900">{{
                          authorLabel(entry.authorUserId)
                        }}</span>
                        <span v-if="entry.editedAt" class="text-xs text-slate-400">
                          （編集済み）
                        </span>
                      </div>

                      <div
                        v-if="!readOnly && entry.authorUserId === currentUserId"
                        class="flex items-center gap-2.5"
                      >
                        <button
                          type="button"
                          aria-label="自分のコメントを編集"
                          class="text-xs font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                          @click="startEditing(entry.id)"
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          aria-label="自分のコメントを削除"
                          :disabled="deletingCommentId === entry.id"
                          class="text-xs font-medium text-red-700 hover:text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          @click="requestDeleteComment(entry.id)"
                        >
                          {{ deletingCommentId === entry.id ? "削除中..." : "削除" }}
                        </button>
                      </div>
                    </div>
                    <p class="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                      {{ entry.body }}
                    </p>
                  </article>
                  <div
                    v-if="confirmingDeleteId === entry.id"
                    data-testid="delete-comment-confirm"
                    role="alertdialog"
                    aria-label="本当に削除しますか?"
                    class="mt-2 flex flex-wrap items-center justify-end gap-2"
                  >
                    <span class="text-xs text-red-700">本当に削除しますか?</span>
                    <button
                      type="button"
                      aria-label="コメント削除を確定"
                      :disabled="deletingCommentId === entry.id"
                      class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      @click="removeComment(entry.id)"
                    >
                      {{ deletingCommentId === entry.id ? "削除中..." : "削除する" }}
                    </button>
                    <button
                      type="button"
                      aria-label="コメント削除をキャンセル"
                      :disabled="deletingCommentId === entry.id"
                      class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      @click="cancelDeleteComment"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
                <time
                  class="shrink-0 whitespace-nowrap pt-1 text-xs text-slate-400"
                  :datetime="entry.occurredAt"
                >{{ formatTimelineTime(entry.occurredAt) }}</time>
              </div>

              <div v-else class="flex items-start gap-2.5 py-2">
                <div
                  aria-hidden="true"
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-slate-400" />
                </div>
                <p class="min-w-0 flex-1 pt-1 text-sm leading-6 text-slate-600">
                  <template v-for="(segment, index) in changeSegments(entry)" :key="index">
                    <span v-if="segment.kind === 'text'">{{ segment.text }}</span>
                    <span
                      v-else
                      data-testid="timeline-value-chip"
                      :class="timelineChipClass(segment.chip.tone)"
                    >
                      {{ segment.chip.label }}
                    </span>
                  </template>
                </p>
                <time
                  class="shrink-0 whitespace-nowrap pt-1 text-xs text-slate-400"
                  :datetime="entry.occurredAt"
                >{{ formatTimelineTime(entry.occurredAt) }}</time>
              </div>
            </li>
          </ol>
        </section>
      </div>

      <div v-if="nextCursor && !loading" class="flex justify-center">
        <button
          type="button"
          aria-label="さらに読み込む"
          :disabled="loadingMore"
          class="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          @click="loadTimeline({ append: true })"
        >
          {{ loadingMore ? "読み込み中..." : "さらに読み込む" }}
        </button>
      </div>
    </div>
  </section>
</template>
