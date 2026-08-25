/**
 * 規模データ投入・掃除の入出力型。
 * デモ seed / clearAllTables 経路とは分離した契約。
 */

export interface ScaleSeedOptions {
  taskCount: number;
}

export interface ScaleSeedResult {
  workspaceId: string;
  userId: string;
  userEmail: string;
  taskCount: number;
  scheduledEndDateCount: number;
}

export interface ScaleCleanupResult {
  workspaceId: string;
  removed: boolean;
}

export interface ScaleDataOps {
  runScaleSeed(options: ScaleSeedOptions): Promise<ScaleSeedResult>;
  cleanupScaleWorkspace(): Promise<ScaleCleanupResult>;
}
