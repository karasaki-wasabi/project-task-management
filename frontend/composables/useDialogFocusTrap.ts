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
