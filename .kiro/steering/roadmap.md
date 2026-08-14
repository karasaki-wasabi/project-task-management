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
- [ ] user-avatar -- `userId` から決定的に生成する identicon を、担当者・コメント投稿者・メンバー一覧・ヘッダー等のユーザー名表示へ一貫して出す。画像アップロードは対象外。Dependencies: user-auth, workspace-membership, task-detail
- [ ] velocity-dashboard -- ストーリーポイントと消化ペース／案件見通しのダッシュボード。Dependencies: workspace-resource-scope, task-detail, task-status-model

## Phase: Frontend workspace URL

ワークスペース導入後も画面 URL がフラットなままなので、業務画面を `/workspaces/:workspaceId/...` に移し、URL を現在ワークスペースの正本にする。旧フラット URL と非所属 ID は 404。API パス変更はしない。

- [x] workspace-url-routing -- 業務画面 URL のワークスペース配下化、`/` の last-used／一覧分岐、Switcher の同一画面種付け替え、URL 一覧の確定。Dependencies: workspace-membership, workspace-resource-scope
- [x] error-page -- 共通エラーページ(`error.vue`)。404/403/401/500 と汎用 4xx/5xx の文言・導線、実行時 fatal の Error Page 接続。Dependencies: workspace-url-routing（非所属・不明な workspaceId の既存 404 経路を利用。401/403 の新規発生源は持たない）

