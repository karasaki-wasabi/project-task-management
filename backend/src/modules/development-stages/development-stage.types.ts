// DevelopmentStage domain types (task 14.1, design.md "Backend/development-stages"
// Service Interface, Requirements 12.1, 12.2, 12.5).
// workspace-resource-scope task 6.1: domain includes workspaceId.
// task-status-model 2.1: kind is part of the domain type and list/getById responses.
export type DevelopmentStageKind = "normal" | "completed" | "cancelled";

export interface DevelopmentStage {
  id: string;
  name: string;
  order: number;
  kind: DevelopmentStageKind;
  workspaceId: string;
}
