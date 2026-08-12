// task-status-model 4.2 — StageBadge mount behavior (Requirements 8.2, 8.3).
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import StageBadge from "./StageBadge.vue";
import Badge from "./Badge.vue";

describe("StageBadge (task-status-model 4.2)", () => {
  it("renders list prefix and stage name for a normal stage", () => {
    const wrapper = mount(StageBadge, {
      props: { kind: "normal", name: "未着手", prefixMode: "list" },
    });
    expect(wrapper.text()).toBe("段階: 未着手");
    expect(wrapper.classes().join(" ")).toContain("rounded-[6px]");
    expect(wrapper.classes().join(" ")).toContain("border");
    expect(wrapper.classes().join(" ")).toContain("bg-white");
    expect(wrapper.classes().join(" ")).not.toContain("rounded-full");
  });

  it("uses modal prefix while keeping the same bordered shell", () => {
    const wrapper = mount(StageBadge, {
      props: { kind: "normal", name: "未着手", prefixMode: "modal" },
    });
    expect(wrapper.text()).toBe("開発段階: 未着手");
    expect(wrapper.classes().join(" ")).toContain("rounded-[6px]");
    expect(wrapper.classes().join(" ")).toContain("border");
  });

  it("styles completed stages with green fill and green border", () => {
    const wrapper = mount(StageBadge, {
      props: { kind: "completed", name: "完了", prefixMode: "list" },
    });
    expect(wrapper.text()).toBe("段階: 完了");
    const classes = wrapper.classes().join(" ");
    expect(classes).toContain("bg-[#dcfce7]");
    expect(classes).toContain("border-[#86efac]");
  });

  it("strikes through only the stage name for cancelled stages", () => {
    const wrapper = mount(StageBadge, {
      props: { kind: "cancelled", name: "中止", prefixMode: "list" },
    });
    expect(wrapper.text()).toBe("段階: 中止");
    const classes = wrapper.classes().join(" ");
    expect(classes).toContain("bg-slate-100");
    expect(classes).toContain("text-slate-500");
    expect(classes).not.toContain("line-through");

    const prefix = wrapper.get('[data-testid="stage-badge-prefix"]');
    const name = wrapper.get('[data-testid="stage-badge-name"]');
    // textContent keeps the trailing space that Vue Test Utils' .text() trims.
    expect(prefix.element.textContent).toBe("段階: ");
    expect(prefix.classes().join(" ")).not.toContain("line-through");
    expect(name.text()).toBe("中止");
    expect(name.classes().join(" ")).toContain("line-through");


  });

  it("renders unset as a dashed badge with 未設定", () => {
    const list = mount(StageBadge, {
      props: { kind: null, name: null, prefixMode: "list" },
    });
    expect(list.text()).toBe("段階: 未設定");
    expect(list.classes().join(" ")).toContain("border-dashed");
    expect(list.classes().join(" ")).toContain("bg-white");

    const modal = mount(StageBadge, {
      props: { kind: null, prefixMode: "modal" },
    });
    expect(modal.text()).toBe("開発段階: 未設定");
    expect(modal.classes().join(" ")).toContain("border-dashed");
  });

  it("stays visually distinct from StatusBadge when the stage name matches a status word", () => {
    const stage = mount(StageBadge, {
      props: { kind: "normal", name: "未着手", prefixMode: "list" },
    });
    const statusPill = mount(Badge, { props: { tone: "neutral", label: "未着手" } });

    expect(stage.text()).toContain("段階:");
    expect(stage.text()).toContain("未着手");
    expect(statusPill.text()).toBe("未着手");
    expect(statusPill.text()).not.toContain("段階:");

    expect(stage.classes().join(" ")).toContain("rounded-[6px]");
    expect(stage.classes().join(" ")).toContain("border");
    expect(statusPill.classes().join(" ")).toContain("rounded-full");
    expect(statusPill.classes().join(" ")).not.toContain("border");
  });
});
