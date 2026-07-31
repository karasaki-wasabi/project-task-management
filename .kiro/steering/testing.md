# テスト戦略

[Purpose: このプロジェクトにおけるテストの配置・種類・実行方法・実MySQL共有環境特有の注意点をまとめる]

## テストの種類と配置

- **ユニット/統合テスト**: `backend/src/**/*.test.ts`(コロケーション)。Vitest。バックエンドは実MySQL(Docker Composeの`mysql`サービス)に対して実行し、DBをモックしない。
- **機能横断の統合検証**: `backend/src/validation.integration.test.ts` のように、単一モジュールに属さないテストは `backend/src/` 直下に置く。実HTTP経路(`buildApp` + `app.inject`)を通して検証し、サービス層を直接呼ぶ既存のユニット/統合テストでは見えない結合面の不備を検出する。
- **フロントエンドユニットテスト**: `frontend/composables/*.test.ts` などコロケーション。Vitest。
- **E2E**: `frontend/e2e/*.spec.ts`。Playwright(design.md/research.mdに指定がなかったため実装時に導入。Nuxt/Vueでの標準的選択として妥当と判断)。

### 重要: VitestとPlaywrightの分離
`frontend/vitest.config.ts` で `test.exclude: ["**/e2e/**"]` を必ず設定すること。設定を忘れると `npm run test`(Vitest)がPlaywrightの `test()` を誤って収集し、ロードエラーで失敗する。新しいE2Eディレクトリを追加する場合は同様の除外設定を確認すること。

## 実MySQL共有によるテスト間干渉

統合テストは実DBを共有するため、以下の2種の干渉が知られている。

1. **クリーンアップ漏れによるデータ残留**: テスト失敗時に `hardDelete`(物理DELETE、アプリコードは論理削除のみで本番では使わない)がスキップされると、次回以降の実行が原因不明に連鎖失敗する。テストが説明のつかない失敗をした場合は、まず対象日付範囲(例: `2034-01-01`以降、`2041-*`など未来日付でテストデータを作る規約)のレコードが残っていないか確認してから再実行する。
2. **Vitestのデフォルト(ファイル並列実行)による競合**: あるテストファイルの`hardDelete`が、別ファイルで進行中の`generateDueInstances`(全アクティブテンプレートをグローバルスキャンするread-then-insert)と競合し、外部キー制約違反やタイムアウトを引き起こすことがある。本番コードの`stop`/`delete`は論理削除のみのためこの競合は発生せず、テスト実行時特有の問題。recurrence関連のテストで原因不明の失敗が出た場合は `npx vitest run --no-file-parallelism` で再実行して切り分ける。

## テストデータの作法

- 統合テストは `randomUUID()` や `e2e-`/`RVW2-` のようなプレフィックス+タイムスタンプでテストデータの名前を一意にし、他テストとの衝突を避ける。
- 各テストの末尾で作成したレコードを明示的に `hardDelete` する(afterEach/afterAllへの寄せではなく、各testケース内で自分が作ったデータを片付ける)。
- 未来日付(2034年以降など)を使うことで、既存の実データや他機能のテストと衝突しないようにする。

## ログ出力の検証パターン

サーバー側の挙動(ログ相関、エラー記録)を検証する際は、`shared/logger.ts`のstdout出力ではなく、`Writable`ストリームでログ行を収集する `collectingStream()` ヘルパーを使い、モジュール単位のロガーシングルトンをテスト用に差し替える(下記「エラーハンドリング」steering参照)。

## Playwright E2Eの実行

`frontend/playwright.config.ts` の `baseURL` は環境変数 `E2E_BASE_URL` で上書き可能。Docker Composeで起動した実際のbackend/frontendに対して実行する(モックサーバーは使わない)。ブラウザバイナリがDockerコンテナ間で永続化されない問題は [[local-dev-pitfalls]] を参照。

## 方針

- サービス層のユニットテストではモックを最小限にし、実DBに対して検証する(このプロジェクトの一貫した選択)。
- 機能の「ビルドが通る」「ユニットテストが通る」は完了の十分条件ではない。フロント/バックエンド結合が絡むタスクは実ブラウザ検証([[local-dev-pitfalls]])を、複数モジュールにまたがる振る舞いは実HTTP経路での統合テストを併用する。
