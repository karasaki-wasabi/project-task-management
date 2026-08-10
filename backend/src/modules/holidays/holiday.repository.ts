// Persistence for NonBusinessDays (task 6.1, design.md "Backend/holidays").
// Soft-delete / audit-column behavior and the default `deletedAt: null`
// filter come from the shared `db` client (task 1.4); the
// `(workspace_id, date_active_key)` unique index (workspace-resource-scope
// task 1.5) enforces "only one active record per date per workspace" at the
// DB level, surfaced here as a Prisma P2002 error for the service layer.
// workspace-resource-scope task 5.1: all queries take VerifiedWorkspaceId and
// compose where via withWorkspaceScope.
import type { NonBusinessDay as PrismaNonBusinessDay } from "@prisma/client";
import { db } from "../../shared/db.js";
import { withWorkspaceScope, type VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import type { NonBusinessDay, RegisterNonBusinessDayInput } from "./holiday.types.js";

// "YYYY-MM-DD" <-> UTC-midnight Date, so date arithmetic never drifts a day
// due to local-timezone parsing.
export function parseDateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toDomain(row: PrismaNonBusinessDay): NonBusinessDay {
  return {
    id: row.id,
    date: formatDateOnly(row.date),
    label: row.label ?? undefined,
    source: row.source,
    workspaceId: row.workspaceId,
  };
}

export const holidayRepository = {
  async register(input: RegisterNonBusinessDayInput, source: "manual" | "external_api"): Promise<NonBusinessDay> {
    const row = await db.nonBusinessDay.create({
      data: {
        date: parseDateOnly(input.date),
        label: input.label,
        source,
        workspaceId: input.workspaceId,
      },
    });
    return toDomain(row);
  },

  findById(id: string, workspaceId: VerifiedWorkspaceId): Promise<PrismaNonBusinessDay | null> {
    return db.nonBusinessDay.findFirst({ where: withWorkspaceScope({ id }, workspaceId) });
  },

  remove(id: string, workspaceId: VerifiedWorkspaceId): Promise<PrismaNonBusinessDay> {
    return db.nonBusinessDay.delete({ where: withWorkspaceScope({ id }, workspaceId) });
  },

  async list(workspaceId: VerifiedWorkspaceId): Promise<NonBusinessDay[]> {
    const rows = await db.nonBusinessDay.findMany({
      where: withWorkspaceScope({}, workspaceId),
      orderBy: { date: "asc" },
    });
    return rows.map(toDomain);
  },

  async existsOnDate(date: string, workspaceId: VerifiedWorkspaceId): Promise<boolean> {
    const row = await db.nonBusinessDay.findFirst({
      where: withWorkspaceScope({ date: parseDateOnly(date) }, workspaceId),
    });
    return row !== null;
  },
};
