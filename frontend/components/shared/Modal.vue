<!--
  Shared modal dialog shell (extracted from TaskDetailModal — the first
  popup this app grew, and expected to be reused for future popups per
  user feedback). Owns the parts every popup needs: a fixed, centered
  overlay with backdrop, an animated open/close transition, a top-right
  close (X) button, real dialog focus-trap semantics, and a three-part
  layout (title / content / actions) via slots — callers only bring
  domain-specific content.

  `open` drives visibility via `v-if` inside a single `<Transition>`, so
  callers don't need to manage their own enter/leave animation. The
  backdrop and the panel fade+scale together under one transition name
  (`modal`) — see main.css `.modal-enter-*`/`.modal-leave-*` — nested
  selectors target `.modal-panel` for its own transform, avoiding a second
  nested `<Transition>` for one shared open/close timeline.

  Clicking the backdrop itself (`@click.self`) or pressing Esc closes the
  dialog, same as the close button — callers only get one `close` event,
  they don't need to distinguish how it happened.

  Slots: `#title` (header text/content next to the close button), default
  (body content), `#actions` (footer button row, only rendered if the
  caller provides it).
-->
<script setup lang="ts">
const props = defineProps<{ open: boolean; ariaLabel: string }>();
const emit = defineEmits<{ close: [] }>();

const dialogRef = ref<HTMLElement | null>(null);
useDialogFocusTrap(
  dialogRef,
  computed(() => props.open),
);
</script>

<template>
  <Transition name="modal">
    <div
      v-if="open"
      class="modal-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-16"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <div
        ref="dialogRef"
        class="modal-panel w-full max-w-xl rounded-lg bg-white p-4 shadow-xl ring-1 ring-slate-200"
        role="dialog"
        aria-modal="true"
        :aria-label="ariaLabel"
      >
        <div class="mb-3 flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1 text-base font-semibold text-slate-900">
            <slot name="title" />
          </div>
          <button
            type="button"
            class="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            aria-label="閉じる"
            @click="emit('close')"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6 6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="space-y-3">
          <slot />
        </div>

        <div v-if="$slots.actions" class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </Transition>
</template>
