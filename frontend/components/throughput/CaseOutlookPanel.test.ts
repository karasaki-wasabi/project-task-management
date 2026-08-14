import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { CaseOutlook } from "../../composables/useApiClient";
import CaseOutlookPanel from "./CaseOutlookPanel.vue";

function makeOutlook(overrides: Partial<CaseOutlook> = {}): CaseOutlook {
  return {
    openTaskCount: 23,
    openPoints: 68,
    requiredPeriods: 3,
    remainingPeriods: 6,
    marginPoints: 94,
    ...overrides,
  };
}

function mountPanel(
  caseOutlook: CaseOutlook | null,
  extras: { caseName?: string; endDateLabel?: string; periodType?: "week" | "month" } = {},
) {
  return mount(CaseOutlookPanel, {
    props: {
      caseOutlook,
      ...extras,
    },
  });
}

describe("CaseOutlookPanel (velocity-dashboard 4.4, Req 7.1-7.5)", () => {
  it("caseOutlook が null のときはパネルを表示しない", () => {
    const wrapper = mountPanel(null);
    expect(wrapper.find('[data-testid="case-outlook-panel"]').exists()).toBe(false);
    expect(wrapper.text()).toBe("");
  });

  it("5項目をグリッド表示する（Req 7.1-7.3）", () => {
    const wrapper = mountPanel(makeOutlook());
    const panel = wrapper.get('[data-testid="case-outlook-panel"]');

    expect(panel.get('[data-testid="outlook-open-task-count"]').text()).toContain("23");
    expect(panel.get('[data-testid="outlook-open-points"]').text()).toContain("68");
    expect(panel.get('[data-testid="outlook-required-periods"]').text()).toContain("3");
    expect(panel.get('[data-testid="outlook-remaining-periods"]').text()).toContain("6");
    expect(panel.get('[data-testid="outlook-margin-points"]').text()).toContain("94");
  });

  it("requiredPeriods / marginPoints が null のとき該当項目のみ算出不可、件数・ポイントは通常表示（Req 7.5）", () => {
    const wrapper = mountPanel(
      makeOutlook({
        requiredPeriods: null,
        marginPoints: null,
        remainingPeriods: 6,
      }),
    );

    expect(wrapper.get('[data-testid="outlook-open-task-count"]').text()).toContain("23");
    expect(wrapper.get('[data-testid="outlook-open-points"]').text()).toContain("68");
    expect(wrapper.get('[data-testid="outlook-required-periods"]').text()).toContain("算出不可");
    expect(wrapper.get('[data-testid="outlook-margin-points"]').text()).toContain("算出不可");
    expect(wrapper.get('[data-testid="outlook-remaining-periods"]').text()).toContain("6");
    expect(wrapper.get('[data-testid="outlook-remaining-periods"]').text()).not.toContain(
      "算出不可",
    );
  });

  it("remainingPeriods が null のとき残期間数は算出不可（Req 7.4）", () => {
    const wrapper = mountPanel(
      makeOutlook({
        remainingPeriods: null,
        requiredPeriods: null,
        marginPoints: null,
      }),
    );

    expect(wrapper.get('[data-testid="outlook-remaining-periods"]').text()).toContain("算出不可");
    expect(wrapper.get('[data-testid="outlook-open-task-count"]').text()).toContain("23");
  });

  it("remainingPeriods が 0 のとき数値 0 を表示する（算出不可にしない）", () => {
    const wrapper = mountPanel(
      makeOutlook({
        remainingPeriods: 0,
        requiredPeriods: null,
        marginPoints: null,
      }),
    );

    const remaining = wrapper.get('[data-testid="outlook-remaining-periods"]');
    expect(remaining.text()).toMatch(/\b0\b/);
    expect(remaining.text()).not.toContain("算出不可");
  });

  it("進捗バーは remainingPeriods が null または 0 のとき算出不可", () => {
    const nullRemaining = mountPanel(makeOutlook({ remainingPeriods: null }));
    expect(nullRemaining.get('[data-testid="outlook-progress"]').text()).toContain("算出不可");
    expect(nullRemaining.find('[data-testid="outlook-progress-bar"]').exists()).toBe(false);

    const zeroRemaining = mountPanel(makeOutlook({ remainingPeriods: 0 }));
    expect(zeroRemaining.get('[data-testid="outlook-progress"]').text()).toContain("算出不可");
    expect(zeroRemaining.find('[data-testid="outlook-progress-bar"]').exists()).toBe(false);
  });

  it("進捗バーは requiredPeriods / remainingPeriods から消化率の目安を算出する", () => {
    const wrapper = mountPanel(makeOutlook({ requiredPeriods: 3, remainingPeriods: 6 }));
    const progress = wrapper.get('[data-testid="outlook-progress"]');
    expect(progress.text()).toContain("50%");
    expect(wrapper.get('[data-testid="outlook-progress-bar"]').attributes("style")).toMatch(
      /width:\s*50%/,
    );
  });

  it("requiredPeriods が null のとき進捗バーは算出不可", () => {
    const wrapper = mountPanel(
      makeOutlook({ requiredPeriods: null, remainingPeriods: 6, marginPoints: null }),
    );
    expect(wrapper.get('[data-testid="outlook-progress"]').text()).toContain("算出不可");
  });

  it("バッジ: remainingPeriods が null なら目安なし", () => {
    const wrapper = mountPanel(
      makeOutlook({ remainingPeriods: null, requiredPeriods: null, marginPoints: null }),
    );
    expect(wrapper.get('[data-testid="outlook-badge"]').text()).toContain("目安なし");
  });

  it("バッジ: remainingPeriods が 0 かつ openPoints が 0 なら間に合いそう", () => {
    const wrapper = mountPanel(
      makeOutlook({ remainingPeriods: 0, openPoints: 0, requiredPeriods: null, marginPoints: null }),
    );
    expect(wrapper.get('[data-testid="outlook-badge"]').text()).toContain(
      "このペースなら間に合いそう",
    );
  });

  it("バッジ: remainingPeriods が 0 かつ openPoints が残っているなら間に合わない", () => {
    const wrapper = mountPanel(
      makeOutlook({ remainingPeriods: 0, openPoints: 10, requiredPeriods: null, marginPoints: null }),
    );
    expect(wrapper.get('[data-testid="outlook-badge"]').text()).toContain(
      "ペースが足りていません",
    );
  });

  it("バッジ: requiredPeriods <= remainingPeriods なら間に合いそう", () => {
    const wrapper = mountPanel(makeOutlook({ requiredPeriods: 3, remainingPeriods: 6 }));
    expect(wrapper.get('[data-testid="outlook-badge"]').text()).toContain(
      "このペースなら間に合いそう",
    );
  });

  it("バッジ: requiredPeriods > remainingPeriods なら間に合わない", () => {
    const wrapper = mountPanel(makeOutlook({ requiredPeriods: 8, remainingPeriods: 6 }));
    expect(wrapper.get('[data-testid="outlook-badge"]').text()).toContain(
      "ペースが足りていません",
    );
  });

  it("バッジ: remainingPeriods はあるが requiredPeriods が null なら目安なし", () => {
    const wrapper = mountPanel(
      makeOutlook({ requiredPeriods: null, remainingPeriods: 6, marginPoints: null }),
    );
    expect(wrapper.get('[data-testid="outlook-badge"]').text()).toContain("目安なし");
  });
});
