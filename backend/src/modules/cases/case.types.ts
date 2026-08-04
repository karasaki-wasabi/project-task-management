// Case domain types (task 3.1, design.md "Backend/cases" CaseService Service
// Interface; renamed/extended from the former deliveries/delivery.types.ts,
// task 4.1). No custom TaskError-style union here: same pattern as
// DeliveriesService/UsersService — the service layer signals failure by
// throwing, not `Result<T, E>`.
export type { Case } from "@prisma/client";

export interface CreateCaseInput {
  name: string;
  startDate?: Date;
  endDate: Date;
}

export interface UpdateCaseInput {
  name?: string;
  startDate?: Date | null;
  endDate?: Date;
  isCompleted?: boolean;
}

export interface CaseProgress {
  requiredTotal: number;
  requiredCompleted: number;
  requiredIncomplete: number;
  isOverdueWithIncomplete: boolean;
}
