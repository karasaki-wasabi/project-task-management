// Task integrity / aggregation public surface (module-boundary-cleanup task 2.3;
// design.md Backend/tasks taskIntegrityService). Depends on taskRepository and
// task.closure only. Must not import stages / cases / recurrence services, and
// must not query Task rows through Prisma client accessors.
import type { DbClient } from "../../shared/soft-delete.repository.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { completedTaskFilter, openTaskFilter } from "./task.closure.js";
import { taskRepository } from "./task.repository.js";

/** recurrence の caseAnchor と同じユニオン。tasks 側で定義し、recurrence 実行時依存を作らない。 */
export type GeneratedTaskAnchor =
  | "case_start"
  | "case_end"
  | "period_month_start"
  | "period_month_end";

export type CaseProgressCounts = {
  requiredTotal: number;
  requiredCompleted: number;
};

export const taskIntegrityService = {
  detachFromCase(caseId: string, client?: DbClient): Promise<void> {
    return taskRepository.detachFromCase(caseId, client);
  },

  clearDevelopmentStage(developmentStageId: string, client?: DbClient): Promise<void> {
    return taskRepository.clearDevelopmentStage(developmentStageId, client);
  },

  listGeneratedByAnchors(
    caseId: string,
    anchors: GeneratedTaskAnchor[],
    client?: DbClient,
  ): Promise<Array<{ id: string; workspaceId: string }>> {
    return taskRepository.listGeneratedByAnchors(caseId, anchors, client);
  },

  async countRequiredForCaseProgress(
    caseId: string,
    workspaceId: VerifiedWorkspaceId,
  ): Promise<CaseProgressCounts> {
    const [requiredTotal, requiredCompleted] = await Promise.all([
      taskRepository.countRequiredMatching(caseId, workspaceId, {
        OR: [openTaskFilter, completedTaskFilter],
      }),
      taskRepository.countRequiredMatching(caseId, workspaceId, completedTaskFilter),
    ]);
    return { requiredTotal, requiredCompleted };
  },

  countCompletedInPeriodIncludingDeleted(periodStart: Date, periodEnd: Date): Promise<number> {
    return taskRepository.countCompletedInPeriodIncludingDeleted(periodStart, periodEnd);
  },
};
