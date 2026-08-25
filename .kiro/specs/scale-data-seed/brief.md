# Brief: scale-data-seed

## Problem

一覧 API の負荷を再現するには数千〜数十万件規模のデータが必要だが、現行の開発 seed と E2E fixture は少数件前提である。手作業や通常テスト経路では規模データを安定して用意できない。

## Current State

- `backend/src/prisma/seed.ts` / `seed-manual-data.ts` は固定の少数データ
- E2E はシナリオ単位の作成と開始時 TRUNCATE
- タスク一括作成の本番経路に規模投入用コマンドはない
- Vitest / E2E / 手動確認が同一 MySQL を共有する

## Desired Outcome

- 専用ワークスペースへ、一覧負荷に足る件数のタスク（および必要な案件等）を再現可能に投入できる
- 投入・掃除の手順が明確で、通常の開発 seed / E2E と混線しない
- `api-load-harness` と `list-api-performance` が同じデータ前提を参照できる

## Approach

Prisma の `createMany`（または同等の一括投入）による専用シード／CLI。件数や対象 WS は引数または環境変数で変えられるようにする。開発用 `db:seed` とは入口を分ける。

## Scope

- In
  - 規模データ投入コマンドと、対象エンティティの最小セット（少なくとも tasks、必要なら cases / stages）
  - 専用 WS（および計測用ユーザー）の作成または指定
  - 掃除方針（専用 WS 単位の削除、または明示コマンド）
- Out
  - k6 シナリオ本体
  - 一覧 API の性能改善そのもの
  - 本番／共有ステージングへの無秩序な投入

## Boundary Candidates

- 投入コマンドとパラメータ（件数・WS）
- データ形状（カレンダー用に `scheduledEndDate` 付きなど）
- 掃除／隔離ルール

## Out of Boundary

- 負荷シナリオの閾値設計
- フロント描画用のモックデータ
- 書き込み API の負荷データ生成（一括インポート機能の追加など）

## Upstream / Downstream

- Upstream
  - 既存 Prisma スキーマ、ワークスペース／認証モデル
- Downstream
  - `api-load-harness`（大規模シナリオ）
  - `list-api-performance`（改善前後の比較）

## Existing Spec Touchpoints

- Extends
  - なし（凍結済み機能スペックは更新しない）
- Adjacent
  - 開発 seed、E2E `clear-tables` / `reset-for-e2e`（衝突回避のみ）

## Constraints

- 共有 MySQL 前提でも、専用 WS に閉じる
- 投入はテストの `hardDelete` 規約に無理に合わせず、規模向けの掃除手段を別に持つ
- k6 ライセンス／実行環境は本スペックの対象外（`api-load-harness`）
