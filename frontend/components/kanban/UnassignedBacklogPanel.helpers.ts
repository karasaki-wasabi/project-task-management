export type BacklogSortKey = "priority" | "createdAt";

export function filterTasksByTitle(tasks: Task[], query: string): Task[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === "") {
    return [...tasks];
  }
  return tasks.filter((task) => task.title.toLowerCase().includes(normalizedQuery));
}

const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function sortTasks(tasks: Task[], sortKey: BacklogSortKey): Task[] {
  const copy = [...tasks];
  if (sortKey === "priority") {
    return copy.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }
  return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
