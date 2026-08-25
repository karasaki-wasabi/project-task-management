/**
 * 負荷計測用規模シードの固定識別子・既定値。
 * デモ seed（SEED_*）とは別プレフィックス／別 UUID 帯を使い、clearAllTables 経路とは独立して参照する。
 *
 * 計測用パスワードは開発・計測 DB 専用。本番・共有ステージングへの投入禁止。
 */

/** 計測用ユーザー ID（SEED_USER_* と非衝突） */
export const SCALE_USER_ID = "99999999-9999-4999-8999-999999999901";

/** 負荷計測専用ワークスペース ID */
export const SCALE_WORKSPACE_ID = "99999999-9999-4999-8999-999999999902";

/** 計測ユーザーのワークスペースメンバー ID */
export const SCALE_MEMBER_ID = "99999999-9999-4999-8999-999999999903";

/** 端末・完了種別の開発段階 ID */
export const SCALE_STAGE_DONE_ID = "99999999-9999-4999-8999-999999999904";

/** 端末・中止種別の開発段階 ID */
export const SCALE_STAGE_CANCELLED_ID = "99999999-9999-4999-8999-999999999905";

/** SCALE_TASK_COUNT 未設定時の既定タスク件数（数千件帯） */
export const SCALE_DEFAULT_TASK_COUNT = 6000;

/** createMany 1 回あたりの最大行数（MySQL プレースホルダ上限回避） */
export const SCALE_CREATE_MANY_CHUNK_SIZE = 1000;

/** 計測用ログインメール（開発・計測 DB 専用） */
export const SCALE_LOGIN_EMAIL = "scale-load@example.com";

/**
 * 計測用ログインパスワード（開発・計測 DB 専用）。
 * 本番・共有ステージングへ投入しないこと。
 */
export const SCALE_LOGIN_PASSWORD = "scale-load@example.com";
