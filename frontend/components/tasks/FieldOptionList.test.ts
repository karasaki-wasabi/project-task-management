// user-avatar 2.2 — FieldOptionList の #leading スロット（Requirement 2.1）。
import { describe, expect, it } from "vitest";
import { h } from "vue";
import { mount } from "@vue/test-utils";
import type { ComponentMountingOptions } from "@vue/test-utils";
import FieldOptionList from "./FieldOptionList.vue";

const OPTIONS = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
] as const;

function mountList(options: {
  modelValue?: string;
  slots?: ComponentMountingOptions<typeof FieldOptionList>["slots"];
} = {}) {
  return mount(FieldOptionList, {
    props: {
      options: [...OPTIONS],
      modelValue: options.modelValue ?? "high",
      ariaLabel: "優先度を選択",
    },
    slots: options.slots,
  });
}

function optionButtons(wrapper: ReturnType<typeof mountList>) {
  return wrapper.findAll('[role="option"]');
}

describe("FieldOptionList (user-avatar 2.2)", () => {
  describe("without #leading", () => {
    it("keeps listbox/option roles, labels, checkmark, and aria-selected without extra slot nodes", () => {
      const wrapper = mountList({ modelValue: "high" });
      const listbox = wrapper.get('[role="listbox"]');
      const buttons = optionButtons(wrapper);

      expect(listbox.attributes("aria-label")).toBe("優先度を選択");
      expect(buttons).toHaveLength(OPTIONS.length);

      for (const [index, option] of OPTIONS.entries()) {
        const button = buttons[index]!;
        const selected = option.value === "high";
        const children = [...button.element.children];

        expect(button.attributes("role")).toBe("option");
        expect(button.attributes("aria-label")).toBe(option.label);
        expect(button.attributes("aria-selected")).toBe(String(selected));
        expect(button.text()).toContain(option.label);

        expect(children).toHaveLength(selected ? 2 : 1);
        expect(children[0]!.tagName).toBe("SPAN");
        expect(children[0]!.textContent).toBe(option.label);
        expect(children[0]!.childElementCount).toBe(0);

        if (selected) {
          expect(children[1]!.tagName).toBe("SPAN");
          expect(children[1]!.getAttribute("aria-hidden")).toBe("true");
          expect(children[1]!.textContent?.trim()).toBe("✓");
        }
      }
    });
  });

  describe("with #leading", () => {
    it("renders slot content before the option label", () => {
      const wrapper = mountList({
        modelValue: "medium",
        slots: {
          leading: ({ option }: { option: { value: string; label: string } }) =>
            h("span", { "data-testid": "leading" }, `lead-${option.value}`),
        },
      });
      const buttons = optionButtons(wrapper);

      for (const [index, option] of OPTIONS.entries()) {
        const button = buttons[index]!;
        const children = [...button.element.children];
        const leading = children[0] as HTMLElement;
        const label = children[1] as HTMLElement;

        expect(leading.getAttribute("data-testid")).toBe("leading");
        expect(leading.textContent).toBe(`lead-${option.value}`);
        expect(label.tagName).toBe("SPAN");
        expect(label.textContent).toBe(option.label);
        expect(button.text().indexOf(`lead-${option.value}`)).toBeLessThan(
          button.text().indexOf(option.label),
        );
      }
    });
  });
});
