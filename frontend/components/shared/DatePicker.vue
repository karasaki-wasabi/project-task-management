<!--
  Shared popover-style single-date picker (case-management-ux design.md
  "Frontend / shared(新規) > DatePicker", claude design mockup 4a,
  Requirement 10). Applied to CaseFormModal/CaseDetailModal's start/end
  date inputs (task 14.x — not wired here, this file is the standalone
  component only).

  `v-model` is a `YYYY-MM-DD` ISO string, empty string meaning "unset" —
  matches this app's existing "empty string = unset" convention for date
  fields (see CaseDetailModal.vue's `endDate`/`startDate` handling)
  rather than `null`, so a plain `v-model="startDate"` on a `ref<string>`
  works without extra normalization at the call site.

  Draft-vs-committed separation (10.3/10.4/10.5): opening the popover
  seeds `draftDate` from `modelValue` (or "today" if unset). Clicking a
  quick-select chip or a calendar day only ever writes `draftDate` — the
  trigger button's label is bound to `modelValue`, not `draftDate`, so it
  provably cannot change until 決定. 決定 is the only path that emits
  `update:modelValue` with the draft; キャンセル/背景クリック/Esc all just
  flip `open` back to false without touching `modelValue` (draftDate is
  re-seeded on next open, so nothing needs explicit discarding). クリア is
  the one immediate/ungated action (design.md's documented judgment call
  for this component) — it emits `""` and closes without going through
  `draftDate` at all.

  Popover, not `shared/Modal.vue`: per design.md this must not cover the
  rest of the form (Modal is a full centered overlay). Implemented as a
  `relative`-positioned trigger + `absolute`-positioned panel, with its
  own transparent full-viewport backdrop (mirroring Modal's
  `@click.self` background-close, just without Modal's visible dim
  overlay) for outside-click detection, and its own Esc handler — no
  focus-trap composable reuse, since `useDialogFocusTrap` assumes a
  modal takes over the whole page (scrolls it into view, expects to be
  the sole open dialog) which doesn't fit a form-field-attached popover.

  Month grid generation and quick-select date math are pure functions
  from `./DatePicker.helpers.ts` (task 11.1) — this component only owns
  UI state (open/draft/visible month) and wiring.
-->
<script setup lang="ts">
import { computeQuickSelectDates, formatLocalDateOnly, generateMonthGrid, parseLocalDateOnly, type QuickSelectDates } from "./DatePicker.helpers";

const props = defineProps<{ modelValue: string; ariaLabel: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const open = ref(false);
const draftDate = ref("");
const visibleYear = ref(0);
const visibleMonth = ref(1); // 1-indexed (matches DatePicker.helpers.generateMonthGrid)
const quickSelects = ref<QuickSelectDates | null>(null);
const panelRef = ref<HTMLElement | null>(null);

const todayIso = computed(() => formatLocalDateOnly(new Date()));

const triggerLabel = computed(() => props.modelValue || "未設定");
const draftHeaderLabel = computed(() => draftDate.value || "未選択");

const monthLabel = computed(() => `${visibleYear.value}年${visibleMonth.value}月`);

const monthGrid = computed(() => generateMonthGrid(visibleYear.value, visibleMonth.value, todayIso.value, draftDate.value));

// Chunk the flat (always-multiple-of-7) grid into calendar weeks for the
// template to `v-for` as table-like rows.
const weekRows = computed(() => {
  const cells = monthGrid.value;
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
});

const quickSelectChips: { key: keyof QuickSelectDates; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "tomorrow", label: "明日" },
  { key: "oneWeekLater", label: "1週間後" },
  { key: "endOfMonth", label: "月末" },
  { key: "firstOfNextMonth", label: "来月1日" },
];

function navigateToMonthOf(iso: string) {
  const parsed = parseLocalDateOnly(iso);
  visibleYear.value = parsed.getFullYear();
  visibleMonth.value = parsed.getMonth() + 1;
}

function openPicker() {
  const base = props.modelValue ? parseLocalDateOnly(props.modelValue) : new Date();
  draftDate.value = props.modelValue;
  visibleYear.value = base.getFullYear();
  visibleMonth.value = base.getMonth() + 1;
  quickSelects.value = computeQuickSelectDates(new Date());
  open.value = true;
}

function toggleOpen() {
  if (open.value) {
    cancel();
  } else {
    openPicker();
  }
}

function selectQuick(iso: string) {
  draftDate.value = iso;
  navigateToMonthOf(iso);
}

function selectDay(iso: string) {
  draftDate.value = iso;
}

function prevMonth() {
  if (visibleMonth.value === 1) {
    visibleMonth.value = 12;
    visibleYear.value -= 1;
  } else {
    visibleMonth.value -= 1;
  }
}

function nextMonth() {
  if (visibleMonth.value === 12) {
    visibleMonth.value = 1;
    visibleYear.value += 1;
  } else {
    visibleMonth.value += 1;
  }
}

// Requirement 10.4: only 決定 commits the draft to modelValue.
function decide() {
  emit("update:modelValue", draftDate.value);
  open.value = false;
}

// Requirement 10.5: キャンセル/背景クリック/Esc discard the draft (implicit —
// draftDate is re-seeded from modelValue on the next openPicker() call) and
// close without emitting.
function cancel() {
  open.value = false;
}

// Requirement 10.6: クリア is an immediate, ungated action — bypasses
// draftDate entirely (design.md judgment call, see file header).
function clear() {
  emit("update:modelValue", "");
  open.value = false;
}
</script>

<template>
  <div class="relative inline-block">
    <button
      type="button"
      class="min-w-[9rem] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-left text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
      :class="{ 'text-slate-400': !modelValue }"
      :aria-label="ariaLabel"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      {{ triggerLabel }}
    </button>

    <template v-if="open">
      <!-- Transparent full-viewport backdrop for background-click-to-cancel
           (Requirement 10.5) — same `@click.self`-on-overlay pattern as
           shared/Modal.vue, just without the visible dim layer since this
           is a popover, not a modal. -->
      <div class="fixed inset-0 z-40" @click="cancel" />

      <div
        ref="panelRef"
        role="dialog"
        :aria-label="`${ariaLabel}を選択`"
        class="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
        @keydown.esc="cancel"
      >
        <!-- Header: currently-selected draft date (Requirement 10.3 — this
             reflects draftDate, never modelValue directly). -->
        <div class="mb-2 rounded-md bg-slate-50 px-2.5 py-2 text-center text-sm font-semibold text-slate-900">
          {{ draftHeaderLabel }}
        </div>

        <!-- Quick-select chips (Requirement 10.2) -->
        <div class="mb-2 flex flex-wrap gap-1.5">
          <button
            v-for="chip in quickSelectChips"
            :key="chip.key"
            type="button"
            class="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            @click="quickSelects && selectQuick(quickSelects[chip.key])"
          >
            {{ chip.label }}
          </button>
        </div>

        <!-- Month calendar grid with prev/next navigation (Requirement 10.2) -->
        <div class="mb-2 flex items-center justify-between">
          <button
            type="button"
            aria-label="前の月"
            class="rounded-md p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            @click="prevMonth"
          >
            ‹
          </button>
          <span class="text-sm font-medium text-slate-900">{{ monthLabel }}</span>
          <button
            type="button"
            aria-label="次の月"
            class="rounded-md p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            @click="nextMonth"
          >
            ›
          </button>
        </div>

        <table class="w-full table-fixed text-center text-xs" role="grid">
          <thead>
            <tr class="text-slate-400">
              <th v-for="label in ['日', '月', '火', '水', '木', '金', '土']" :key="label" scope="col" class="pb-1 font-normal">
                {{ label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in weekRows" :key="rowIndex">
              <td v-for="cell in row" :key="cell.date" class="p-0.5">
                <button
                  type="button"
                  :aria-label="cell.date"
                  :aria-selected="cell.isSelected"
                  class="flex h-7 w-full items-center justify-center rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  :class="[
                    cell.isSelected ? 'bg-primary-600 font-semibold text-white' : 'hover:bg-slate-100',
                    !cell.isSelected && !cell.inCurrentMonth ? 'text-slate-300' : '',
                    !cell.isSelected && cell.inCurrentMonth ? 'text-slate-700' : '',
                    !cell.isSelected && cell.isToday ? 'font-semibold text-primary-600' : '',
                  ]"
                  @click="selectDay(cell.date)"
                >
                  {{ Number(cell.date.slice(8, 10)) }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Footer: クリア(left) / キャンセル・決定(right) — 10.5/10.6 -->
        <div class="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
          <button
            type="button"
            class="rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
            @click="clear"
          >
            クリア
          </button>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              @click="cancel"
            >
              キャンセル
            </button>
            <button
              type="button"
              class="rounded-md bg-primary-600 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
              @click="decide"
            >
              決定
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
