import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import type { Case } from "../../composables/useApiClient";
import CaseFilterSelect from "./CaseFilterSelect.vue";

function makeCase(
  overrides: Partial<Case> & Pick<Case, "id" | "name" | "isCompleted">,
): Case {
  return {
    endDate: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

const sampleCases: Case[] = [
  makeCase({ id: "case-open-a", name: "Alpha案件", isCompleted: false }),
  makeCase({ id: "case-done", name: "完了した案件", isCompleted: true }),
  makeCase({ id: "case-open-b", name: "Betaプロジェクト", isCompleted: false }),
  makeCase({ id: "case-done-2", name: "Alpha完了", isCompleted: true }),
];

function mountFilter(modelValue: string | null = null, cases: Case[] = sampleCases) {
  return mount(CaseFilterSelect, {
    props: {
      cases,
      modelValue,
      "onUpdate:modelValue": (value: string | null) => {
        void value;
      },
    },
  });
}

describe("CaseFilterSelect (velocity-dashboard 4.3, Req 4.2-4.4, 7.6)", () => {
  it("完了済み案件を候補・選択肢に表示しない（Req 4.4, 7.6）", async () => {
    const wrapper = mountFilter();
    await wrapper.get('[data-testid="case-filter-trigger"]').trigger("click");
    await nextTick();

    const optionTexts = wrapper.findAll('[role="option"]').map((option) => option.text());
    expect(optionTexts).toContain("Alpha案件");
    expect(optionTexts).toContain("Betaプロジェクト");
    expect(optionTexts).not.toContain("完了した案件");
    expect(optionTexts).not.toContain("Alpha完了");
    expect(wrapper.text()).toContain("完了済みの案件は表示されません");
  });

  it("先頭に「全体(ワークスペース)」を固定表示し、選択で null を emit する（Req 4.3）", async () => {
    const wrapper = mountFilter("case-open-a");
    await wrapper.get('[data-testid="case-filter-trigger"]').trigger("click");
    await nextTick();

    const options = wrapper.findAll('[role="option"]');
    expect(options[0]!.text()).toContain("全体(ワークスペース)");

    await options[0]!.trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[null]]);
  });

  it("未完了案件を選ぶと caseId を emit する（Req 4.2）", async () => {
    const wrapper = mountFilter();
    await wrapper.get('[data-testid="case-filter-trigger"]').trigger("click");
    await nextTick();

    const beta = wrapper
      .findAll('[role="option"]')
      .find((option) => option.text().includes("Betaプロジェクト"));
    expect(beta).toBeTruthy();
    await beta!.trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([["case-open-b"]]);
  });

  it("案件名の部分一致で候補を絞り込む（Req 4.2）", async () => {
    const wrapper = mountFilter();
    await wrapper.get('[data-testid="case-filter-trigger"]').trigger("click");
    await nextTick();

    await wrapper.get('[data-testid="case-filter-search"]').setValue("Alpha");
    await nextTick();

    const optionTexts = wrapper.findAll('[role="option"]').map((option) => option.text());
    expect(optionTexts[0]).toContain("全体(ワークスペース)");
    expect(optionTexts).toContain("Alpha案件");
    expect(optionTexts).not.toContain("Betaプロジェクト");
    expect(optionTexts).not.toContain("Alpha完了");
  });

  it("選択中の案件名をトリガーに表示する", () => {
    const wrapper = mountFilter("case-open-a");
    expect(wrapper.get('[data-testid="case-filter-trigger"]').text()).toContain("Alpha案件");
  });

  it("未選択時はトリガーに「全体(ワークスペース)」を表示する", () => {
    const wrapper = mountFilter(null);
    expect(wrapper.get('[data-testid="case-filter-trigger"]').text()).toContain(
      "全体(ワークスペース)",
    );
  });
});
