// task-status-model 4.1 — handoff tone reserves teal; green stays off StatusBadge path.
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import Badge from "./Badge.vue";
import { STATUS_BADGE_CONFIG } from "./StatusBadge.helpers";

describe("Badge handoff tone (task-status-model 4.1)", () => {
  it("applies teal handoff colors and keeps success green out of status configs", () => {
    const wrapper = mount(Badge, { props: { tone: "handoff", label: "引継待ち" } });
    expect(wrapper.classes().join(" ")).toContain("bg-[#ccfbf1]");
    expect(wrapper.classes().join(" ")).toContain("text-[#0f766e]");
    expect(wrapper.classes().join(" ")).not.toContain("bg-green-100");
    expect(wrapper.classes().join(" ")).not.toContain("text-green-700");

    for (const config of Object.values(STATUS_BADGE_CONFIG)) {
      expect(config.tone).not.toBe("success");
    }
  });
});
