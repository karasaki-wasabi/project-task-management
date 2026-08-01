// Impeccable critique P0 ("no non-mouse path... picker has no aria-modal,
// no focus trap, doesn't receive programmatic focus on open"): shared by
// every dialog-like overlay on the kanban page (the assignee picker, the
// keyboard-triggered task action menu) so Tab stays inside the open dialog,
// initial focus lands on its first control, and closing it returns focus to
// whatever opened it. DOM-dependent (focus/querySelector), so it's covered
// by e2e (frontend/e2e/kanban.spec.ts's keyboard-path coverage) rather than
// vitest — this repo has no jsdom/DOM test environment (see vitest.config.ts).
import type { Ref } from "vue";

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useDialogFocusTrap(dialogRef: Ref<HTMLElement | null | undefined>, isOpen: Ref<boolean>) {
  let previouslyFocused: HTMLElement | null = null;

  function focusableElements(): HTMLElement[] {
    if (!dialogRef.value) return [];
    return Array.from(dialogRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => !el.hasAttribute("disabled"));
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== "Tab") return;
    const els = focusableElements();
    const first = els[0];
    const last = els[els.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  watch(isOpen, async (open) => {
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      await nextTick();
      // Impeccable critique minor observation: the dialog always renders at
      // a fixed spot in page flow, disconnected from wherever on the
      // horizontally-scrolling board a drag/keyboard-activate actually
      // happened. An explicit smooth scroll-into-view (on top of the native
      // scroll `.focus()` already triggers) makes that jump legible instead
      // of the dialog just appearing to "pop in" off to one side.
      dialogRef.value?.scrollIntoView({ behavior: "smooth", block: "center" });
      focusableElements()[0]?.focus();
      document.addEventListener("keydown", handleKeydown);
    } else {
      document.removeEventListener("keydown", handleKeydown);
      previouslyFocused?.focus();
      previouslyFocused = null;
    }
  });
}
