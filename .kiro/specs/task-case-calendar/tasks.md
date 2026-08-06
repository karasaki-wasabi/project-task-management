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

- [x] 2.2 (P) ダッシュボードの「直近のイベント」セクション削除
  - `frontend/pages/index.vue`から`upcomingEvents`関連の状態・テンプレートを削除する
  - `frontend/e2e/dashboard.spec.ts`から`/events`へのイベント登録手順と「直近のイベント」見出し・空状態文言のアサーションを削除し、案件パネルの検証のみ残す
  - 観測可能な完了状態: ダッシュボード画面に非タスクイベントに関する表示セクションが存在せず、`dashboard.spec.ts`が`/events`に依存せずgreenになる
  - _Requirements: 8.1_
  - _Boundary: dashboard page, e2e_

- [ ] 3. カレンダー表示ロジック(CalendarHelpers)の実装
- [x] 3.1 (P) タスク期限日のグルーピング・省略表示・月移動ロジック実装
  - `scheduledDate`が設定されたタスクのみを日付キー(`YYYY-MM-DD`)でグルーピングする関数を実装する
  - 1日あたりの表示件数が閾値を超える場合に上位N件+overflow件数を算出する関数を実装する
  - 年またぎを含む月の前後移動を計算する関数を実装する
  - 各関数の単体テストを作成する
  - 観測可能な完了状態: `scheduledDate`未設定のタスクが除外され、同日に多数のタスクがある場合に省略件数が正しく算出されることを単体テストが検証する
  - _Requirements: 2.1, 2.2, 2.5, 4.1, 4.2, 4.3_
  - _Boundary: CalendarHelpers_

- [x] 3.2 案件期間のセグメント算出ロジック実装
  - 月グリッドの`DateCell[]`と`Case[]`から、日付ごとの案件セグメント(位置: point/start/middle/end/single)を算出する関数を実装する
  - 開始日・終了日の両方/片方のみ/いずれも未設定、の3パターンを単体テストで検証する
  - 表示中の月のセル範囲内でのみセグメント化されること(月をまたぐ案件の扱い)を単体テストで検証する
  - 観測可能な完了状態: 月をまたぐ案件期間が表示中の月のセルのみに正しくセグメント化されることを単体テストが確認する
  - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - _Depends: 3.1_
  - _Boundary: CalendarHelpers_

- [ ] 4. カレンダー画面(CalendarPage)の実装
- [x] 4.1 月グリッドとタスク期限日の表示
  - `DatePicker.helpers.ts`の`generateMonthGrid`を用いて週区切りの月グリッドを描画し、本日を強調表示する
  - タスクの期限日を該当日セルに表示し、`StatusBadge`/`PriorityBadge`で状態・優先度を区別する
  - 同日の表示件数が閾値を超える場合に省略表示(+N件)を反映する
  - 観測可能な完了状態: 期限日を持つタスクが該当日セルに表示され、期限日未設定のタスクは表示されないことをブラウザで確認できる
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5_
  - _Boundary: CalendarPage_

- [x] 4.2 案件期間バーの表示
  - `buildCaseSegments`の結果を用いて、日セル内に案件セグメントをstart/middle/end/single/pointに応じた角丸で描画し、視覚的に連続したバーに見せる
  - 案件の完了状態(`isCompleted`)を視覚的に区別する
  - 観測可能な完了状態: 開始日・終了日を持つ案件が期間バーとして連続して見え、片側のみ日付が設定された案件は点表示されることを確認できる
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - _Depends: 4.1_
  - _Boundary: CalendarPage_

- [x] 4.3 月移動と担当者絞り込みの統合
  - 前月/次月/今月の操作で`shiftMonth`を呼び出し、表示対象の年月を更新する
  - `AssigneeFilter`を組み込み、選択に応じて`listTasks({ assigneeUserId })`を再取得する(案件は常に全件表示のまま変更しない)
  - 観測可能な完了状態: 月移動操作で表示月が切り替わり、担当者選択でタスク表示のみが絞り込まれ案件バーの表示件数は変化しないことを確認できる
  - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 5.3_
  - _Depends: 4.1_
  - _Boundary: CalendarPage_

- [x] 4.4 タスク・案件詳細モーダルの統合
  - `TaskDetailModal`が要求する`users`/`stages`の一覧を`listUsers`/`listDevelopmentStages`で取得する(`kanban/index.vue`と同じ取得パターン)
  - タスクを選択すると`TaskDetailModal`を`taskId`/`users`/`stages`/`cases`のpropsで起動する
  - 案件を選択すると`CaseDetailModal`を`caseId`のpropsで起動する
  - 観測可能な完了状態: カレンダー上のタスク/案件を選択すると対応する詳細モーダルが開き、タイトル・状態・担当者等の詳細が表示される
  - _Requirements: 6.1, 6.2_
  - _Depends: 4.2_
  - _Boundary: CalendarPage_

- [ ] 5. 統合: ナビゲーションとsteeringの更新
- [x] 5.1 グローバルナビゲーションの更新
  - `frontend/app.vue`の`{ to: "/events", label: "タイムライン" }`を`{ to: "/calendar", label: "カレンダー" }`に置き換える
  - 観測可能な完了状態: グローバルナビゲーションから「タイムライン」の項目が消え、「カレンダー」から`/calendar`へ遷移できる
  - _Requirements: 7.2_
  - _Depends: 2.1, 4.4_

- [x] 5.2 product.mdのCore Capabilities更新
  - `.kiro/steering/product.md`から非タスクイベントの記述を除去し、カレンダー機能(タスク期限日・案件期間の月表示)の記述に更新する
  - 観測可能な完了状態: `product.md`に非タスクイベントの記載がなく、カレンダー機能の記載がある
  - _Requirements: 7.1_
  - _Depends: 1.2, 4.4_

- [ ] 6. 検証: E2Eテスト
- [x] 6.1 カレンダー画面の主要フローのE2E検証
  - 期限日を持つタスクと期間を持つ案件の表示、月移動、担当者絞り込み、タスク/案件詳細モーダルの起動をPlaywrightで検証する
  - 観測可能な完了状態: 一連の操作を自動検証する新規E2Eテストがgreenになる
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 6.1, 6.2_
  - _Depends: 5.1_

- [x] 6.2 非タスクイベント廃止の統合検証
  - 旧`/events`パス、グローバルナビゲーション、ダッシュボードのいずれにも非タスクイベント関連の導線が残っていないことをE2E/統合テストで確認する
  - 観測可能な完了状態: 非タスクイベント関連の導線がゼロであることを検証するテストがgreenになる
  - _Requirements: 7.1, 7.2, 8.1_
  - _Depends: 5.1, 5.2_

- [ ] 7. ビジュアルデザインの反映(claude design確定版)
- [x] 7.1 OverflowListPopupコンポーネントの新規実装
  - `frontend/components/shared/OverflowListPopup.vue`を新規作成する(`open`/`title`/`items`のprops、`select`/`close`のemits、claude design `詳細ポップアップ.dc.html`のレイアウトを実装)
  - 観測可能な完了状態: propsで渡した一覧が表示され、行クリックで`select(kind, id)`イベントが、背景クリック/閉じるボタンで`close`イベントが発火することを確認できる
  - _Requirements: 2.6, 3.6_
  - _Boundary: OverflowListPopup_

- [x] 7.2 CalendarHelpersの週次レーン割り当て・行予算・配色ロジックへの置き換え
  - 既存の`buildCaseSegments`(日セル単位のposition算出)を削除し、`buildWeekCaseLanes(weekDays, cases, maxLanes)`(区間スケジューリングによるレーン割り当て、overflow算出)に置き換える
  - `computeWeekRowBudget(laneCount, hasOverflow, totalRows, maxLanes)`と`colorIndexForCase(caseId)`を新規実装する
  - `buildTaskMarkersByDate`が返す`TaskMarkerView`に`stage`(開発段階ラベル)と`isOverdue`(期限超過フラグ)を含めるよう変更する(`status`/`priority`は削除)
  - `truncateDayMarkers`に`maxVisible`引数を追加する(固定定数から呼び出し側が渡す値に変更)
  - 既存の`buildCaseSegments`関連の単体テストを削除し、新関数群の単体テストに置き換える(レーンの重なり回避、overflow、片側日付のみの案件のopenStart/openEnd、週範囲外のクリップ、行予算の合計が常にtotalRowsになること、配色インデックスの安定性)
  - 観測可能な完了状態: 新しいテストスイートがgreenになり、`buildCaseSegments`という名前の関数がコードベースに存在しない
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3_
  - _Depends: 7.1_
  - _Boundary: CalendarHelpers_

- [x] 7.3 カレンダー画面のグリッド・タスク表示のビジュアル刷新
  - 週グリッドの列幅を日曜・土曜のみ狭める(claude design比率)。日曜・祝日セルは薄い赤背景+赤文字、土曜セルは薄い青背景+青文字、本日セルは黒丸の日付数字+薄い黄色背景にする(祝日は既存の`listHolidays`を取得して判定する)
  - タスク行の表示を、状態・優先度バッジから「タイトル+開発段階バッジ」に変更し、期限超過タスクは赤背景+赤枠+太字タイトルで強調する
  - `computeWeekRowBudget`を使って週ごとの案件レーン行数・タスク表示行数を動的に算出し、どの週も合計7行になるようにする
  - 観測可能な完了状態: 期限超過タスクが赤背景で強調表示され、週ごとにセルの高さが揃って見えることをブラウザで確認できる
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5_
  - _Depends: 7.2_
  - _Boundary: CalendarPage_

- [x] 7.4 案件バーの週次レーン描画への刷新
  - `buildWeekCaseLanes`の結果を使い、週行に絶対配置のオーバーレイを重ねてレーンごとに案件バーを描画する(`grid-column`のスパンで日付範囲を表現、開始日は左端を丸め、終了日は右端を丸める)
  - 案件ごとに`colorIndexForCase`から得た色を適用し、完了案件はパレット色を使わずスレート+打ち消し線にする
  - 開始日・終了日が未定の案件(`openStart`/`openEnd`)はグラデーションフェード+矢印(‹/›)で表現する
  - 観測可能な完了状態: 複数の案件が同じ週で重なる場合に別レーンに分かれて表示され、完了案件が打ち消し線付きのグレー表示になることをブラウザで確認できる
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - _Depends: 7.3_
  - _Boundary: CalendarPage_

- [x] 7.5 案件バー表示切替スイッチの実装
  - ヘッダーに「案件バーを表示」のトグルスイッチを追加し、操作で案件バー(レーン領域)の表示・非表示を切り替える(タスク表示行数は非表示時に7行まで広がる)
  - claude designのモックアップはボタン形式だったが、`CaseFormModal.vue`(`selection[task.id]?.selected`用・`isRequiredForCase`用)/`CaseDetailModal.vue`(`isCompleted`用)ですでに3箇所使われている既存のトグルスイッチの見た目(`role="switch"`、`toggle-switch`/`toggle-knob`クラス、`bg-primary-600`/`bg-slate-300`、`translate-x-4`/`translate-x-0.5`)をそのまま踏襲する。ラベルテキスト+スイッチの並びは`CaseDetailModal.vue`の「この案件を完了にする」と同じ構成にする
  - 観測可能な完了状態: トグル操作で案件バーが非表示になり、再度の操作で表示に戻ることをブラウザで確認できる。スイッチの見た目が案件登録・案件詳細画面の既存トグルと一致する
  - _Requirements: 9.1, 9.2_
  - _Depends: 7.4_
  - _Boundary: CalendarPage_

- [x] 7.6 「他N件」からOverflowListPopupを開く統合
  - タスクの日次省略表示・案件の週次省略表示(overflow)のクリックで、`OverflowListPopup`にその日/週の全項目を渡して開く
  - `OverflowListPopup`の`select`イベントを受けてポップアップを閉じ、対応する`TaskDetailModal`/`CaseDetailModal`を開く
  - 観測可能な完了状態: 「他N件」をクリックすると一覧ポップアップが開き、行を選択すると一覧が閉じて該当タスク/案件の詳細モーダルが開くことをブラウザで確認できる
  - _Requirements: 2.6, 3.6_
  - _Depends: 7.5_
  - _Boundary: CalendarPage_

- [ ] 7.7 E2Eテストのビジュアル刷新への追従
  - 既存の`frontend/e2e/calendar.spec.ts`を、新しいタスク行表示(開発段階バッジ+期限超過強調、状態/優先度バッジのアサーションを削除)に合わせて更新する
  - 案件が3件を超える週で「他N件」チップが表示され、選択して一覧ポップアップから案件詳細モーダルに遷移するシナリオを追加する
  - 「案件バー」表示切替ボタンで案件バーの表示・非表示が切り替わるシナリオを追加する
  - 観測可能な完了状態: 更新後の`calendar.spec.ts`が新デザインに対してgreenになる
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 9.1, 9.2_
  - _Depends: 7.6_

## Implementation Notes
- (task 1.1) `prisma migrate dev`はコンテナ内MySQLユーザーがシャドウDB作成権限を持たないため`P3014`で失敗する。代わりに`prisma migrate diff --from-empty --to-schema-datamodel`でSQLを生成し`prisma migrate reset --force`で適用する方式を使うこと。`non_business_days.date_active_key`のSTORED GENERATED COLUMN(Prismaスキーマ言語で表現不可、[[local-dev-pitfalls]]の落とし穴5)は自動生成されないため、再生成後のmigration.sqlに手動で追記が必要。
- (task 1.1 レビューで発見) `backend/src/prisma/schema.integration.test.ts`が`prisma.event.create`/`delete`を直接呼んでおり、tasks.mdの当初版はこの依存箇所を見落としていた。修正をtask 1.4のスコープに追加済み。
- (task 7.1) `docker compose run --rm --no-deps -T frontend`(実行ユーザー`node`)と、常駐している`frontend`サービス本体(`root`ユーザーで起動)が同じbind-mountの`frontend/.nuxt/`を共有しているため、どちらか一方が`nuxt dev`/`nuxt typecheck`等で`.nuxt`配下を再生成すると、もう一方の実行ユーザーから書き込めなくなり`tsconfig.json`の欠落等でテストが全滅することがある。復旧は`docker compose exec frontend npx nuxt prepare`(常駐サービス側=`root`所有者で再生成)で行うこと。
- (task 7.4、4ラウンドかかったレビュー往復から) 案件バーと「他N件」チップの重なり回避で、「チップ用に土曜列を予約しバー側を削る」戦略は、土曜のみのバーが幾何学的に消滅する派生バグを繰り返したため捨てた。バー座標は`hasOverflow`に依存せず実の`startDayIndex`/`endDayIndex`から算出する。
- (task 7.4 完了後の目視不具合修正) 上記の「チップをバーに重ねる」方式は見た目上の重なり・行数オーバーを残した。正しい行予算は research.md の `bandRows = min(lanes + dropped, maxLanes)` で、overflow があるときはバーレーンを `maxLanes - 1` に縮めチップ専用行を確保する(タスクの `truncateDayMarkers` も同様に「他N件」行を予算内に含める)。あわせて日セルへ `min-w-0 overflow-hidden`(土日列の内容によるトラック膨張でバーがずれないようにする)、`CASE_LANE_TOP_OFFSET_PX` にセルpaddingを含める(本日丸との重なり回避)、バー高さをレーン枠より低くする(縦隙間)を適用した。
- (省略表示ラベル) タスク・案件とも「他N件」表記に統一。表示キャップはタスク99(「他99+件」)、案件9(「他9+件」)。チップ幅は最長形が入るよう予約する(`formatTaskOverflowLabel` / `formatCaseOverflowLabel`)。
