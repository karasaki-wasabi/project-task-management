<script setup lang="ts">
import {
  templateOffsetLabel,
  templatePolicyLabel,
  templateStatusBadge,
} from "./index.helpers";

const api = useApiClient();
const { currentId } = useCurrentWorkspace();

const templates = ref<RecurringTaskTemplate[]>([]);
const loaded = ref(false);
const error = ref<string | null>(null);

const showCreateModal = ref(false);
const activeTemplateId = ref<string | null>(null);

async function load() {
  if (currentId.value === null) return;
  error.value = null;
  try {
    templates.value = await api.listRecurringTemplates();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loaded.value = true;
  }
}

watch(
  currentId,
  (id) => {
    if (id === null) {
      templates.value = [];
      loaded.value = false;
      error.value = null;
      showCreateModal.value = false;
      activeTemplateId.value = null;
      return;
    }
    void load();
  },
  { immediate: true },
);

function openCreateModal() {
  showCreateModal.value = true;
}

async function closeCreateModal() {
  showCreateModal.value = false;
  await load();
}

async function onTemplateCreated() {
  await load();
}

function openTemplateDetail(templateId: string) {
  activeTemplateId.value = templateId;
}

function closeTemplateDetail() {
  activeTemplateId.value = null;
}

async function onTemplateUpdated() {
  await load();
}

async function onTemplateDeleted() {
  activeTemplateId.value = null;
  await load();
}
</script>

<template>
  <div class="space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <h1 class="text-xl font-semibold tracking-tight text-slate-900">繰り返し設定</h1>
        <button
          type="button"
          class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
          @click="openCreateModal"
        >
          テンプレートを登録
        </button>
      </div>

      <ErrorAlert v-if="error" :message="error" />

      <p
        v-if="loaded && templates.length === 0"
        class="rounded-lg bg-white p-6 text-center text-sm text-slate-600 ring-1 ring-slate-200"
      >
        テンプレートがまだありません。「テンプレートを登録」から案件連動テンプレートを作成してください。
      </p>

      <div v-else class="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th class="px-3 py-2 font-medium">名前</th>
              <th class="px-3 py-2 font-medium">オフセット</th>
              <th class="px-3 py-2 font-medium">非営業日の扱い</th>
              <th class="px-3 py-2 font-medium">状態</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="template in templates"
              :key="template.id"
              :data-testid="`template-row-${template.id}`"
              tabindex="0"
              role="button"
              :aria-label="`${template.title} の詳細を開く`"
              class="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
              @click="openTemplateDetail(template.id)"
              @keydown.enter="openTemplateDetail(template.id)"
            >
              <td class="px-3 py-2 font-medium text-slate-900">{{ template.title }}</td>
              <td class="px-3 py-2 text-slate-600">{{ templateOffsetLabel(template) }}</td>
              <td class="px-3 py-2 text-slate-600">{{ templatePolicyLabel(template) }}</td>
              <td class="px-3 py-2">
                <Badge
                  :tone="templateStatusBadge(template.isActive).tone"
                  :label="templateStatusBadge(template.isActive).label"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <RecurrenceFormModal
        :open="showCreateModal"
        @close="closeCreateModal"
        @created="onTemplateCreated"
      />

      <RecurrenceDetailModal
        :template-id="activeTemplateId"
        @close="closeTemplateDetail"
        @updated="onTemplateUpdated"
        @deleted="onTemplateDeleted"
      />
  </div>
</template>
