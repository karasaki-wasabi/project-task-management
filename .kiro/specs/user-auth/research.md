# Gap Analysis: user-auth

注意: `spec.json` 時点で `approvals.requirements.approved` は false。ギャップ分析は要件改訂の材料にも使えるが、design 前に要件承認を推奨する。

## 1. 現状調査 (Current State)

### 認証・セッション
- 認証・セッション・JWT・Cookie プラグイン・Nuxt `middleware/` はいずれも不在
- `backend/src/app.ts`: CORS は `origin: true`、`credentials` なし。ルート登録のみ。auth preHandler なし
- `backend/package.json`: `@fastify/cors` / `fastify` / `prisma` / `zod` / `pino` のみ。cookie / session / パスワードハッシュ依存なし
- `backend/src/config/env.ts`: `DATABASE_URL` / `LOG_LEVEL` / `PORT` のみ。セッション秘密鍵用の環境変数なし
- `frontend/composables/useApiClient.ts`: `$fetch` 一箇所が HTTP 境界。`credentials` 未指定
- `frontend/nuxt.config.ts`: SPA (`ssr: false`)、`apiBaseUrl` は別オリジン既定 (`http://localhost:3000`)

### User ドメイン
- Prisma `User`: `id`, `name`, `createdAt`, `updatedAt`, `deletedAt`。email / password なし。`name` に一意制約なし
- `backend/src/modules/users/`: create(name) / list / delete(soft)。コメント上も「No authentication」
- API: `POST/GET/DELETE /api/users`。GET by id・名前更新なし
- FE: `frontend/pages/users/index.vue` で名前登録・一覧・削除。ナビ「ユーザー」(`app.helpers.ts`)
- 担当者候補: `listUsers` を `/tasks`・`/kanban`・`/calendar`・`AssigneeFilter`・`TaskDetailModal` が利用

### 再利用可能なパターン
- モジュール構成: `routes → service → repository`、Zod 検証、`HttpError`、soft-delete Extension
- FE エラー: `ErrorAlert` + try/catch（作成系）
- Modal / フォームの既存 chrome（登録・ログイン画面の見た目は claude design ゲート対象）
- 統合テスト: `app.inject` によるルート検証、`validation.integration.test.ts`
- E2E: Playwright。多数が `/users` で名前ユーザーを先に作ってから担当者シナリオを実行

### Steering 上の制約
- `product.md` / `tech.md`: 認証は Out of Boundary、User は名前だけの担当者
- `local-dev-pitfalls.md`: CORS 必須。現行は認証なし前提の Origin 反射
- `structure.md`: 認証は他ドメインが無断で肩代わりしない境界例として記載 → 本仕様で正式に所有を定義する
- Requirement 7 により、完了時に上記前提の更新が必須

## 2. Requirements Feasibility Analysis（要件→資産マップ）

| Requirement | 必要な技術要素 | 現状資産 | ギャップ種別 |
|---|---|---|---|
| 1. 自己登録 | email 一意・表示名・password hash、登録 API／画面 | User.name のみ、`POST /api/users` は name のみ | Missing |
| 2. ログイン／ログアウト／セッション | セッション発行・破棄、ログイン UI、Cookie 送信経路 | なし | Missing |
| 3. 未ログイン保護 | API 共通ガード、FE ルートガード、公開ルート例外 | `/health` のみ公開的。全業務 API が無防備 | Missing |
| 4. 名前登録廃止＋担当者候補 | `/users` UI／`createUser`／`deleteUser` の廃止または置換、一覧は表示名、E2E 導線更新 | 名前登録と delete が現役。多数 E2E が依存 | Missing + Constraint（破壊的変更） |
| 5. 権限対等 | ロールを作らないこと | ロールなし（偶然満たしている） | ギャップなし（維持） |
| 6. 誤り表示 | 登録／ログイン失敗の利用者向けメッセージ、ログイン失敗の情報抑制 | ErrorAlert パターンあり | Constraint（新画面へ適用） |
| 7. steering 更新 | product.md / tech.md / local-dev-pitfalls 等 | 認証 OoB の記述が残存 | Missing（文書） |

**Research Needed（design へ持ち越し）**:
- Cookie 属性のローカル方針（`SameSite=Lax` + HTTP）と、将来本番の同一親ドメイン前提の具体化
- CSRF 対策の方式（`@fastify/csrf-protection` vs double-submit 等）と、どの変更系 API に適用するか
- セッション実装: `@fastify/secure-session`（Cookie 内暗号化・ストア不要）vs `@fastify/session` + 永続ストア
- パスワードハッシュ: argon2 vs bcrypt（依存・Docker ビルド制約）
- `User.name` を表示名へ転用するか、`displayName` を新列にするか。email の正規化（小文字化）方針
- 登録成功後の挙動（自動ログインするか、ログイン画面へ誘導するか）— Req 1.7 の解釈
- `POST /api/client-errors` 等を公開のまま残すか、ログイン必須にするか
- グローバル `preHandler` の適用範囲と、ルート単体テスト（inject）でのセッション付与ヘルパ
- E2E のユーザー作成ヘルパを「自己登録＋ログイン」にどう置き換えるか（全 E2E の共通 fixture）
- レスポンス／`listUsers` から password 関連フィールドを絶対に出さない DTO 形状

## 3. 実装アプローチの選択肢

### Option A: 既存 `users` モジュールをアカウント＋認証へ拡張 (Extend)
- `users` に email / passwordHash を追加し、register／login／logout／me も同モジュールに載せる。全ルートにガードを `app.ts` または共有 preHandler で付ける
- 利点: モジュール数が増えない、担当者一覧とアカウントが同一モデルで自然
- 欠点: users が「担当者マスタ」と「認証」の両方を抱え肥大化しやすい。セッション／CORS／CSRF は本来横断関心

### Option B: 新規 `auth` モジュールを新設し、`users` はアカウント読み出しに縮退 (New)
- `auth`: register／login／logout／session／ガード。`users`: 一覧（表示名）のみ。`POST/DELETE /api/users` は廃止
- 利点: structure.md の境界に沿い、後続の workspace／トークン追加時に auth を拡張しやすい
- 欠点: User スキーマ変更は users／auth のどちらが「所有」かを design で明示する必要がある

### Option C: ハイブリッド（推奨候補）
- 新設 `auth` がセッション・登録・ログイン・共通ガード・CORS/credentials／CSRF を所有
- Prisma `User` をアカウント化し、`users` はログイン必須の一覧（担当者候補）に限定。名前登録と他者削除 API／UI を削除
- FE: `/register` `/login`、auth middleware、`useApiClient` に credentials と auth メソッド、`/users` は一覧のみまたはナビから認証導線へ再編
- steering 更新を実装タスクに含める
- 利点: 認証の横断関心と担当者一覧の関心を分離しつつ、単一 User モデルを維持
- 欠点: 初期のファイル数と配線は Option A より多い。E2E／統合テストの一斉更新が必須

## 4. Effort & Risk

| 領域 | Effort | Risk | 理由 |
|---|---|---|---|
| User スキーマ拡張＋登録／ログイン API | M | Medium | 新パターン（hash／一意 email）だが既存モジュール規約に載せられる |
| Cookie セッション＋CORS credentials＋CSRF | M | High | 別オリジン SPA。設定ミスだと「ログインできない／Cookie が付かない」になりやすい |
| API／FE ガード全面適用 | M | Medium | 全モジュールに影響。公開例外の漏れがセキュリティ欠陥になる |
| `/users` 廃止・置換と担当者候補維持 | S–M | Medium | 機能自体は小さいが E2E・画面の破壊的変更が広い |
| steering 更新 | S | Low | 文書作業 |
| E2E／統合テスト一斉更新 | M–L | Medium | `/users` 前提のシナリオが多く、共通ログイン fixture が必要 |

総合: Effort **L**（おおよそ 1–2 週間規模の横断変更）、Risk **High**（主因はクロスオリジン Cookie とガード漏れ。機能要件そのものの難度は Medium）

## 5. Design フェーズへの推奨

- Preferred approach: Option C（`auth` 新設 + `User` アカウント化 + `users` を一覧へ縮退）
- Key decisions to lock in design
  - セッションライブラリと Cookie／CORS／CSRF の具体設定（ローカル HTTP 前提）
  - 公開ルート一覧（register／login／logout？／health／client-errors？）
  - 登録後の自動ログイン有無
  - User フィールド形状（email / displayName / passwordHash）と API 公開 DTO
  - E2E 共通の「登録またはシード＋ログイン」手順
- ビジュアル: 登録・ログイン画面は ui-design.md の claude design ゲート対象。design 前にモック確定が必要
- 後続仕様との接続: currentUser 取得を auth に閉じ、workspace-membership が所属判定だけに依存できる形にする

## 6. 外部依存の所見（調査時点）

- `@fastify/secure-session` + `@fastify/cookie`: 維持中・MIT。ストア不要の Cookie セッション向き
- CORS で Cookie を使う場合: `credentials: true` と具体 Origin（`*` 不可）。FE は `credentials: 'include'`
- ローカル別ポートは same-site 扱いになりやすく `SameSite=Lax` + HTTP で成立しやすい。本番で別 eTLD+1 のままだと cross-site Cookie が不安定 → roadmap の同一親ドメイン前提と一致
- CSRF 対策は Cookie セッション採用時に別途必要（ライブラリバグというより設計必須）
- MCP 用 Bearer は本仕様 Out。auth 境界を currentUser に閉じれば後付け可能

---

## ビジュアルデザイン確定(claude design連携)

確定日: 2026-08-09

### 識別情報

- Claude Design プロジェクト URL
  - https://claude.ai/design/p/159ca27f-ecb8-4e35-8cdc-74e05c366d25
- プロジェクト表示名（Design 上）
  - ユーザーナビ廃止案のヘッダー設計
- 採用モック
  - `Auth Final Spec.dc.html`（最終仕様。代替案は含まない）
- 参考（不採用／過程）
  - `Auth Screens.dc.html`（検討用。実装の正本にしない）
- 依存
  - `support.js`（Design ランタイム。アプリ実装には持ち込まない）

### 採用したレイアウト・主要コントロール

- 登録 `/register`・ログイン `/login`
  - 左右分割。左 38% は slate-900 (#0f172a) にアプリ名のみ。右は slate-50 上に最大幅 360px のフォーム（垂直中央）
  - 登録フィールド: メールアドレス / 表示名 / パスワード（ヘルプ「8文字以上」）
  - パスワード表示切替（目アイコン、aria-label「パスワードを表示 / パスワードを非表示」）
  - エラーはフォーム上部の赤アラートのみ（フィールド横の赤文字なし）
  - 登録 CTA「登録」、ログイン導線「登録済みの場合は ログイン」
  - ログイン CTA「ログイン」、登録導線「アカウントをお持ちでない方は 登録」
  - ログイン失敗文言は常に同一: 「メールアドレスまたはパスワードが正しくありません。」
- ログイン後ヘッダー
  - 既存 sticky 白ヘッダーを維持
  - 右端: 表示名（テキストのみ）+ 区切り線 + Secondary「ログアウト」
  - 旧「ユーザー」ナビは廃止（名前登録画面を持たない）。担当者は各画面の既存セレクト
- 未ログインで業務 URL に来たとき（モック上のゲートカード）
  - モックには白ヘッダー + 「ログインが必要です」カードがあるが、実装はゲート専用ページを作らない（後述の追加合意）
- レスポンシブ（モック記載）
  - 900px 未満: 左パネルを高さ 56px の濃色バーへ。ナビは折り返さず横スクロール
  - 640px 以下ヘッダー: 表示名を先に省略し、ログアウトは残す

### 採用した挙動（design 入力として固定）

- 登録成功時は自動ログインし、ダッシュボードへ遷移する（ログイン画面へは戻さない）
- 未ログインの業務 URL は描画せず `/login?redirect=` へリダイレクトし、ログイン後に元ページへ戻す
- ロール／権限 UI なし。ワークスペース切替・招待・プロフィール編集・パスワード再設定・ソーシャルログインは出さない

### 不採用

- 旧プロンプト案 B（「ユーザー」ナビを読み取り専用一覧として残す）→ ナビごと廃止を採用
- 認証画面以外への濃色左右分割の適用
- `Auth Screens.dc.html` 内の検討バリエーションを正本とすること

### 確定時の追加合意（2026-08-09）

- 登録画面のメールヘルプ「ログインや通知時に使用する…」はそのまま残す（通知機能自体は本仕様 Out。将来実装を見据えて文言のみ許容）
- 登録成功後の遷移先はダッシュボード固定
- ヘッダーナビは既存の全リンクを維持する。モックの「ダッシュボード／タスク／カンバン」はレイアウト見本であり、他ナビを消す意味ではない。除去するのは旧「ユーザー」（名前登録）のみ

---

## Design Discovery / Synthesis（kiro-spec-design）

### Discovery type

- Extension + security-sensitive → light discovery をベースに、セッション／ハッシュライブラリのみ外部検証

### Build vs Adopt

| 領域 | 決定 | 理由 |
|------|------|------|
| セッション | Adopt `@fastify/secure-session` + `@fastify/cookie` | Cookie 内暗号化、ストア不要、App Runner 単一インスタンスでも破綻しにくい。logout は Cookie 破棄で足りる |
| CSRF | Adopt `@fastify/csrf-protection` | Cookie セッション採用時の必須対策 |
| パスワード | Adopt `@node-rs/argon2` | Argon2、prebuilt で Docker ビルド摩擦が少ない |
| サーバセッションストア | 不採用 | 個人／開発規模では過剰。将来 revoke 一覧が必要なら再検討 |

### Generalization

- 「操作主体」は `currentUser`（PublicUser）に正規化。後続の workspace／コメント／操作ログはこれを参照する
- 担当者候補とアカウントは同一 `User`。表示名は既存 `name` 列を転用

### Simplification

- users モジュールに auth を同居させない（Option A 却下）
- JWT／refresh／Remember me UI は作らない
- `client-errors` は公開のまま（ログイン前通報）

### Design decisions locked in design.md

- Option C: `auth` 新設 + User アカウント化 + users 一覧のみ
- 登録成功で自動ログイン → `/`
- ログイン後の業務 URL 復帰は `redirect` クエリ
- email 小文字正規化 + unique
- 公開ルート: health, register, login, csrf, client-errors
- CORS_ORIGIN 明示 + credentials

### validate-design 指摘への反映（2026-08-09）

- CSRF: 未ログインでも `GET /api/auth/csrf` 可。FE は API クライアント初期化時およびログイン／登録成功直後に取得し、変更系ヘッダへ付与。register／login は免除、logout は必須
- User: 論理削除しない（削除 API なし）。`deletedAt` は互換のため残可。email 一意と soft-delete の衝突は当面回避。将来削除が要る場合は別 spec
- 未ログイン誘導: ゲート専用ページは作らず `/login?redirect=` へリダイレクト。モックのゲートカードは参考
