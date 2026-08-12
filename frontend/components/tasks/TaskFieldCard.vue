<script setup lang="ts">
import { computed } from "vue";
import type {
  Case,
  DevelopmentStage,
  Task,
  User,
} from "../../composables/useApiClient";
import { isTaskClosed } from "../../composables/useTaskClosure";
import PriorityBadge from "../shared/PriorityBadge.vue";
import StageBadge from "../shared/StageBadge.vue";
import StatusBadge from "../shared/StatusBadge.vue";
import InlineEditableField from "./InlineEditableField.vue";
import ParentTaskCombobox from "./ParentTaskCombobox.vue";

interface CaseDraft {
  caseId: string | null;
  isRequiredForCase: boolean;
}

const props = withDefaults(
  defineProps<{
    task: Task;
    users: User[];
    stages: DevelopmentStage[];
    cases: Case[];
    parentTask?: Task | null;
    childTasks?: Task[];
    editable?: boolean;
    today?: string;
    onUpdate: (field: string, value: unknown) => Promise<void>;
  }>(),
  {
    parentTask: null,
    childTasks: () => [],
    editable: true,
    today: () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    },
  },
);

const stage = computed(
  () => props.stages.find((entry) => entry.id === props.task.developmentStageId) ?? null,
);
const closed = computed(() => isTaskClosed(props.task, props.stages));
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

function selectValue(event: Event): string {
  return (event.target as HTMLSelectElement).value;
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
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
    <InlineEditableField
      label="タイトル"
      :modelValue="task.title"
      :editable="editable"
      :onSave="saveHandler('title')"
    >
      <template #default="{ value }">
        <div>
          <span class="text-xs font-medium text-slate-500">タイトル</span>
          <p class="mt-0.5 text-base font-semibold text-slate-900">{{ value }}</p>
        </div>
      </template>
      <template #picker="{ draftValue, setDraftValue, save, cancel, saving }">
        <form class="space-y-2" @submit.prevent="save">
          <input
            :value="draftValue"
            aria-label="タイトルを入力"
            required
            class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            @input="setDraftValue(inputValue($event))"
          >
          <div class="flex gap-2">
            <button type="submit" :disabled="saving" class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">保存</button>
            <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700" @click="cancel">キャンセル</button>
          </div>
        </form>
      </template>
    </InlineEditableField>

    <div class="mt-4 grid gap-6 border-t border-slate-100 pt-4 md:grid-cols-2">
      <div>
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">状態</h2>
        <div class="space-y-1">
          <InlineEditableField
            v-if="!closed"
            label="ステータス"
            :modelValue="task.status"
            :editable="editable"
            :onSave="saveHandler('status')"
          >
            <template #default>
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm text-slate-600">ステータス</span>
                <StatusBadge :status="task.status" />
              </div>
            </template>
            <template #picker="{ draftValue, setDraftValue, save, cancel, saving }">
              <form class="space-y-2" @submit.prevent="save">
                <select :value="draftValue" aria-label="ステータスを選択" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" @change="setDraftValue(selectValue($event))">
                  <option value="not_started">未着手</option>
                  <option value="in_progress">作業中</option>
                  <option value="ready_for_handoff">引継待ち</option>
                  <option value="on_hold">保留</option>
                </select>
                <div class="flex gap-2">
                  <button type="submit" :disabled="saving" class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">保存</button>
                  <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm" @click="cancel">キャンセル</button>
                </div>
              </form>
            </template>
          </InlineEditableField>

          <InlineEditableField label="優先度" :modelValue="task.priority" :editable="editable" :onSave="saveHandler('priority')">
            <template #default>
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm text-slate-600">優先度</span>
                <PriorityBadge :priority="task.priority" />
              </div>
            </template>
            <template #picker="{ draftValue, setDraftValue, save, cancel, saving }">
              <form class="space-y-2" @submit.prevent="save">
                <select :value="draftValue" aria-label="優先度を選択" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" @change="setDraftValue(selectValue($event))">
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
                <div class="flex gap-2">
                  <button type="submit" :disabled="saving" class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">保存</button>
                  <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm" @click="cancel">キャンセル</button>
                </div>
              </form>
            </template>
          </InlineEditableField>

          <InlineEditableField label="開発段階" :modelValue="task.developmentStageId ?? ''" :editable="editable" :onSave="nullableSaveHandler('developmentStageId')">
            <template #default>
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm text-slate-600">開発段階</span>
                <StageBadge :kind="stage?.kind ?? null" :name="stage?.name ?? null" prefix-mode="list" />
              </div>
            </template>
            <template #picker="{ draftValue, setDraftValue, save, cancel, saving }">
              <form class="space-y-2" @submit.prevent="save">
                <select :value="draftValue" aria-label="開発段階を選択" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" @change="setDraftValue(selectValue($event))">
                  <option value="">未設定</option>
                  <option v-for="entry in stages" :key="entry.id" :value="entry.id">{{ entry.name }}</option>
                </select>
                <div class="flex gap-2">
                  <button type="submit" :disabled="saving" class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">保存</button>
                  <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm" @click="cancel">キャンセル</button>
                </div>
              </form>
            </template>
          </InlineEditableField>
        </div>
      </div>

      <div>
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">担当・日程・案件</h2>
        <div class="space-y-1">
          <InlineEditableField label="担当者" :modelValue="task.assigneeUserId ?? ''" :editable="editable" :onSave="nullableSaveHandler('assigneeUserId')">
            <template #default>
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm text-slate-600">担当者</span>
                <span class="text-sm font-medium text-slate-800">{{ assigneeName }}</span>
              </div>
            </template>
            <template #picker="{ draftValue, setDraftValue, save, cancel, saving }">
              <form class="space-y-2" @submit.prevent="save">
                <select :value="draftValue" aria-label="担当者を選択" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" @change="setDraftValue(selectValue($event))">
                  <option value="">未設定</option>
                  <option v-for="user in users" :key="user.id" :value="user.id">{{ user.name }}</option>
                </select>
                <div class="flex gap-2">
                  <button type="submit" :disabled="saving" class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">保存</button>
                  <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm" @click="cancel">キャンセル</button>
                </div>
              </form>
            </template>
          </InlineEditableField>

          <InlineEditableField label="終了予定日" :modelValue="task.scheduledEndDate ?? ''" :editable="editable" :onSave="nullableSaveHandler('scheduledEndDate')">
            <template #default>
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm text-slate-600">終了予定日</span>
                <span class="flex items-center gap-2 text-sm font-medium text-slate-800">
                  {{ formatDate(task.scheduledEndDate) }}
                  <span v-if="overdue" data-testid="overdue-badge" class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">超過</span>
                </span>
              </div>
            </template>
            <template #picker="{ draftValue, setDraftValue, save, cancel, saving }">
              <form class="space-y-2" @submit.prevent="save">
                <input type="date" :value="draftValue" aria-label="終了予定日を選択" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" @input="setDraftValue(inputValue($event))">
                <div class="flex gap-2">
                  <button type="submit" :disabled="saving" class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">保存</button>
                  <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm" @click="cancel">キャンセル</button>
                </div>
              </form>
            </template>
          </InlineEditableField>

          <div data-testid="completed-at-field" class="flex min-h-9 items-center justify-between gap-3 px-2 py-1.5">
            <span class="text-sm text-slate-600">完了日時</span>
            <span class="text-sm font-medium text-slate-800">{{ formatDate(task.completedAt) }}</span>
          </div>

          <InlineEditableField
            label="案件"
            :modelValue="{ caseId: task.caseId ?? null, isRequiredForCase: task.isRequiredForCase }"
            :editable="editable"
            :onSave="saveHandler('case')"
          >
            <template #default>
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm text-slate-600">案件</span>
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
                  <button type="submit" :disabled="saving" class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">保存</button>
                  <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm" @click="cancel">キャンセル</button>
                </div>
              </form>
            </template>
          </InlineEditableField>
        </div>
      </div>
    </div>

    <div class="mt-5 border-t border-slate-100 pt-4">
      <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">詳細</h2>
      <InlineEditableField label="詳細" :modelValue="task.detail ?? ''" :editable="editable" :onSave="nullableSaveHandler('detail')">
        <template #default>
          <p class="whitespace-pre-wrap text-sm leading-6 text-slate-700">{{ task.detail?.trim() ? task.detail : "未設定" }}</p>
        </template>
        <template #picker="{ draftValue, setDraftValue, save, cancel, saving }">
          <form class="space-y-2" @submit.prevent="save">
            <textarea :value="textValue(draftValue)" aria-label="詳細を入力" rows="5" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" @input="setDraftValue(inputValue($event))" />
            <div class="flex gap-2">
              <button type="submit" :disabled="saving" class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">保存</button>
              <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm" @click="cancel">キャンセル</button>
            </div>
          </form>
        </template>
      </InlineEditableField>
    </div>

    <div class="mt-5 border-t border-slate-100 pt-4">
      <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">親子タスク</h2>
      <InlineEditableField label="親タスク" :modelValue="task.parentTaskId ?? null" :editable="editable" :onSave="saveHandler('parentTaskId')">
        <template #default>
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm text-slate-600">親タスク</span>
            <span class="text-sm font-medium text-slate-800">{{ parentTask?.title ?? "未設定" }}</span>
          </div>
        </template>
        <template #picker="{ draftValue, setDraftValue, save, cancel, saving }">
          <form data-testid="parent-picker-form" class="space-y-3" @submit.prevent="save">
            <ParentTaskCombobox :taskId="task.id" :modelValue="typeof draftValue === 'string' ? draftValue : null" @update:modelValue="setDraftValue" />
            <div class="flex gap-2">
              <button type="submit" :disabled="saving" class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">保存</button>
              <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm" @click="cancel">キャンセル</button>
            </div>
          </form>
        </template>
      </InlineEditableField>

      <div class="px-2 py-2">
        <span class="text-sm text-slate-600">子タスク</span>
        <p v-if="childTasks.length === 0" class="mt-1 text-sm text-slate-500">未設定</p>
        <ul v-else class="mt-1 space-y-1">
          <li v-for="child in childTasks" :key="child.id" class="text-sm font-medium text-slate-800">
            {{ child.title }}
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
