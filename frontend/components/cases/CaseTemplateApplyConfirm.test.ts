import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import CaseTemplateApplyConfirm from "./CaseTemplateApplyConfirm.vue";
import type { CaseTemplateApplyOperation } from "./caseTemplateApplyCandidates";
import type { ConfirmMode, MissingDates } from "./CaseTemplateApplyConfirm.helpers";

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

describe("CaseTemplateApplyConfirm マウント", () => {
  it("画面A: 作成タイトルを表示し、作成するで approve(null) を承認する", async () => {
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

  it("画面B → C → 選択されたサブセットを承認する", async () => {
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

  it("画面B: 変更された日付にのみ取り消し線を表示する", () => {
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

  it("選択された候補行に境界線のハイライトを使用する（オーバーフロークリップされないリングではない）", () => {
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

  it("画面B → C → 空の選択で承認([])", async () => {
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

  it("画面Bでキャンセルすると close を発行する（abort）", async () => {
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

  it("モーダル閉じる（×）で close を発行する（abort）", async () => {
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
