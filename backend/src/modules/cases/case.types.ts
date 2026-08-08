// Case domain types (task 3.1, design.md "Backend/cases" CaseService Service
// Interface; renamed/extended from the former deliveries/delivery.types.ts,
// task 4.1). Task 4: CaseCreateInput/CaseUpdateInput gain templateOperations
// (design.md CaseService). No custom TaskError-style union here: same pattern
// as DeliveriesService/UsersService — the service layer signals failure by
// throwing, not `Result<T, E>`.
import type { CaseTemplateApplyOperation } from "./caseTemplateApplyCandidates.js";

export type { Case } from "@prisma/client";
export type { CaseTemplateApplyOperation };

export interface CreateCaseInput {
  name: string;
  startDate?: Date;
  endDate?: Date;
  /** omit = full candidates; [] = no apply; non-subset = 400 (design.md) */
  templateOperations?: CaseTemplateApplyOperation[];
}

export interface UpdateCaseInput {
  name?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  isCompleted?: boolean;
  /** omit = full candidates; [] = no apply; non-subset = 400 (design.md) */
  templateOperations?: CaseTemplateApplyOperation[];
}

export interface CaseProgress {
  requiredTotal: number;
  requiredCompleted: number;
  requiredIncomplete: number;
  isOverdueWithIncomplete: boolean;
}
