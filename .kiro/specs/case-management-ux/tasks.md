# Implementation Plan

- [ ] 1. Foundation: データベーススキーマの改称・拡張
- [x] 1.1 schema.prismaの更新(Delivery→Case改称・フィールド追加)
  - `Delivery`モデルを`Case`に改称し、`startDate`(nullable)・`isCompleted`(既定false)を追加する
  - `Task.deliveryId`→`caseId`、`Task.isRequiredForDelivery`→`isRequiredForCase`にリネームする
  - `Event.deliveryId`→`caseId`にリネームする
  - `RecurringTaskTemplate.boundDeliveryId`→`boundCaseId`、`deliveryOffsetDays`→`caseOffsetDays`にリネームする
  - `RecurrenceKind`列挙値`delivery_relative`→`case_relative`にリネームする
  - 観測可能な完了状態: `npx prisma validate`が通り、生成されたPrisma Clientの型に`Case`/`caseId`/`isRequiredForCase`/`case_relative`が現れる
  - _Requirements: 1.1, 2.2, 2.5, 5.1, 5.4_

- [x] 1.2 既存マイグレーションの削除とスキーマの再生成・適用
  - `backend/src/prisma/migrations/`配下の既存マイグレーション(`20260731051829_init_domain_schema`, `20260731141826_add_development_stages`)を削除する
  - 開発DB(Docker Compose `mysql`)のデータをリセットする
  - `docker compose exec backend npx prisma migrate dev --name init_domain_schema`でリネーム後のスキーマから単一の初期マイグレーションを生成・適用する
  - 観測可能な完了状態: マイグレーションディレクトリが1つだけ存在し、実DBに`cases`テーブルと`tasks.case_id`/`tasks.is_required_for_case`列が反映されている
  - _Requirements: 1.1, 2.2, 2.5, 5.1, 5.4_

- [ ] 2. Foundation: 依存モジュール(tasks/events/recurrence)の呼称・フィールド名追従
- [x] 2.1 (P) tasksモジュールのフィールド名リネーム
  - `task.types.ts`/`task.repository.ts`/`task.routes.ts`/`task.service.ts`の`deliveryId`→`caseId`、`isRequiredForDelivery`→`isRequiredForCase`を一括変更する(強制false化・単独指定エラー等の既存ロジックは変更しない)
  - 既存のtask関連ユニット/統合テストのフィールド名を更新する
  - 観測可能な完了状態: 既存のtask関連テストが新フィールド名のまま全てgreenになる
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - _Boundary: TasksService_

- [x] 2.2 (P) eventsモジュールのフィールド名リネーム
  - `event.types.ts`/`event.repository.ts`/`event.routes.ts`/`event.service.ts`の`deliveryId`→`caseId`を変更する
  - 既存のevent関連テストのフィールド名を更新する
  - 観測可能な完了状態: 既存のevent関連テストが新フィールド名のまま全てgreenになる
  - _Requirements: 1.1_
  - _Boundary: EventsService_

- [x] 2.3 recurrenceモジュールのメソッド名・参照フィールド追従
  - `recurrence.service.ts`: `onDeliveryCreated`→`onCaseCreated`、`onDeliveryDueDateChanged`→`onCaseEndDateChanged`にリネームし、引数型を`Case`に変更、参照フィールドを`delivery.dueDate`→`case.endDate`に変更する。`tryCreateInstance`呼び出しの`deliveryId`引数を`caseId`に追従させる(2.1のリネーム後のフィールド名を使用)
  - `recurrence.types.ts`: `RegisterTemplateInput.boundDeliveryId`→`boundCaseId`、`deliveryOffsetDays`→`caseOffsetDays`にリネームする
  - `recurrence.routes.ts`: Zodスキーマの上記フィールド名と、`kind`列挙値`"delivery_relative"`→`"case_relative"`を変更する
  - `recurrence.repository.ts`: `create()`のフィールド名を追従させ、`findIncompleteInstance(templateId, deliveryId)`の引数名を`caseId`に変更し`Task.caseId`(2.1でリネーム済み)で問い合わせる
  - 既存のrecurrence関連テストのメソッド名・フィールド名・列挙値を更新する
  - 観測可能な完了状態: recurrence統合テストで、`endDate`から同じオフセット日数で生成日が算出されることが確認できる(既存の`dueDate`基準テストと同じ結果になる)。`npm run build`(バックエンド)がrecurrenceモジュールの型エラーなしで通る
  - _Depends: 2.1_
  - _Boundary: RecurrenceService_

- [ ] 3. Core: バックエンド `cases` モジュールの実装
- [x] 3.1 cases: 型・リポジトリ層の実装(旧deliveryの改称・拡張)
  - `backend/src/modules/deliveries/`を`cases/`へ改称し、`case.types.ts`(`Case`, `CreateCaseInput`, `UpdateCaseInput`, `CaseProgress`)と`case.repository.ts`を実装する
  - `name`/`startDate`(nullable)/`endDate`/`isCompleted`のCRUDを実装し、削除時は既存同様`Task`/`Event`の`caseId`をnullにdetachしてから削除する
  - 観測可能な完了状態: リポジトリ層のユニット/統合テストで、作成した`Case`が`startDate`なしでも登録できること、削除後に紐づくタスクの`caseId`が`null`になることを確認できる
  - _Requirements: 2.2, 2.5, 5.1, 8.1, 8.2_
  - _Boundary: CaseRepository_

- [x] 3.2 cases: Service層の実装(作成・汎用更新・進捗算出・削除・recurrence連携)
  - `case.service.ts`に作成(`isCompleted`は常にfalse固定)・汎用更新(`name`/`startDate`/`endDate`/`isCompleted`を独立して更新可能)・削除を実装する
  - `startDate > endDate`の場合に作成・更新の両方で`badRequest`を返すバリデーションを実装する
  - `getProgress`で`isOverdueWithIncomplete = !isCompleted && endDate < now && requiredIncomplete > 0`を算出する
  - 作成時は`recurrenceService.onCaseCreated`、`endDate`変更時は`onCaseEndDateChanged`を既存同様の素の`await`で呼び出す
  - 業務イベント名を`case.created`/`case.deleted`に変更する
  - 観測可能な完了状態: ユニットテストで、`isCompleted=true`のとき終了日を過ぎていても`isOverdueWithIncomplete=false`になることを確認できる
  - _Depends: 2.3, 3.1_
  - _Requirements: 2.3, 2.4, 2.5, 5.3, 5.4, 6.1, 6.2, 8.1, 8.2_
  - _Boundary: CaseService_

- [x] 3.3 cases: ルート実装とアプリへの登録
  - `case.routes.ts`に`POST/PATCH/GET/DELETE /api/cases`と`GET /api/cases/:id/progress`をZodバリデーション付きで実装する
  - `app.ts`の`deliveryRoutes`登録を`caseRoutes`に置き換える
  - 観測可能な完了状態: 実HTTP経路(`app.inject`)で`POST /api/cases`が201を返し、`startDate > endDate`を指定した`PATCH`が400を返すことを統合テストで確認できる
  - _Depends: 3.2_
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.1, 5.2, 5.3, 6.3, 7.1, 8.1_

- [x] 4. (P) Core: 未割当タスク取得フィルタの追加
  - `task.routes.ts`のクエリスキーマに`unassignedCase: z.literal("true").optional()`を追加し、`task.repository.ts`の`list()`で指定時に`caseId IS NULL`で絞り込む
  - 観測可能な完了状態: `GET /api/tasks?unassignedCase=true`が案件未設定のタスクのみを返すことを統合テストで確認できる
  - _Depends: 2.1_
  - _Requirements: 3.1_
  - _Boundary: TasksService_

- [x] 5. Core: フロントエンドAPIクライアントの改称・拡張
  - `useApiClient.ts`の`Delivery`/`DeliveryProgress`型と`listDeliveries/createDelivery/updateDeliveryDueDate/getDeliveryProgress/deleteDelivery`を`Case`/`CaseProgress`型と`listCases/createCase/updateCase(汎用)/getCaseProgress/deleteCase`に改称・拡張する
  - `Task`型の`deliveryId`/`isRequiredForDelivery`を`caseId`/`isRequiredForCase`に改称し、`listTasks`に`unassignedCase`フィルタ引数を追加する
  - `AppEvent.deliveryId`→`caseId`、`RecurringTaskTemplate`/`RegisterTemplateInput`の`boundDeliveryId`→`boundCaseId`・`deliveryOffsetDays`→`caseOffsetDays`、`RecurrenceKind`の`"delivery_relative"`→`"case_relative"`も改称する(この共有クライアント以外に、タスク8.3/8.4が依存するこれらの型を改称する担当箇所がないため、本タスクの範囲に含める)
  - 観測可能な完了状態: フロントエンドの型チェック(`nuxi typecheck`または`vue-tsc`)を実行すると、`useApiClient.ts`自体にはエラーが出ず、`createCase`が`{ name, startDate?, endDate }`で201のレスポンス型を持つことを確認できる(他の`.vue`ファイルの改称待ちによるエラーは後続タスクで解消される想定内のもの)
  - _Depends: 3.3, 4_
  - _Requirements: 1.1, 1.2_

- [ ] 6. Core: 案件一覧・登録・編集ポップアップの実装
- [x] 6.1 (P) 案件一覧ページの実装
  - `frontend/pages/deliveries/index.vue`を`frontend/pages/cases/index.vue`へ改称し、名称検索・ステータス絞り込みチップ(すべて/進行中/完了/期限超過、件数付き)・案件0件/検索ヒットなしの空状態を実装する
  - `listCases`+`getCaseProgress`の一括取得結果からチップの件数を算出する
  - 観測可能な完了状態: ブラウザで`/cases`を開くと案件一覧・進捗・期限超過バッジが表示され、ステータスチップで「期限超過」を選ぶと該当案件のみに絞り込まれる
  - _Depends: 5_
  - _Requirements: 1.1, 7.1, 7.2, 7.3_
  - _Boundary: cases index page_

- [x] 6.2 (P) 案件登録ポップアップ(CaseFormModal)の実装
  - `frontend/components/cases/CaseFormModal.vue`を新規実装し、`shared/Modal.vue`をベースに名称・開始日・終了日の入力と、未割当タスク(`listTasks({ unassignedCase: true })`)のカード型リスト+選択トグル+必須トグル(選択時のみ活性化)を実装する
  - タスク名での絞り込み検索と「すべて選択」操作、割り当て可能なタスクが0件の場合の表示を実装する
  - `startDate > endDate`の場合はクライアント側でエラー表示し送信しないようにする
  - 送信時は`createCase`後、選択タスク分の`updateTask`を逐次実行し、失敗したタスクがあってもモーダルを閉じずエラーを表示する
  - 観測可能な完了状態: 未割当タスクを2件選択(1件を必須指定)して登録すると、案件が作成され両タスクの`caseId`が設定され、必須指定した1件のみ`isRequiredForCase=true`になることをブラウザまたはE2Eで確認できる
  - _Depends: 5_
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 9.2_
  - _Boundary: CaseFormModal_

- [x] 6.3 (P) 案件詳細/編集ポップアップ(CaseDetailModal)の実装
  - `frontend/components/cases/CaseDetailModal.vue`を新規実装し、`TaskDetailModal`と同じ閲覧→編集→保存→閲覧のフローで、閲覧モードに開始日・終了日・完了状態・必須タスク進捗・関連タスクの簡易リストを表示する
  - 編集モードに名称・開始日・終了日の入力と「この案件を完了にする」トグル(必須タスクの完了状況と無関係に切替可能)を実装する
  - 閲覧モードのactionsスロットに、`TaskDetailModal`と同様のインライン確認ステップを持つ削除操作を実装し、成功時に`deleted`イベントを発行する
  - 観測可能な完了状態: 案件の名称・終了日を変更して保存すると閲覧モードに戻り変更後の値が表示され、完了トグルをONにすると終了日超過でも期限超過表示が消えることを確認できる。削除確認後にモーダルが閉じ一覧から当該案件が消える
  - _Depends: 5_
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.3, 7.2, 8.1, 8.2, 9.1, 9.2_
  - _Boundary: CaseDetailModal_

- [x] 7. (P) Core: カンバンのタスク詳細ポップアップへの案件セクション追加
  - `frontend/components/kanban/TaskDetailModal.vue`の編集モードに、案件セレクト(未設定を含む、`listCases()`の結果を選択肢とする)+必須トグル(案件未選択時は無効化)のセクションを追加する
  - 案件セレクトを未設定に変更した際、必須トグルの表示状態を即時falseにリセットする
  - 閲覧モードに「案件」表示行を1行追加する(未設定時は「—」)
  - `save()`に`caseId`/`isRequiredForCase`を既存の`updateTask`呼び出しへ追加する(別APIコールは増やさない)
  - 観測可能な完了状態: 編集モードで案件を選択し必須トグルをONにして保存すると、再度開いたときに案件名と必須表示が反映されている。案件選択を未設定に戻して保存すると必須表示が「—」になる
  - _Depends: 5_
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 9.2_
  - _Boundary: TaskDetailModal.vue_

- [ ] 8. Integration: 一覧への組み込みと周辺画面の表示文言追従
- [x] 8.1 案件一覧ページとポップアップの結合
  - `cases/index.vue`に登録ボタン→`CaseFormModal`、行クリック→`CaseDetailModal`の開閉を実装し、登録・保存・削除後に一覧とステータスチップの件数を再読込する
  - 観測可能な完了状態: 一覧から登録・編集・削除の一連の操作をポップアップ経由で完結でき、操作後に一覧の表示が最新の状態に更新される
  - _Depends: 6.1, 6.2, 6.3_
  - _Requirements: 3.2, 5.2_

- [x] 8.2 (P) ダッシュボードの表示文言・API呼び出し追従
  - `frontend/pages/index.vue`の期限超過パネルを`listCases`/`getCaseProgress`呼び出しに置き換え、表示文言を「案件」に統一する
  - 観測可能な完了状態: ダッシュボードの期限超過パネルに、完了マーク済みの案件が表示されず、未完了かつ終了日超過の案件のみ表示される
  - _Depends: 5_
  - _Requirements: 1.2, 6.3_
  - _Boundary: dashboard page_

- [x] 8.3 (P) タスク管理一覧画面の表示ラベル追従
  - `frontend/pages/tasks/index.vue`の案件関連の表示ラベル・パラメータ名(`deliveryId`→`caseId`、`isRequiredForDelivery`→`isRequiredForCase`)を「案件」表記に更新する(UI構造・フォームレイアウトは変更しない)
  - 観測可能な完了状態: `/tasks`画面のクエリパラメータ・必須タスクチェックボックスの表示条件・作成フォームの送信内容が`caseId`/`isRequiredForCase`に統一されている(このページに案件選択ドロップダウン自体は元々存在しないことをレビューで確認済み)
  - _Depends: 5_
  - _Requirements: 1.1, 1.2_
  - _Boundary: tasks page_

- [x] 8.4 (P) 繰り返し設定画面の表示ラベル・フィールド名追従
  - `frontend/pages/recurrence/index.vue`の案件連動テンプレートの表示ラベル・フィールド名(`deliveryOffsetDays`→`caseOffsetDays`、`kind`の`"delivery_relative"`→`"case_relative"`とそのラベル)を「案件」表記・新フィールド名に更新する
  - 観測可能な完了状態: `/recurrence`画面のテンプレート作成フォームで種別を選ぶと「案件連動」と表示され、オフセット日数の入力・既存テンプレート一覧の種別表示が「案件」表記に統一されている(`boundCaseId`はcase_relativeテンプレートには設定不可というバックエンドの業務ルールにより、このページに案件選択ドロップダウン自体は元々存在しないことをレビューで確認済み)
  - _Depends: 5, 2.3_
  - _Requirements: 1.1, 1.2_
  - _Boundary: recurrence page_

- [ ] 9. Validation: バックエンド統合テスト・E2E・回帰確認
- [x] 9.1 バックエンド統合テストの追加・更新
  - `POST /api/cases`(タスク未選択でも201)、`PATCH /api/cases/:id`(name/startDate/endDate/isCompletedの独立更新)、`DELETE /api/cases/:id`後の`Task`/`Event`のdetach、recurrenceの`endDate`基準生成/再計算を実HTTP経路で検証する
  - 観測可能な完了状態: 上記シナリオを検証する統合テストが全てgreenになる
  - _Depends: 3.3, 2.3_
  - _Requirements: 2.5, 6.1, 6.2, 8.1, 8.2_

- [x] 9.2 E2E: 案件登録・検索・ステータスチップ・期限超過表示
  - `frontend/e2e/cases.spec.ts`を新規作成し、未割当タスク2件を選択(1件を必須指定)して登録→一覧に進捗が反映→名称検索→ステータスチップでの絞り込み→期限超過表示の一連をPlaywrightで検証する
  - 観測可能な完了状態: 上記シナリオがPlaywrightで成功する
  - _Depends: 8.1_
  - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 6.1, 6.3, 7.1, 7.2, 7.3_

- [x] 9.3 E2E: カンバンのタスク詳細ポップアップからの案件関連付け
  - 既存のカンバンE2E(または新規spec)に、タスク詳細ポップアップの編集モードで案件を選択→必須トグルON→保存→再表示確認、および案件選択を未設定に戻す操作をPlaywrightで検証する
  - 観測可能な完了状態: 上記シナリオがPlaywrightで成功する
  - _Depends: 7_
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 9.4 既存E2Eの表記回帰確認・更新
  - `frontend/e2e/dashboard.spec.ts`と`frontend/e2e/kanban-tray-reassign.spec.ts`内の「納品」表記・セレクタを「案件」に更新し、既存シナリオが変わらず成功することを確認する
  - 観測可能な完了状態: 両E2Eファイルが「案件」表記のまま成功する
  - _Depends: 8.2, 7_
  - _Requirements: 1.1, 1.2_

- [ ] 10. Foundation: 開始日・終了日のnullable化
- [x] 10.1 schema.prismaの更新(Case.endDateをnullableに変更)
  - `Case.endDate`を必須から任意(nullable)に変更する
  - 観測可能な完了状態: `npx prisma validate`が通り、生成されたPrisma Clientの`Case`型で`endDate`が`Date | null`になる
  - _Requirements: 2.4, 5.3_

- [x] 10.2 既存マイグレーションの削除とスキーマの再生成・適用
  - `backend/src/prisma/migrations/`配下の既存マイグレーション(改称作業で生成済みの`<timestamp>_init_domain_schema`)を削除し、開発DBのデータをリセットした上で、`endDate`のnullable化を反映した単一の初期マイグレーションを再生成・適用する
  - `non_business_days.date_active_key`のSTORED GENERATED COLUMN+UNIQUE INDEXをmigration.sqlへ再度手動追記し、`prisma migrate deploy`で適用する(タスク1.2のImplementation Notes参照)
  - 観測可能な完了状態: `prisma migrate status`が最新であることを示し、実DBの`cases.end_date`列がNULL許容になっており、`non_business_days`の生成列+UNIQUE INDEXが維持されている
  - _Depends: 10.1_
  - _Requirements: 2.4, 5.3_

- [ ] 11. Core: DatePickerコンポーネントの実装
- [x] 11.1 DatePicker.helpers.tsの実装(月グリッド生成・クイック選択肢計算)
  - 月カレンダーグリッド生成(指定年月の日付配列、前後月の埋め日を含むかは実装時に決定)と、クイック選択肢(今日・明日・1週間後・月末・来月1日)の日付計算を純関数として実装する
  - 観測可能な完了状態: 各関数の単体テストで、基準日を固定した際の月グリッド・クイック選択肢の日付が期待通りになることを確認できる
  - _Requirements: 10.2_
  - _Boundary: DatePicker.helpers.ts_

- [x] 11.2 DatePicker.vueの実装
  - `frontend/components/shared/DatePicker.vue`を新規実装し、claude design 4a確定版(選択中日付ヘッダー・クイック選択肢・月カレンダー・クリア/キャンセル/決定のフッター)をポップオーバー形式で実装する
  - `v-model`(`string`、ISO `YYYY-MM-DD`、空文字は未設定)を持ち、「決定」まで入力欄の表示を変えず、「キャンセル」「背景クリック」では変更を破棄し、「クリア」は即座に空文字をemitする
  - 観測可能な完了状態: ブラウザでピッカーを開き、クイック選択肢やカレンダー日付をクリックしても入力欄の表示が変わらないこと、「決定」を押すと入力欄に反映されること、「キャンセル」では変更が反映されないこと、「クリア」で入力欄が空になることを確認できる
  - _Depends: 11.1_
  - _Requirements: 10.1, 10.3, 10.4, 10.5, 10.6_
  - _Boundary: DatePicker.vue_

- [ ] 12. Core: TimePicker/DateTimePickerコンポーネントの実装(適用先画面なし)
- [ ] 12.1 (P) TimePicker.vueの実装
  - `frontend/components/shared/TimePicker.vue`を新規実装し、claude design 4c確定版(時・分の2ホイール+AM/PM列、現在時刻ショートカット、キャンセル/決定)を実装する
  - `v-model`(`string`、`HH:mm`形式、空文字は未設定)を持ち、DatePickerと同じ決定/キャンセル規約に従う
  - 観測可能な完了状態: ブラウザでピッカーを開き、時・分のホイール操作と「現在時刻」ショートカットが選択中表示に反映され、「決定」まで入力欄が変わらないことを確認できる
  - _Depends: 11.2_
  - _Boundary: TimePicker.vue_

- [ ] 12.2 DateTimePicker.vueの実装
  - `frontend/components/shared/DateTimePicker.vue`を新規実装し、claude design 4d/4e確定版(日付/時刻タブ切り替え)を、`DatePicker`のカレンダー表示と`TimePicker`のホイール表示を内部で流用して実装する
  - `v-model`(`string`、ISO 8601日時、空文字は未設定)を持つ
  - 観測可能な完了状態: ブラウザでピッカーを開き、日付タブ・時刻タブの切り替えができ、上部の表示で選択中の日付・時刻が常に確認できることを確認できる
  - _Depends: 12.1_
  - _Boundary: DateTimePicker.vue_

- [ ] 13. Core: CaseServiceの開始日・終了日任意化対応
- [ ] 13.1 endDateを必須から任意へ変更するデータ契約の更新
  - `backend/src/modules/cases/case.types.ts`: `CreateCaseInput.endDate`を`Date`(必須)から`Date | undefined`(任意)に、`UpdateCaseInput.endDate`を`Date | undefined`から`Date | null | undefined`(明示的な`null`で未設定化)に変更する
  - `backend/src/modules/cases/case.repository.ts`: `update()`の引数型を`endDate: Date | null`を受け付けられるように変更する
  - `backend/src/modules/cases/case.routes.ts`: `createCaseBodySchema.endDate`に`.optional()`を追加し、`updateCaseBodySchema.endDate`に`.nullable()`を追加する
  - `frontend/composables/useApiClient.ts`: `Case.endDate`を`string | null`に、`createCase`の入力型の`endDate`を任意に、`updateCase`の入力型の`endDate`を`string | null`に変更する
  - 観測可能な完了状態: `npx tsc --noEmit`(バックエンド)・`npm run typecheck`(フロントエンド)がこれらの型変更に起因するエラーなく通り、`POST /api/cases`を`endDate`省略で呼ぶと201が返る
  - _Requirements: 2.4, 5.3_
  - _Boundary: case.types.ts, case.repository.ts, case.routes.ts, useApiClient.ts_

- [ ] 13.2 開始日・終了日のバリデーション変更
  - `case.service.ts`の`create`/`update`のバリデーションを、開始日・終了日の両方が指定されている場合のみ`startDate > endDate`を検証するように変更する(片方のみ、または両方未指定の場合は検証をスキップする)
  - 観測可能な完了状態: 単体テストで、終了日のみ指定した登録・開始日のみ指定した登録・両方未指定の登録がいずれも成功し、両方指定かつ順序が逆の場合のみ400になることを確認できる
  - _Depends: 13.1_
  - _Requirements: 2.4, 2.5, 5.3, 5.4_
  - _Boundary: CaseService_

- [ ] 13.3 期限超過判定の終了日null対応
  - `getProgress`の`isOverdueWithIncomplete`算出式に`endDate !== null`の条件を追加し、終了日未設定の案件を常に非該当とする
  - 観測可能な完了状態: 単体テストで、終了日未設定の案件が(必須タスク未完了・未完了状態であっても)`isOverdueWithIncomplete=false`になることを確認できる
  - _Depends: 13.1_
  - _Requirements: 6.3_
  - _Boundary: CaseService_

- [ ] 13.4 recurrence呼び出しの終了日状態遷移分岐
  - `case.service.ts`の`create`/`update`で、終了日の状態遷移に応じて`recurrenceService`の呼び出しを分岐する: 作成時に終了日未設定なら呼ばない、更新で「未設定→値あり」なら`onCaseCreated`相当の新規生成を呼ぶ、「値あり→別の値」なら`onCaseEndDateChanged`を呼ぶ、「値あり→未設定」または終了日を更新しない場合は呼ばない
  - 観測可能な完了状態: 単体テストで、終了日未設定での作成時にrecurrenceが呼ばれないこと、後から終了日を設定すると案件連動テンプレートのタスクが新規生成されることを確認できる
  - _Depends: 13.1_
  - _Requirements: 2.4, 5.3_
  - _Boundary: CaseService_

- [ ] 14. Integration: フォームへのDatePicker組み込みと必須制約の撤廃
- [ ] 14.1 (P) CaseFormModalの開始日・終了日をDatePickerに置き換え
  - `CaseFormModal.vue`の開始日・終了日の入力を`shared/DatePicker.vue`に置き換え、両方未入力での登録を許可し、両方入力時のみ`startDate > endDate`のクライアント側検証を行う
  - `CaseFormModal.helpers.ts`の`validateCaseForm`から「`endDate`が空文字ならエラー」という現行の必須チェックを削除する(現状はendDate必須の前提で実装されている)
  - 登録ボタンの`:disabled`条件から`!endDate`を削除する(現状は終了日未入力だと登録ボタンが常に無効化される)
  - 観測可能な完了状態: ブラウザで案件登録ポップアップを開き、開始日・終了日をいずれも入力せずに登録できること、DatePickerでの日付選択・クリアが正しく反映されることを確認できる
  - _Depends: 11.2, 13.2, 13.4_
  - _Requirements: 2.4, 2.5, 10.1_
  - _Boundary: CaseFormModal.vue_

- [ ] 14.2 (P) CaseDetailModalの開始日・終了日をDatePickerに置き換え
  - `CaseDetailModal.vue`の編集モードの開始日・終了日入力を`shared/DatePicker.vue`に置き換え、既存値をクリアして未設定に戻せるようにする
  - `CaseDetailModal.helpers.ts`の`validateCaseEditForm`から「`endDate`が空文字ならエラー」という現行の必須チェックを削除する
  - 保存ボタンの`:disabled`条件から`!endDate`を削除し、閲覧モードの終了日表示(`caseEntity.endDate.slice(0, 10)`、`endDate`が`null`だと例外になる)を開始日表示と同様に未設定時「未設定」を表示するよう修正する
  - 観測可能な完了状態: ブラウザで既存案件の編集モードを開き、開始日または終了日をクリアして保存すると、閲覧モードで「未設定」表示になることを確認できる
  - _Depends: 11.2, 13.2, 13.4_
  - _Requirements: 5.3, 5.4, 10.1_
  - _Boundary: CaseDetailModal.vue_

- [ ] 15. Validation: バックエンド統合テスト・単体テスト・E2Eの追加
- [ ] 15.1 バックエンド統合テストの追加
  - `POST /api/cases`で開始日・終了日を省略しても201になること、`PATCH /api/cases/:id`で`startDate`/`endDate`を`null`指定で未設定に戻せること、終了日未設定での作成時に案件連動タスクが生成されないこと、後から終了日を設定すると生成されることを実HTTP経路で検証する
  - 観測可能な完了状態: 上記シナリオを検証する統合テストが全てgreenになる
  - _Depends: 13.3, 13.4_
  - _Requirements: 2.4, 2.5, 5.3, 6.3_

- [ ] 15.2 E2E: 開始日・終了日未入力での登録とDatePicker操作
  - `frontend/e2e/cases.spec.ts`に、開始日・終了日をいずれも入力せずに案件を登録できるシナリオと、DatePickerでのクイック選択肢・カレンダー選択・決定・キャンセル・クリアの一連の操作が入力欄に正しく反映される/されないことを検証するシナリオを追加する
  - 観測可能な完了状態: 上記シナリオがPlaywrightで成功する
  - _Depends: 14.1_
  - _Requirements: 2.4, 10.1, 10.3, 10.4, 10.5, 10.6_

## Implementation Notes
- タスク1.2: `non_business_days.date_active_key`はPrismaが`Unsupported("date")?`としてしか表現できないSTORED GENERATED COLUMN(+UNIQUE INDEX)であるため、`prisma migrate dev`をこのテーブルに対して再実行すると、生成列/UNIQUE INDEXをdriftとして検知し、それらをDROPする追従マイグレーションを自動生成してしまう(実際に1回発生し、生成された不要マイグレーションを削除して再対応した)。このハンドエディット済みマイグレーション(`20260804102439_init_domain_schema`)を今後再適用する際は`prisma migrate dev`ではなく`prisma migrate deploy`(diffなしでファイルをそのまま適用)を使うこと。マイグレーションSQL自体にも同内容の警告コメントを追加済み。
- タスク9.4: 開発DBがE2E実行間でリセットされないため、繰り返しテスト実行により`cases`/`users`等にテストデータが蓄積し続けている。これが2つの実害を生んでいる: (1) `frontend/pages/index.vue`の期限超過パネルは`overdueCases.value.slice(0, DISPLAY_LIMIT)`(DISPLAY_LIMIT=5)で**ソートなしに**先頭5件のみ表示するため、蓄積した古い期限超過案件に埋もれて新規作成した案件がパネルの表示範囲に入らないことがある(件数自体を示す「すべての案件を見る(N件)」リンクの`overdueCases.length`は非キャップなので、件数ベースの検証や`/cases`の検索ボックス経由での確認であれば影響を受けない)。(2) `kanban-tray-reassign.spec.ts`・`kanban-backlog.spec.ts`のように、蓄積したユーザー数/タスク数を前提にした検証が他のE2E実行と合わせて実行すると不安定になるテストが既に存在する(いずれも本スペックの変更前から存在する既知の課題で、今回は対応していない)。将来的にE2Eスイート全体の安定性を上げる場合は、(a) 期限超過パネルに`upcomingEvents`同様のソートを入れる、(b) E2E実行前に開発DBをリセットする仕組みを導入する、のいずれかが有効な対策になる。
