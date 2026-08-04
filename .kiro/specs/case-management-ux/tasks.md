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

- [ ] 8.2 (P) ダッシュボードの表示文言・API呼び出し追従
  - `frontend/pages/index.vue`の期限超過パネルを`listCases`/`getCaseProgress`呼び出しに置き換え、表示文言を「案件」に統一する
  - 観測可能な完了状態: ダッシュボードの期限超過パネルに、完了マーク済みの案件が表示されず、未完了かつ終了日超過の案件のみ表示される
  - _Depends: 5_
  - _Requirements: 1.2, 6.3_
  - _Boundary: dashboard page_

- [ ] 8.3 (P) タスク管理一覧画面の表示ラベル追従
  - `frontend/pages/tasks/index.vue`の案件関連の表示ラベル・パラメータ名(`deliveryId`→`caseId`)を「案件」表記に更新する(UI構造・フォームレイアウトは変更しない)
  - 観測可能な完了状態: `/tasks`画面の案件フィルタ・案件選択ドロップダウンの表示が「案件」に統一されている
  - _Depends: 5_
  - _Requirements: 1.1, 1.2_
  - _Boundary: tasks page_

- [ ] 8.4 (P) 繰り返し設定画面の表示ラベル・フィールド名追従
  - `frontend/pages/recurrence/index.vue`の案件連動テンプレートの表示ラベル・フィールド名(`boundDeliveryId`等)を「案件」表記・新フィールド名に更新する
  - 観測可能な完了状態: `/recurrence`画面のテンプレート作成フォームで「案件連動」種別を選ぶと、紐づける案件の選択肢が「案件」表記で表示される
  - _Depends: 5, 2.3_
  - _Requirements: 1.1, 1.2_
  - _Boundary: recurrence page_

- [ ] 9. Validation: バックエンド統合テスト・E2E・回帰確認
- [ ] 9.1 バックエンド統合テストの追加・更新
  - `POST /api/cases`(タスク未選択でも201)、`PATCH /api/cases/:id`(name/startDate/endDate/isCompletedの独立更新)、`DELETE /api/cases/:id`後の`Task`/`Event`のdetach、recurrenceの`endDate`基準生成/再計算を実HTTP経路で検証する
  - 観測可能な完了状態: 上記シナリオを検証する統合テストが全てgreenになる
  - _Depends: 3.3, 2.3_
  - _Requirements: 2.5, 6.1, 6.2, 8.1, 8.2_

- [ ] 9.2 E2E: 案件登録・検索・ステータスチップ・期限超過表示
  - `frontend/e2e/cases.spec.ts`を新規作成し、未割当タスク2件を選択(1件を必須指定)して登録→一覧に進捗が反映→名称検索→ステータスチップでの絞り込み→期限超過表示の一連をPlaywrightで検証する
  - 観測可能な完了状態: 上記シナリオがPlaywrightで成功する
  - _Depends: 8.1_
  - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 6.1, 6.3, 7.1, 7.2, 7.3_

- [ ] 9.3 E2E: カンバンのタスク詳細ポップアップからの案件関連付け
  - 既存のカンバンE2E(または新規spec)に、タスク詳細ポップアップの編集モードで案件を選択→必須トグルON→保存→再表示確認、および案件選択を未設定に戻す操作をPlaywrightで検証する
  - 観測可能な完了状態: 上記シナリオがPlaywrightで成功する
  - _Depends: 7_
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [ ] 9.4 既存E2Eの表記回帰確認・更新
  - `frontend/e2e/dashboard.spec.ts`と`frontend/e2e/kanban-tray-reassign.spec.ts`内の「納品」表記・セレクタを「案件」に更新し、既存シナリオが変わらず成功することを確認する
  - 観測可能な完了状態: 両E2Eファイルが「案件」表記のまま成功する
  - _Depends: 8.2, 7_
  - _Requirements: 1.1, 1.2_

## Implementation Notes
- タスク1.2: `non_business_days.date_active_key`はPrismaが`Unsupported("date")?`としてしか表現できないSTORED GENERATED COLUMN(+UNIQUE INDEX)であるため、`prisma migrate dev`をこのテーブルに対して再実行すると、生成列/UNIQUE INDEXをdriftとして検知し、それらをDROPする追従マイグレーションを自動生成してしまう(実際に1回発生し、生成された不要マイグレーションを削除して再対応した)。このハンドエディット済みマイグレーション(`20260804102439_init_domain_schema`)を今後再適用する際は`prisma migrate dev`ではなく`prisma migrate deploy`(diffなしでファイルをそのまま適用)を使うこと。マイグレーションSQL自体にも同内容の警告コメントを追加済み。
