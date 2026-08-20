<script setup lang="ts">
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
const visibleMonth = ref(1);
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

function cellTextClass(cell: DateCell): string {
  if (!cell.inCurrentMonth) return "text-slate-300";
  if (cell.isToday) return "font-semibold text-primary-600";
  return weekendCellClass(cell.dayOfWeek) || "text-slate-700";
}

const monthLabel = computed(() => `${visibleYear.value}年${visibleMonth.value}月`);

const monthGrid = computed(() => generateMonthGrid(visibleYear.value, visibleMonth.value, todayIso.value, draftDate.value));

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

function decide() {
  emit("update:modelValue", draftDate.value);
  if (!props.embedded) open.value = false;
}

function cancel() {
  if (!props.embedded) open.value = false;
  emit("dismissed");
}

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

    <div v-if="open && !embedded" class="fixed inset-0 z-40" @click="cancel" />

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
        <div class="mb-2 flex items-baseline gap-2 border-b border-slate-100 px-0.5 pb-2.5">
          <span class="text-xl font-bold tabular-nums text-slate-900">{{ draftHeaderLabel }}</span>
          <span v-if="draftHeaderWeekday" class="text-xs text-slate-500">{{ draftHeaderWeekday }}</span>
        </div>

        <div class="mb-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            class="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            @click="selectToday"
          >
            今日
          </button>
        </div>

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
