import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PriorityBadge from "./PriorityBadge.vue";

describe("PriorityBadge", () => {
  it("renders 高 as a filled danger pill so only high priority stands out", () => {
    const wrapper = mount(PriorityBadge, { props: { priority: "high" } });
    const classes = wrapper.classes().join(" ");

    expect(wrapper.text()).toBe("高");
    expect(classes).toContain("bg-red-100");
    expect(classes).toContain("text-red-700");
  });

  it("renders 中 as a white outline pill without amber fill", () => {
    const wrapper = mount(PriorityBadge, { props: { priority: "medium" } });
    const classes = wrapper.classes().join(" ");

    expect(wrapper.text()).toBe("中");
    expect(classes).toContain("bg-white");
    expect(classes).toContain("border-slate-300");
    expect(classes).toContain("text-slate-600");
    expect(classes).not.toContain("bg-amber-100");
    expect(classes).not.toContain("text-amber-800");
  });

  it("renders 低 as a quiet filled pill", () => {
    const wrapper = mount(PriorityBadge, { props: { priority: "low" } });
    const classes = wrapper.classes().join(" ");

    expect(wrapper.text()).toBe("低");
    expect(classes).toContain("bg-slate-100");
  });
});
