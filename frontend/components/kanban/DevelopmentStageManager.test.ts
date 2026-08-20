import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import type { DevelopmentStage } from "../../composables/useApiClient";
import DevelopmentStageManager from "./DevelopmentStageManager.vue";

const listDevelopmentStages = vi.fn();
const createDevelopmentStage = vi.fn();
const renameDevelopmentStage = vi.fn();
const reorderDevelopmentStages = vi.fn();
const deleteDevelopmentStage = vi.fn();

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      listDevelopmentStages,
      createDevelopmentStage,
      renameDevelopmentStage,
      reorderDevelopmentStages,
      deleteDevelopmentStage,
    }),
  };
});

function makeStage(overrides: Partial<DevelopmentStage> = {}): DevelopmentStage {
  return {
    id: "s-normal",
    name: "作業中",
    order: 1,
    kind: "normal",
    ...overrides,
  };
}

const defaultStages: DevelopmentStage[] = [
  makeStage({ id: "s1", name: "仕様未確定", order: 1, kind: "normal" }),
  makeStage({ id: "s2", name: "作業中", order: 2, kind: "normal" }),
  makeStage({ id: "s-done", name: "完了", order: 3, kind: "completed" }),
  makeStage({ id: "s-cancel", name: "中止", order: 4, kind: "cancelled" }),
];

async function mountManager(stages: DevelopmentStage[] = defaultStages) {
  listDevelopmentStages.mockResolvedValue(stages);
  const wrapper = mount(DevelopmentStageManager);
  await flushPromises();
  return wrapper;
}

function rowFor(wrapper: ReturnType<typeof mount>, stageId: string) {
  const rows = wrapper.findAll("li");
  const match = rows.find((row) => row.attributes("data-stage-id") === stageId);
  if (!match) {
    throw new Error(`row not found for stage ${stageId}`);
  }
  return match;
}

describe("DevelopmentStageManager (task-status-model 5.1)", () => {
  beforeEach(() => {
    listDevelopmentStages.mockReset();
    createDevelopmentStage.mockReset();
    renameDevelopmentStage.mockReset();
    reorderDevelopmentStages.mockReset();
    deleteDevelopmentStage.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("完了・中止の段階にのみ種類を表示し、通常の段階には表示しない", async () => {
    const wrapper = await mountManager();

    const normal = rowFor(wrapper, "s1");
    expect(normal.find('[data-testid="stage-kind-badge"]').exists()).toBe(false);
    expect(normal.text()).not.toMatch(/完了|中止/);

    const completed = rowFor(wrapper, "s-done");
    const completedBadge = completed.get('[data-testid="stage-kind-badge"]');
    expect(completedBadge.text()).toContain("完了");

    const cancelled = rowFor(wrapper, "s-cancel");
    const cancelledBadge = cancelled.get('[data-testid="stage-kind-badge"]');
    expect(cancelledBadge.text()).toContain("中止");
  });

  it("完了・中止の段階で削除を無効化し、その理由を表示する", async () => {
    const wrapper = await mountManager();

    const normalDelete = rowFor(wrapper, "s1").get('[data-testid="stage-delete"]');
    expect(normalDelete.attributes("disabled")).toBeUndefined();
    expect(rowFor(wrapper, "s1").find('[data-testid="stage-delete-reason"]').exists()).toBe(
      false,
    );

    for (const id of ["s-done", "s-cancel"] as const) {
      const row = rowFor(wrapper, id);
      const deleteBtn = row.get('[data-testid="stage-delete"]');
      expect(deleteBtn.attributes("disabled")).toBeDefined();
      expect(row.get('[data-testid="stage-delete-reason"]').text()).toBe(
        "この段階は削除できません",
      );
      await deleteBtn.trigger("click");
    }
    expect(deleteDevelopmentStage).not.toHaveBeenCalled();
  });

  it("完了・中止の段階でリネームと並び替えを有効化する", async () => {
    const wrapper = await mountManager();
    const completed = rowFor(wrapper, "s-done");

    const rename = completed.get('[data-testid="stage-rename"]');
    expect(rename.attributes("disabled")).toBeUndefined();

    const moveUp = completed.get('[data-testid="stage-move-up"]');
    const moveDown = completed.get('[data-testid="stage-move-down"]');
    expect(moveUp.attributes("disabled")).toBeUndefined();
    expect(moveDown.attributes("disabled")).toBeUndefined();

    const cancelled = rowFor(wrapper, "s-cancel");
    expect(cancelled.get('[data-testid="stage-rename"]').attributes("disabled")).toBeUndefined();
    expect(cancelled.get('[data-testid="stage-move-up"]').attributes("disabled")).toBeUndefined();
  });
});
