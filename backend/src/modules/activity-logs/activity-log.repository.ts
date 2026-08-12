import { db } from "../../shared/db.js";
import type { SoftDeleteTx } from "../../shared/soft-delete.repository.js";
import type { ActivityLogEntry, FieldName, OperationType } from "./activity-log.types.js";

interface AppendActivityLogInput {
  taskId: string;
  actorUserId: string | null;
  actorSourceLabel: string | null;
  operationType: OperationType;
  fieldName: FieldName | null;
  beforeValue: string | null;
  afterValue: string | null;
}

export const activityLogRepository = {
  async append(input: AppendActivityLogInput, tx: SoftDeleteTx): Promise<void> {
    await tx.activityLog.create({ data: input });
  },

  listDisplayable(taskId: string): Promise<ActivityLogEntry[]> {
    return db.activityLog.findMany({
      where: {
        taskId,
        operationType: "field_changed",
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    });
  },
};
