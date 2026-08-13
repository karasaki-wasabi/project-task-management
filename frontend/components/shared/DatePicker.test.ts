import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import DatePicker from "./DatePicker.vue";

function buttonByText(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.findAll("button").find((button) => button.text() === label);
}

describe("DatePicker", () => {
  it("embedded ではトリガーを出さず、決定で値を確定しキャンセルで閉じる", async () => {
    const wrapper = mount(DatePicker, {
      props: {
        modelValue: "2026-08-10",
        ariaLabel: "終了予定日",
        embedded: true,
      },
    });

    expect(wrapper.find('button[aria-label="終了予定日"]').exists()).toBe(false);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

    await wrapper.get('button[aria-label="2026-08-20"]').trigger("click");
    await buttonByText(wrapper, "決定")!.trigger("click");

    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["2026-08-20"]);

    await buttonByText(wrapper, "キャンセル")!.trigger("click");

    expect(wrapper.emitted("dismissed")).toHaveLength(1);
  });

  it("API の日時 ISO でもカレンダーを日付として開ける", () => {
    const wrapper = mount(DatePicker, {
      props: {
        modelValue: "2026-08-10T00:00:00.000Z",
        ariaLabel: "終了予定日",
        embedded: true,
      },
    });

    expect(wrapper.text()).toContain("2026/08/10");
    expect(wrapper.text()).not.toContain("T00:00:00");
    expect(wrapper.text()).toContain("2026年8月");
    expect(wrapper.text()).not.toContain("NaN");
    expect(wrapper.find('button[aria-label="2026-08-10"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="2026-08-20"]').exists()).toBe(true);
  });

  it("clearLabel を渡すとその文言で未設定ボタンを出す", () => {
    const wrapper = mount(DatePicker, {
      props: {
        modelValue: "2026-08-10",
        ariaLabel: "終了予定日",
        embedded: true,
        clearLabel: "終了予定日を未設定にする",
      },
    });

    expect(buttonByText(wrapper, "終了予定日を未設定にする")?.exists()).toBe(true);
    expect(buttonByText(wrapper, "クリア")).toBeUndefined();
    expect(buttonByText(wrapper, "キャンセル")?.classes()).toEqual(
      expect.arrayContaining(["shrink-0", "whitespace-nowrap"]),
    );
    expect(buttonByText(wrapper, "決定")?.classes()).toEqual(
      expect.arrayContaining(["shrink-0", "whitespace-nowrap"]),
    );
  });
});
