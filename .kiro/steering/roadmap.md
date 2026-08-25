# Roadmap

## Overview

タスク・案件 CRUD が一区切りしたタイミングで、公開自己登録と Cookie セッションによる本格認証を入れ、続けて「ワークスペース」を可視境界として導入する。案件（Case）・タスクはワークスペース配下に属し、招待（当面はユーザー検索での追加）されたメンバーだけが読み書きできる。

認証方式は HttpOnly Cookie セッション（Approach A）。細かい RBAC・招待リンク・メール送信・JWT／MCP トークンは後続とする。認証とワークスペースが揃った後に、タスク詳細（コメント・操作ログ）へ進む。ユーザー名の視覚的識別（user-avatar）はタスク詳細・カンバン・メンバー一覧へ差し込むフロント専用仕様で、velocity-dashboard とは独立に進める。消化ペース可視化（velocity-dashboard）はタスク詳細の後続とする。

タスク詳細の検討過程で、ステータスと開発段階に軸が混在しており、タスク全体の完了をシステムが判定できない（＝消化数を自動集計できない）ことが判明した。完了判定を開発段階の種別へ移す task-status-model を切り出し、操作ログがステータス語彙を永続化し始める前に先行させる。

あわせて、表示名と API／DB 名のずれ（メモ／`memo`、予定日／`scheduledDate`）は task-detail より前に task-field-rename で解消済み。完了済み仕様文書は触らず、コード側を `detail` / `scheduledEndDate` に揃えた（将来の開始予定日は `scheduledStartDate`）。

## Approach Decision

- Chosen
  - Cookie セッション認証 + ワークスペース段階導入
  - `User` をアカウントへ拡張（既存データは破棄前提）
  - ログイン済みユーザーは権限上対等。見える範囲はワークスペース所属で決める
  - 招待はユーザー検索でのメンバー追加を先に入れ、リンク招待は後続
- Why
  - ブラウザ SPA が主戦場で、ログアウト／無効化がしやすい
  - 案件と紛らわしい「プロジェクト」ではなく、可視境界としてワークスペースを置く
  - 後続のコメント／操作ログに操作者（ログインユーザー）を載せやすい
  - MCP 用 Bearer トークンは認証境界を保ったまま後付け可能
- Rejected alternatives
  - JWT Bearer 主軸（Approach B）: MCP 親和性はあるが、当面はブラウザ中心のため見送り
  - 認証とワークスペースを1仕様に圧縮: レビュー単位が大きく切り分けにくい
  - 薄い操作者選択だけの先行: 本格認証が近いため二重投資になる

## Scope

- In
  - 公開自己登録、ログイン／ログアウト、Cookie セッション、要ログイン API／画面ガード
  - ワークスペースの作成・所属・メンバー追加（ユーザー検索）
  - 案件・タスク等のワークスペーススコープ化
  - 後続: タスク詳細画面（コメント・操作ログ・CRUD）、user-avatar、velocity-dashboard
- Out
  - 画面・操作単位の細かい RBAC
  - 招待リンク、メール送信、OAuth／外部 IdP
  - JWT／MCP トークン発行（将来別仕様）
  - 本番マルチドメイン構成の最終決定以外のインフラ大規模変更

## Constraints

- スタック: Nuxt 4（SPA） / Fastify 5 / Prisma / MySQL / Zod / pino
- Cookie セッション: CORS `credentials`、フロント `credentials: 'include'`、CSRF 対策をセットで入れる
- ローカルは HTTP + `SameSite=Lax` で可。将来本番ではフロントと API を同一親ドメイン配下に置く前提を踏まえる
- product.md / tech.md / local-dev-pitfalls.md は user-auth 完了時点で Cookie 認証前提へ更新済み。追加の運用注意は [[local-dev-pitfalls]] / [[structure]] / [[testing]] を参照
- 凍結済み spec 文書は更新せず、コード拡張で進める（velocity-dashboard brief と同じ方針）
- 画面変更を含む仕様は `.kiro/steering/ui-design.md` の claude design ゲート対象

## Boundary Strategy

- Why this split
  - アカウント／セッション、ワークスペース所属、データスコープ、詳細画面協調、消化数拡張はレビュー単位が異なる
  - 公開登録があるため、実装順は auth → ワークスペース → データスコープを固定する（ローカル開発でも半端な状態を避ける）
- Shared seams to watch
  - currentUser は auth モジュール経由のみ。ハンドラが Cookie 実装詳細に依存しない
  - データアクセスの所属チェックは認証方式と分離し、将来のトークン認証でも再利用可能にする
  - 担当者選択は「同一ワークスペースのメンバー」に寄せる
  - Case（案件）と Workspace（可視境界）の用語を UI／API で混同しない

## Specs (dependency order)

- [x] user-auth -- User をアカウントへ拡張し、公開自己登録と Cookie セッション認証を入れる。Dependencies: none
- [x] workspace-membership -- ワークスペース作成・所属・ユーザー検索でのメンバー追加・現在ワークスペース選択。Dependencies: user-auth
- [x] workspace-resource-scope -- 案件・タスク等をワークスペース配下へ移行し、所属外アクセスを拒否する。Dependencies: workspace-membership
- [x] task-status-model -- 開発段階に種別（通常/完了/中止）を持たせ、完了判定と `completedAt` 打刻をステータスから段階到達へ移す。ステータスは段階内の作業状態へ再定義する。Dependencies: none（ワークスペース系とは独立。操作ログが記録するステータス語彙を確定させるため task-detail より先行させる）
- [x] task-field-rename -- `memo`→`detail`、`scheduledDate`→`scheduledEndDate` の API／DB／文言揃え。将来の開始予定日は `scheduledStartDate` と命名予約（カラム追加はしない）。完了済み仕様文書は更新しない。Dependencies: none（task-detail より先行）
- [x] task-detail -- モーダルは簡易表示のまま、詳細画面でコメント・操作ログ・CRUD を提供する。Dependencies: workspace-resource-scope, task-status-model, task-field-rename
- [x] user-avatar -- `userId` から決定的に生成する identicon を、担当者・コメント投稿者・メンバー一覧・ヘッダー等のユーザー名表示へ一貫して出す。画像アップロードは対象外。Dependencies: user-auth, workspace-membership, task-detail
- [x] velocity-dashboard -- ストーリーポイントと消化ペース／案件見通しのダッシュボード。Dependencies: workspace-resource-scope, task-detail, task-status-model, module-boundary-cleanup

## Phase: Frontend workspace URL

ワークスペース導入後も画面 URL がフラットなままなので、業務画面を `/workspaces/:workspaceId/...` に移し、URL を現在ワークスペースの正本にする。旧フラット URL と非所属 ID は 404。API パス変更はしない。

- [x] workspace-url-routing -- 業務画面 URL のワークスペース配下化、`/` の last-used／一覧分岐、Switcher の同一画面種付け替え、URL 一覧の確定。Dependencies: workspace-membership, workspace-resource-scope
- [x] error-page -- 共通エラーページ(`error.vue`)。404/403/401/500 と汎用 4xx/5xx の文言・導線、実行時 fatal の Error Page 接続。Dependencies: workspace-url-routing（非所属・不明な workspaceId の既存 404 経路を利用。401/403 の新規発生源は持たない）

## Phase: Backend module boundaries

クロスモジュールの repository／Prisma 直呼びを、通常の service および読み取り／整合専用公開面へ寄せた（Approach A）。画面・対外 API 契約は変えていない。

- [x] module-boundary-cleanup -- クロスモジュールの repository／Prisma 直呼びを、通常の service および読み取り／整合専用公開面（`caseReadService`／`taskIntegrityService`、必要なら `client?: DbClient`）へ寄せ、整合・集計・初期投入の所有を明示する。Dependencies: none（既存モジュール実装に対する修復。完了後は velocity-dashboard の集計公開面の前提になる）

## Phase: API load testing and list performance

カレンダーの `GET /api/tasks` が約 6000 件で固まる問題をきっかけに、一覧系 API のデータ量負荷と同時アクセス用ハーネスを整え、計測結果に基づいて一覧 GET を改善する。データ量を本丸とし、同時アクセスは本番寄り環境で回せるシナリオまでリポジトリに置く（ローカル Docker を本番級の同時負荷対象にはしない）。

### Approach Decision（本 Phase）

- Chosen
  - Grafana k6 でシナリオ（データ量／同時アクセス）を記述
  - 大量データは専用シード（専用ワークスペース、開発 seed / E2E と分離）
  - 改善は計測後に `GET /api/tasks` を優先し、他の無制限一覧へ展開
- Why
  - 同時アクセス用ハーネスを本番寄り環境へ持ち運べる
  - Cookie セッション + `X-Workspace-Id` の GET 負荷と相性が良い（変更系 CSRF は GET 負荷に不要）
  - 計測と改善・データ投入のレビュー単位を分けられる
- Rejected alternatives
  - Node 内製（autocannon 等）のみ: Compose 内完結は楽だが、本番寄り同時アクセスの標準感で k6 に劣る
  - Vitest の応答時間アサートのみ: 同時アクセス／本番寄り実行の土台にならない

### Scope（本 Phase）

- In
  - 一覧 GET のデータ量計測と、必要に応じた改善
  - 同時アクセス用 k6 シナリオと実行手順（実行自体は本番寄り環境向け）
  - 規模データ投入コマンド（専用 WS）
- Out
  - フロント描画固まりの改善
  - 書き込み API の負荷
  - CI での毎回必須ゲート化
  - AWS 上での実負荷実行そのもの（スクリプトと手順の整備は In）

### Constraints（本 Phase）

- k6 バイナリはホストまたは公式イメージ。スクリプトはリポジトリ管理（AGPL はバイナリ側。通常スクリプトは汚染しない）
- 大規模 seed と負荷は専用ワークスペースに閉じ、Vitest / E2E 共有 DB 運用と衝突させない掃除方針を持つ
- 凍結済み機能スペック文書は更新せず、コードと本 Phase の新スペックで進める

### Boundary Strategy（本 Phase）

- Why this split
  - ハーネス、データ投入、API 改善は失敗モードとレビュー観点が異なる
- Shared seams to watch
  - 認証 setup（login Cookie / 必要なら CSRF 取得後の jar）と `X-Workspace-Id`
  - seed 対象 WS と計測ターゲットの一致
  - 一覧契約変更（日付範囲・ページネーション等）がカレンダー／カンバン／タスク一覧に与える影響

### Specs (dependency order)

- [x] scale-data-seed -- 一覧負荷用の大量データを専用ワークスペースへ投入するシード／コマンド。Dependencies: none
- [ ] api-load-harness -- k6 による一覧 GET のデータ量・同時アクセスシナリオと実行手順。Dependencies: none（大規模シナリオの前提データは scale-data-seed）
- [ ] list-api-performance -- 計測に基づく一覧 GET 改善（`GET /api/tasks` 優先、他一覧は必要に応じて）。Dependencies: scale-data-seed, api-load-harness

