// Case domain types (task 3.1, design.md "Backend/cases" CaseService Service
// Interface; renamed/extended from the former deliveries/delivery.types.ts,
// task 4.1). Task 4: CaseCreateInput/CaseUpdateInput gain templateOperations
// (design.md CaseService). workspace-resource-scope task 2.1: CreateCaseInput
// requires VerifiedWorkspaceId (clients cannot set it via body).
// No custom TaskError-style union here: same pattern as DeliveriesService/
// UsersService — the service layer signals failure by throwing, not `Result<T, E>`.
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import type { CaseTemplateApplyOperation } from "./caseTemplateApplyCandidates.js";

export type { Case } from "@prisma/client";
export type { CaseTemplateApplyOperation };

export interface CreateCaseInput {
  name: string;
  startDate?: Date;
  endDate?: Date;
  /** omit = full candidates; [] = no apply; non-subset = 400 (design.md) */
  templateOperations?: CaseTemplateApplyOperation[];
  /** From request.currentWorkspaceId only (VerifiedWorkspaceId). */
  workspaceId: VerifiedWorkspaceId;
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
