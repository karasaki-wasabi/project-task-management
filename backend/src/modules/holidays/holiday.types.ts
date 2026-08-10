// NonBusinessDay domain types (task 6.1, design.md "Backend/holidays"
// Service Interface). Dates are plain "YYYY-MM-DD" strings at the service
// boundary (not Date objects) so business-day arithmetic (task 6.1) and API
// responses match design.md's literal `date: string` contract; conversion
// to/from Prisma's `DateTime @db.Date` column happens only in the
// repository.
// workspace-resource-scope task 5.1: RegisterNonBusinessDayInput requires
// VerifiedWorkspaceId (clients cannot set it via body).
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";

export interface NonBusinessDay {
  id: string;
  date: string;
  label?: string;
  source: "manual" | "external_api";
  workspaceId: string;
}

export interface RegisterNonBusinessDayInput {
  date: string;
  label?: string;
  /** From request.currentWorkspaceId only (VerifiedWorkspaceId). */
  workspaceId: VerifiedWorkspaceId;
}
