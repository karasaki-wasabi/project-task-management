# テスト戦略

[Purpose: このプロジェクトにおけるテストの配置・種類・実行方法・実MySQL共有環境特有の注意点をまとめる]

## テストの種類と配置

- ユニット/統合テスト
  - `backend/src/**/*.test.ts`（コロケーション）。Vitest。バックエンドは実MySQL（Docker Composeの`mysql`サービス）に対して実行し、DBをモックしない
- 機能横断の統合検証
  - `backend/src/validation.integration.test.ts` のように、単一モジュールに属さないテストは `backend/src/` 直下に置く
  - 実HTTP経路（`buildApp` + `app.inject`）を通して検証し、サービス層を直接呼ぶ既存のユニット/統合テストでは見えない結合面の不備を検出する
- フロントエンドユニットテスト
  - `frontend/composables/*.test.ts` などコロケーション。Vitest。DB非依存（モック中心）でテスト間干渉は起きにくい
- E2E
  - `frontend/e2e/*.spec.ts`。Playwright
- 認証済み E2E fixture
  - `frontend/e2e/fixtures.ts`
  - 各シナリオは公開自己登録＋ログイン後の状態から始める
  - 旧 `/users` の名前だけ登録手順には依存しない

### 重要: VitestとPlaywrightの分離

`frontend/vitest.config.ts` で `test.exclude: ["**/e2e/**"]` を必ず設定すること。設定を忘れると `npm run test`（Vitest）がPlaywrightの `test()` を誤って収集し、ロードエラーで失敗する。新しいE2Eディレクトリを追加する場合は同様の除外設定を確認すること。

## 共有MySQLとテスト種別ごとの干渉リスク

すべての実DBテストは原則として docker compose の開発用 MySQL 1本を共有する。種別ごとのリスクと対策は次のとおり。

| 種別 | 干渉リスク | 既定の対策 |
|------|------------|------------|
| Backend Vitest | 中（残留・グローバル集計・失敗時cleanup漏れ） | `fileParallelism: false`、一意名、`hardDelete`、専用日付帯 |
| Frontend Vitest | 低（DB非使用） | 特になし |
| Playwright E2E | 高（実行間でデータ蓄積） | `globalSetup` で TRUNCATE、`workers: 1`、WS単位のfixture |

Backend と E2E を同時に同じ DB へ向けないこと。E2E の globalSetup はアプリテーブルを空にする。

## 実MySQL共有による Backend テスト間干渉

統合テストは実DBを共有するため、以下の干渉が知られている。

1. クリーンアップ漏れによるデータ残留
   - テスト失敗時に `hardDelete`（物理DELETE、アプリコードは論理削除のみで本番では使わない）がスキップされると、次回以降の実行が原因不明に連鎖失敗する
   - テストが説明のつかない失敗をした場合は、まず対象日付範囲（例: `2034-01-01`以降、`2041-*`など未来日付でテストデータを作る規約）のレコードが残っていないか確認してから再実行する
2. Vitestのデフォルト（ファイル並列実行）による競合
   - あるテストファイルの`hardDelete`が、別ファイルで進行中の案件作成・テンプレ適用（`templateOperations`同一TX）やテンプレCRUDのread-then-writeと競合し、外部キー制約違反やタイムアウトを引き起こすことがある
   - 本番コードの`stop`/`delete`は論理削除のみのためこの競合は発生せず、テスト実行時特有の問題
   - recurrence / cases 関連のテストで原因不明の失敗が出た場合は `npx vitest run --no-file-parallelism` で再実行して切り分ける
   - `backend/vitest.config.ts` では既定で `fileParallelism: false`

3. ワークスペース非依存のグローバル集計
   - 例: throughput の `countCompleted` は全WS横断の COUNT で、soft-delete行も集計対象
   - 絶対件数をアサートするテストは、専用の歴史日付帯を決め、`beforeEach` でその帯の行を物理DELETEしてから始める（`throughput.service.test.ts` 参照）
   - 新規にグローバル集計テストを書くときも、共有DB前提の絶対値アサートを避け、日付帯パージか差分アサートにする

## テストデータの作法（Backend 統合）

- 統合テストは `randomUUID()` や `e2e-`/`RVW2-` のようなプレフィックス+タイムスタンプでテストデータの名前を一意にし、他テストとの衝突を避ける
- 各テストの末尾で作成したレコードを明示的に `hardDelete` する（afterEach/afterAllへの寄せではなく、各testケース内で自分が作ったデータを片付ける）
- 失敗時に片付けが飛ぶのを防ぐため、作成後は `try` / `finally` で `hardDelete` する
- 未来日付（2034年以降など）を使うことで、既存の実データや他機能のテストと衝突しないようにする
- ユーザーfixtureは `backend/src/test/user.fixture.ts`（`test-user-${uuid}@example.test`）を使う

## ログ出力の検証パターン

サーバー側の挙動（ログ相関、エラー記録）を検証する際は、`shared/logger.ts`のstdout出力ではなく、`Writable`ストリームでログ行を収集する `collectingStream()` ヘルパーを使い、モジュール単位のロガーシングルトンをテスト用に差し替える（下記「エラーハンドリング」steering参照）。

## Playwright E2Eの実行

`frontend/playwright.config.ts` の `baseURL` は環境変数 `E2E_BASE_URL` で上書き可能。Docker Composeで起動した実際のbackend/frontendに対して実行する（モックサーバーは使わない）。ブラウザバイナリがDockerコンテナ間で永続化されない問題は [[local-dev-pitfalls]] を参照。

既定設定（隔離のため必須）:

- `workers: 1`
  - 共有DB/APIへの並列アクセスによるタイムアウト散発を防ぐ
- `globalSetup: ./e2e/global-setup.ts`
  - スイート開始時に `docker compose run --rm -T backend npx tsx src/prisma/reset-for-e2e.ts` でアプリテーブルを TRUNCATE する
  - シードは入れ直さない（E2Eは自己登録でユーザー／WSを作る）
  - 手元確認用データが必要なときは E2E 後に `prisma db seed`（[[local-dev-pitfalls]] §11）
  - リセットを飛ばすときだけ `E2E_SKIP_DB_RESET=1`

TRUNCATE 対象テーブル一覧は `backend/src/prisma/clear-tables.ts` が正本。スキーマにテーブルを足したらここも更新する。

### 認証前提と Origin の揃え方

業務画面の E2E はログイン済み状態が前提である。新規シナリオでは `frontend/e2e/fixtures.ts` の共有 fixture を使い、名前だけのユーザー作成 UI を再導入しない。

案件・タスク系などワークスペース文脈が必要な E2E は、既定の `test` fixture（登録／ログイン後にワークスペース作成・選択まで行う）を使う。ワークスペース未作成の空状態を検証するときだけ `authTest`（認証のみ）を使う。API 直叩きヘルパでは `workspaceScopedHeaders`（`x-workspace-id`）を付与する。

実行前に次を同じ Origin に揃える。

- `E2E_BASE_URL`
  - Playwright が開くフロント URL
- `CORS_ORIGIN`
  - バックエンドが許可する Origin

例: フロント公開が `http://localhost:3401` のとき

```bash
# .env の CORS_ORIGIN も同じ値にしたうえで backend を再起動してから
E2E_BASE_URL=http://localhost:3401 npm --prefix frontend run test:e2e -- auth.spec.ts
```

`CORS_ORIGIN` だけが `http://localhost:3001` のままだと、登録・ログインの preflight が失敗し、認証クリティカルパスが落ちる。

### E2E シナリオを書くときの作法

- ユーザー／WS／案件／タスク名は毎回一意（fixture と `Date.now()` / random で足りる）
- 件数固定・表示キャップ付き一覧への `getByText` 直アサートは避け、検索や件数ベース、自WS内で一意な識別子で確認する
- グローバル件数や「DB全体のN件目」を前提にしない
- スイート開始時の TRUNCATE に加え、シナリオ内で作ったデータの片付ける必要は原則ない（次の globalSetup が捨てる）。ただし同一スイート内でカレンダー週レーン予算などを圧迫しうる大量データを作る場合は、そのスペック内で緩和する（`calendar.spec.ts` の purge が先例）
- Backend Vitest と同時実行しない

### 将来候補（未採用）

専用 MySQL（または compose profile）を E2E 専用に切り、実行後に破棄する方式は隔離は強いが運用コストが大きい。当面は共有DB + 実行前 TRUNCATE で足りる。CI に E2E を載せる段階で再検討する。

### ドラッグ&ドロップ(HTML5 Drag and Drop API)のテスト

カンバンのカード移動（`frontend/pages/kanban/index.vue`、ブラウザ標準のHTML5 Drag and Drop API）は、Playwrightの`locator.dragTo()`で検証できる。ネイティブの`dragstart`/`dragover`/`drop`イベントシーケンスを内部で発行するため、独自にイベントを手動ディスパッチする必要はない。`frontend/e2e/kanban.spec.ts`が実例。ドラッグ元・ドロップ先ともロケータで要素を絞り込んだ上で`sourceLocator.dragTo(targetLocator)`を呼ぶだけでよい。

## 方針

- サービス層のユニットテストではモックを最小限にし、実DBに対して検証する（このプロジェクトの一貫した選択）
- 機能の「ビルドが通る」「ユニットテストが通る」は完了の十分条件ではない。フロント/バックエンド結合が絡むタスクは実ブラウザ検証（[[local-dev-pitfalls]]）を、複数モジュールにまたがる振る舞いは実HTTP経路での統合テストを併用する
- 新しいテストを足すときは、上表の干渉リスクに当てはまる前提（共有DB・グローバル集計・キャップ付きUI）がないか先に確認する
