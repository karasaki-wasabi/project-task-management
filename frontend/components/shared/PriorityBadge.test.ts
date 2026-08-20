import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PriorityBadge from "./PriorityBadge.vue";

describe("PriorityBadge", () => {
  it("「高」を赤いチップとする", () => {
    const wrapper = mount(PriorityBadge, { props: { priority: "high" } });
    const classes = wrapper.classes().join(" ");

    expect(wrapper.text()).toBe("高");
    expect(classes).toContain("bg-red-100");
    expect(classes).toContain("text-red-700");
  });

  it("「中」を白いアウトラインのチップとする", () => {
    const wrapper = mount(PriorityBadge, { props: { priority: "medium" } });
    const classes = wrapper.classes().join(" ");

    expect(wrapper.text()).toBe("中");
    expect(classes).toContain("bg-white");
    expect(classes).toContain("border-slate-300");
    expect(classes).toContain("text-slate-600");
  });

  it("「低」を灰のチップとする", () => {
    const wrapper = mount(PriorityBadge, { props: { priority: "low" } });
    const classes = wrapper.classes().join(" ");

    expect(wrapper.text()).toBe("低");
    expect(classes).toContain("bg-slate-100");
  });
});
