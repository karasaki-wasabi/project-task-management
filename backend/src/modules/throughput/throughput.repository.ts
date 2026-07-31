// Persistence for Throughput aggregation (task 7.1, design.md
// "Backend/throughput"). Requirement 9.5: soft-deleted tasks must still
// count toward past-period totals, so this deliberately bypasses the shared
// `db` client's default `deletedAt: null` filter (task 1.4) by including an
// explicit (but value-`undefined`, i.e. unconstrained) `deletedAt` key in
// the `where` clause — see `soft-delete.repository.ts`'s
// `withDefaultActiveFilter`, which only injects the default when the caller
// did not already mention `deletedAt`.
import { db } from "../../shared/db.js";

export const throughputRepository = {
  countCompleted(periodStart: Date, periodEnd: Date): Promise<number> {
    return db.task.count({
      where: {
        completedAt: { gte: periodStart, lte: periodEnd },
        deletedAt: undefined,
      },
    });
  },
};
