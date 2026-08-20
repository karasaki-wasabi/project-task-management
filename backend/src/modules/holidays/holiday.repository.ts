import type { NonBusinessDay as PrismaNonBusinessDay } from "@prisma/client";
import { formatDateOnly, parseDateOnly } from "../../shared/date-only.js";
import { db } from "../../shared/db.js";
import { withWorkspaceScope, type VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import type { NonBusinessDay, RegisterNonBusinessDayInput } from "./holiday.types.js";

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
