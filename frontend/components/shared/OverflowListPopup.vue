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
  <Modal class="overflow-list-popup" :open="open" :ariaLabel="title" @close="emit('close')">
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
