// Persistence for NonBusinessDays (task 6.1, design.md "Backend/holidays").
// Soft-delete / audit-column behavior and the default `deletedAt: null`
// filter come from the shared `db` client (task 1.4); the
// `non_business_days_date_active_key_key` unique index (task 1.3) enforces
// "only one active record per date" at the DB level, surfaced here as a
// Prisma P2002 error for the service layer to translate into 409.
import type { NonBusinessDay as PrismaNonBusinessDay } from "@prisma/client";
import { db } from "../../shared/db.js";
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
  };
}

export const holidayRepository = {
  async register(input: RegisterNonBusinessDayInput, source: "manual" | "external_api"): Promise<NonBusinessDay> {
    const row = await db.nonBusinessDay.create({
      data: { date: parseDateOnly(input.date), label: input.label, source },
    });
    return toDomain(row);
  },

  remove(id: string): Promise<PrismaNonBusinessDay> {
    return db.nonBusinessDay.delete({ where: { id } });
  },

  async list(): Promise<NonBusinessDay[]> {
    const rows = await db.nonBusinessDay.findMany({ orderBy: { date: "asc" } });
    return rows.map(toDomain);
  },

  async existsOnDate(date: string): Promise<boolean> {
    const row = await db.nonBusinessDay.findFirst({ where: { date: parseDateOnly(date) } });
    return row !== null;
  },
};
