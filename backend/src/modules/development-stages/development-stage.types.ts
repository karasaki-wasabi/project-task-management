// DevelopmentStage domain types (task 14.1, design.md "Backend/development-stages"
// Service Interface, Requirements 12.1, 12.2, 12.5).
// workspace-resource-scope task 6.1: domain includes workspaceId.
export interface DevelopmentStage {
  id: string;
  name: string;
  order: number;
  workspaceId: string;
}
