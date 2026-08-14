import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import type { ThroughputPeriod } from "../../composables/useApiClient";
import ThroughputTrendChart from "./ThroughputTrendChart.vue";

function makePeriods(
  entries: Array<{ start: string; count: number; points: number }>,
): ThroughputPeriod[] {
  return entries.map((entry) => ({
    periodStart: entry.start,
    periodEnd: entry.start,
    completedCount: entry.count,
    completedPoints: entry.points,
  }));
}

const samplePeriods = makePeriods([
  { start: "2026-06-01", count: 12, points: 34 },
  { start: "2026-06-08", count: 9, points: 26 },
  { start: "2026-06-15", count: 14, points: 40 },
]);

function mountChart(periods: ThroughputPeriod[] = samplePeriods) {
  return mount(ThroughputTrendChart, {
    props: { periods },
  });
}

describe("ThroughputTrendChart (velocity-dashboard 4.2, Req 5.1-5.3)", () => {
  it("期間ごとの完了タスク数を棒として描画する（Req 5.1, 5.3）", () => {
    const wrapper = mountChart();

    const bars = wrapper.findAll('[data-testid="count-bar"]');
    expect(bars).toHaveLength(3);
    expect(bars.map((bar) => Number(bar.attributes("data-value")))).toEqual([12, 9, 14]);
  });

  it("期間ごとの完了ポイントを折れ線の点として描画する（Req 5.1, 5.3）", () => {
    const wrapper = mountChart();

    const dots = wrapper.findAll('[data-testid="points-dot"]');
    expect(dots).toHaveLength(3);
    expect(dots.map((dot) => Number(dot.attributes("data-value")))).toEqual([34, 26, 40]);
    expect(wrapper.find('[data-testid="points-line"]').exists()).toBe(true);
  });

  it("件数とポイントで独立した y 軸目盛りを持つ（Req 5.3）", () => {
    const wrapper = mountChart();

    const countTicks = wrapper.findAll('[data-testid="count-y-tick"]');
    const pointsTicks = wrapper.findAll('[data-testid="points-y-tick"]');
    expect(countTicks.length).toBeGreaterThanOrEqual(2);
    expect(pointsTicks.length).toBeGreaterThanOrEqual(2);

    const countValues = countTicks.map((tick) => tick.text());
    const pointsValues = pointsTicks.map((tick) => tick.text());
    expect(countValues).not.toEqual(pointsValues);
    expect(countValues).toContain("0");
    expect(pointsValues).toContain("0");
  });

  it("x 軸ラベルは下段のみに表示し、期間数と一致する（Req 5.1）", () => {
    const wrapper = mountChart();

    const labels = wrapper.findAll('[data-testid="period-x-label"]');
    expect(labels).toHaveLength(3);
    expect(labels.map((label) => label.text())).toEqual(["6/01", "6/08", "6/15"]);
    expect(wrapper.findAll('[data-testid="period-x-label-top"]')).toHaveLength(0);
  });

  it("同一期間インデックスへホバーすると上下段が同時にハイライトされる（Req 5.3）", async () => {
    const wrapper = mountChart();

    const hitAreas = wrapper.findAll('[data-testid="period-hit"]');
    expect(hitAreas).toHaveLength(3);

    await hitAreas[1]!.trigger("mouseenter");
    await nextTick();

    const highlights = wrapper.findAll('[data-testid="period-highlight"]');
    expect(highlights).toHaveLength(2);
    for (const band of highlights) {
      expect(band.attributes("data-period-index")).toBe("1");
    }

    await hitAreas[1]!.trigger("mouseleave");
    await nextTick();
    expect(wrapper.findAll('[data-testid="period-highlight"]')).toHaveLength(0);
  });

  it("periods が変わると棒・折れ線・ラベルが更新される（Req 5.2）", async () => {
    const wrapper = mountChart();

    await wrapper.setProps({
      periods: makePeriods([
        { start: "2026-07-01", count: 4, points: 10 },
        { start: "2026-07-08", count: 8, points: 20 },
      ]),
    });
    await nextTick();

    expect(wrapper.findAll('[data-testid="count-bar"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-testid="points-dot"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-testid="period-x-label"]').map((el) => el.text())).toEqual([
      "7/01",
      "7/08",
    ]);
  });

  it("空の periods でも落ちず、系列要素を描かない", () => {
    const wrapper = mountChart([]);
    expect(wrapper.find('[data-testid="throughput-trend-chart"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="count-bar"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-testid="points-dot"]')).toHaveLength(0);
  });
});
