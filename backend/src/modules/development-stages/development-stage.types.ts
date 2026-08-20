export type DevelopmentStageKind = "normal" | "completed" | "cancelled";

export interface DevelopmentStage {
  id: string;
  name: string;
  order: number;
  kind: DevelopmentStageKind;
  workspaceId: string;
}
