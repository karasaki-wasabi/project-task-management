import type { DevelopmentStageKind, Prisma } from "@prisma/client";

export type TaskClosureState = "open" | "completed" | "cancelled";

/** 完了種別の段階にあるタスクに一致する。 */
export const completedTaskFilter: Prisma.TaskWhereInput = {
  developmentStage: {
    kind: "completed",
  },
};

/** 完了または中止の段階にあるタスクに一致する。 */
export const closedTaskFilter: Prisma.TaskWhereInput = {
  developmentStage: {
    kind: { in: ["completed", "cancelled"] },
  },
};

/** クローズ済みでないタスクに一致する。段階未設定のタスクを含む。 */
export const openTaskFilter: Prisma.TaskWhereInput = {
  NOT: closedTaskFilter,
};

/** 段階の種別からクローズ状態を求める。段階未設定は "open"。 */
export function resolveClosureState(
  kind: DevelopmentStageKind | null,
): TaskClosureState {
  if (kind === "completed") {
    return "completed";
  }
  if (kind === "cancelled") {
    return "cancelled";
  }
  return "open";
}
