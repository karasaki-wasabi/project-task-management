<!--
  Team workload summary + assignee selector, merged (task 2.2 original +
  user feedback round 2: "担当者絞り込みの欄とチーム負荷の欄を共通化").
  This is now the single control that drives kanban/index.vue's
  `selectedAssigneeUserId` — the standalone AssigneeFilter dropdown was
  removed from the kanban page. Design.md's original "TeamWorkloadSummary
  is never filtered by the selection" still holds: this component always
  renders every assignee's chip regardless of which one is selected, it
  just also reports which chip was clicked.

  - Requirement 2.1/2.3: aggregation and descending sort order are the
    caller's responsibility (kanban/index.vue) — this component renders
    `counts` in the order it is given, it never re-sorts.
  - Requirement 2.2: each chip shows the assignee's name and count.
  - Requirement 2.4: when `counts` exceeds `maxVisible`, only the top
    entries render as chips and the rest are folded into a single "+N名"
    summary chip.
  - Requirement 2.5: the folded-away assignees remain individually
    inspectable (name + count each) via an expand toggle on the "+N名"
    chip.
  - A leading "すべて" chip is always shown (not subject to maxVisible
    truncation) and is the equivalent of AssigneeFilter's "" value.
    Clicking any chip (including "すべて") sets `v-model`.
-->
<script setup lang="ts">
import { splitVisibleWorkload, type WorkloadCount } from "./TeamWorkloadSummary.helpers";

// design.md: "既定値はコンポーネント内で定義し" — the default visible chip
// count lives here, not in the caller.
const DEFAULT_MAX_VISIBLE = 5;

interface TeamWorkloadSummaryProps {
  counts: WorkloadCount[];
  maxVisible?: number;
}

const props = withDefaults(defineProps<TeamWorkloadSummaryProps>(), {
  maxVisible: DEFAULT_MAX_VISIBLE,
});

const selectedAssigneeUserId = defineModel<string>({ default: "" });

const isRemainderExpanded = ref(false);

const split = computed(() => splitVisibleWorkload(props.counts, props.maxVisible));
const visibleCounts = computed(() => split.value.visible);
const remainderCounts = computed(() => split.value.remainder);
const hasRemainder = computed(() => remainderCounts.value.length > 0);

function toggleRemainder() {
  isRemainderExpanded.value = !isRemainderExpanded.value;
}

function selectAssignee(userId: string) {
  selectedAssigneeUserId.value = userId;
}
</script>

<template>
  <div class="workload-summary flex flex-wrap items-center gap-2 py-1">
    <span class="flex items-center gap-1.5 text-xs font-medium text-slate-500">
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
      チーム負荷
    </span>
    <button
      type="button"
      class="workload-chip workload-chip-all inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 transition"
      :class="
        selectedAssigneeUserId === ''
          ? 'bg-primary-600 text-white ring-primary-600'
          : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
      "
      @click="selectAssignee('')"
    >
      すべて
    </button>
    <button
      v-for="(entry, index) in visibleCounts"
      :key="entry.user.id"
      type="button"
      class="workload-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ring-1 transition"
      :class="[
        selectedAssigneeUserId === entry.user.id
          ? 'ring-2 ring-primary-600'
          : index === 0 && entry.count > 0
            ? 'bg-red-50 text-red-700 ring-red-200 hover:bg-red-100'
            : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
        selectedAssigneeUserId === entry.user.id && !(index === 0 && entry.count > 0) ? 'bg-primary-50 text-primary-700' : '',
        selectedAssigneeUserId === entry.user.id && index === 0 && entry.count > 0 ? 'bg-red-50 text-red-700' : '',
      ]"
      @click="selectAssignee(entry.user.id)"
    >
      <span class="font-medium">{{ entry.user.name }}</span>
      <span :class="index === 0 && entry.count > 0 ? 'text-red-500' : 'text-slate-400'">{{ entry.count }}</span>
    </button>
    <button
      v-if="hasRemainder"
      type="button"
      class="remainder-toggle inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
      @click="toggleRemainder"
    >
      +{{ remainderCounts.length }}名
    </button>
    <div v-if="hasRemainder && isRemainderExpanded" class="remainder-list flex w-full flex-wrap items-center gap-2 pl-[4.5rem]">
      <button
        v-for="entry in remainderCounts"
        :key="entry.user.id"
        type="button"
        class="workload-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ring-1 transition"
        :class="
          selectedAssigneeUserId === entry.user.id
            ? 'bg-primary-50 text-primary-700 ring-2 ring-primary-600'
            : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
        "
        @click="selectAssignee(entry.user.id)"
      >
        <span class="font-medium">{{ entry.user.name }}</span>
        <span class="text-slate-400">{{ entry.count }}</span>
      </button>
    </div>
  </div>
</template>
