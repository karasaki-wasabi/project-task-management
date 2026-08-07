# Brief: task-case-calendar

## Problem
既存の`/events`(タスク・イベント統合タイムライン)画面は、時系列の単純な縦リスト表示で、日付ごとの視認性・案件期間との関係性が乏しい。加えて、非タスクイベント(定例会議などの予定管理)機能は社内の別システムと役割が重複しており、このアプリで二重管理する意義が薄い。

タスクの期限日と案件の期間を「いつ何をすべきか」の観点で一覧できるカレンダー表示があれば、非タスクイベント機能なしでも本来の目的(タスク・案件単位での進捗追跡)を満たせる。

## Current State
- `frontend/pages/events/index.vue`: タスク(`scheduledDate`/`completedAt`)とイベント(`occursAt`)をクライアント側でマージした縦リスト表示。日付ごとのグルーピングなし。
- `backend/src/modules/events/`: Event用のroutes/service/repository/types一式。Prisma `Event`モデルが`Case`と関連(`case.events`)。
- `frontend/pages/index.vue`(ダッシュボード): 「直近のイベント」セクションで`api.listEvents()`を参照。
- `Task`モデルは既に`scheduledDate`(期限日相当、`@db.Date`)を持つ。新規フィールド不要。
- `Case`モデルは既に`startDate`/`endDate`を持つ。新規フィールド不要。
- `frontend/composables/useApiClient.ts`に`listEvents`/`createEvent`等のevents用メソッドが存在。

## Desired Outcome
- `/events`を、タスク期限日(点)と案件期間(バー)を月表示のカレンダー上に表示する新しい画面(`/calendar`等、パスは設計時に確定)に置き換える。
- 非タスクイベント機能(`backend/src/modules/events/`一式、Prisma `Event`モデル、`/events`ページ、`useApiClient`のevents関連メソッド)を完全に廃止する。
- ダッシュボードの「直近のイベント」セクションは、代替機能を設けず単純に削除する(ダッシュボード自体の改修は別途将来対応)。
- `product.md`のCore Capabilities記載(非タスクイベント)を実態に合わせて更新する。

## Approach
claude designのみで対話的にデザインを確定する(Google Stitchは使用しない — 過去に指示した制約を無視したデザインを出すことが多かったため不採用)。

- カレンダー本体: 月表示、各日付セルにその日が期限のタスクを点/チップとして表示、案件期間はセルをまたぐバーとして重ねて表示(ガントチャート寄りのカレンダーUI)。
- バックエンド: Event関連の実装(routes/service/repository/types、Prismaモデル、マイグレーション)を削除。既存のTask/Caseの一覧APIを流用してカレンダー用データを構成する(新規エンドポイントが必要かは設計時に判断)。
- DBスキーマ変更は、本番データがまだ存在しない前提のため、既存マイグレーションを整理してリセットする方針(手書きのDROP/ALTER SQLではなく)を踏襲する。

## Scope
- **In**:
  - 新しいカレンダー画面(タスク期限日を点、案件期間をバーとして月表示)の新規実装
  - `backend/src/modules/events/`一式の削除(routes/service/repository/types)
  - Prisma `Event`モデルおよび`Case.events`リレーションの削除、マイグレーション整理
  - `frontend/pages/events/index.vue`の削除
  - `frontend/composables/useApiClient.ts`のevents関連メソッド削除
  - ダッシュボード(`frontend/pages/index.vue`)の「直近のイベント」セクション削除(代替機能なし)
  - `product.md`のCore Capabilities記載の更新(非タスクイベントの記述を除去)
  - Google Stitch/claude designによる視覚デザインの確定、kanban/案件管理画面との視覚的統一
- **Out**:
  - ダッシュボードのそれ以外の改修(将来別対応)
  - タスク・案件のデータモデルへの新規フィールド追加(`scheduledDate`/`startDate`/`endDate`を流用)
  - 週表示など月表示以外のカレンダービュー切り替え
  - 非タスクイベント機能の代替(社内の別システムとの連携等)

## Boundary Candidates
- カレンダー表示ロジック(月グリッド生成、タスク期限日の配置、案件期間バーの配置) — 本スペックが所有
- events機能の削除(バックエンド・フロントエンド・ダッシュボード連携箇所) — 本スペックが所有
- タスク/案件の一覧取得ロジック自体(`useApiClient`のlistTasks/listCases) — 既存を流用するのみで変更しない

## Out of Boundary
- 認証・ログインユーザーの自動判定
- 週表示・日表示等の追加ビュー
- ダッシュボード全体のリニューアル
- 社内の別システムとの予定連携

## Upstream / Downstream
- **Upstream**: `task-delivery-management`(Requirement 4、既存`/events`画面・Event機能の実装元)、`case-management-ux`(DatePicker等の視覚言語、案件のstartDate/endDate)、`kanban-ux-redesign`(視覚パターン)
- **Downstream**: ダッシュボード改修(将来別スペック、本スペックでは「直近のイベント」セクション削除のみ対応)

## Existing Spec Touchpoints
- **Extends**: なし(新規スペック)。ただし`task-delivery-management`が定義したEvent関連の要件(Requirement 4)を本スペックで機能ごと廃止する
- **Adjacent**: `case-management-ux`(DatePicker等のコンポーネント資産を再利用)、`kanban-ux-redesign`(視覚パターンを参考)

## Constraints
- タスク・案件のデータモデルは`scheduledDate`/`startDate`/`endDate`を流用し、新規フィールドは追加しない
- DBスキーマ変更(Event削除)は、既存マイグレーション整理+リセットで対応する(本番データなしの前提)
- 視覚デザインはclaude designのみで確定させ(Google Stitchは不使用)、要件定義段階でポジティブな視覚言語(フォント・配色・カード構成)も明文化する([[feedback_design_to_impl_gap]]の再発防止策)
- `product.md`の更新は、実装完了後(または要件確定後)に反映する(`/kiro-steering`での同期を想定)
