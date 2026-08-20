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
  workspaceId: VerifiedWorkspaceId;
}
