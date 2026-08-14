import { describe, expect, it } from "vitest";
import { defineComponent, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import type { User } from "../../composables/useApiClient";
import UserAvatar from "../shared/UserAvatar.vue";
import type { WorkloadCount } from "./TeamWorkloadSummary.helpers";
import TeamWorkloadSummary from "./TeamWorkloadSummary.vue";

const BadgeStub = defineComponent({
  name: "Badge",
  props: {
    tone: { type: String, required: true },
    label: { type: String, required: true },
  },
  template: `<span data-testid="badge-stub">{{ label }}</span>`,
});

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    name: "山田",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeCounts(entries: Array<{ id: string; name: string; count: number }>): WorkloadCount[] {
  return entries.map((entry) => ({
    user: makeUser({ id: entry.id, name: entry.name }),
    count: entry.count,
  }));
}

function mountSummary(
  counts: WorkloadCount[],
  options: { maxVisible?: number; selectedAssigneeUserId?: string } = {},
) {
  return mount(TeamWorkloadSummary, {
    props: {
      counts,
      maxVisible: options.maxVisible,
      selectedAssigneeUserId: options.selectedAssigneeUserId ?? "",
      "onUpdate:selectedAssigneeUserId": () => {},
    },
    global: {
      stubs: { Badge: BadgeStub },
      components: { UserAvatar },
    },
  });
}

describe("TeamWorkloadSummary (user-avatar 3.4)", () => {
  it("可視チップに担当者の UserAvatar（20px）を名前の横へ置く（Req 2.1）", () => {
    const wrapper = mountSummary(
      makeCounts([{ id: "user-1", name: "山田", count: 3 }]),
    );

    const chip = wrapper.get(".workload-chip");
    const avatar = chip.getComponent(UserAvatar);
    expect(avatar.props("userId")).toBe("user-1");
    expect(avatar.props("size")).toBe(20);
    expect(avatar.props("name")).toBeUndefined();
    expect(chip.text()).toContain("山田");
  });

  it("展開後の残りチップにも UserAvatar を置く（Req 2.1）", async () => {
    const counts = makeCounts([
      { id: "user-1", name: "山田", count: 4 },
      { id: "user-2", name: "佐藤", count: 3 },
      { id: "user-3", name: "鈴木", count: 2 },
      { id: "user-4", name: "高橋", count: 1 },
    ]);

    const wrapper = mountSummary(counts, { maxVisible: 2 });

    const visibleAvatars = wrapper.findAllComponents(UserAvatar);
    expect(visibleAvatars).toHaveLength(2);
    expect(visibleAvatars.map((a) => a.props("userId"))).toEqual(["user-1", "user-2"]);

    await wrapper.get(".remainder-toggle").trigger("click");
    await nextTick();

    const remainderChips = wrapper.findAll(".remainder-list .workload-chip");
    expect(remainderChips).toHaveLength(2);

    const remainderAvatars = remainderChips.map((chip) => chip.getComponent(UserAvatar));
    expect(remainderAvatars.map((a) => a.props("userId"))).toEqual(["user-3", "user-4"]);
    for (const avatar of remainderAvatars) {
      expect(avatar.props("size")).toBe(20);
      expect(avatar.props("name")).toBeUndefined();
    }
  });
});
