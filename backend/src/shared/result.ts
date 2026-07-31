// Shared Result<T, E> type (design.md File Structure Plan: "shared/result.ts
// — Result<T, E>型など共通型(モジュール間で重複させない)"). TasksService is
// the first consumer (task 3.1); its Service Interface returns
// `Result<Task, TaskError>` for every operation that can fail on business
// rules rather than throwing.
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
