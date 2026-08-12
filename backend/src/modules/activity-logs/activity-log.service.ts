import type { Prisma } from "@prisma/client";
import { activityLogRepository } from "./activity-log.repository.js";
import type { ActivityLogEntry, RecordActivityLogInput } from "./activity-log.types.js";

export const activityLogService = {
  async record(input: RecordActivityLogInput, tx: Prisma.TransactionClient): Promise<void> {
    const actor =
      input.actor.type === "user"
        ? { actorUserId: input.actor.userId, actorSourceLabel: null }
        : { actorUserId: null, actorSourceLabel: input.actor.sourceLabel };

    await activityLogRepository.append(
      {
        taskId: input.taskId,
        ...actor,
        operationType: input.operation,
        fieldName: input.operation === "field_changed" ? input.field : null,
        beforeValue: input.operation === "field_changed" ? (input.beforeValue ?? null) : null,
        afterValue: input.operation === "field_changed" ? (input.afterValue ?? null) : null,
      },
      tx,
    );
  },

  listDisplayable(taskId: string): Promise<ActivityLogEntry[]> {
    return activityLogRepository.listDisplayable(taskId);
  },
};
