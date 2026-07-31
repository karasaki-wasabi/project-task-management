# ローカル開発環境の落とし穴

[Purpose: ビルド・型チェック・ユニットテストをすべて通過しても実際には動かない、フロントエンド/バックエンド結線に関する既知の落とし穴を記録する]

## なぜこのファイルが必要か

このプロジェクトは `ssr: false` のNuxt SPA(フロントエンド)が、Docker Compose上の別コンテナで動くFastifyバックエンドへブラウザから直接リクエストする構成を取っている。この構成特有の不備は、**`nuxt build`/`nuxt generate`/`tsc`/Vitest(curlや`app.inject`によるユニット・統合テスト含む)のいずれでも検出できず、実際に `docker compose up` した状態で実ブラウザから操作して初めて発覚する**。task-delivery-managementスペックのフロントエンド実装(tasks.md task 11.x)では、この種の不備が3件同時に見つかった。

## 既知の落とし穴と対処

### 1. CORS未設定
SPAはブラウザから直接APIを呼ぶため、フロント/バックエンドが別オリジン(別ポート)である限りCORS設定が必須。未設定だと `net::ERR_FAILED`/`Failed to fetch` になるが、これは同一オリジンで動くcurl・`app.inject`・Vitestからは絶対に再現しない。
→ `backend/src/app.ts` で `@fastify/cors` を `origin: true` で登録済み(認証なしの内部ツールという product.md の前提のもと、Originを許可リストではなく反映する方式)。新しいバックエンドを立てる場合も同様に必要。

### 2. `docker-compose.yml` の環境変数配線漏れ
`docker-compose.yml` の各サービスの `environment:` に明示的に書かれていない環境変数は、たとえホスト側で `-e VAR=val docker compose up` としても**コンテナには一切渡らない**。フロントエンドが参照する `NUXT_PUBLIC_API_BASE_URL`(バックエンドの到達可能URL、`http://localhost:${BACKEND_PORT:-3000}` — SPAはブラウザから叩くのでdocker内部のサービス名ではなくホスト公開ポートを指す必要がある)がこれで一度配線漏れした。
→ 新しい環境変数をフロント/バックエンドに追加する際は、必ず `docker-compose.yml` の `environment:` ブロックに明示し、`docker compose exec <service> printenv | grep <VAR>` で実際に渡っているか確認すること。

### 3. Nuxtのサブディレクトリコンポーネント自動登録プレフィックス
Nuxtはデフォルトで `components/tasks/TaskNode.vue` を `<TasksTaskNode>` という**ディレクトリ名プレフィックス付き**のタグ名で自動登録する。テンプレート内で `<TaskNode>` のように素の名前で参照すると、ビルド・型チェックのエラーにはならず、未知のネイティブ要素として無音でレンダリングされ(Vue devモードのコンソール警告のみ)、機能が完全に壊れる。
→ `frontend/nuxt.config.ts` に `components: [{ path: "~/components", pathPrefix: false }]` を設定済み。サブディレクトリにコンポーネントを追加する際は、この設定があるおかげでディレクトリ名を気にせず素の名前で参照してよい。

## Playwright(E2E)実行時の注意

`docker compose run` はコマンドごとに使い捨てコンテナを作るため、あるコマンドで `npx playwright install --with-deps chromium` してブラウザバイナリを入れても、**次の `docker compose run` invocationには一切残らない**。実行のたびに毎回インストールするコストを避けたい場合は、ホストにNode.jsがあれば `frontend/node_modules`/`package-lock.json` を汚さないスクラッチディレクトリ(例: `/tmp/.../scratchpad/pw`)に `@playwright/test` を単独インストールし、公開済みポート(`http://localhost:<FRONTEND_PORT>`)に対してホスト側から実行するのが安定する。

またVite devサーバーの `server.allowedHosts` はデフォルトで `localhost` のみ許可するため、`http://frontend:3001` のようなdocker内部サービス名でアクセスすると403になる。これはセキュリティ機能であり修正対象のバグではない — 実ブラウザ検証は必ず `localhost:<公開ポート>` 経由で行うこと。

## 検証の原則

フロントエンド/バックエンドを結線するタスクでは、**ビルド成功・型チェック通過・ユニットテストグリーンだけで完了と判断しない**。必ず `docker compose up` で実際に両方を起動し、実ブラウザ(または Playwright)で該当機能を操作して確認すること。上記3件はすべてこの手順によってのみ発見された。
