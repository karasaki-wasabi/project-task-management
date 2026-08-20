export function resolveAssigneeName(users: User[], userId: string | null | undefined): string | undefined {
  if (!userId) {
    return undefined;
  }
  return users.find((user) => user.id === userId)?.name;
}

export function isEmpty(tasks: Task[]): boolean {
  return tasks.length === 0;
}
