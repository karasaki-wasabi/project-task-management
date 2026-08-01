import { describe, expect, it } from "vitest";
import { swapStageOrder } from "./DevelopmentStageManager.helpers";

describe("swapStageOrder (task 3, Requirement 7.3)", () => {
  it("swaps the id at index with its upward neighbor when direction is -1", () => {
    const result = swapStageOrder(["a", "b", "c"], 1, -1);
    expect(result).toEqual(["b", "a", "c"]);
  });

  it("swaps the id at index with its downward neighbor when direction is 1", () => {
    const result = swapStageOrder(["a", "b", "c"], 1, 1);
    expect(result).toEqual(["a", "c", "b"]);
  });

  it("returns null when moving the first entry upward (out of bounds)", () => {
    const result = swapStageOrder(["a", "b", "c"], 0, -1);
    expect(result).toBeNull();
  });

  it("returns null when moving the last entry downward (out of bounds)", () => {
    const result = swapStageOrder(["a", "b", "c"], 2, 1);
    expect(result).toBeNull();
  });

  it("does not mutate the input array", () => {
    const input = ["a", "b", "c"];
    swapStageOrder(input, 0, 1);
    expect(input).toEqual(["a", "b", "c"]);
  });

  it("returns null for a single-element list in either direction", () => {
    expect(swapStageOrder(["a"], 0, -1)).toBeNull();
    expect(swapStageOrder(["a"], 0, 1)).toBeNull();
  });
});
