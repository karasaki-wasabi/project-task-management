<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  Case,
  DevelopmentStage,
  Task,
  User,
} from "../../composables/useApiClient";
import { isTaskClosed } from "../../composables/useTaskClosure";
import DatePicker from "../shared/DatePicker.vue";
import PriorityBadge from "../shared/PriorityBadge.vue";
import StageBadge from "../shared/StageBadge.vue";
import StatusBadge from "../shared/StatusBadge.vue";
import UserAvatar from "../shared/UserAvatar.vue";
import FieldOptionList from "./FieldOptionList.vue";
import InlineEditableField from "./InlineEditableField.vue";
import ParentTaskCombobox from "./ParentTaskCombobox.vue";

interface CaseDraft {
  caseId: string | null;
  isRequiredForCase: boolean;
}

const statusOptions = [
  { value: "not_started", label: "未着手" },
  { value: "in_progress", label: "作業中" },
  { value: "ready_for_handoff", label: "引継待ち" },
  { value: "on_hold", label: "保留" },
] as const;

const priorityOptions = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
] as const;

const props = withDefaults(
  defineProps<{
    task: Task;
    users: User[];
    stages: DevelopmentStage[];
    cases: Case[];
    workspaceId: string;
    parentTask?: Task | null;
    childTasks?: Task[];
    editable?: boolean;
    today?: string;
    currentUserId?: string;
    onUpdate: (field: string, value: unknown) => Promise<void>;
  }>(),
  {
    parentTask: null,
    childTasks: () => [],
    editable: true,
    currentUserId: "",
    today: () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    },
  },
);

const assigneeSearch = ref("");
const relatedTasksOpen = ref(false);

watch(
  () => props.task.id,
  () => {
    relatedTasksOpen.value = false;
  },
);

const stage = computed(
  () => props.stages.find((entry) => entry.id === props.task.developmentStageId) ?? null,
);
const closed = computed(() => isTaskClosed(props.task, props.stages));
const hasChildren = computed(() => props.childTasks.length > 0);
const overdue = computed(
  () =>
    !closed.value &&
    Boolean(props.task.scheduledEndDate) &&
    props.task.scheduledEndDate! < props.today,
);
const assigneeName = computed(
  () => props.users.find((user) => user.id === props.task.assigneeUserId)?.name ?? "未設定",
);
const caseName = computed(
  () => props.cases.find((entry) => entry.id === props.task.caseId)?.name ?? "未設定",
);
const stageOptions = computed(() => [
  { value: "", label: "未設定" },
  ...props.stages.map((entry) => ({ value: entry.id, label: entry.name })),
]);
const filteredAssigneeOptions = computed(() => {
  const query = assigneeSearch.value.trim();
  const users = query
    ? props.users.filter((user) => user.name.includes(query))
    : props.users;
  return users.map((user) => ({ value: user.id, label: user.name }));
});

function formatDate(value?: string | null): string {
  if (!value) return "未設定";
  const [date] = value.split("T");
  return date?.replaceAll("-", "/") ?? value;
}

function saveHandler(field: string) {
  return (value: unknown) => props.onUpdate(field, value);
}

function nullableSaveHandler(field: string) {
  return (value: unknown) =>
    props.onUpdate(field, typeof value === "string" && value.length > 0 ? value : null);
}

function storyPointsDraft(value: unknown): string {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return String(value);
  }
  if (typeof value === "string") return value;
  return "";
}

async function saveStoryPoints(value: unknown) {
  const raw = storyPointsDraft(value);
  if (raw.trim().length > 0) {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error("1以上の整数を入力してください");
    }
    await props.onUpdate("storyPoints", parsed);
    return;
  }
  await props.onUpdate("storyPoints", null);
}

function selectValue(event: Event): string {
  return (event.target as HTMLSelectElement).value;
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function onDetailKeydown(event: KeyboardEvent, save: () => Promise<void>) {
  if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
  event.preventDefault();
  void save();
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function caseDraft(value: unknown): CaseDraft {
  if (
    typeof value === "object" &&
    value !== null &&
    "caseId" in value &&
    "isRequiredForCase" in value
  ) {
    const candidate = value as Partial<CaseDraft>;
    return {
      caseId: typeof candidate.caseId === "string" ? candidate.caseId : null,
      isRequiredForCase: candidate.isRequiredForCase === true,
    };
  }
  return { caseId: null, isRequiredForCase: false };
}

function updateCaseId(
  value: unknown,
  nextCaseId: string,
  setDraftValue: (next: unknown) => void,
) {
  const current = caseDraft(value);
  setDraftValue({
    caseId: nextCaseId || null,
    isRequiredForCase: nextCaseId ? current.isRequiredForCase : false,
  } satisfies CaseDraft);
}

function userName(userId: string | null | undefined): string {
  return props.users.find((user) => user.id === userId)?.name ?? "未設定";
}

function taskHref(taskId: string): string {
  return `/workspaces/${props.workspaceId}/tasks/${taskId}`;
}

function childClosed(child: Task): boolean {
  return isTaskClosed(child, props.stages);
}

function childStageName(child: Task): string {
  return props.stages.find((entry) => entry.id === child.developmentStageId)?.name ?? "未設定";
}

function toggleRequired(value: unknown, setDraftValue: (next: unknown) => void) {
  const current = caseDraft(value);
  if (!current.caseId) return;
  setDraftValue({ ...current, isRequiredForCase: !current.isRequiredForCase });
}
</script>

<template>
  <section
    data-testid="task-field-card"
    class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
  >
    <div class="grid gap-6 md:grid-cols-2">
      <div class="space-y-1">
          <InlineEditableField
            v-if="!closed"
            label="ステータス"
            :modelValue="task.status"
            :editable="editable"
            :onSave="saveHandler('status')"
          >
            <template #default>
              <div class="flex items-center gap-3">
                <span class="w-[88px] shrink-0 text-xs font-medium text-slate-500">ステータス</span>
                <StatusBadge :status="task.status" />
              </div>
            </template>
            <template #picker="{ draftValue, saveValue }">
              <FieldOptionList
                :options="[...statusOptions]"
                :modelValue="textValue(draftValue)"
                ariaLabel="ステータスを選択"
                @select="saveValue"
              />
            </template>
          </InlineEditableField>

          <InlineEditableField label="優先度" :modelValue="task.priority" :editable="editable" :onSave="saveHandler('priority')">
            <template #default>
              <div class="flex items-center gap-3">
                <span class="w-[88px] shrink-0 text-xs font-medium text-slate-500">優先度</span>
                <PriorityBadge :priority="task.priority" />
              </div>
            </template>
            <template #picker="{ draftValue, saveValue }">
              <FieldOptionList
                :options="[...priorityOptions]"
                :modelValue="textValue(draftValue)"
                ariaLabel="優先度を選択"
                @select="saveValue"
              />
            </template>
          </InlineEditableField>

          <InlineEditableField label="開発段階" :modelValue="task.developmentStageId ?? ''" :editable="editable" :onSave="nullableSaveHandler('developmentStageId')">
            <template #default>
              <div class="flex items-center gap-3">
                <span class="w-[88px] shrink-0 text-xs font-medium text-slate-500">開発段階</span>
                <StageBadge :kind="stage?.kind ?? null" :name="stage?.name ?? null" prefix-mode="list" />
              </div>
            </template>
            <template #picker="{ draftValue, saveValue }">
              <FieldOptionList
                :options="stageOptions"
                :modelValue="textValue(draftValue)"
                ariaLabel="開発段階を選択"
                @select="saveValue"
              />
            </template>
          </InlineEditableField>

          <!-- velocity-dashboard 5.3 / mock 1h-c: leaf editable, parent readonly sum -->
          <div
            v-if="hasChildren"
            data-testid="story-points-field"
            class="flex min-h-9 items-center gap-3 px-2 py-1.5"
            title="子タスクの合計のため直接編集できません"
          >
            <span class="w-[88px] shrink-0 text-xs font-medium text-slate-500">ストーリーポイント</span>
            <span class="flex items-center gap-2 text-sm font-medium text-slate-800">
              <span data-testid="story-points-value">{{ task.storyPoints ?? "—" }}</span>
              <span
                data-testid="story-points-parent-badge"
                class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
              >
                子の合計(自動計算)
              </span>
            </span>
          </div>
          <InlineEditableField
            v-else
            label="ストーリーポイント"
            :modelValue="task.storyPoints != null ? String(task.storyPoints) : ''"
            :editable="editable"
            :onSave="saveStoryPoints"
          >
            <template #default>
              <div class="flex items-center gap-3">
                <span class="w-[88px] shrink-0 text-xs font-medium text-slate-500">ストーリーポイント</span>
                <span
                  data-testid="story-points-value"
                  class="text-sm"
                  :class="task.storyPoints != null ? 'font-medium text-slate-800' : 'text-slate-400'"
                >
                  {{ task.storyPoints ?? "—" }}
                </span>
              </div>
            </template>
            <template #picker="{ draftValue, setDraftValue, save, cancel, saving }">
              <form data-testid="story-points-picker-form" class="space-y-3" @submit.prevent="save">
                <div class="space-y-1">
                  <label class="text-xs font-medium text-slate-500" for="task-field-story-points">
                    ストーリーポイント
                  </label>
                  <input
                    id="task-field-story-points"
                    data-testid="story-points-input"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="任意"
                    :value="storyPointsDraft(draftValue)"
                    :disabled="saving"
                    class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                    @input="setDraftValue(inputValue($event))"
                  >
                  <p class="text-xs text-slate-400">1 以上の整数</p>
                </div>
                <div class="flex justify-end gap-2">
                  <button
                    type="button"
                    :disabled="saving"
                    class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    @click="cancel"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    :disabled="saving"
                    class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {{ saving ? "送信中..." : "更新" }}
                  </button>
                </div>
              </form>
            </template>
          </InlineEditableField>
      </div>

      <div class="space-y-1">
          <InlineEditableField label="担当者" :modelValue="task.assigneeUserId ?? ''" :editable="editable" :onSave="nullableSaveHandler('assigneeUserId')">
            <template #default>
              <div class="flex items-center gap-3">
                <span class="w-[88px] shrink-0 text-xs font-medium text-slate-500">担当者</span>
                <span class="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <UserAvatar
                    v-if="task.assigneeUserId"
                    :userId="task.assigneeUserId"
                    :size="24"
                  />
                  {{ assigneeName }}
                </span>
              </div>
            </template>
            <template #picker="{ draftValue, saveValue }">
              <div class="space-y-2">
                <input
                  :value="assigneeSearch"
                  type="search"
                  aria-label="担当者を検索"
                  placeholder="メンバーを検索…"
                  class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  @input="assigneeSearch = inputValue($event)"
                >
                <button
                  v-if="currentUserId"
                  type="button"
                  aria-label="担当者を自分にする"
                  class="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-primary-700 hover:bg-primary-50"
                  @click="saveValue(currentUserId)"
                >
                  担当者を自分にする
                </button>
                <FieldOptionList
                  :options="filteredAssigneeOptions"
                  :modelValue="textValue(draftValue)"
                  ariaLabel="担当者を選択"
                  @select="saveValue"
                >
                  <template #leading="{ option }">
                    <UserAvatar :userId="option.value" :size="20" />
                  </template>
                </FieldOptionList>
                <button
                  type="button"
                  class="w-full rounded-md px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
                  @click="saveValue('')"
                >
                  担当者を未設定にする
                </button>
              </div>
            </template>
          </InlineEditableField>

          <InlineEditableField
            label="終了予定日"
            surface="plain"
            :modelValue="task.scheduledEndDate ?? ''"
            :editable="editable"
            :onSave="nullableSaveHandler('scheduledEndDate')"
          >
            <template #default>
              <div class="flex items-center gap-3">
                <span class="w-[88px] shrink-0 text-xs font-medium text-slate-500">終了予定日</span>
                <span class="flex items-center gap-2 text-sm font-medium text-slate-800">
                  {{ formatDate(task.scheduledEndDate) }}
                  <span v-if="overdue" data-testid="overdue-badge" class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">超過</span>
                </span>
              </div>
            </template>
            <template #picker="{ draftValue, saveValue, cancel }">
              <DatePicker
                :modelValue="textValue(draftValue)"
                ariaLabel="終了予定日を選択"
                embedded
                @update:modelValue="saveValue"
                @dismissed="cancel"
              />
            </template>
          </InlineEditableField>

          <div data-testid="completed-at-field" class="flex min-h-9 items-center gap-3 px-2 py-1.5">
            <span class="w-[88px] shrink-0 text-xs font-medium text-slate-500">完了日時</span>
            <span
              data-testid="completed-at-value"
              class="text-sm"
              :class="task.completedAt ? 'font-medium text-slate-800' : 'text-slate-400'"
            >
              {{ task.completedAt ? formatDate(task.completedAt) : "—" }}
            </span>
          </div>

          <InlineEditableField
            label="案件"
            :modelValue="{ caseId: task.caseId ?? null, isRequiredForCase: task.isRequiredForCase }"
            :editable="editable"
            :onSave="saveHandler('case')"
          >
            <template #default>
              <div class="flex items-center gap-3">
                <span class="w-[88px] shrink-0 text-xs font-medium text-slate-500">案件</span>
                <span class="flex items-center gap-2 text-sm font-medium text-slate-800">
                  {{ caseName }}
                  <span v-if="task.caseId && task.isRequiredForCase" class="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">必須</span>
                </span>
              </div>
            </template>
            <template #picker="{ draftValue, setDraftValue, save, cancel, saving }">
              <form data-testid="case-picker-form" class="space-y-3" @submit.prevent="save">
                <select
                  :value="caseDraft(draftValue).caseId ?? ''"
                  aria-label="案件を選択"
                  class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  @change="updateCaseId(draftValue, selectValue($event), setDraftValue)"
                >
                  <option value="">未設定</option>
                  <option v-for="entry in cases" :key="entry.id" :value="entry.id">{{ entry.name }}</option>
                </select>
                <label class="flex items-center gap-2 text-sm text-slate-700">
                  <button
                    type="button"
                    role="switch"
                    aria-label="この案件の必須タスクにする"
                    :aria-checked="caseDraft(draftValue).isRequiredForCase"
                    :disabled="!caseDraft(draftValue).caseId"
                    class="relative inline-flex h-5 w-9 items-center rounded-full disabled:opacity-50"
                    :class="caseDraft(draftValue).isRequiredForCase ? 'bg-primary-600' : 'bg-slate-300'"
                    @click="toggleRequired(draftValue, setDraftValue)"
                  >
                    <span class="h-4 w-4 rounded-full bg-white transition-transform" :class="caseDraft(draftValue).isRequiredForCase ? 'translate-x-4' : 'translate-x-0.5'" />
                  </button>
                  必須タスクにする
                </label>
                <div class="flex gap-2">
                  <button type="submit" :disabled="saving" class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">更新</button>
                  <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm" @click="cancel">キャンセル</button>
                </div>
              </form>
            </template>
          </InlineEditableField>
      </div>
    </div>

    <div class="mt-5 border-t border-slate-100 pt-4">
      <InlineEditableField
        label="詳細"
        placement="inline"
        surface="plain"
        replaceDisplay
        :modelValue="task.detail ?? ''"
        :editable="editable"
        :onSave="nullableSaveHandler('detail')"
      >
        <template #default>
          <p
            data-testid="task-detail-display"
            class="whitespace-pre-wrap text-sm leading-6 text-slate-700"
          >
            {{ task.detail?.trim() ? task.detail : "未設定" }}
          </p>
        </template>
        <template #picker="{ draftValue, setDraftValue, save, cancel, saving }">
          <form class="flex flex-col gap-2" @submit.prevent="save">
            <textarea
              :value="textValue(draftValue)"
              aria-label="詳細を入力"
              placeholder="（背景・経緯を記述）"
              rows="5"
              autofocus
              :disabled="saving"
              class="w-full resize-y rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm leading-7 text-slate-700 placeholder:text-slate-400 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/35 disabled:cursor-not-allowed disabled:bg-slate-100"
              @input="setDraftValue(inputValue($event))"
              @keydown="onDetailKeydown($event, save)"
            />
            <div class="flex justify-end gap-2">
              <button
                type="button"
                :disabled="saving"
                class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                @click="cancel"
              >
                キャンセル
              </button>
              <button
                type="submit"
                :disabled="saving"
                class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {{ saving ? "送信中..." : "更新" }}
              </button>
            </div>
          </form>
        </template>
      </InlineEditableField>
    </div>

    <div class="mt-5 border-t border-slate-100 pt-4">
      <button
        type="button"
        data-testid="related-tasks-toggle"
        class="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-slate-50"
        :aria-expanded="relatedTasksOpen"
        aria-controls="related-tasks-panel"
        @click="relatedTasksOpen = !relatedTasksOpen"
      >
        <span aria-hidden="true" class="text-slate-400">{{ relatedTasksOpen ? "▾" : "▸" }}</span>
        <h2 class="text-sm font-semibold text-slate-900">親子タスク</h2>
      </button>
      <div v-if="relatedTasksOpen" id="related-tasks-panel" class="pt-2">
      <div class="grid gap-3 md:grid-cols-3">
        <InlineEditableField label="親タスク" :modelValue="task.parentTaskId ?? null" :editable="editable" :onSave="saveHandler('parentTaskId')">
          <template #default>
            <div class="flex flex-col gap-0.5">
              <span class="text-xs font-medium text-slate-500">親タスク</span>
              <NuxtLink
                v-if="parentTask"
                data-testid="parent-task-link"
                :to="taskHref(parentTask.id)"
                class="text-sm text-primary-700 hover:underline"
                @click.stop
              >
                {{ parentTask.title }}
              </NuxtLink>
              <span v-else data-testid="parent-task-value" class="text-sm text-slate-800">未設定</span>
            </div>
          </template>
          <template #picker="{ draftValue, saveValue }">
            <ParentTaskCombobox
              :taskId="task.id"
              :modelValue="typeof draftValue === 'string' ? draftValue : null"
              @update:modelValue="saveValue"
            />
          </template>
        </InlineEditableField>
      </div>

      <div class="px-2 pt-1">
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-medium text-slate-500">子タスク</span>
          <span v-if="childTasks.length > 0" data-testid="child-task-count" class="text-xs text-slate-400">{{ childTasks.length }}</span>
        </div>
        <p v-if="childTasks.length === 0" class="mt-1 text-sm text-slate-500">未設定</p>
        <ul v-else data-testid="child-task-list">
          <li
            v-for="child in childTasks"
            :key="child.id"
            class="flex items-center gap-2 border-b border-slate-100 py-1.5 last:border-b-0"
          >
            <StatusBadge v-if="!childClosed(child)" :status="child.status" />
            <span
              v-else
              class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-400"
            >
              {{ childStageName(child) }}
            </span>
            <NuxtLink
              :to="taskHref(child.id)"
              class="min-w-0 truncate text-sm hover:underline"
              :class="childClosed(child) ? 'text-slate-500' : 'text-slate-900'"
            >
              {{ child.title }}
            </NuxtLink>
            <span class="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
              <UserAvatar
                v-if="child.assigneeUserId"
                :userId="child.assigneeUserId"
                :size="24"
              />
              {{ userName(child.assigneeUserId) }}
            </span>
          </li>
        </ul>
      </div>
      </div>
    </div>
  </section>
</template>
