import { describe, expect, it } from "vitest";
import {
  buildAxisTicks,
  buildChartLayout,
  formatPeriodLabel,
  niceCeiling,
} from "./ThroughputTrendChart.helpers";

describe("ThroughputTrendChart.helpers", () => {
  it("formatPeriodLabel は ISO 日付を mock 1c 形式にする", () => {
    expect(formatPeriodLabel("2026-06-01")).toBe("6/01");
    expect(formatPeriodLabel("2026-12-08T00:00:00.000Z")).toBe("12/08");
  });

  it("niceCeiling は正の最大値を読みやすい天井に丸める", () => {
    expect(niceCeiling(0)).toBe(1);
    expect(niceCeiling(14)).toBe(20);
    expect(niceCeiling(40)).toBe(50);
  });

  it("buildAxisTicks は 0・中間・最大を返す", () => {
    expect(buildAxisTicks(18).values).toEqual([0, 10, 20]);
    expect(buildAxisTicks(40).values).toEqual([0, 25, 50]);
  });

  it("buildChartLayout は件数とポイントで異なる軸最大を使う", () => {
    const layout = buildChartLayout([
      {
        periodStart: "2026-06-01",
        periodEnd: "2026-06-07",
        completedCount: 12,
        completedPoints: 34,
      },
      {
        periodStart: "2026-06-08",
        periodEnd: "2026-06-14",
        completedCount: 9,
        completedPoints: 26,
      },
    ]);

    expect(layout.countAxis.max).not.toBe(layout.pointsAxis.max);
    expect(layout.points).toHaveLength(2);
    expect(layout.points[0]!.cx).toBe(layout.points[0]!.barX + 15);
    expect(layout.linePointsAttr.split(" ")).toHaveLength(2);
  });
});
