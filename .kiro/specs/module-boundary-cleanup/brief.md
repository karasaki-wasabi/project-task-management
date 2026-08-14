# Brief: module-boundary-cleanup

## Problem

バックエンドはドメインモジュール構成で、他モジュール依存は service 公開インターフェース経由のみと steering（`structure.md`）で定めている。実際には他モジュールの repository 直呼びや、他ドメインの Prisma モデルを service／repository から直接触る箇所があり、境界が形骸化している。その結果、ドメイン判定の二重化・公開契約変更時の追従漏れ・TX 内一貫性の場当たり対応が起きやすい。

## Current State

- 正しい依存例もある（`tasks`→`developmentStagesService`／`workspaceService`、`cases`→`recurrenceService`、`recurrence`→`holidaysService`／`tasksService` など）
- 明確な違反（調査時点・本番コード）
  - `tasks/task.service.ts` が `cases/case.repository` を直接 import（`caseId` 存在検証。TX 内で同一 `DbClient` を使うため）
  - `recurrence/recurrence.service.ts` が `holidays/holiday.repository` の日付ヘルパー（`formatDateOnly`／`parseDateOnly`）を import
  - 他ドメイン Prisma 直触り: tasks→`developmentStage`、recurrence→`task`／`case`、cases repository→`task`、development-stages repository→`task`、throughput repository→`task`、workspaces service→`developmentStage` 初期投入
- `DbClient`（soft-delete 拡張クライアント／TX）を service に渡すパターンは既にあり（`tasksService.create|delete(..., client)`、`runActivityWrite` の再利用など）
- `caseService` に公開 `findById` は無く、TX 対応 API 不足が repository 直呼びの動機になっている
- 素朴に `tasks`→`caseService` へ置換すると `cases → recurrence → tasks → cases` の循環依存になる（現状 madge 上はサイクル無し）

## Desired Outcome

- 他モジュールの repository／他ドメイン Prisma への直アクセスが本番コードから無くなり、依存は公開した手続き（通常の service、または明示した読み取り／整合専用面。必要なら `client?: DbClient`）経由のみになる
- 循環依存を導入せずに境界を修復できる
- 整合副作用（案件削除時のタスク切り離し、必須タスク進捗カウント、スループット集計、WS 作成時のターミナル段階投入）の所有モジュールと公開 API が明示される
- 後続仕様が同じルールで迷わず依存を追加できる

## Approach

Approach A（厳格一掃）。既存の `DbClient` 伝播を延長し、クロスモジュール参照をすべて所有側 service の公開メソッドへ寄せる。

- 参照専用ファサードまたは read／write 分離などで、`tasks`↔`cases`↔`recurrence` の循環を避ける
- 日付ヘルパーは `shared/` または holidays 公開 API へ移す
- delete 系の自前 `$transaction` は、外側 TX に参加できるよう `client?: DbClient` を足す（ネスト／二重 TX を避ける）
- 進捗カウント・throughput・WS 初期段階は「誰が所有するか」を design で決め、そのモジュールの service／公開 API に集約する

## Scope

- **In**
  - 横断調査で特定したクロスモジュール repository import と他ドメイン Prisma 直触りの解消（調査表で約 10 箇所・呼び出し側 6 モジュール相当）
  - TX 参加可能な service 公開メソッドの追加／拡張
  - 循環依存を避ける参照境界（ファサード等）の導入
  - 日付ユーティリティの適切な置き場への移動
  - 必要なら `structure.md` への TX 伝播・循環回避の短い追記
  - 境界修復を担保する既存テストの更新と不足分の追加
- **Out**
  - フロントエンド変更（API 契約の破壊的変更は行わない前提）
  - 新機能（velocity-dashboard 等）や HTTP パス／ワークスペースヘッダー設計の変更
  - モジュール分割の大規模再編や新規ドメインの切り出し（本仕様は既存境界の修復に限定）
  - ESLint による import 禁止の強制（後続でも可。本仕様の必須成果にはしない）

## Boundary Candidates

- クロスモジュール公開 API と `DbClient` 伝播規約
- 循環回避のための参照専用境界（cases 読み取りファサード等）
- 共有ユーティリティ（日付のみ等）の置き場
- 整合・集計・ブートストラップ副作用の所有モジュール定義

## Out of Boundary

- UI／Nuxt 側のリファクタ
- REST の workspace を URL に載せる変更やクエリ名 `q` の改名（ideas の別項目）
- velocity-dashboard のダッシュボード機能そのもの（集計の所有境界を tasks 側 API に寄せる場合でも、画面・要件は別仕様）
- import 禁止ルールの lint 自動化（任意の後続）

## Upstream / Downstream

- **Upstream**: 既存ドメインモジュール一式（tasks／cases／recurrence／holidays／development-stages／throughput／workspaces）。`structure.md` の依存ルール
- **Downstream**: 今後のバックエンド仕様全般が同じ依存規約に従う。velocity-dashboard は tasks 集計 API の有無に影響され得るが、本仕様の完了を必須依存にはしない

## Existing Spec Touchpoints

- **Extends**: なし（アーキテクチャ修復の独立仕様。完了済み仕様文書は更新しない）
- **Adjacent**: `workspace-resource-scope`（所属判定は既に service 経由）、`task-detail`／`task-status-model`（触るが文書は凍結）、`velocity-dashboard`（throughput／完了集計の所有境界に隣接）

## Constraints

- スタック・レイヤリングは現行どおり（Fastify／Prisma／`routes → service → repository`）
- 既存の `DbClient`／soft-delete 拡張パターンを壊さない
- `cases → recurrence → tasks → cases` 型の循環依存を導入しない
- API の対外契約（パス・レスポンス形）は原則維持。内部公開 IF の追加に留める
- 画面変更は伴わないため claude design ゲート対象外
- 凍結済み spec 文書は更新せず、コードと必要なら steering のみ更新する
