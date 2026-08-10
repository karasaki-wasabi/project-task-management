<!--
  Recurring templates index page (task 7.3, design.md RecurrencePage,
  Requirements 1.3, 7.1, 7.2, 8.1–8.3). Template-only list with Modal
  create/detail — holidays UI and fixed_interval controls removed.
  Visual language follows cases/kanban (primary CTA, ring-1 table, row click).

  Explicit Vue / useApiClient / Modal imports so vitest can mount without
  Nuxt auto-import runtime (same approach as pages/holidays/index.vue).
-->
<script setup lang="ts">
import { ref, watch } from "vue";
import {
  useApiClient,
  type RecurringTaskTemplate,
} from "../../composables/useApiClient";
import { useCurrentWorkspace } from "../../composables/useCurrentWorkspace";
import RecurrenceFormModal from "../../components/recurrence/RecurrenceFormModal.vue";
import RecurrenceDetailModal from "../../components/recurrence/RecurrenceDetailModal.vue";
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
    <div
      v-if="currentId === null"
      data-testid="workspace-empty-state"
      class="rounded-lg bg-white p-8 text-center ring-1 ring-slate-200"
    >
      <h1 class="text-xl font-semibold tracking-tight text-slate-900">ワークスペースがありません</h1>
      <p class="mt-2 text-sm text-slate-600">
        最初のワークスペースを作成すると、メンバーを追加して共有の可視境界を持てます。
      </p>
      <NuxtLink
        to="/workspaces"
        class="mt-5 inline-block rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
      >
        ワークスペースを作成
      </NuxtLink>
    </div>

    <template v-else>
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
    </template>
  </div>
</template>
