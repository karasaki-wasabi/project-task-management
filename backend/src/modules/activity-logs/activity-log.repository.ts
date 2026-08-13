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

export interface TimelinePageQuery {
  cursor?: { occurredAt: Date; id: string };
  take: number;
}

function afterOccurredAtCursor(cursor?: { occurredAt: Date; id: string }) {
  if (!cursor) return {};
  return {
    OR: [
      { occurredAt: { lt: cursor.occurredAt } },
      { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
    ],
  };
}

export const activityLogRepository = {
  async append(input: AppendActivityLogInput, tx: SoftDeleteTx): Promise<void> {
    await tx.activityLog.create({ data: input });
  },

  listDisplayable(taskId: string, page?: TimelinePageQuery): Promise<ActivityLogEntry[]> {
    return db.activityLog.findMany({
      where: {
        taskId,
        operationType: "field_changed",
        ...afterOccurredAtCursor(page?.cursor),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      ...(page ? { take: page.take } : {}),
    });
  },
};
