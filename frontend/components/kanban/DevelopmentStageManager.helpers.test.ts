import { describe, expect, it } from "vitest";
import { swapStageOrder } from "./DevelopmentStageManager.helpers";

describe("swapStageOrder (task 3, Requirement 7.3)", () => {
  it("direction が -1 の場合、index の id を上方向の隣接要素と交換する", () => {
    const result = swapStageOrder(["a", "b", "c"], 1, -1);
    expect(result).toEqual(["b", "a", "c"]);
  });

  it("direction が 1 の場合、index の id を下方向の隣接要素と交換する", () => {
    const result = swapStageOrder(["a", "b", "c"], 1, 1);
    expect(result).toEqual(["a", "c", "b"]);
  });

  it("最初の要素を上方向に移動する（範囲外）場合、null を返す", () => {
    const result = swapStageOrder(["a", "b", "c"], 0, -1);
    expect(result).toBeNull();
  });

  it("最後の要素を下方向に移動する（範囲外）場合、null を返す", () => {
    const result = swapStageOrder(["a", "b", "c"], 2, 1);
    expect(result).toBeNull();
  });

  it("入力配列を変更しない", () => {
    const input = ["a", "b", "c"];
    swapStageOrder(input, 0, 1);
    expect(input).toEqual(["a", "b", "c"]);
  });

  it("1要素のリストの場合、どちらの方向でも null を返す", () => {
    expect(swapStageOrder(["a"], 0, -1)).toBeNull();
    expect(swapStageOrder(["a"], 0, 1)).toBeNull();
  });
});
