# Brief: user-auth

## Problem

認証がなく、誰でも API／画面から全データに触れる前提になっている。今後ワークスペース・コメント・操作ログ・将来の MCP 利用へ進むにあたり、「誰が操作しているか」をサーバが保証できない。

## Current State

- `User` は id と name のみ。担当者選択リストとして使われている
- `/users` で名前の登録・一覧・削除ができる。ログイン／パスワード／セッションはない
- Fastify に認証 preHandler はなく、フロントに route middleware もない
- CORS は `origin: true`、フロント `$fetch` は credentials 未使用
- product.md / tech.md では認証は Out of Boundary と明記されている

## Desired Outcome

- 誰でも自己登録でき、一意なメールアドレス・表示名・パスワードでアカウントを持てる
- ログイン後は HttpOnly Cookie セッションで API を利用できる。ログアウトできる
- 公開エンドポイント（登録・ログイン・csrf・ヘルス・client-errors 等）以外は未ログインなら拒否される
- フロントに登録／ログイン画面があり、未ログイン時は業務画面を描画せずログインへ誘導する
- 既存の名前だけ User は破棄前提で、`User` をアカウントモデルへ拡張する
- ログイン済みユーザー同士の権限差は作らない（対等）

## Approach

Cookie セッション（Approach A）。`@fastify/cookie` + `@fastify/secure-session` と `@node-rs/argon2`、`@fastify/csrf-protection` を用い、auth モジュールで register／login／logout／currentUser を提供する。API ハンドラは currentUser だけに依存し、Cookie 実装詳細に触れない。CORS は credentials 対応に更新し、フロントは `credentials: 'include'` とする。画面は Claude Design `Auth Final Spec.dc.html` を正本とする（詳細は research.md）。

## Scope

- In
  - `User` のアカウント化（認証用識別子・パスワードハッシュ等）
  - 公開自己登録、ログイン、ログアウト、セッション維持
  - 要ログイン API ガードとフロントの登録／ログイン UI・ルートガード
  - 既存 `/users` の「名前だけ登録」UI／API の廃止または認証後フローへの置換
  - steering（product.md / tech.md 等）の認証前提更新
- Out
  - ワークスペース概念（次仕様）
  - 案件・タスクのテナント分離（その次）
  - ロール／細かい権限、招待リンク、メール送信、OAuth
  - JWT／MCP トークン

## Boundary Candidates

- アカウント／資格情報（スキーマ・ハッシュ・登録）
- セッション発行・検証・破棄
- HTTP／フロントのガードとログイン UI

## Out of Boundary

- ワークスペースの作成・招待
- データスコープ（Case／Task の所属）
- RBAC、外部 IdP、パスワードレス

## Upstream / Downstream

- Upstream
  - 既存 `User` モデルと users モジュール（拡張・置換対象）
- Downstream
  - workspace-membership、コメント／操作ログ、将来の API トークン

## Existing Spec Touchpoints

- Extends（コードのみ、spec 文書は凍結）
  - `task-delivery-management` の User／担当者周り
- Adjacent
  - 担当者フィルタやカンバンの assignee 選択（意味は後続でワークスペースメンバーに寄る）

## Constraints

- Nuxt 4 SPA + Fastify 5 + Prisma + MySQL
- ローカル HTTP でも動作すること（`SameSite=Lax`、`Secure` は環境に応じて）
- 将来本番では同一親ドメイン配下を前提に Cookie 設計する
- 画面追加のため claude design ゲート対象
