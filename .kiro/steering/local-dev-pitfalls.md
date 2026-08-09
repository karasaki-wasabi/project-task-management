# ローカル開発環境の落とし穴

[Purpose: ビルド・型チェック・ユニットテストをすべて通過しても実際には動かない、実ブラウザでの操作によって初めて発覚する既知の落とし穴を記録する(フロントエンド/バックエンド結線に限らず、フロントエンド単体のライブラリ統合上の落とし穴も含む)]

## なぜこのファイルが必要か

このプロジェクトは `ssr: false` のNuxt SPA(フロントエンド)が、Docker Compose上の別コンテナで動くFastifyバックエンドへブラウザから直接リクエストする構成を取っている。この構成特有の不備は、**`nuxt build`/`nuxt generate`/`tsc`/Vitest(curlや`app.inject`によるユニット・統合テスト含む)のいずれでも検出できず、実際に `docker compose up` した状態で実ブラウザから操作して初めて発覚する**。task-delivery-managementスペックのフロントエンド実装(tasks.md task 11.x)では、この種の不備が3件同時に見つかった。

## 既知の落とし穴と対処

### 1. CORS未設定
SPAはブラウザから直接 API を呼ぶため、フロント/バックエンドが別オリジン(別ポート)である限り CORS 設定が必須。Cookie セッションではさらに、ブラウザとサーバーの両方で資格情報を明示しなければ Cookie が送受信されない。未設定だと `net::ERR_FAILED`/`Failed to fetch`、またはログイン成功後も 401 になるが、これは同一オリジンで動く curl・`app.inject`・Vitestからは再現しない。
→ `backend/src/app.ts` では `@fastify/cors` を `credentials: true`、`CORS_ORIGIN`で指定した許可 Origin として登録する。ワイルドカード(`*`)は credentials と併用できない。フロントエンドの API クライアントは `credentials: 'include'` を指定し、`CORS_ORIGIN`、`NUXT_PUBLIC_API_BASE_URL`、実際のフロント公開 URL を同じポートを含む Origin に揃えること。

### 2. Cookie セッションの親ドメインが分かれる
ローカルでは `http://localhost:<frontend-port>` と `http://localhost:<backend-port>` のように、ポートが異なっても同じホスト名を使う。`SameSite=Lax`と `COOKIE_SECURE=false` で HTTP 開発環境の Cookie セッションを確認できる。片方だけを `127.0.0.1`、別の側を `localhost` にすると、同一サイトとして扱われず、CORS または Cookie の問題に見えるログイン状態の不整合が起きる。

本番ではフロントエンドと API を同一親ドメイン配下に置く(例: `app.example.com` と `api.example.com`)。異なる eTLD+1 のドメイン間では Cookie の送信条件が不安定になり、CSRF 対策の前提も複雑になる。`COOKIE_SECURE=true`と HTTPS を必須にし、デプロイ先を決める際はこのドメイン構成を先に確認すること。

### 3. `docker-compose.yml` の環境変数配線漏れ
`docker-compose.yml` の各サービスの `environment:` に明示的に書かれていない環境変数は、たとえホスト側で `-e VAR=val docker compose up` としても**コンテナには一切渡らない**。フロントエンドが参照する `NUXT_PUBLIC_API_BASE_URL`(バックエンドの到達可能URL、`http://localhost:${BACKEND_PORT:-3000}` — SPAはブラウザから叩くのでdocker内部のサービス名ではなくホスト公開ポートを指す必要がある)がこれで一度配線漏れした。
→ 新しい環境変数をフロント/バックエンドに追加する際は、必ず `docker-compose.yml` の `environment:` ブロックに明示し、`docker compose exec <service> printenv | grep <VAR>` で実際に渡っているか確認すること。

### 4. Nuxtのサブディレクトリコンポーネント自動登録プレフィックス
Nuxtはデフォルトで `components/tasks/TaskNode.vue` を `<TasksTaskNode>` という**ディレクトリ名プレフィックス付き**のタグ名で自動登録する。テンプレート内で `<TaskNode>` のように素の名前で参照すると、ビルド・型チェックのエラーにはならず、未知のネイティブ要素として無音でレンダリングされ(Vue devモードのコンソール警告のみ)、機能が完全に壊れる。
→ `frontend/nuxt.config.ts` に `components: [{ path: "~/components", pathPrefix: false }]` を設定済み。サブディレクトリにコンポーネントを追加する際は、この設定があるおかげでディレクトリ名を気にせず素の名前で参照してよい。

### 5. vue-draggable-plus(Sortable.js)の`chosenClass`/`ghostClass`/`dragClass`に複数クラス文字列を渡す
Sortableはこれらのオプション値をそのまま`element.classList.add(value)`に渡す。Tailwindの複数ユーティリティクラスをスペース区切りの1文字列として渡すと(例: `"opacity-50 outline outline-2"`)、`classList.add()`はスペースを含む値で例外を投げる。ビルド・型チェックはすべて通過し、コンソールにもエラーが出ない場合がある一方、ドラッグ操作自体が完全に無反応になる(`chosen`/`ghost`状態が一切適用されないため、Sortableの内部初期化が失敗する)。実ブラウザで`page.on("pageerror", ...)`を仕込んで初めて例外が可視化された。
→ 各状態(`chosen`/`ghost`/`drag-clone`等)ごとに、複数のTailwindユーティリティをまとめた単一のカスタムCSSクラス(例: `.task-card-chosen { opacity: 0.5; ... }`)を`frontend/assets/css/main.css`に定義し、Sortableへは常に単一トークンのクラス名のみを渡すこと。

同様の理由で、ドラッグ中に追従するフォールバック要素(`fallback-class`で指定)には`transition: transform`を含むクラスを付与しないこと。SortableはドラッグClone要素の位置を毎フレーム`transform: translate3d(...)`で直接更新するが、Tailwindの`transition`ユーティリティ(`transform`を含む)が付いていると、この更新がイージングされてカーソルに追従できなくなる(見た目には「ゆっくりずれてついてくる」程度の症状になり、不具合と気づきにくい)。

### 6. Prismaマイグレーション再生成時、スキーマ言語で表現しきれないDB機能がdriftとしてDROPされる
MySQLの`STORED GENERATED COLUMN`+`UNIQUE INDEX`のように、Prismaスキーマ言語では`Unsupported("...")`としてしか表現できないDB機能を含むテーブルがある場合、そのテーブルに対して`prisma migrate dev`を再実行すると、Prismaは生成列や関連インデックスを「スキーマに存在しないdrift」と誤検知し、それらをDROPする追従マイグレーションを自動生成してしまう。`prisma validate`・型チェックのどちらでも検出できず、マイグレーション適用後に実DBを見て初めて「意図せずインデックスが消えた」形で発覚する。
→ スキーマ言語で完全に表現できないDB機能を含むマイグレーションを再生成・再適用する際は、`prisma migrate dev`(diffを取ってから適用)ではなく`prisma migrate deploy`(ハンドエディット済みのSQLファイルをdiffなしでそのまま適用)を使うこと。該当のマイグレーションSQLファイル自体にも、この経緯と`migrate dev`を使ってはいけない旨のコメントを残し、次にスキーマを変更する人が同じ罠を踏まないようにする。

### 7. Vueの`<Transition>`は祖先の`v-if`では効かない
`<Transition>`でラップした要素の表示/非表示を、`Transition`自身ではなくその**祖先**(`<template v-if="...">`など、`Transition`コンポーネントごと存在するかどうかを切り替える箇所)の条件分岐で制御すると、条件が`false`になった瞬間に`Transition`コンポーネント自体が丸ごと破棄され、`leave`のトランジションクラスが一切適用されないまま要素が即座に消える。ビルド・型チェック・(DOM環境のない)ユニットテストのいずれでも検出できず、実ブラウザで実際に閉じる操作をして初めて「アニメーションが効いていない」と気づく。
→ `v-if`は`Transition`が直接ラップする要素**自身**に付けること(`<Transition><div v-if="open">...</div></Transition>`)。背景クリック用のオーバーレイなど、アニメーションが不要な兄弟要素は別に`v-if`を付けて構わない。

### 8. 認証用必須環境変数の未設定または Origin 不一致
バックエンド起動時検証では次が必須である。
- `SESSION_SECRET`
  - 64桁の16進数(32バイト)
- `CORS_ORIGIN`
  - フロントの公開 Origin(例: `http://localhost:3001`)
- `COOKIE_SECURE`
  - ローカル HTTP では `false`

未設定だと Compose が空文字を渡し、起動時に Zod 検証で落ちる。`CORS_ORIGIN` が実際のフロント公開 URL(ポート含む)と一致しないと、preflight 後に登録・ログインが失敗する。`.env.example` をコピーして揃え、変更後は `docker compose exec backend printenv | grep -E 'SESSION_SECRET|CORS_ORIGIN|COOKIE_SECURE'` でコンテナへ渡っているか確認する。

### 9. ブランチ切替後の Prisma Client 不整合
`backend_node_modules` ボリューム内の生成済み Prisma Client は、ブランチを切り替えても自動では更新されない。`user-auth` のようなスキーマ差分があるブランチへ戻った直後に、ソース上は `email` / `passwordHash` があるのに Client が古いと、テストが `Unknown argument email` で大量失敗する。
→ スキーマやブランチを切り替えたあとは、テスト前に `docker compose run --rm -T backend npx prisma generate` を実行する。必要なら `prisma migrate status` で DB も最新か確認する。

### 10. CSRF トークン取得後の session Cookie 更新
`GET /api/auth/csrf` はトークン発行時に session Cookie を更新する。`app.inject` や手動の Cookie 組み立てで、csrf 取得前の古い Cookie のまま変更系 API を呼ぶと `Missing csrf secret` や 403 になる。
→ csrf レスポンスの `Set-Cookie` を反映した最新 Cookie を、続けて呼ぶ POST / PATCH / DELETE / logout に使う。ブラウザ上の `useApiClient` はこれを自動で扱うが、統合テストヘルパでは明示的に更新する。

## Playwright(E2E)実行時の注意

`docker compose run` はコマンドごとに使い捨てコンテナを作るため、あるコマンドで `npx playwright install --with-deps chromium` してブラウザバイナリを入れても、**次の `docker compose run` invocationには一切残らない**。実行のたびに毎回インストールするコストを避けたい場合は、ホストにNode.jsがあれば `frontend/node_modules`/`package-lock.json` を汚さないスクラッチディレクトリ(例: `/tmp/.../scratchpad/pw`)に `@playwright/test` を単独インストールし、公開済みポート(`http://localhost:<FRONTEND_PORT>`)に対してホスト側から実行するのが安定する。

またVite devサーバーの `server.allowedHosts` はデフォルトで `localhost` のみ許可するため、`http://frontend:3001` のようなdocker内部サービス名でアクセスすると403になる。これはセキュリティ機能であり修正対象のバグではない — 実ブラウザ検証は必ず `localhost:<公開ポート>` 経由で行うこと。

E2E では `E2E_BASE_URL` を実際のフロント公開 URL に合わせ、同時にバックエンドの `CORS_ORIGIN` も同じ Origin にする。例: フロントが `http://localhost:3401` なら、両方をその値に揃えてから `npm --prefix frontend run test:e2e` を実行する。詳細は [[testing]] を参照。

## 検証の原則

フロントエンド/バックエンドを結線するタスク、および外部UIライブラリを統合するタスクでは、**ビルド成功・型チェック通過・ユニットテストグリーンだけで完了と判断しない**。必ず `docker compose up` で実際に起動し、実ブラウザ(または Playwright、`page.on("pageerror", ...)`のようなコンソール監視込み)で該当機能を操作して確認すること。上記4件はすべてこの手順によってのみ発見された。
