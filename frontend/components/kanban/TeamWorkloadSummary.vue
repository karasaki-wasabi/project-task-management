<!--
  Team workload summary + assignee selector, merged into a single control.
  This is the single control that drives kanban/index.vue's
  `selectedAssigneeUserId` — there is no separate assignee-filter dropdown.
  This component always renders every assignee's chip regardless of which
  one is selected; it never filters itself, it just reports which chip was
  clicked. Clicking a member's chip again toggles the selection back to ""
  (closing the focus tray).

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

  The chip itself only ever changes appearance for selection state (the
  primary-ring treatment); overload is communicated solely through the
  shared `Badge` pill around the count (same idiom `PriorityBadge`/
  `StatusBadge` use elsewhere on this screen), and only turns red past
  `isOverloaded(entry.count)` (see ./TeamWorkloadSummary.helpers.ts) — never
  merely for outranking teammates in a caller-provided sort. Coloring an
  entire chip, or coloring by rank instead of an absolute threshold, both
  produce false alarms on routine team-size distributions.
-->
<script setup lang="ts">
import { isOverloaded, splitVisibleWorkload, type WorkloadCount } from "./TeamWorkloadSummary.helpers";

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
  selectedAssigneeUserId.value = selectedAssigneeUserId.value === userId ? "" : userId;
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
      v-for="entry in visibleCounts"
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
      <Badge :tone="isOverloaded(entry.count) ? 'danger' : 'neutral'" :label="String(entry.count)" />
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
        <Badge :tone="isOverloaded(entry.count) ? 'danger' : 'neutral'" :label="String(entry.count)" />
      </button>
    </div>
  </div>
</template>
