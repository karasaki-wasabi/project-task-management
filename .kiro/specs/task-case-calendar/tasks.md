# Implementation Plan

- [ ] 1. バックエンド: 非タスクイベント機能の廃止(データモデル・API)
- [x] 1.1 Prismaスキーマ更新とマイグレーションリセット
  - `Event`モデルと`Case.events`リレーションをスキーマから削除する
  - 既存の単一マイグレーション(`20260805030211_init_domain_schema`)を整理し、単一の初期マイグレーションとして再生成する(本番データなしの前提でのリセット)
  - 観測可能な完了状態: マイグレーション適用後のスキーマに`events`テーブルが存在せず、`tasks`/`cases`等の既存テーブルは無傷である
  - _Requirements: 7.1_

- [x] 1.2 backend eventsモジュールの削除とアプリ配線の除去
  - `backend/src/modules/events/`配下の全ファイル(routes/service/repository/types/test)を削除する
  - `backend/src/app.ts`から`eventRoutes`のimportと`app.register(eventRoutes)`を除去する
  - `backend/src/app.routes.test.ts`から`["/api/events", "GET"]`のルート確認を除去する
  - 観測可能な完了状態: `GET /api/events`が404を返し、`app.routes.test.ts`が非タスクイベント関連のエントリなしでgreenになる
  - _Requirements: 7.1, 7.2_

- [x] 1.3 案件削除処理からのEvent参照除去
  - `case.repository.ts`の`delete()`内にある`tx.event.updateMany(...)`呼び出しを削除し、コメントを「Task records」のみに修正する
  - `case.repository.test.ts`/`case.routes.test.ts`のEvent連動セットアップ・アサーション・`hardDelete("events", ...)`を削除し、タスクの`caseId`解除のみを検証するテストに整理する
  - 観測可能な完了状態: 案件削除時にタスクの`caseId`のみが解除されることを検証するテストがgreenで、Event関連のコードが残っていない
  - _Requirements: 7.1_

- [x] 1.4 ビジネスイベントログテスト・スキーマ統合テストの整理
  - `business-event-logging.integration.test.ts`から`eventsService`のimportと`"logs event.deleted with the deleted event's id"`テストケースを削除する
  - `backend/src/prisma/schema.integration.test.ts`(task 1.1レビューで発見: 全ドメインテーブルをラウンドトリップする単一テストが`prisma.event.create`/`prisma.event.delete`を呼んでいる)から、Event関連の作成・アサーション・削除呼び出しのみを削除する(他ドメインの検証はそのまま維持)
  - 観測可能な完了状態: 残りのログ種別(`case.created`等)のテストがgreenのまま`event.deleted`のテストが存在せず、`schema.integration.test.ts`がEvent削除後のスキーマに対してgreenになる
  - _Requirements: 7.1_

- [x] 1.5 機能横断統合テストからのEvent参照除去
  - `backend/src/validation.integration.test.ts`(task 1.4実装中に発見: フルバックエンドスイート実行で唯一残る失敗ファイル)の`"DELETE /api/cases/:id detaches linked Task/Event caseId to null end-to-end"`テストから、`POST /api/events`でのイベント作成・`GET /api/events`でのアサーション・`hardDelete("events", eventIds)`を削除し、タスクの`caseId`解除のみを検証するテストに整理する(タイトルも「Task caseId」のみに修正)
  - 同ファイルの`"a server-side exception logs the stack trace..."`テスト(Requirement 10.3, 10.5、ログ相関の検証が目的で`/api/events`固有の挙動を検証するものではない)が呼び出す`DELETE /api/events/${randomUUID()}`を、同じく`HttpError`をthrowして404を返す既存エンドポイント`DELETE /api/cases/${randomUUID()}`に置き換える。`accessLine`のパスプレフィックス判定(`/api/events/`)も`/api/cases/`に合わせて修正する
  - 観測可能な完了状態: `validation.integration.test.ts`がgreenになり、バックエンドの全テストスイート(`npx vitest run --no-file-parallelism`)がEvent関連の失敗なしで完走する
  - _Requirements: 7.1_

- [ ] 2. フロントエンド: 非タスクイベント機能の廃止
- [x] 2.1 (P) useApiClientからのイベント関連メソッド削除とイベント画面の削除
  - `AppEvent`インターフェース、`listEvents`/`createEvent`/`deleteEvent`メソッドを`useApiClient.ts`から削除する
  - `frontend/pages/events/index.vue`を削除する
  - `frontend/e2e/timeline.spec.ts`(`/events`画面を直接検証するE2E)を削除する
  - `frontend/e2e/assignee-filter.spec.ts`冒頭のコメント(「tasks/events lists」)を実態に合わせて修正する(機能自体への変更ではない軽微な追従)
  - 観測可能な完了状態: `/events`パスにページが存在せず、`useApiClient`の型定義に`AppEvent`等のイベント関連シンボルが残らず、`timeline.spec.ts`が存在しない
  - _Requirements: 7.1, 7.2_
  - _Boundary: useApiClient, events page, e2e_

- [ ] 2.2 (P) ダッシュボードの「直近のイベント」セクション削除
  - `frontend/pages/index.vue`から`upcomingEvents`関連の状態・テンプレートを削除する
  - `frontend/e2e/dashboard.spec.ts`から`/events`へのイベント登録手順と「直近のイベント」見出し・空状態文言のアサーションを削除し、案件パネルの検証のみ残す
  - 観測可能な完了状態: ダッシュボード画面に非タスクイベントに関する表示セクションが存在せず、`dashboard.spec.ts`が`/events`に依存せずgreenになる
  - _Requirements: 8.1_
  - _Boundary: dashboard page, e2e_

- [ ] 3. カレンダー表示ロジック(CalendarHelpers)の実装
- [ ] 3.1 (P) タスク期限日のグルーピング・省略表示・月移動ロジック実装
  - `scheduledDate`が設定されたタスクのみを日付キー(`YYYY-MM-DD`)でグルーピングする関数を実装する
  - 1日あたりの表示件数が閾値を超える場合に上位N件+overflow件数を算出する関数を実装する
  - 年またぎを含む月の前後移動を計算する関数を実装する
  - 各関数の単体テストを作成する
  - 観測可能な完了状態: `scheduledDate`未設定のタスクが除外され、同日に多数のタスクがある場合に省略件数が正しく算出されることを単体テストが検証する
  - _Requirements: 2.1, 2.2, 2.5, 4.1, 4.2, 4.3_
  - _Boundary: CalendarHelpers_

- [ ] 3.2 案件期間のセグメント算出ロジック実装
  - 月グリッドの`DateCell[]`と`Case[]`から、日付ごとの案件セグメント(位置: point/start/middle/end/single)を算出する関数を実装する
  - 開始日・終了日の両方/片方のみ/いずれも未設定、の3パターンを単体テストで検証する
  - 表示中の月のセル範囲内でのみセグメント化されること(月をまたぐ案件の扱い)を単体テストで検証する
  - 観測可能な完了状態: 月をまたぐ案件期間が表示中の月のセルのみに正しくセグメント化されることを単体テストが確認する
  - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - _Depends: 3.1_
  - _Boundary: CalendarHelpers_

- [ ] 4. カレンダー画面(CalendarPage)の実装
- [ ] 4.1 月グリッドとタスク期限日の表示
  - `DatePicker.helpers.ts`の`generateMonthGrid`を用いて週区切りの月グリッドを描画し、本日を強調表示する
  - タスクの期限日を該当日セルに表示し、`StatusBadge`/`PriorityBadge`で状態・優先度を区別する
  - 同日の表示件数が閾値を超える場合に省略表示(+N件)を反映する
  - 観測可能な完了状態: 期限日を持つタスクが該当日セルに表示され、期限日未設定のタスクは表示されないことをブラウザで確認できる
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5_
  - _Boundary: CalendarPage_

- [ ] 4.2 案件期間バーの表示
  - `buildCaseSegments`の結果を用いて、日セル内に案件セグメントをstart/middle/end/single/pointに応じた角丸で描画し、視覚的に連続したバーに見せる
  - 案件の完了状態(`isCompleted`)を視覚的に区別する
  - 観測可能な完了状態: 開始日・終了日を持つ案件が期間バーとして連続して見え、片側のみ日付が設定された案件は点表示されることを確認できる
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - _Depends: 4.1_
  - _Boundary: CalendarPage_

- [ ] 4.3 月移動と担当者絞り込みの統合
  - 前月/次月/今月の操作で`shiftMonth`を呼び出し、表示対象の年月を更新する
  - `AssigneeFilter`を組み込み、選択に応じて`listTasks({ assigneeUserId })`を再取得する(案件は常に全件表示のまま変更しない)
  - 観測可能な完了状態: 月移動操作で表示月が切り替わり、担当者選択でタスク表示のみが絞り込まれ案件バーの表示件数は変化しないことを確認できる
  - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 5.3_
  - _Depends: 4.1_
  - _Boundary: CalendarPage_

- [ ] 4.4 タスク・案件詳細モーダルの統合
  - `TaskDetailModal`が要求する`users`/`stages`の一覧を`listUsers`/`listDevelopmentStages`で取得する(`kanban/index.vue`と同じ取得パターン)
  - タスクを選択すると`TaskDetailModal`を`taskId`/`users`/`stages`/`cases`のpropsで起動する
  - 案件を選択すると`CaseDetailModal`を`caseId`のpropsで起動する
  - 観測可能な完了状態: カレンダー上のタスク/案件を選択すると対応する詳細モーダルが開き、タイトル・状態・担当者等の詳細が表示される
  - _Requirements: 6.1, 6.2_
  - _Depends: 4.2_
  - _Boundary: CalendarPage_

- [ ] 5. 統合: ナビゲーションとsteeringの更新
- [ ] 5.1 グローバルナビゲーションの更新
  - `frontend/app.vue`の`{ to: "/events", label: "タイムライン" }`を`{ to: "/calendar", label: "カレンダー" }`に置き換える
  - 観測可能な完了状態: グローバルナビゲーションから「タイムライン」の項目が消え、「カレンダー」から`/calendar`へ遷移できる
  - _Requirements: 7.2_
  - _Depends: 2.1, 4.4_

- [ ] 5.2 product.mdのCore Capabilities更新
  - `.kiro/steering/product.md`から非タスクイベントの記述を除去し、カレンダー機能(タスク期限日・案件期間の月表示)の記述に更新する
  - 観測可能な完了状態: `product.md`に非タスクイベントの記載がなく、カレンダー機能の記載がある
  - _Requirements: 7.1_
  - _Depends: 1.2, 4.4_

- [ ] 6. 検証: E2Eテスト
- [ ] 6.1 カレンダー画面の主要フローのE2E検証
  - 期限日を持つタスクと期間を持つ案件の表示、月移動、担当者絞り込み、タスク/案件詳細モーダルの起動をPlaywrightで検証する
  - 観測可能な完了状態: 一連の操作を自動検証する新規E2Eテストがgreenになる
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 6.1, 6.2_
  - _Depends: 5.1_

- [ ] 6.2 非タスクイベント廃止の統合検証
  - 旧`/events`パス、グローバルナビゲーション、ダッシュボードのいずれにも非タスクイベント関連の導線が残っていないことをE2E/統合テストで確認する
  - 観測可能な完了状態: 非タスクイベント関連の導線がゼロであることを検証するテストがgreenになる
  - _Requirements: 7.1, 7.2, 8.1_
  - _Depends: 5.1, 5.2_

## Implementation Notes
- (task 1.1) `prisma migrate dev`はコンテナ内MySQLユーザーがシャドウDB作成権限を持たないため`P3014`で失敗する。代わりに`prisma migrate diff --from-empty --to-schema-datamodel`でSQLを生成し`prisma migrate reset --force`で適用する方式を使うこと。`non_business_days.date_active_key`のSTORED GENERATED COLUMN(Prismaスキーマ言語で表現不可、[[local-dev-pitfalls]]の落とし穴5)は自動生成されないため、再生成後のmigration.sqlに手動で追記が必要。
- (task 1.1 レビューで発見) `backend/src/prisma/schema.integration.test.ts`が`prisma.event.create`/`delete`を直接呼んでおり、tasks.mdの当初版はこの依存箇所を見落としていた。修正をtask 1.4のスコープに追加済み。
