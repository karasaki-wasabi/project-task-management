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
- [ ] 11.1 (P) タスク一覧・階層表示・分割UI
  - タスク一覧画面で状態・優先度がひと目でわかる表示と、保留タスクが一覧に残り続けることを実装する
  - 子タスクの階層表示(折りたたみ可能)とタスク分割操作のUIを実装する
  - 画面操作からタスクの作成・状態更新・分割が行えることを確認できる状態にする
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4_
  - _Depends: 3.2_
  - _Boundary: Frontend/tasks_

- [ ] 11.2 (P) 納品ボード・進捗表示画面
  - 納品の登録・一覧・必須タスクの進捗表示画面を実装する
  - 複数納品を並行して閲覧・絞り込みできるUIを実装し、必須タスク未完了のまま納品期日を過ぎた場合に明示されることを確認できる状態にする
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - _Depends: 4.1_
  - _Boundary: Frontend/deliveries_

- [ ] 11.3 (P) タスク・イベント統合タイムライン画面
  - タスク一覧APIとイベント一覧APIのレスポンスをクライアント側でマージし、タスクとイベントを区別できる形式で時系列に表示する画面を実装する
  - _Requirements: 4.1, 4.2, 4.3_
  - _Depends: 3.1, 5.1_
  - _Boundary: Frontend/events_

- [ ] 11.4 (P) 繰り返しテンプレート設定・非営業日マスタ管理画面
  - 固定間隔/納品連動の繰り返しテンプレート登録フォーム(既定メモ・非営業日ポリシーの4択を含む)を実装する
  - 非営業日マスタの手動登録・一覧・「祝日を取得」ボタンによる外部API同期・「今すぐ生成」ボタンによる手動生成トリガーのUIを実装する
  - _Requirements: 5.1, 5.2, 5.6, 5.7, 8.1, 8.2, 8.3, 8.8, 8.9_
  - _Depends: 9.3, 6.2_
  - _Boundary: Frontend/recurrence_

- [ ] 11.5 (P) 消化数ダッシュボード画面
  - 期間(週/月)を指定して過去複数期間分の消化タスク数を並べて表示する画面を実装する
  - 今後の消化数の目安が算出できる場合は表示し、できない場合は実績データ不足である旨を表示することを確認できる状態にする
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - _Depends: 7.1_
  - _Boundary: Frontend/throughput_

- [ ] 11.6 (P) 担当者フィルタ・ユーザー管理UI
  - ユーザーの登録・一覧画面と、タスク・イベント一覧を担当者で絞り込むUIコンポーネントを実装する
  - _Requirements: 7.1, 7.2, 7.3_
  - _Depends: 2.1_
  - _Boundary: Frontend/users_

- [ ] 11.7 フロントエンドエラー通報プラグインの実装
  - Vueのグローバルエラーハンドラと`window.onerror`を購読し、未捕捉のJSエラーを`POST /api/client-errors`へ送信するNuxtプラグインを実装する
  - 同一エラーの連続送信を抑制する簡易レート制限を実装し、意図的に例外を発生させた際にバックエンドログへ記録されることを確認できる状態にする
  - _Requirements: 10.4_
  - _Depends: 8.1_
  - _Boundary: Frontend/plugins_

- [ ] 12. Validation: 結合・E2E検証
- [ ] 12.1 タスク一覧の状態・優先度表示と保留タスク保持のE2E検証
  - タスク一覧で状態・優先度がひと目でわかること、保留タスクが一覧から消えないことをE2Eテストで確認する
  - _Requirements: 1.2, 1.4_
  - _Depends: 11.1_

- [ ] 12.2 タスク・イベント統合タイムライン表示のE2E検証
  - タスクとイベントが区別可能な形式で時系列に表示されることをE2Eテストで確認する
  - _Requirements: 4.2_
  - _Depends: 11.3_

- [ ] 12.3 担当者フィルタのE2E検証
  - 担当者フィルタでタスク・イベント一覧が正しく絞り込まれることをE2Eテストで確認する
  - _Requirements: 7.2_
  - _Depends: 11.6_

- [ ] 12.4 繰り返しタスク生成の統合検証
  - 納品登録による納品連動テンプレートの自動生成、手動トリガーによる固定間隔テンプレートの生成、および同一条件での再実行時の冪等性を統合テストで確認する
  - _Requirements: 5.1, 5.3, 5.5, 5.6_
  - _Depends: 10.1, 9.3_

- [ ] 12.5 非営業日ポリシー4パターンの統合検証
  - そのまま登録/登録しない/次営業日/前営業日の各ポリシーで生成結果(予定日または生成有無)が仕様通りになることを統合テストで確認する
  - _Requirements: 8.4, 8.5, 8.6, 8.7_
  - _Depends: 9.2_

- [ ] 12.6 論理削除の一覧除外と消化数実績不変の統合検証
  - タスクを削除した後、一覧APIから除外されること、および`ThroughputService`の過去期間の完了数集計値が変化しないことを統合テストで確認する
  - _Requirements: 9.4, 9.5_
  - _Depends: 10.2, 7.1_

- [ ] 12.7 ログ相関とフロントエンドエラー記録の統合検証
  - サーバー側で例外を発生させた際にエラーログへ`requestId`とスタックトレースが記録され、同一`requestId`でアクセスログと関連付けられることを確認する
  - フロントエンドから送信したエラーがバックエンドログに同じ形式で記録されることを確認する
  - _Requirements: 10.3, 10.4, 10.5_
  - _Depends: 10.3, 11.7_

## Implementation Notes

- task 4.1: design.mdのDeliveriesService Postconditionsに「削除後もTask/EventはdeliveryIdを保持する」という記載とData Models「Consistency & Integrity」の「deliveryIdをnullに更新する」という記載が矛盾していたため、後者(明示的な理由付きの記述)を正として実装し、design.md側の記載を修正した。今後同様の箇所を実装する際は両セクションの整合性を先に確認すること。
- task 9.2: 統合テストは実MySQLを共有し、テスト失敗時にクリーンアップ(hardDelete)がスキップされるとデータが残留し、以降の実行が連鎖的に失敗することがある(特に並列実行時)。テストが原因不明に失敗した場合は、まず対象日付範囲のレコードが残っていないか確認してから再実行すること。
- task 9.3: Vitestのデフォルト(ファイル並列実行)では、あるテストファイルのhardDelete(物理DELETE、アプリコード側は使用しない)が、別ファイルで進行中のgenerateDueInstances(全アクティブテンプレートをグローバルスキャン)のread-then-insertと競合し、外部キー制約違反(500)やタイムアウトを引き起こすことがある。本番コードはstop/deleteとも論理削除のみでこの競合は発生しないため機能的な欠陥ではないが、recurrence関連のテストで原因不明の失敗が出た場合は`npx vitest run --no-file-parallelism`で再実行して切り分けること。
- task 10.3: `rrule`パッケージは`exports`フィールドを持たないCJSパッケージのため、`import { RRule } from "rrule"`はVitest(esbuild変換)配下では動くが、`tsc`のビルドやNode実行時(ESMネイティブローダー)では`SyntaxError: does not provide an export named 'RRule'`で失敗する。テストとビルド(tsc)はどちらもこの問題を検出できず、`docker compose up`で実際にコンテナを起動して初めて発覚した。デフォルトインポート+分割代入(`import rrulePackage from "rrule"; const { RRule } = rrulePackage;`)に修正して解決。`exports`フィールドを持たないCJS依存を追加する際は、テスト・ビルドが通っても実際にアプリを起動して動作確認すること。
