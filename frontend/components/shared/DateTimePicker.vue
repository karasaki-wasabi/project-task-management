<!--
  Shared popover-style date+time picker (case-management-ux design.md
  "Frontend / shared > TimePicker / DateTimePicker(適用先画面なし)", claude
  design mockups 4d=日付タブ/4e=時刻タブ). Task 12.2 — standalone component,
  no consuming screen in this spec (design.md Non-Goals: "TimePicker/
  DateTimePickerの既存画面への適用...は将来の別スペックの対象").

  `v-model` is a full ISO 8601 datetime string (`YYYY-MM-DDTHH:mm`, e.g.
  "2026-09-14T13:30"), empty string meaning "unset" — same convention as
  DatePicker/TimePicker. Joining/splitting this combined wire format from/to
  DatePicker's `YYYY-MM-DD` and TimePicker's `HH:mm` parts is the one piece
  of genuinely new logic this task needed, extracted into
  ./DateTimePicker.helpers.ts (combineDateTime/splitDateTime) and unit
  tested there.

  No calendar-grid or wheel math is reimplemented here (design.md: "内部実装
  はDatePicker/TimePickerのロジックを流用し、二重実装を避ける") — the 日付 tab
  imports generateMonthGrid/computeQuickSelectDates/parseLocalDateOnly/
  formatLocalDateOnly straight from ./DatePicker.helpers, and the 時刻 tab
  imports to12Hour/to24Hour/wrapHour12/wrapMinute/togglePeriod/
  computeNowHHmm/formatDisplay12 straight from ./TimePicker.helpers. This
  component's own template re-renders the calendar table / wheel lists
  markup (rather than mounting <DatePicker>/<TimePicker> as child
  components), because those components each own their own trigger button +
  popover shell + draft/decide/cancel state machine, which would conflict
  with DateTimePicker owning a single shared draft and a single combined
  decide/cancel here; only the pure math is shared, per design.md's
  wording ("ロジックを流用").

  Key UX difference from composing two separate pickers (design.md: "上部の
  大きな表示で日付・時刻の両方を常に確認できる"): the popover header always
  renders BOTH the draft date and draft time together, regardless of which
  tab (日付/時刻) is currently active — see `draftHeaderLabel` below, which
  is independent of `activeTab`.

  Draft-vs-committed separation — same contract as DatePicker.vue/
  TimePicker.vue (design.md: "いずれも決定/キャンセル/背景クリックの挙動は
  DatePickerと同じ規約に従う"): opening the popover seeds `draftDate`/
  `draftHour12`/`draftMinute`/`draftPeriod` from `modelValue` (falling back
  to "today"/"now" per-part if modelValue is unset or only partially
  parseable). Tab switching, calendar day clicks, and wheel
  clicks/scrolls only ever write those draft refs — the trigger button's
  label is bound to `modelValue`, never the draft. 決定 is the only path
  that emits `update:modelValue`, and it always combines BOTH the draft
  date and draft time into a single ISO datetime string via
  combineDateTime, even if the user only ever touched one of the two tabs
  before deciding. キャンセル/背景クリック/Esc discard the draft (implicit —
  re-seeded on next open) and close without emitting. There is no クリア
  button, matching TimePicker.vue's footer (design.md only documents
  クリア for DatePicker).

  Popover shell (trigger button, transparent full-viewport backdrop for
  outside-click, own Esc handler, no focus-trap composable reuse) mirrors
  DatePicker.vue's/TimePicker.vue's — see DatePicker.vue's header comment
  for the rationale, which applies unchanged here.
-->
<script setup lang="ts">
import { computeQuickSelectDates, formatLocalDateOnly, generateMonthGrid, parseLocalDateOnly, type QuickSelectDates } from "./DatePicker.helpers";
import { combineDateTime, splitDateTime } from "./DateTimePicker.helpers";
import {
  computeNowHHmm,
  formatDisplay12,
  parseHHmm,
  to12Hour,
  to24Hour,
  togglePeriod,
  wrapHour12,
  wrapMinute,
  type Period,
} from "./TimePicker.helpers";

const props = defineProps<{ modelValue: string; ariaLabel: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

type Tab = "date" | "time";

const open = ref(false);
const activeTab = ref<Tab>("date");

// Date-tab draft state (mirrors DatePicker.vue).
const draftDate = ref("");
const visibleYear = ref(0);
const visibleMonth = ref(1); // 1-indexed (matches DatePicker.helpers.generateMonthGrid)
const quickSelects = ref<QuickSelectDates | null>(null);

// Time-tab draft state (mirrors TimePicker.vue).
const draftHour12 = ref(12);
const draftMinute = ref(0);
const draftPeriod = ref<Period>("AM");

const panelRef = ref<HTMLElement | null>(null);

const hourValues = Array.from({ length: 12 }, (_, index) => index + 1); // 1-12
const minuteValues = Array.from({ length: 60 }, (_, index) => index); // 0-59

const todayIso = computed(() => formatLocalDateOnly(new Date()));

// Trigger label reflects modelValue only, never the draft (see file header).
const triggerLabel = computed(() => {
  if (!props.modelValue) return "未設定";
  const { dateOnly, hhmm } = splitDateTime(props.modelValue);
  const timeParts = parseHHmm(hhmm);
  const timeLabel = timeParts ? formatDisplay12(timeParts.hour24, timeParts.minute) : "";
  return timeLabel ? `${dateOnly} ${timeLabel}` : dateOnly;
});

// Header: currently-selected draft date AND draft time together, regardless
// of which tab is active (design.md: "上部の大きな表示で日付・時刻の両方を常に
// 確認できる" — this is what makes the header independent of activeTab).
const draftDateLabel = computed(() => draftDate.value || "未選択");
const draftTimeLabel = computed(() => {
  const { hour24, minute } = to24Hour(draftHour12.value, draftMinute.value, draftPeriod.value);
  return formatDisplay12(hour24, minute);
});
const draftHeaderLabel = computed(() => `${draftDateLabel.value} ${draftTimeLabel.value}`);

const monthLabel = computed(() => `${visibleYear.value}年${visibleMonth.value}月`);

const monthGrid = computed(() => generateMonthGrid(visibleYear.value, visibleMonth.value, todayIso.value, draftDate.value));

// Chunk the flat (always-multiple-of-7) grid into calendar weeks, same as
// DatePicker.vue.
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

// Seeds the date-tab draft from a `YYYY-MM-DD` string, falling back to
// today when unset — same fallback DatePicker.vue's openPicker() uses.
function seedDateDraftFrom(dateOnly: string) {
  const base = dateOnly ? parseLocalDateOnly(dateOnly) : new Date();
  draftDate.value = dateOnly;
  visibleYear.value = base.getFullYear();
  visibleMonth.value = base.getMonth() + 1;
}

// Seeds the time-tab draft from an `HH:mm` string, falling back to now when
// unset/unparseable — same fallback TimePicker.vue's seedDraftFrom() uses.
function seedTimeDraftFrom(hhmm: string) {
  const parsed = parseHHmm(hhmm) ?? parseHHmm(computeNowHHmm(new Date()));
  const { hour24, minute } = parsed!;
  const { hour12, period } = to12Hour(hour24, minute);
  draftHour12.value = hour12;
  draftMinute.value = minute;
  draftPeriod.value = period;
}

function openPicker() {
  const { dateOnly, hhmm } = splitDateTime(props.modelValue);
  seedDateDraftFrom(dateOnly);
  seedTimeDraftFrom(hhmm);
  quickSelects.value = computeQuickSelectDates(new Date());
  activeTab.value = "date";
  open.value = true;
}

function toggleOpen() {
  if (open.value) {
    cancel();
  } else {
    openPicker();
  }
}

function selectTab(tab: Tab) {
  activeTab.value = tab;
}

// -- 日付タブ operations (mirror DatePicker.vue) --

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

// -- 時刻タブ operations (mirror TimePicker.vue) --

function selectHour(hour12: number) {
  draftHour12.value = hour12;
}

function selectMinute(minute: number) {
  draftMinute.value = minute;
}

function scrollHour(event: WheelEvent) {
  event.preventDefault();
  draftHour12.value = wrapHour12(draftHour12.value, event.deltaY > 0 ? 1 : -1);
}

function scrollMinute(event: WheelEvent) {
  event.preventDefault();
  draftMinute.value = wrapMinute(draftMinute.value, event.deltaY > 0 ? 1 : -1);
}

function selectPeriod(period: Period) {
  if (draftPeriod.value !== period) {
    draftPeriod.value = togglePeriod(draftPeriod.value);
  }
}

// "現在時刻" shortcut: jumps the time draft to now (still gated behind 決定).
function selectNow() {
  seedTimeDraftFrom(computeNowHHmm(new Date()));
}

// Only 決定 commits the draft to modelValue — combines BOTH the date and
// time drafts into a single ISO datetime string, regardless of which tab
// was active when 決定 was pressed (matches DatePicker's/TimePicker's own
// "only 決定 commits" contract, generalized to two draft parts).
function decide() {
  const { hour24, minute } = to24Hour(draftHour12.value, draftMinute.value, draftPeriod.value);
  const hhmm = `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  emit("update:modelValue", combineDateTime(draftDate.value, hhmm));
  open.value = false;
}

// キャンセル/背景クリック/Esc discard the draft (implicit — re-seeded from
// modelValue on the next openPicker() call) and close without emitting.
function cancel() {
  open.value = false;
}
</script>

<template>
  <div class="relative inline-block">
    <button
      type="button"
      class="min-w-[12rem] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-left text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
      :class="{ 'text-slate-400': !modelValue }"
      :aria-label="ariaLabel"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      {{ triggerLabel }}
    </button>

    <template v-if="open">
      <!-- Transparent full-viewport backdrop for background-click-to-cancel,
           same pattern as DatePicker.vue/TimePicker.vue. -->
      <div class="fixed inset-0 z-40" @click="cancel" />

      <div
        ref="panelRef"
        role="dialog"
        :aria-label="`${ariaLabel}を選択`"
        class="absolute left-0 top-full z-50 mt-1 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
        @keydown.esc="cancel"
      >
        <!-- Header: always shows BOTH the draft date and draft time
             together, independent of activeTab (design.md's key
             requirement for this component). -->
        <div class="mb-2 rounded-md bg-slate-50 px-2.5 py-2 text-center text-sm font-semibold text-slate-900">
          {{ draftHeaderLabel }}
        </div>

        <!-- Tab switcher: 日付 / 時刻 (claude design 4d/4e). -->
        <div class="mb-2 flex rounded-md border border-slate-200 bg-slate-50 p-0.5" role="tablist">
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'date'"
            class="flex-1 rounded px-2.5 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            :class="activeTab === 'date' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            @click="selectTab('date')"
          >
            日付
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'time'"
            class="flex-1 rounded px-2.5 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            :class="activeTab === 'time' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            @click="selectTab('time')"
          >
            時刻
          </button>
        </div>

        <!-- 日付タブ: same calendar UI as DatePicker.vue, driven by the same
             DatePicker.helpers.ts pure functions. -->
        <div v-if="activeTab === 'date'">
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
        </div>

        <!-- 時刻タブ: same wheel UI as TimePicker.vue, driven by the same
             TimePicker.helpers.ts pure functions. -->
        <div v-else class="flex items-stretch justify-center gap-2">
          <div
            class="h-36 w-14 overflow-y-auto rounded-md border border-slate-200"
            role="listbox"
            aria-label="時"
            @wheel="scrollHour"
          >
            <button
              v-for="hour in hourValues"
              :key="hour"
              type="button"
              role="option"
              :aria-selected="hour === draftHour12"
              class="flex h-9 w-full items-center justify-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              :class="hour === draftHour12 ? 'bg-primary-600 font-semibold text-white' : 'text-slate-700 hover:bg-slate-100'"
              @click="selectHour(hour)"
            >
              {{ hour }}
            </button>
          </div>

          <div class="flex items-center text-sm font-semibold text-slate-400">:</div>

          <div
            class="h-36 w-14 overflow-y-auto rounded-md border border-slate-200"
            role="listbox"
            aria-label="分"
            @wheel="scrollMinute"
          >
            <button
              v-for="minute in minuteValues"
              :key="minute"
              type="button"
              role="option"
              :aria-selected="minute === draftMinute"
              class="flex h-9 w-full items-center justify-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              :class="minute === draftMinute ? 'bg-primary-600 font-semibold text-white' : 'text-slate-700 hover:bg-slate-100'"
              @click="selectMinute(minute)"
            >
              {{ String(minute).padStart(2, "0") }}
            </button>
          </div>

          <div class="flex w-12 flex-col justify-center gap-1" role="group" aria-label="午前/午後">
            <button
              v-for="periodOption in (['AM', 'PM'] as const)"
              :key="periodOption"
              type="button"
              :aria-pressed="draftPeriod === periodOption"
              class="rounded-md py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              :class="draftPeriod === periodOption ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
              @click="selectPeriod(periodOption)"
            >
              {{ periodOption }}
            </button>
          </div>
        </div>

        <!-- Footer: 現在時刻(left, time-tab shortcut) / キャンセル・決定(right).
             決定 always commits both draft date and draft time together. -->
        <div class="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
          <button
            v-if="activeTab === 'time'"
            type="button"
            class="rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
            @click="selectNow"
          >
            現在時刻
          </button>
          <span v-else />
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
