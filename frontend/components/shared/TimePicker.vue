<script setup lang="ts">
import {
  computeNowHHmm,
  formatDisplay12,
  formatHHmm,
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

const open = ref(false);
const draftHour12 = ref(12);
const draftMinute = ref(0);
const draftPeriod = ref<Period>("AM");
const panelRef = ref<HTMLElement | null>(null);

const hourValues = Array.from({ length: 12 }, (_, index) => index + 1); // 1-12
const minuteValues = Array.from({ length: 60 }, (_, index) => index); // 0-59

const triggerLabel = computed(() => {
  const parsed = parseHHmm(props.modelValue);
  return parsed ? formatDisplay12(parsed.hour24, parsed.minute) : "未設定";
});

const draftHeaderLabel = computed(() => {
  const { hour24, minute } = to24Hour(draftHour12.value, draftMinute.value, draftPeriod.value);
  return formatDisplay12(hour24, minute);
});

function seedDraftFrom(hhmm: string) {
  const parsed = parseHHmm(hhmm) ?? parseHHmm(computeNowHHmm(new Date()));
  const { hour24, minute } = parsed!;
  const { hour12, period } = to12Hour(hour24, minute);
  draftHour12.value = hour12;
  draftMinute.value = minute;
  draftPeriod.value = period;
}

function openPicker() {
  seedDraftFrom(props.modelValue);
  open.value = true;
}

function toggleOpen() {
  if (open.value) {
    cancel();
  } else {
    openPicker();
  }
}

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

// "現在時刻" shortcut: jumps the draft to now (still gated behind 決定, like
// every other draft mutation here).
function selectNow() {
  seedDraftFrom(computeNowHHmm(new Date()));
}

function decide() {
  const { hour24, minute } = to24Hour(draftHour12.value, draftMinute.value, draftPeriod.value);
  emit("update:modelValue", formatHHmm(hour24, minute));
  open.value = false;
}

function cancel() {
  open.value = false;
}
</script>

<template>
  <div class="relative inline-block">
    <button
      type="button"
      class="min-w-[7rem] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-left text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
      :class="{ 'text-slate-400': !modelValue }"
      :aria-label="ariaLabel"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      {{ triggerLabel }}
    </button>

    <div v-if="open" class="fixed inset-0 z-40" @click="cancel" />

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
        class="absolute left-0 top-full z-50 mt-1 w-64 origin-top rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
        @keydown.esc="cancel"
      >
        <div class="mb-2 border-b border-slate-100 px-0.5 pb-2.5 text-base font-bold tabular-nums text-slate-900">
          {{ draftHeaderLabel }}
        </div>

        <div class="mb-2 flex items-stretch justify-center gap-2">
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

        <div class="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
          <button
            type="button"
            class="rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
            @click="selectNow"
          >
            現在時刻
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
    </Transition>
  </div>
</template>
