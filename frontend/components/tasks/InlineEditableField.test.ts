import { describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import InlineEditableField from "./InlineEditableField.vue";

interface PickerSlotProps {
  draftValue: unknown;
  setDraftValue: (value: unknown) => void;
  save: () => Promise<void>;
  cancel: () => void;
  saving: boolean;
}

function mountField(options: {
  editable?: boolean;
  modelValue?: string;
  onSave?: (value: unknown) => Promise<void>;
} = {}) {
  return mount(InlineEditableField, {
    props: {
      label: "優先度",
      modelValue: options.modelValue ?? "中",
      editable: options.editable ?? true,
      onSave: options.onSave ?? vi.fn().mockResolvedValue(undefined),
    },
    slots: {
      default: ({ value }: { value: unknown }) =>
        h("span", { "data-testid": "display-value" }, String(value)),
      picker: ({ draftValue, setDraftValue, save, cancel, saving }: PickerSlotProps) =>
        h(
          "form",
          {
            "data-testid": "picker",
            onSubmit: (event: Event) => {
              event.preventDefault();
              void save();
            },
          },
          [
            h("input", {
              "aria-label": "優先度を選択",
              value: String(draftValue),
              onInput: (event: Event) =>
                setDraftValue((event.target as HTMLInputElement).value),
            }),
            h("button", { type: "submit", disabled: saving }, "保存"),
            h("button", { type: "button", onClick: cancel }, "キャンセル"),
          ],
        ),
    },
  });
}

describe("InlineEditableField", () => {
  it("デスクトップではホバー時に編集ボタンを表示し、押すとピッカーを開く", async () => {
    const wrapper = mountField();
    const row = wrapper.get('[data-testid="inline-editable-row"]');
    const editButton = wrapper.get('button[aria-label="優先度を編集"]');

    expect(editButton.attributes("aria-hidden")).toBe("true");
    expect(editButton.classes()).toContain("opacity-0");

    await row.trigger("mouseenter");

    expect(editButton.attributes("aria-hidden")).toBeUndefined();
    expect(editButton.classes()).toContain("opacity-100");

    await editButton.trigger("click");

    expect(wrapper.find('[data-testid="picker"]').exists()).toBe(true);
  });

  it("タッチ操作では行選択だけでは開かず、表示された編集ボタンでピッカーを開く", async () => {
    const wrapper = mountField();
    const row = wrapper.get('[data-testid="inline-editable-row"]');

    await row.trigger("click");

    expect(wrapper.find('[data-testid="picker"]').exists()).toBe(false);
    expect(wrapper.get('button[aria-label="優先度を編集"]').classes()).toContain("opacity-100");

    await wrapper.get('button[aria-label="優先度を編集"]').trigger("click");

    expect(wrapper.find('[data-testid="picker"]').exists()).toBe(true);
  });

  it("別の行を選択すると、それまで選択されていた兄弟行の編集ボタンを隠す", async () => {
    const Host = defineComponent({
      render() {
        const makeField = (label: string) =>
          h(
            InlineEditableField,
            {
              label,
              modelValue: `${label}の値`,
              onSave: vi.fn().mockResolvedValue(undefined),
            },
            {
              default: ({ value }: { value: unknown }) => String(value),
            },
          );
        return h("div", [makeField("優先度"), makeField("担当者")]);
      },
    });
    const wrapper = mount(Host);
    const rows = wrapper.findAll('[data-testid="inline-editable-row"]');
    const buttons = wrapper.findAll("button");

    await rows[0]!.trigger("click");
    expect(buttons[0]!.classes()).toContain("opacity-100");
    expect(buttons[1]!.classes()).toContain("opacity-0");

    await rows[1]!.trigger("click");
    expect(buttons[0]!.classes()).toContain("opacity-0");
    expect(buttons[1]!.classes()).toContain("opacity-100");
  });

  it("editable=false では編集操作を提示しない", async () => {
    const wrapper = mountField({ editable: false });

    await wrapper.get('[data-testid="inline-editable-row"]').trigger("click");

    expect(wrapper.find('button[aria-label="優先度を編集"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="picker"]').exists()).toBe(false);
  });

  it("保存成功時は変更値を渡してピッカーを閉じる", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountField({ onSave });

    await wrapper.get('[data-testid="inline-editable-row"]').trigger("click");
    await wrapper.get('button[aria-label="優先度を編集"]').trigger("click");
    await wrapper.get('input[aria-label="優先度を選択"]').setValue("高");
    await wrapper.get('[data-testid="picker"]').trigger("submit");
    await flushPromises();

    expect(onSave).toHaveBeenCalledWith("高");
    expect(wrapper.find('[data-testid="picker"]').exists()).toBe(false);
  });

  it("保存失敗時はエラーを表示して編集値を保存前の値へ戻す", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("更新できませんでした"));
    const wrapper = mountField({ modelValue: "中", onSave });

    await wrapper.get('[data-testid="inline-editable-row"]').trigger("click");
    await wrapper.get('button[aria-label="優先度を編集"]').trigger("click");
    await wrapper.get('input[aria-label="優先度を選択"]').setValue("高");
    await wrapper.get('[data-testid="picker"]').trigger("submit");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("更新できませんでした");
    expect(wrapper.get('input[aria-label="優先度を選択"]').element).toHaveProperty("value", "中");
    expect(wrapper.find('[data-testid="picker"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="display-value"]').text()).toBe("中");
  });
});
