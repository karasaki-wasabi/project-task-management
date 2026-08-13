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
  quick-select chip, a calendar day, or クリア only ever writes `draftDate`
  — the trigger button's label is bound to `modelValue`, not `draftDate`,
  so it provably cannot change until 決定. 決定 is the only path that emits
  `update:modelValue` with the draft; キャンセル/背景クリック/Esc/クリア all
  just leave `open` as-is (クリア) or flip it back to false (キャンセル etc.)
  without touching `modelValue` (draftDate is re-seeded on next open, so
  nothing needs explicit discarding).

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

  --- Post-review design-fidelity pass ---
  This component initially drifted from the claude design mockup (4a) in
  several ways the user flagged by eye: a background-boxed selected-date
  header instead of the mockup's borderless/border-bottom header, the
  `YYYY-MM-DD` wire format leaking into what should be display-only text
  (mockup uses `YYYY/MM/DD`), and calendar weekday coloring being uniform
  instead of the mockup's muted red/blue for Sun/Sat (`support.js`
  Component.weekdays/cells: `dow===0 ? "#c05a5a" : dow===6 ? "#5a7fc0" :
  "#8a97a8"`). This pass re-derives those values directly from the
  mockup's own `.dc.html`/`support.js` source (fetched via DesignSync)
  rather than approximating with default Tailwind slate/gray tokens, since
  that approximation was the actual root cause of the drift.

  Also addresses three UX requests with no mockup equivalent (the static
  mockup can't show them): (1) an open/close transition on the popover
  panel (Vue <Transition>, fade+scale), (2) クリア no longer closes the
  popover — it now only resets the draft to empty (still gated behind 決定
  like every other draft mutation, matching this file's own "only 決定
  commits" contract instead of being a bypass of it), (3) larger, filled
  前の月/次の月 buttons (28px square, mockup's #f6f8fb chip style) instead
  of unbounded-hit-area bare glyphs.
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import {
  computeTodayIso,
  formatLocalDateOnly,
  formatSlashDate,
  generateMonthGrid,
  parseLocalDateOnly,
  toDateOnlyIso,
  weekdayKanji,
  type DateCell,
} from "./DatePicker.helpers";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    ariaLabel: string;
    embedded?: boolean;
    clearLabel?: string;
  }>(),
  { embedded: false, clearLabel: "クリア" },
);
const emit = defineEmits<{
  "update:modelValue": [value: string];
  dismissed: [];
}>();

const open = ref(props.embedded);
const draftDate = ref("");
const visibleYear = ref(0);
const visibleMonth = ref(1); // 1-indexed (matches DatePicker.helpers.generateMonthGrid)
const panelRef = ref<HTMLElement | null>(null);

const todayIso = computed(() => formatLocalDateOnly(new Date()));

const triggerLabel = computed(() => (props.modelValue ? formatSlashDate(props.modelValue) : "未設定"));
const draftHeaderLabel = computed(() => (draftDate.value ? formatSlashDate(draftDate.value) : "未選択"));
const draftHeaderWeekday = computed(() => (draftDate.value ? weekdayKanji(parseLocalDateOnly(draftDate.value).getDay()) : ""));

const weekdayColumns = ["日", "月", "火", "水", "木", "金", "土"].map((label, dayOfWeek) => ({
  label,
  dayOfWeek,
  class: dayOfWeek === 0 ? "text-[#c05a5a]" : dayOfWeek === 6 ? "text-[#5a7fc0]" : "text-slate-400",
}));

function weekendCellClass(dayOfWeek: number) {
  return dayOfWeek === 0 ? "text-[#c05a5a]" : dayOfWeek === 6 ? "text-[#5a7fc0]" : "";
}

// Mirrors support.js's `cells()` precedence: out-of-month > today >
// weekend > default — selected is handled separately in the template
// since it also needs the filled background, not just a text color.
function cellTextClass(cell: DateCell): string {
  if (!cell.inCurrentMonth) return "text-slate-300";
  if (cell.isToday) return "font-semibold text-primary-600";
  return weekendCellClass(cell.dayOfWeek) || "text-slate-700";
}

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

function navigateToMonthOf(iso: string) {
  const parsed = parseLocalDateOnly(iso);
  visibleYear.value = parsed.getFullYear();
  visibleMonth.value = parsed.getMonth() + 1;
}

function seedFromModel() {
  const dateOnly = props.modelValue ? toDateOnlyIso(props.modelValue) : "";
  const base = dateOnly ? parseLocalDateOnly(dateOnly) : new Date();
  draftDate.value = dateOnly;
  visibleYear.value = base.getFullYear();
  visibleMonth.value = base.getMonth() + 1;
}

if (props.embedded) seedFromModel();

function openPicker() {
  seedFromModel();
  open.value = true;
}

function toggleOpen() {
  if (open.value) {
    cancel();
  } else {
    openPicker();
  }
}

// Requirement 10.2's quick-select chip, trimmed to 今日 only — the other
// four (明日/1週間後/月末/来月1日) were removed after the user reported they
// went unused in practice (see DatePicker.helpers.ts's computeTodayIso).
function selectToday() {
  const iso = computeTodayIso(new Date());
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
// embedded では親ピッカーが保存成否を持つので、ここではパネルを閉じない。
function decide() {
  emit("update:modelValue", draftDate.value);
  if (!props.embedded) open.value = false;
}

// Requirement 10.5: キャンセル/背景クリック/Esc discard the draft (implicit —
// draftDate is re-seeded from modelValue on the next openPicker() call) and
// close without emitting. embedded では親へ dismissed を返し、閉じる判断は親に任せる。
function cancel() {
  if (!props.embedded) open.value = false;
  emit("dismissed");
}

// Requirement 10.6: クリア resets the draft to empty without closing the
// popover or emitting — the user can still change their mind (pick a new
// day, キャンセル) before 決定 actually commits the cleared value. This
// supersedes this file's earlier "クリア is immediate/ungated" judgment
// call, which the user explicitly reported as unwanted (クリア closing the
// popover felt like it was doing more than just clearing the field).
function clear() {
  draftDate.value = "";
}
</script>

<template>
  <div class="relative inline-block">
    <button
      v-if="!embedded"
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

    <!-- Transparent full-viewport backdrop for background-click-to-cancel
         (Requirement 10.5) — same `@click.self`-on-overlay pattern as
         shared/Modal.vue, just without the visible dim layer since this is
         a popover, not a modal. v-if lives directly on this element (not a
         wrapping <template>) for the same reason as the panel below.
         embedded では親の InlineEditableField が背景クリックを持つ。 -->
    <div v-if="open && !embedded" class="fixed inset-0 z-40" @click="cancel" />

    <!-- The panel's v-if must be on the element Transition directly wraps,
         not on an ancestor <template> — Vue's enter/leave transition hooks
         only fire when Transition itself observes its slot content toggle
         between present/absent. Putting v-if higher up (as this file
         originally did) instead toggles whether the whole <Transition>
         component exists at all, which mounts/destroys it outright and
         skips the leave animation entirely (the bug the user reported: the
         panel visibly "popped" closed instead of animating out). -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95 -translate-y-1"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 -translate-y-1"
    >
      <div
        v-if="open"
        ref="panelRef"
        role="dialog"
        :aria-label="`${ariaLabel}を選択`"
        class="w-72 origin-top rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
        :class="embedded ? 'relative' : 'absolute left-0 top-full z-50 mt-1'"
        @keydown.esc="cancel"
      >
        <!-- Header: currently-selected draft date (Requirement 10.3 — this
             reflects draftDate, never modelValue directly). Borderless,
             large-text, border-bottom style per claude design mockup 4a
             (no background box — that was this file's original drift). -->
        <div class="mb-2 flex items-baseline gap-2 border-b border-slate-100 px-0.5 pb-2.5">
          <span class="text-xl font-bold tabular-nums text-slate-900">{{ draftHeaderLabel }}</span>
          <span v-if="draftHeaderWeekday" class="text-xs text-slate-500">{{ draftHeaderWeekday }}</span>
        </div>

        <!-- Quick-select (Requirement 10.2) — trimmed to 今日 only; see
             DatePicker.helpers.ts's computeTodayIso comment for why the
             other four chips were removed. -->
        <div class="mb-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            class="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            @click="selectToday"
          >
            今日
          </button>
        </div>

        <!-- Month calendar grid with prev/next navigation (Requirement 10.2).
             Nav buttons are a fixed 28px square filled chip (mockup's
             #f6f8fb background) — previously a bare glyph with only 4px of
             padding, which the user reported as too small to comfortably
             click. -->
        <div class="mb-2 flex items-center justify-between">
          <button
            type="button"
            aria-label="前の月"
            class="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            @click="prevMonth"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 6l-6 6 6 6" />
            </svg>
          </button>
          <span class="text-sm font-medium tabular-nums text-slate-900">{{ monthLabel }}</span>
          <button
            type="button"
            aria-label="次の月"
            class="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            @click="nextMonth"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <table class="w-full table-fixed text-center text-xs" role="grid">
          <thead>
            <tr>
              <th v-for="col in weekdayColumns" :key="col.label" scope="col" class="pb-1 font-normal" :class="col.class">
                {{ col.label }}
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
                  :class="cell.isSelected ? 'bg-primary-600 font-semibold text-white' : ['hover:bg-slate-100', cellTextClass(cell)]"
                  @click="selectDay(cell.date)"
                >
                  {{ Number(cell.date.slice(8, 10)) }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Footer: クリア(left) / キャンセル・決定(right) — 10.5/10.6 -->
        <div class="mt-2 flex items-start gap-2 border-t border-slate-100 pt-2">
          <div class="min-w-0 flex-1">
            <button
              type="button"
              class="max-w-full rounded-md px-2.5 py-1.5 text-left text-sm font-medium leading-5 text-slate-500 hover:bg-slate-100"
              @click="clear"
            >
              {{ props.clearLabel }}
            </button>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              class="shrink-0 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              @click="cancel"
            >
              キャンセル
            </button>
            <button
              type="button"
              class="shrink-0 whitespace-nowrap rounded-md bg-primary-600 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
              @click="decide"
            >
              決定
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
