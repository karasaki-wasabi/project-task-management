# Implementation Plan

- [ ] 1. Foundation: 基盤・データモデル・共通インフラ
- [x] 1.1 Docker開発環境の基盤構築
  - `docker-compose.yml`にbackend/frontend/mysqlの3サービスを定義する
  - mysqlサービス(MySQL 8.x)にnamed volumeを設定しデータを永続化する
  - backend/frontend用のマルチステージDockerfile(devステージ: bind mount + ホットリロード)の雛形を作成する
  - `docker compose up`でmysqlコンテナが起動し接続確認できることを確認できる状態にする
  - _Requirements: 10.6_

- [x] 1.2 バックエンドプロジェクトセットアップ
  - Node.js 24 + TypeScript + Fastify + Zod + Prismaの初期構成を作成する(Prismaの`datasource provider`は`mysql`)
  - `app.ts`にFastifyインスタンスを生成し、環境変数(`DATABASE_URL`、`LOG_LEVEL`)を読み込む
  - backendのDockerfile devステージを完成させ、`docker compose up backend`でコンテナが起動することを確認する
  - `GET /health`エンドポイントがコンテナ経由で200を返すことを確認できる状態にする
  - _Requirements: 10.6_

- [x] 1.3 全ドメインのPrismaスキーマ定義
  - `tasks` / `deliveries` / `events` / `recurring_task_templates` / `non_business_days` / `users`のテーブルをdesign.mdの物理データモデル通りに定義する
  - 全テーブルに`created_at`・`updated_at`・`deleted_at`を付与する
  - `non_business_days`に生成カラム`date_active_key`(`deleted_at`がnullのときのみ`date`と同値、それ以外はnull)を定義し、そのカラムにUNIQUE INDEXを設定する(論理削除済みレコードを除いた日付一意性をMySQLで実現する。design.md参照)
  - `(source_template_id, scheduled_date)`相当の一意制約を定義する
  - `docker compose exec backend npx prisma migrate dev`でマイグレーションを実行し、全テーブルがDBに作成されることを確認する
  - _Requirements: 9.1, 9.3_

- [x] 1.4 共通ソフトデリートRepository規約の実装
  - レコード更新時に`updated_at`を自動更新する共通処理を実装する
  - 削除操作を物理DELETEではなく`deleted_at`のUPDATEとして実行する共通関数を実装する
  - 一覧・詳細取得系の既定クエリに`deleted_at IS NULL`を自動付与する共通クエリビルダーを実装する
  - 更新→`updated_at`が変わること、削除→`deleted_at`が設定され物理行が残ることをテストで確認できる状態にする
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 1.5 ログ基盤の実装
  - Pinoロガーを`shared/logger.ts`に構成し、Fastifyの`reqId`をアクセスログ・エラーログ・業務イベントログ共通の相関キーとして使う
  - `onResponse`フックでアクセスログ(メソッド・パス・ステータスコード・応答時間)を出力する
  - `logBusinessEvent`/`logError`ヘルパー関数を実装し、`setErrorHandler`でグローバル例外を捕捉してスタックトレース+`requestId`を記録してから適切なHTTPステータスを返す
  - `LOG_LEVEL`環境変数でログレベル(debug/info/warn/error)を切り替えられるようにする
  - 意図的に例外を発生させた際、同一`requestId`でアクセスログとエラーログが出力されることを確認できる状態にする
  - _Requirements: 10.1, 10.3, 10.5, 10.6_

- [x] 1.6 (P) フロントエンドプロジェクトセットアップ
  - Nuxt 4.x(Vue 3) + TypeScriptプロジェクトを`ssr: false`の静的SPA構成で初期化する
  - `composables/useApiClient.ts`にバックエンドAPIクライアントの雛形を作成する
  - frontendのDockerfile devステージを完成させ、`docker compose up frontend`でコンテナが起動し初期画面が表示されることを確認できる状態にする
  - _Requirements: 10.6_
  - _Boundary: Frontend scaffolding_

- [ ] 2. Users: 担当ユーザー管理
- [x] 2.1 (P) UsersServiceの実装
  - ユーザーの登録・一覧・論理削除を行うServiceとRepositoryを実装する
  - 認証・ログイン機能を持たせず、登録済みユーザーの一覧からの選択のみをサポートする
  - `POST /api/users`・`GET /api/users`・`DELETE /api/users/:id`エンドポイントを実装する
  - 削除したユーザーが一覧APIのレスポンスから除外されることを確認できる状態にする
  - _Requirements: 7.1, 7.3, 9.1, 9.2, 9.3, 9.4_
  - _Boundary: UsersService_

- [ ] 3. Tasks: タスク管理
- [x] 3.1 (P) TasksServiceコア機能の実装
  - タスクの登録・一覧・状態更新(未着手/進行中/完了/保留)・優先度(高/中/低)・自由記述メモ(1件)・論理削除を実装する
  - `deliveryId`・`assigneeUserId`によるフィルタ付き一覧取得を実装する
  - 保留状態のタスクが一覧から消えないこと、削除したタスクが一覧APIから除外されることを確認できる状態にする
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 7.2, 9.1, 9.2, 9.3, 9.4_
  - _Boundary: TasksService_

- [x] 3.2 TasksServiceの階層化と分割
  - タスクへの子タスク追加による多階層の親子関係を実装する
  - 既存タスクを複数タスクに分割する機能を実装し、分割後の各タスクに元タスクの納品紐付け・優先度を引き継がせる
  - 親タスクに未完了の子タスクが存在する状態での完了操作を拒否し、理由を返すことを確認できる状態にする
  - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - _Boundary: TasksService_

- [ ] 4. Deliveries: 納品管理
- [x] 4.1 (P) DeliveriesServiceの実装
  - 納品(名前・納品期日)の登録・納品日更新・一覧・論理削除を実装する(この時点ではRecurrenceServiceへの通知は行わない)
  - タスクを納品に紐付け、必須フラグを設定できるようにする
  - 必須タスクの完了数・未完了数から進捗を算出するAPIを実装し、複数納品が同時に並行して存在できることを確認できる状態にする
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 9.1, 9.2, 9.3, 9.4_
  - _Boundary: DeliveriesService_

- [ ] 5. Events: 非タスクイベント
- [x] 5.1 (P) EventsServiceの実装
  - イベント(名前・日時)の登録・一覧・論理削除を実装する
  - `assigneeUserId`によるフィルタ付き一覧取得を実装し、イベントに完了/未完了などのタスク用ステータスを持たせないことを確認できる状態にする
  - _Requirements: 4.1, 4.2, 4.3, 7.2, 9.1, 9.2, 9.3, 9.4_
  - _Boundary: EventsService_

- [ ] 6. Holidays: 非営業日マスタ
- [x] 6.1 (P) HolidaysServiceの手動管理機能
  - 非営業日(日付・ラベル)の手動登録・削除(論理削除)・一覧を実装する
  - 指定日が非営業日かどうかの判定、および直後/直前の非営業日でない日を返す関数を実装する
  - 非営業日が連続するケースで該当しなくなるまで日付を進める/遡ることをテストで確認できる状態にする
  - _Requirements: 8.1, 8.2, 9.1, 9.2, 9.3, 9.4_
  - _Boundary: HolidaysService_

- [x] 6.2 HolidaysServiceの外部祝日API手動同期機能
  - ユーザー操作(手動トリガー)でのみ外部祝日APIを呼び出し、取得した祝日を非営業日マスタへ反映する機能を実装する
  - 既存の日付と重複する取得結果をスキップし、新規分のみ`source=external_api`で追加する
  - `POST /api/holidays/sync`エンドポイントを実装し、外部API障害時に既存マスタを変更せず502を返すことを確認できる状態にする
  - _Requirements: 8.8, 8.9_
  - _Boundary: HolidaysService_

- [ ] 7. Throughput: 消化数集計
- [x] 7.1 (P) ThroughputServiceの実装
  - 指定期間(週/月)ごとの完了タスク数集計を実装する
  - 直近4期間の単純移動平均によるフォーキャストを算出し、有効な過去期間が2未満の場合は`null`を返すロジックを実装する
  - `GET /api/throughput`エンドポイントを実装し、論理削除されたタスクの有無が過去期間の集計値に影響しないことを確認できる状態にする
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 9.5_
  - _Boundary: ThroughputService_

- [ ] 8. Client Errors: フロントエンドエラー受信
- [x] 8.1 (P) ClientErrorsServiceの実装
  - フロントエンドから送信されたエラー情報(メッセージ・スタックトレース・発生ページURL)を受け取るServiceを実装する
  - `POST /api/client-errors`エンドポイントを実装し、受信内容がLogging Infrastructure経由でバックエンドと同じ形式のエラーログとして出力されることを確認できる状態にする
  - _Requirements: 10.4_
  - _Boundary: ClientErrorsService_

- [ ] 9. Recurrence: 繰り返しタスク生成ロジック
- [x] 9.1 RecurrenceServiceのテンプレート管理
  - 固定間隔(`fixed_interval`)・納品連動(`delivery_relative`)のテンプレート登録、停止(`isActive=false`)、論理削除を実装する
  - テンプレートに全インスタンス共通の既定メモと、非営業日該当時の扱い(そのまま登録/登録しない/次営業日/前営業日)を設定できるようにする
  - `POST /api/recurring-templates`・`POST /api/recurring-templates/:id/stop`・`DELETE /api/recurring-templates/:id`を実装し、登録したテンプレートが一覧から取得できることを確認できる状態にする
  - _Requirements: 5.6, 5.7, 8.3, 9.1, 9.2, 9.3, 9.4_
  - _Depends: 3.1, 6.1_
  - _Boundary: RecurrenceService_

- [x] 9.2 RecurrenceServiceのインスタンス生成ロジック
  - 固定間隔テンプレートについて`rrule`を用いた次回発生日計算からタスクインスタンスを生成する処理を実装する
  - 納品連動テンプレートについて納品日からのオフセット日数でタスクインスタンスを生成する処理を実装する
  - テンプレートの既定メモを生成時にインスタンスの初期メモへコピーし、生成後の個別編集が他インスタンス・テンプレートに影響しないことを実装する
  - 算出日が非営業日マスタに該当する場合、テンプレートのポリシーに従い次営業日/前営業日にずらす、またはそのまま登録する、または当該回を生成しない処理を実装する
  - 同一テンプレート・同一発生予定日に対する重複生成が起きない(冪等)ことをテストで確認できる状態にする
  - _Requirements: 5.1, 5.2, 5.5, 5.8, 5.9, 8.4, 8.5, 8.6, 8.7_
  - _Depends: 9.1_
  - _Boundary: RecurrenceService_

- [x] 9.3 手動生成トリガーエンドポイントの実装
  - `POST /api/recurring-templates/generate-due`エンドポイントを実装し、`asOf`省略時は現在時刻を基準にfixed_intervalテンプレートの期日到来分を生成する
  - 同じ`asOf`で複数回呼び出しても重複したタスクが生成されないことを確認できる状態にする
  - _Requirements: 5.1, 5.5, 5.6_
  - _Depends: 9.2_
  - _Boundary: RecurrenceService_

- [ ] 10. Integration: モジュール間結線とログ計測の組み込み
- [x] 10.1 納品作成・納品日変更からのRecurrenceService呼び出し結線
  - `DeliveriesService.create`実行時に`RecurrenceService.onDeliveryCreated`を呼び出し、納品連動テンプレートに基づくタスクインスタンスが自動生成されるようにする
  - `DeliveriesService.updateDueDate`実行時に`RecurrenceService.onDeliveryDueDateChanged`を呼び出し、未完了の自動生成タスクの予定日が新しい納品日を基準に再計算され、完了済みタスクは変更されないことを確認できる状態にする
  - _Requirements: 5.3, 5.4_
  - _Depends: 4.1, 9.2_

- [x] 10.2 業務イベントログの組み込み
  - 納品作成、繰り返しタスクインスタンス生成、各エンティティ(タスク・納品・イベント・テンプレート・非営業日・ユーザー)の削除操作に`logBusinessEvent`呼び出しを追加する
  - ログに操作種別と対象エンティティIDが含まれることを確認できる状態にする
  - _Requirements: 10.2_
  - _Depends: 1.4, 2.1, 3.1, 4.1, 5.1, 6.1, 9.1_

- [x] 10.3 全モジュールのルート登録とエラーハンドラ結線の確認
  - `app.ts`に全モジュール(users/tasks/deliveries/events/holidays/throughput/recurrence/client-errors)のルートを登録する
  - グローバルエラーハンドラが全ルートに適用されていることを確認する
  - 一連のAPI呼び出しを通しで実行し、正常系・異常系ともに期待したレスポンスとログが得られることを確認できる状態にする
  - _Requirements: 10.1, 10.3, 10.5_
  - _Depends: 2.1, 3.2, 4.1, 5.1, 6.2, 7.1, 8.1, 9.3_

- [ ] 11. Frontend: 画面実装
- [x] 11.1 (P) タスク一覧・階層表示・分割UI
  - タスク一覧画面で状態・優先度がひと目でわかる表示と、保留タスクが一覧に残り続けることを実装する
  - 子タスクの階層表示(折りたたみ可能)とタスク分割操作のUIを実装する
  - 画面操作からタスクの作成・状態更新・分割が行えることを確認できる状態にする
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4_
  - _Depends: 3.2_
  - _Boundary: Frontend/tasks_

- [x] 11.2 (P) 納品ボード・進捗表示画面
  - 納品の登録・一覧・必須タスクの進捗表示画面を実装する
  - 複数納品を並行して閲覧・絞り込みできるUIを実装し、必須タスク未完了のまま納品期日を過ぎた場合に明示されることを確認できる状態にする
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - _Depends: 4.1_
  - _Boundary: Frontend/deliveries_

- [x] 11.3 (P) タスク・イベント統合タイムライン画面
  - タスク一覧APIとイベント一覧APIのレスポンスをクライアント側でマージし、タスクとイベントを区別できる形式で時系列に表示する画面を実装する
  - _Requirements: 4.1, 4.2, 4.3_
  - _Depends: 3.1, 5.1_
  - _Boundary: Frontend/events_

- [x] 11.4 (P) 繰り返しテンプレート設定・非営業日マスタ管理画面
  - 固定間隔/納品連動の繰り返しテンプレート登録フォーム(既定メモ・非営業日ポリシーの4択を含む)を実装する
  - 非営業日マスタの手動登録・一覧・「祝日を取得」ボタンによる外部API同期・「今すぐ生成」ボタンによる手動生成トリガーのUIを実装する
  - _Requirements: 5.1, 5.2, 5.6, 5.7, 8.1, 8.2, 8.3, 8.8, 8.9_
  - _Depends: 9.3, 6.2_
  - _Boundary: Frontend/recurrence_

- [x] 11.5 (P) 消化数ダッシュボード画面
  - 期間(週/月)を指定して過去複数期間分の消化タスク数を並べて表示する画面を実装する
  - 今後の消化数の目安が算出できる場合は表示し、できない場合は実績データ不足である旨を表示することを確認できる状態にする
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - _Depends: 7.1_
  - _Boundary: Frontend/throughput_

- [x] 11.6 (P) 担当者フィルタ・ユーザー管理UI
  - ユーザーの登録・一覧画面と、タスク・イベント一覧を担当者で絞り込むUIコンポーネントを実装する
  - _Requirements: 7.1, 7.2, 7.3_
  - _Depends: 2.1_
  - _Boundary: Frontend/users_

- [x] 11.7 フロントエンドエラー通報プラグインの実装
  - Vueのグローバルエラーハンドラと`window.onerror`を購読し、未捕捉のJSエラーを`POST /api/client-errors`へ送信するNuxtプラグインを実装する
  - 同一エラーの連続送信を抑制する簡易レート制限を実装し、意図的に例外を発生させた際にバックエンドログへ記録されることを確認できる状態にする
  - _Requirements: 10.4_
  - _Depends: 8.1_
  - _Boundary: Frontend/plugins_

- [ ] 12. Validation: 結合・E2E検証
- [x] 12.1 タスク一覧の状態・優先度表示と保留タスク保持のE2E検証
  - タスク一覧で状態・優先度がひと目でわかること、保留タスクが一覧から消えないことをE2Eテストで確認する
  - _Requirements: 1.2, 1.4_
  - _Depends: 11.1_

- [x] 12.2 タスク・イベント統合タイムライン表示のE2E検証
  - タスクとイベントが区別可能な形式で時系列に表示されることをE2Eテストで確認する
  - _Requirements: 4.2_
  - _Depends: 11.3_

- [x] 12.3 担当者フィルタのE2E検証
  - 担当者フィルタでタスク・イベント一覧が正しく絞り込まれることをE2Eテストで確認する
  - _Requirements: 7.2_
  - _Depends: 11.6_

- [x] 12.4 繰り返しタスク生成の統合検証
  - 納品登録による納品連動テンプレートの自動生成、手動トリガーによる固定間隔テンプレートの生成、および同一条件での再実行時の冪等性を統合テストで確認する
  - _Requirements: 5.1, 5.3, 5.5, 5.6_
  - _Depends: 10.1, 9.3_

- [x] 12.5 非営業日ポリシー4パターンの統合検証
  - そのまま登録/登録しない/次営業日/前営業日の各ポリシーで生成結果(予定日または生成有無)が仕様通りになることを統合テストで確認する
  - _Requirements: 8.4, 8.5, 8.6, 8.7_
  - _Depends: 9.2_

- [x] 12.6 論理削除の一覧除外と消化数実績不変の統合検証
  - タスクを削除した後、一覧APIから除外されること、および`ThroughputService`の過去期間の完了数集計値が変化しないことを統合テストで確認する
  - _Requirements: 9.4, 9.5_
  - _Depends: 10.2, 7.1_

- [x] 12.7 ログ相関とフロントエンドエラー記録の統合検証
  - サーバー側で例外を発生させた際にエラーログへ`requestId`とスタックトレースが記録され、同一`requestId`でアクセスログと関連付けられることを確認する
  - フロントエンドから送信したエラーがバックエンドログに同じ形式で記録されることを確認する
  - _Requirements: 10.3, 10.4, 10.5_
  - _Depends: 10.3, 11.7_

- [ ] 13. Foundation: 開発段階マスタのデータモデル拡張
- [x] 13.1 Prisma schema拡張
  - Prisma schemaに開発段階マスタ(名称・並び順・共通監査カラム)のテーブル定義を追加する
  - タスクに開発段階への任意の紐付け(null許容の外部キー)を追加する
  - マイグレーションを作成し、既存の共通ソフトデリート規約(共有Repository層のPrisma Client Extension)が新テーブルにも自動適用されることを確認する
  - マイグレーション適用後、`development_stages`テーブルと`tasks.development_stage_id`カラムが実際にDBへ反映されていることを確認できる状態にする
  - _Requirements: 12.1, 12.3_

- [ ] 14. Development Stages: 開発段階マスタ管理
- [ ] 14.1 (P) DevelopmentStagesServiceの実装
  - 開発段階の登録・名称変更・一覧取得・削除を行う
  - 並び替え操作(登録済み全段階のIDを渡すことで並び順を一括更新)を実装する
  - 使用中の段階を削除した際、当該段階が設定されている全タスクの開発段階を未設定に戻してから段階自体を削除する(delivery削除時のタスク参照解除と同じ実装パターンを踏襲)
  - 登録・削除・並び替えの各操作をHTTP経由で呼び出せる状態にする
  - _Requirements: 12.1, 12.2, 12.5_
  - _Boundary: Backend/development-stages_
  - _Depends: 13.1_

- [ ] 15. Tasks: 開発段階紐付けの拡張
- [ ] 15.1 (P) タスクへの開発段階設定機能の追加
  - タスクの開発段階を、タスクの状態(未着手/進行中/完了/保留)とは独立して更新できるようにする
  - 担当者が未設定のタスクに対しては、開発段階の更新と同時に担当者を設定できるようにする
  - 担当者が既に設定されているタスクに対しては、この操作で担当者が上書きされないようにする
  - 開発段階の更新をHTTP経由で呼び出せる状態にする
  - _Requirements: 12.3, 12.6, 12.7, 12.8, 12.9_
  - _Boundary: Backend/tasks_
  - _Depends: 13.1_

- [ ] 16. Integration: 開発段階関連ルートの結線確認
- [ ] 16.1 development-stagesルートとtasks開発段階ルートの登録確認
  - development-stagesモジュールと、タスクの開発段階更新エンドポイントをアプリ全体(app.ts)に登録する
  - 実際にサーバーを起動し、両エンドポイントが200番台の応答を返すことを確認できる状態にする
  - _Requirements: 12.1, 12.3_
  - _Depends: 14.1, 15.1_

- [ ] 17. Frontend: 画面実装(ダッシュボード・カンバン)
- [ ] 17.1 (P) ダッシュボード画面の実装
  - アプリを開いた際にタスク一覧画面ではなく、状況把握用のダッシュボード画面を表示する
  - 納品期日を過ぎても未完了の必須タスクが存在する納品の一覧を表示する
  - 直近の非タスクイベントの一覧を表示する
  - いずれかの項目を選択すると対応する詳細画面へ遷移する
  - いずれかのセクションに表示すべき項目が存在しない場合、空欄ではなくその旨のメッセージを表示する
  - いずれかのセクションの件数が表示上限を超える場合、上位の項目のみを表示しすべてを確認できる導線を示す
  - 画面を実際に開いて各セクションの表示とドリルダウン遷移を確認できる状態にする
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
  - _Boundary: Frontend/dashboard_

- [ ] 17.2 開発段階マスタ管理UIの実装
  - 開発段階の登録・名称変更・並び替え・削除を行うUIを実装する
  - 一覧を並び順通りに表示し、並び替え操作の結果が画面に反映されることを確認できる状態にする
  - _Requirements: 12.1_
  - _Boundary: Frontend/kanban_
  - _Depends: 14.1_

- [ ] 17.3 カンバン表示とカード移動の実装
  - 開発段階が設定されているタスクを、開発段階ごとの列に分けたカンバン形式で表示する(未設定のタスクは対象外とする)
  - カードを別の列にドラッグ操作で移動すると、タスクの開発段階が更新される
  - 担当者未設定のタスクのカードを移動する際は、担当者の選択を求めてから移動を確定する
  - ドラッグ&ドロップの実装方式はブラウザ標準のHTML5 Drag and Drop APIを既定とし、見た目・操作性(ドラッグ中のプレビュー表示、タッチデバイス対応等)が要求水準に届かないと判断した場合は軽量ライブラリの導入に切り替えてよい(research.md参照)。採用した方式と理由をtasks.mdのImplementation Notesに記録する
  - 画面を実際に開いてカードのドラッグ操作・列移動・担当者選択ダイアログを確認できる状態にする
  - _Requirements: 12.2, 12.3, 12.4, 12.6, 12.7, 12.8_
  - _Boundary: Frontend/kanban_
  - _Depends: 14.1, 15.1, 16.1, 17.2_

- [ ] 18. Validation: 結合・E2E検証
- [ ] 18.1 開発段階マスタ削除時のタスク参照解除の統合検証
  - 開発段階を設定したタスクを作成し、その開発段階をマスタから削除した後、当該タスクの開発段階が未設定に戻ることを実HTTP経路で確認する
  - マスタの一覧取得から削除済みの段階が除外されることをあわせて確認する
  - _Requirements: 12.5_
  - _Depends: 14.1, 15.1_

- [ ] 18.2 開発段階更新時の担当者自動設定ルールの統合検証
  - 担当者未設定のタスクに開発段階と担当者を同時に指定して更新すると、両方が反映されることを確認する
  - 担当者設定済みのタスクに対して開発段階の更新時に別の担当者を指定しても、既存の担当者が変更されないことを確認する
  - _Requirements: 12.6, 12.7, 12.8_
  - _Depends: 15.1_

- [ ] 18.3 ダッシュボード表示のE2E検証
  - 期限超過かつ必須タスク未完了の納品を作成し、ダッシュボードにその納品が表示されることを実ブラウザで確認する
  - 直近のイベントを作成し、ダッシュボードに表示されることを確認する
  - 表示された項目を選択すると対応する詳細画面へ遷移することを確認する
  - _Requirements: 11.2, 11.3, 11.4_
  - _Depends: 17.1_

- [ ] 18.4 カンバンでのカード移動のE2E検証
  - 開発段階を登録し、担当者未設定のタスクを作成した上で、そのタスクのカードを別の開発段階の列へドラッグ操作で移動する
  - 移動時に担当者選択が求められ、選択後にタスクの開発段階と担当者が更新されて画面に反映されることを実ブラウザで確認する
  - 採用したドラッグ&ドロップの自動テスト手法(Playwrightの`dragTo()`または手動イベントディスパッチ等)を`.kiro/steering/testing.md`に追記する
  - _Requirements: 12.1, 12.6, 12.7_
  - _Depends: 17.3_

## Implementation Notes

- task 4.1: design.mdのDeliveriesService Postconditionsに「削除後もTask/EventはdeliveryIdを保持する」という記載とData Models「Consistency & Integrity」の「deliveryIdをnullに更新する」という記載が矛盾していたため、後者(明示的な理由付きの記述)を正として実装し、design.md側の記載を修正した。今後同様の箇所を実装する際は両セクションの整合性を先に確認すること。
- task 9.2: 統合テストは実MySQLを共有し、テスト失敗時にクリーンアップ(hardDelete)がスキップされるとデータが残留し、以降の実行が連鎖的に失敗することがある(特に並列実行時)。テストが原因不明に失敗した場合は、まず対象日付範囲のレコードが残っていないか確認してから再実行すること。
- task 9.3: Vitestのデフォルト(ファイル並列実行)では、あるテストファイルのhardDelete(物理DELETE、アプリコード側は使用しない)が、別ファイルで進行中のgenerateDueInstances(全アクティブテンプレートをグローバルスキャン)のread-then-insertと競合し、外部キー制約違反(500)やタイムアウトを引き起こすことがある。本番コードはstop/deleteとも論理削除のみでこの競合は発生しないため機能的な欠陥ではないが、recurrence関連のテストで原因不明の失敗が出た場合は`npx vitest run --no-file-parallelism`で再実行して切り分けること。
- task 10.3: `rrule`パッケージは`exports`フィールドを持たないCJSパッケージのため、`import { RRule } from "rrule"`はVitest(esbuild変換)配下では動くが、`tsc`のビルドやNode実行時(ESMネイティブローダー)では`SyntaxError: does not provide an export named 'RRule'`で失敗する。テストとビルド(tsc)はどちらもこの問題を検出できず、`docker compose up`で実際にコンテナを起動して初めて発覚した。デフォルトインポート+分割代入(`import rrulePackage from "rrule"; const { RRule } = rrulePackage;`)に修正して解決。`exports`フィールドを持たないCJS依存を追加する際は、テスト・ビルドが通っても実際にアプリを起動して動作確認すること。
- task 11.x: フロントエンド(`ssr: false`のSPA)は実ブラウザからバックエンドAPIへ直接クロスオリジンでリクエストするため、curl/`app.inject`/同一オリジンのユニットテストでは検出できない3件の重大な結線不備が実ブラウザ検証で初めて発覚した。(1) `docker-compose.yml`のfrontendサービスに`NUXT_PUBLIC_API_BASE_URL`が渡されていなかった(デフォルトポートでのみ偶然動作していた)。(2) バックエンドにCORS設定が一切なく、ブラウザからの全APIコールが`net::ERR_FAILED`で失敗していた(`@fastify/cors`を`origin: true`で追加し解決)。(3) Nuxtはサブディレクトリ配下のコンポーネント(`components/tasks/TaskNode.vue`等)をデフォルトでディレクトリ名プレフィックス付き(`<TasksTaskNode>`)で自動登録するため、テンプレート内で`<TaskNode>`/`<AssigneeFilter>`と直接参照すると未知のネイティブ要素として無音で失敗する(ビルド/型チェックエラーにならず、Vue devモードのコンソール警告のみ)。`nuxt.config.ts`に`components: [{ path: "~/components", pathPrefix: false }]`を追加して解決。これら3件は`nuxt build`/`nuxt generate`/typecheck/ユニットテストのいずれでも検出できず、実ブラウザでの結合確認によってのみ発見された。今後フロントエンドとバックエンドを結線するタスクでは、ビルド成功だけで完了と判断せず、必ず実際に起動した状態で実ブラウザから操作確認すること。
- task 11.1: レビューで、親タスクの子タスク未完了ガード(409)がフロントエンドで無音に握りつぶされ、要件2.4の「未完了の子タスクが存在する旨を示す」が満たされていない不備が指摘された。`onStatusChange`にtry/catchを追加しエラーメッセージを画面に表示するよう修正(`frontend/pages/users/index.vue`の既存パターンを踏襲)。状態変更やAPI呼び出しを行うUIを実装する際は、バックエンドが返しうるエラー応答(409など)を必ず画面上に表示すること。
- task 11.x: `frontend/e2e/*.spec.ts`(Playwright、task 12.1-12.3で追加)を除外する`vitest.config.ts`がなかったため、フロントエンドの標準テストコマンド`npm run test`(=`vitest run`)がPlaywrightの`test()`をVitestのデフォルトglobで収集してロードエラーになり、コマンド全体が失敗していた。`vitest.config.ts`に`test.exclude: ["**/node_modules/**", "**/e2e/**"]`を追加して解決。E2Eテストツール(Playwright等)をユニットテストランナー(Vitest)と同一ディレクトリ構成で導入する際は、必ずテストランナーのinclude/excludeを明示的に分離すること。
- task 12.x: design.md/research.mdはE2Eテストツールを指定していなかったため、Nuxt/Vue向けの標準的な選択肢としてPlaywrightを新規導入した(判断根拠は`frontend/playwright.config.ts`のヘッダコメントに記載)。また`backend/src/modules/client-errors/client-error.service.ts`には、task 10.2の`shared/business-event-logger.ts`と同じ「モジュール単位のロガーシングルトインをテストから差し替え可能にする」パターン(`let`エクスポート+セッター関数)を追加し、`validation.integration.test.ts`が実HTTP経由でのクライアントエラーログ出力を検証できるようにした。
- task 13.1: `non_business_days.date_active_key`(MySQLのSTORED GENERATED COLUMN、task 1.3参照)はPrisma schemaでは`Unsupported("date")`かつ`@@unique`注釈なしで表現されているため、Prisma自身のドリフト検出からは見えない。この状態で無関係なスキーマ変更に対して`npx prisma migrate dev`を実行したところ、生成されたマイグレーションの先頭に`DROP INDEX non_business_days_date_active_key_key ON non_business_days`が混入し、そのまま適用すると非営業日の重複登録防止ルールが無音で無効化されるところだった。既存の`schema.integration.test.ts`の該当テストで検出し、生成されたマイグレーションSQLから該当行を手動で削除、`prisma migrate reset --force`でDBを再構築して解決した。今後、この生成カラムが存在する状態で新しいマイグレーションを`migrate dev`で生成する際は、必ず生成されたSQLに`non_business_days`への意図しないDROP文が混入していないか確認してから適用すること。
