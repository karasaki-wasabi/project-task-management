# Brief: task-field-rename

## Problem

タスクの「メモ」「予定日」は UI・要件上の意味（詳細・終了予定日）と API／DB 名（`memo`・`scheduledDate`）がずれている。完了済み仕様は更新しない運用のため、旧名のまま放置すると操作ログ・詳細画面・他画面で二重語彙が長く残る。

## Current State

- API／Prisma: `Task.memo`、`Task.scheduledDate`
- UI の一部はすでに「詳細(メモ)」など過渡的表記
- 将来「開始予定日」を足すと `scheduledDate` の意味がさらに曖昧になる

## Desired Outcome

- `memo` → `detail`（表示名「詳細」）
- `scheduledDate` → `scheduledEndDate`（表示名「終了予定日」）
- 将来の開始予定日は `scheduledStartDate` とする命名枠を文書で固定する（本仕様ではカラム追加しない）
- アプリ全体の表示文言を「詳細」「終了予定日」に揃える（完了済み仕様文書は触らず、コードと本仕様のみ）

## Approach

完了済み仕様は更新せず、本仕様でマイグレーション・API・FE・繰り返しテンプレート等の参照を一括改名する。`task-detail` は本仕様完了後の語彙を前提にする。

## Scope

- In
  - `memo` → `detail` の Prisma／API／FE／テスト／シード改名
  - `scheduledDate` → `scheduledEndDate` の同様の改名
  - 画面文言の「詳細」「終了予定日」揃え（カンバン・カレンダー・一覧・繰り返し等）
  - 将来 `scheduledStartDate`（開始予定日）の命名予約の明文化
- Out
  - `scheduledStartDate` カラムの追加・UI
  - タスク詳細ページ・コメント・操作ログ（`task-detail`）
  - 完了済み `.kiro/specs/*/requirements.md` 等の歴史文書の書き換え

## Upstream / Downstream

- Upstream
  - なし（既存 tasks／recurrence コードが対象）
- Downstream
  - task-detail（改名後の `detail` / `scheduledEndDate` を前提にする）
