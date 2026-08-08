// Component tests for CaseTemplateApplyConfirm (task 6.1 remediation).
// Mounts the SFC with @vue/test-utils so screen A/B/C switching and
// approve/close emits are observable (Requirements 3.1/3.5, 4.1–4.4).
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import CaseTemplateApplyConfirm from "./CaseTemplateApplyConfirm.vue";
import type { CaseTemplateApplyOperation } from "./caseTemplateApplyCandidates";
import type { ConfirmMode, MissingDates } from "./CaseTemplateApplyConfirm.helpers";

/** Slot-passthrough Modal stub — keeps close affordance for abort path. */
const ModalStub = defineComponent({
  name: "Modal",
  props: {
    open: { type: Boolean, required: true },
    ariaLabel: { type: String, required: true },
  },
  emits: ["close"],
  template: `
    <div v-if="open" data-testid="modal" role="dialog" :aria-label="ariaLabel">
      <div data-testid="modal-title"><slot name="title" /></div>
      <div data-testid="modal-body"><slot /></div>
      <div data-testid="modal-actions"><slot name="actions" /></div>
      <button type="button" aria-label="閉じる" @click="$emit('close')">×</button>
    </div>
  `,
});

type ConfirmMountProps = {
  mode: ConfirmMode;
  missingDates?: MissingDates;
  startDate?: string | null;
  endDate?: string | null;
  oldStartDate?: string | null;
  oldEndDate?: string | null;
  candidates?: CaseTemplateApplyOperation[];
};

function mountConfirm(props: ConfirmMountProps) {
  return mount(CaseTemplateApplyConfirm, {
    props: { open: true, ...props },
    global: {
      stubs: { Modal: ModalStub },
    },
  });
}

function buttonByText(wrapper: ReturnType<typeof mountConfirm>, text: string) {
  const match = wrapper.findAll("button").find((b) => b.text().trim() === text);
  if (!match) throw new Error(`button not found: ${text}`);
  return match;
}

describe("CaseTemplateApplyConfirm (mounted)", () => {
  it("screen A: shows create title and approve(null) on 作成する", async () => {
    const wrapper = mountConfirm({
      mode: "create-missing",
      missingDates: "both",
      startDate: null,
      endDate: null,
    });

    expect(wrapper.get('[data-testid="modal-title"]').text()).toContain(
      "案件を作成しますか?",
    );

    await buttonByText(wrapper, "作成する").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("approve")).toEqual([[null]]);
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("screen B → C → approve selected subset", async () => {
    const wrapper = mountConfirm({
      mode: "edit-apply",
      candidates: ["start_generate", "end_delete"],
      oldStartDate: null,
      startDate: "2026-04-01",
      oldEndDate: "2026-05-31",
      endDate: null,
    });

    expect(wrapper.get('[data-testid="modal-title"]').text()).toContain(
      "テンプレートタスクへの反映",
    );

    // Uncheck end_delete via its checkbox
    const endDeleteCheckbox = wrapper.get(
      'input[aria-label="案件終了日起点のタスクを削除"]',
    );
    await endDeleteCheckbox.trigger("click");

    await buttonByText(wrapper, "次へ").trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="modal-title"]').text()).toContain(
      "実行内容の確認",
    );

    await buttonByText(wrapper, "実行する").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("approve")).toEqual([[["start_generate"]]]);
  });

  it("screen B shows strikethrough only for dates that changed", () => {
    const wrapper = mountConfirm({
      mode: "edit-apply",
      candidates: ["start_regenerate", "month_regenerate"],
      oldStartDate: "2036-06-01",
      startDate: "2036-06-02",
      oldEndDate: "2036-06-15",
      endDate: "2036-06-15",
    });

    const startRow = wrapper.get('[data-testid="date-change-start"]');
    expect(startRow.text()).toContain("2036-06-01");
    expect(startRow.text()).toContain("→");
    expect(startRow.text()).toContain("2036-06-02");
    expect(startRow.html()).toContain("line-through");

    const endRow = wrapper.get('[data-testid="date-change-end"]');
    expect(endRow.text()).toContain("2036-06-15");
    expect(endRow.text()).not.toContain("→");
    expect(endRow.html()).not.toContain("line-through");
  });

  it("selected candidate rows use border highlight (not overflow-clipped ring)", () => {
    const wrapper = mountConfirm({
      mode: "edit-apply",
      candidates: ["start_regenerate"],
      oldStartDate: "2036-06-01",
      startDate: "2036-06-02",
      oldEndDate: "2036-06-15",
      endDate: "2036-06-15",
    });

    const selected = wrapper.get("li.border-indigo-500");
    expect(selected.classes()).toContain("border-2");
    expect(selected.classes().join(" ")).not.toMatch(/ring-2/);
  });

  it("screen B → C with empty selection → approve([])", async () => {
    const wrapper = mountConfirm({
      mode: "edit-apply",
      candidates: ["start_regenerate"],
      oldStartDate: "2026-01-01",
      startDate: "2026-02-01",
      oldEndDate: "2026-01-31",
      endDate: "2026-02-28",
    });

    await wrapper
      .get('input[aria-label="案件開始日起点のタスクを生成し直し"]')
      .trigger("click");
    await buttonByText(wrapper, "次へ").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("テンプレートタスクへの操作はありません");

    await buttonByText(wrapper, "実行する").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("approve")).toEqual([[[]]]);
  });

  it("cancel on screen B emits close (abort)", async () => {
    const wrapper = mountConfirm({
      mode: "edit-apply",
      candidates: ["month_generate"],
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      oldStartDate: null,
      oldEndDate: null,
    });

    await buttonByText(wrapper, "キャンセル").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(wrapper.emitted("approve")).toBeUndefined();
  });

  it("Modal close (×) emits close (abort)", async () => {
    const wrapper = mountConfirm({
      mode: "create-missing",
      missingDates: "start",
      startDate: null,
      endDate: "2026-04-30",
    });

    await wrapper.get('button[aria-label="閉じる"]').trigger("click");
    await flushPromises();

    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(wrapper.emitted("approve")).toBeUndefined();
  });
});
