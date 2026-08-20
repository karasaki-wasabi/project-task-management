export interface WorkloadCount {
  user: User;
  count: number;
}

export interface VisibleWorkload {
  visible: WorkloadCount[];
  remainder: WorkloadCount[];
}

export function splitVisibleWorkload(counts: WorkloadCount[], maxVisible: number): VisibleWorkload {
  if (maxVisible < 0) {
    return { visible: [], remainder: [...counts] };
  }
  return {
    visible: counts.slice(0, maxVisible),
    remainder: counts.slice(maxVisible),
  };
}

export function remainderCount(counts: WorkloadCount[], maxVisible: number): number {
  return splitVisibleWorkload(counts, maxVisible).remainder.length;
}

export const WORKLOAD_OVERLOAD_THRESHOLD = 5;

export function isOverloaded(count: number): boolean {
  return count > WORKLOAD_OVERLOAD_THRESHOLD;
}
