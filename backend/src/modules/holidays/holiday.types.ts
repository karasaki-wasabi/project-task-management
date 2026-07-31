// NonBusinessDay domain types (task 6.1, design.md "Backend/holidays"
// Service Interface). Dates are plain "YYYY-MM-DD" strings at the service
// boundary (not Date objects) so business-day arithmetic (task 6.1) and API
// responses match design.md's literal `date: string` contract; conversion
// to/from Prisma's `DateTime @db.Date` column happens only in the
// repository.
export interface NonBusinessDay {
  id: string;
  date: string;
  label?: string;
  source: "manual" | "external_api";
}

export interface RegisterNonBusinessDayInput {
  date: string;
  label?: string;
}
