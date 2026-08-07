<!--
  Shared "他N件" overflow list popup (task 7.1, design.md "Frontend /
  shared > OverflowListPopup", Requirements 2.6, 3.6, research.md
  ビジュアルデザイン確定 / claude design `詳細ポップアップ.dc.html`).

  Common to both the daily task-marker overflow (Requirement 2.6) and the
  weekly case-lane overflow (Requirement 3.6) — the caller supplies a
  homogeneous `items` list already labeled with `kind` so this component
  stays domain-agnostic; it never fetches or knows about Task/Case shapes
  itself.

  Chrome (overlay, open/close animation, focus trap, background-click/Esc
  to close, close button) is delegated to shared/Modal.vue, same as
  TaskDetailModal/CaseDetailModal, per this repo's convention of not
  building a second overlay implementation. Modal.vue already emits one
  `close` for backdrop click, Esc, and the X button, so this component
  only needs to re-emit it.

  Row styling follows the `divide-y divide-slate-100` + `hover:bg-slate-50`
  list convention already used by pages/calendar/index.vue's day cells and
  pages/cases|recurrence|users|throughput index.vue's table rows (thin
  divider between rows, not per-row bordered cards like
  CaseDetailModal's related-task list) — the closest existing analogue to
  a plain clickable row list. The trailing "›" chevron is a static visual
  affordance (not from an icon set already in use elsewhere) indicating
  the row opens further detail, matching the claude design mockup.

  Task 7.6 (not this task) is responsible for actually wiring this
  component into calendar/index.vue and reacting to `select`/`close`.
-->
<script setup lang="ts">
export type OverflowListPopupItem = {
  id: string;
  kind: "task" | "case";
  label: string;
  meta: string;
};

defineProps<{
  open: boolean;
  title: string;
  items: OverflowListPopupItem[];
}>();

const emit = defineEmits<{
  select: [kind: "task" | "case", id: string];
  close: [];
}>();
</script>

<template>
  <Modal class="overflow-list-popup" :open="open" :aria-label="title" @close="emit('close')">
    <template #title>{{ title }}</template>

    <ul class="max-h-80 divide-y divide-slate-100 overflow-y-auto">
      <li v-for="item in items" :key="`${item.kind}-${item.id}`">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-1 py-2 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
          @click="emit('select', item.kind, item.id)"
        >
          <span class="min-w-0 flex-1 truncate text-sm text-slate-800">{{ item.label }}</span>
          <span class="shrink-0 text-xs text-slate-500">{{ item.meta }}</span>
          <span class="shrink-0 text-slate-400" aria-hidden="true">›</span>
        </button>
      </li>
    </ul>
  </Modal>
</template>
