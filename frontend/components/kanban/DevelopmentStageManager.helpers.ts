export function swapStageOrder(orderedIds: string[], index: number, direction: -1 | 1): string[] | null {
  const target = index + direction;
  if (target < 0 || target >= orderedIds.length) return null;
  const result = [...orderedIds];
  const atIndex = result[index]!;
  const atTarget = result[target]!;
  result[index] = atTarget;
  result[target] = atIndex;
  return result;
}
