<!--
  Shared popover-style time wheel picker (case-management-ux design.md
  "Frontend / shared > TimePicker / DateTimePicker(適用先画面なし)", claude
  design mockup 4c). Task 12.1 — standalone component, no consuming screen
  in this spec (design.md Non-Goals: "TimePicker/DateTimePickerの既存画面へ
  の適用...は将来の別スペックの対象").

  `v-model` is an `HH:mm` 24-hour string, empty string meaning "unset" —
  same wire-format convention as DatePicker's `YYYY-MM-DD`. The wheel UI
  itself is 12-hour + AM/PM (per the 4c mockup), so the 12h<->24h
  conversion happens at the boundary in ./TimePicker.helpers.ts; the
  trigger button's display and the popover header both use the same
  `formatDisplay12` helper, so they can never disagree about what the
  underlying 24-hour value looks like.

  Draft-vs-committed separation — same contract as DatePicker.vue (design.md:
  "いずれも決定/キャンセル/背景クリックの挙動はDatePickerと同じ規約に従う"):
  opening the popover seeds draftHour12/draftMinute/draftPeriod from
  modelValue (or "now" if unset). Wheel clicks/scrolls and the AM/PM toggle
  only ever write those draft refs — the trigger label is bound to
  modelValue, not the draft, so it provably cannot change until 決定. 決定 is
  the only path that emits `update:modelValue`; キャンセル/背景クリック/Esc
  just close without touching modelValue (the draft is re-seeded on next
  open, so nothing needs explicit discarding). Unlike DatePicker there is no
  クリア button — design.md's TimePicker responsibilities list only
  "現在時刻ショートカットと「キャンセル/決定」" for the footer, no clear
  affordance, so none is added here (this task's brief and design.md agree).

  "Infinite scroll" approximation (design.md: "時・分の2ホイール(相互に無限ス
  クロール、12↔1で循環)"): true virtualized infinite scroll is over-
  engineering for a component with no consuming screen yet. Instead each
  wheel is a plain scrollable list of its full value range (1-12 / 0-59)
  that responds to mouse-wheel ticks via a `@wheel` handler calling the
  circular `wrapHour12`/`wrapMinute` helpers (TimePicker.helpers.ts) — so
  scrolling down past 12 wraps to 1 and vice versa, satisfying "feels like
  you can scroll past the boundary" without rendering a repeated/duplicated
  list or tracking scroll position math. Clicking any value in the list
  also jumps straight to it (an unambiguous, cheap-to-implement affordance
  the mockup's static image can't fully specify either way).

  Popover shell (trigger button, transparent full-viewport backdrop for
  outside-click, own Esc handler, no focus-trap composable reuse) mirrors
  DatePicker.vue's — see that file's header comment for the rationale,
  which applies unchanged here.
-->
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

// Trigger label reflects modelValue only, never the draft (see file header).
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

// AM/PM is a 2-value toggle column (design.md), not a wheel — clicking
// either option should just select it (togglePeriod only needs to fire when
// the other option is clicked, which is exactly "not already selected").
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

// Only 決定 commits the draft to modelValue (matches DatePicker's 10.4).
function decide() {
  const { hour24, minute } = to24Hour(draftHour12.value, draftMinute.value, draftPeriod.value);
  emit("update:modelValue", formatHHmm(hour24, minute));
  open.value = false;
}

// キャンセル/背景クリック/Esc discard the draft (implicit — re-seeded from
// modelValue on the next openPicker() call) and close without emitting
// (matches DatePicker's 10.5).
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

    <!-- Transparent full-viewport backdrop for background-click-to-cancel,
         same pattern as DatePicker.vue. v-if is directly on this element
         (not a wrapping <template>) — see the comment above the panel's
         <Transition> below for why. -->
    <div v-if="open" class="fixed inset-0 z-40" @click="cancel" />

    <!-- v-if must sit on the element Transition directly wraps, not on an
         ancestor <template> that also toggles Transition's own existence —
         otherwise Vue skips the leave animation entirely (see
         DatePicker.vue's identical comment for the full explanation). -->
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
        <!-- Header: currently-selected draft time (reflects the draft, never
             modelValue directly). Borderless border-bottom style, matching
             DatePicker.vue's post-review fix for design-mockup fidelity
             (claude design 4c uses the same header treatment as 4a). -->
        <div class="mb-2 border-b border-slate-100 px-0.5 pb-2.5 text-base font-bold tabular-nums text-slate-900">
          {{ draftHeaderLabel }}
        </div>

        <!-- Hour / minute wheels + AM/PM toggle column. -->
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

        <!-- Footer: 現在時刻(left) / キャンセル・決定(right). No クリア —
             design.md's TimePicker footer is 現在時刻+キャンセル/決定 only. -->
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
