import {
  getCurrentInstance,
  inject,
  ref,
  type AppContext,
  type InjectionKey,
  type Ref,
} from "vue";

interface InlineEditableFieldSelection {
  selectedId: Ref<symbol | null>;
}

export const inlineEditableFieldSelectionKey: InjectionKey<InlineEditableFieldSelection> =
  Symbol("inline-editable-field-selection");

const defaultSelections = new WeakMap<AppContext, InlineEditableFieldSelection>();

export function useInlineEditableFieldSelection(): InlineEditableFieldSelection {
  const provided = inject(inlineEditableFieldSelectionKey, null);
  if (provided) return provided;

  const appContext = getCurrentInstance()?.appContext;
  if (!appContext) {
    return { selectedId: ref(null) };
  }

  const existing = defaultSelections.get(appContext);
  if (existing) return existing;

  const selection = { selectedId: ref<symbol | null>(null) };
  defaultSelections.set(appContext, selection);
  appContext.provides[inlineEditableFieldSelectionKey] = selection;
  return selection;
}
