import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import type { CaseTemplateApplyOperation } from "./caseTemplateApplyCandidates.js";

export type { Case } from "@prisma/client";
export type { CaseTemplateApplyOperation };

export interface CreateCaseInput {
  name: string;
  startDate?: Date;
  endDate?: Date;
  templateOperations?: CaseTemplateApplyOperation[];
  workspaceId: VerifiedWorkspaceId;
}

export interface UpdateCaseInput {
  name?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  isCompleted?: boolean;
  templateOperations?: CaseTemplateApplyOperation[];
}

export interface CaseProgress {
  requiredTotal: number;
  requiredCompleted: number;
  requiredIncomplete: number;
  isOverdueWithIncomplete: boolean;
}
