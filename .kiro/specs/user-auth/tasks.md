# Implementation Plan

## Implementation Notes

- ビジュアル正本: `research.md` の Claude Design `Auth Final Spec.dc.html`
- 既存 User データは破棄前提。破壊的 migrate を許容する
- User の論理削除経路は作らない（email 一意との衝突回避）
- CSRF 免除: register / login / csrf GET / health。logout と業務の変更系、および `POST /api/client-errors` は CSRF 必須
- requireUser 除外: health / register / login / csrf / client-errors（CSRF 免除リストとは別）
- 未ログイン業務 URL はゲート専用ページを作らず `/login?redirect=` へリダイレクト
- steering 更新は Req 7（本スペック Boundary）

- [ ] 1. Foundation: 依存・環境変数・スキーマ・テストヘルパ
- [x] 1.1 認証用バックエンド依存と環境変数を追加する
  - `@fastify/cookie`・`@fastify/secure-session`・`@fastify/csrf-protection`・`@node-rs/argon2` を追加する
  - `SESSION_SECRET`・`CORS_ORIGIN`・`COOKIE_SECURE` を env 検証と docker-compose に追加する
  - 観測可能な完了状態: バックエンドが新環境変数なしでは起動時検証に失敗し、値ありでは依存を resolve して起動できる
  - _Requirements: 2.3, 3.3, 7.1_
  - _Boundary: env, package.json_

- [ ] 1.2 User をアカウント用スキーマへ拡張し migrate する
  - `email`（一意）・`passwordHash` を追加し、`name` を表示名として維持する
  - 開発 DB に破壊的適用してよい
  - 観測可能な完了状態: `prisma validate` が通り、DB 上に email / password_hash 列がある
  - _Requirements: 1.2, 1.3, 1.5_
  - _Depends: 1.1_

- [ ] 1.3 unauthorized ヘルパと inject 用セッション／CSRF テストヘルパを追加する
  - `HttpError` に 401 用ヘルパを追加する
  - 統合テストからセッション Cookie 付与と CSRF ヘッダ付与ができるヘルパを用意する
  - 観測可能な完了状態: ヘルパを呼ぶ最小テスト、または型付きエクスポートで付与手段が利用できる
  - _Requirements: 3.3, 6.1_
  - _Depends: 1.1_

- [ ] 2. Core: auth モジュール
- [ ] 2.1 Auth repository / service を実装し単体テストする
  - email の trim・小文字正規化、argon2 ハッシュ、register / login / getPublicUser を実装する
  - ロールを持たない。PublicUser に passwordHash を含めない
  - 単体テスト: 成功登録、email 重複、短いパスワード、空白表示名、ログイン失敗の固定文言、未知 email と誤りパスワードが同一文言
  - 観測可能な完了状態: 上記単体テストが green
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 2.2, 2.5, 5.1, 5.2, 6.1, 6.2_
  - _Boundary: AuthService_
  - _Depends: 1.2_

- [ ] 2.2 Auth HTTP ルートを実装する
  - `POST register` / `POST login` / `POST logout` / `GET me` / `GET csrf` を design 契約どおり公開する
  - register / login 成功時に session へ userId を書き込み、logout で破棄する（Cookie 属性のプラグイン設定はタスク 3）
  - 登録成功は自動ログイン状態（セッション確立）になる
  - 観測可能な完了状態: ルート単体または inject で各エンドポイントが契約どおり応答する（アプリ全体ガード前でも検証可）
  - _Requirements: 1.1, 1.7, 2.1, 2.4, 3.1_
  - _Boundary: AuthRoutes_
  - _Depends: 2.1_

- [ ] 2.3 requireUser ガードを実装する
  - 有効セッションの userId から PublicUser を付与し、セッション欠落・無効・ユーザー不在は 401 とする（本仕様では User 削除経路を作らない）
  - 観測可能な完了状態: ガード単体テストで付与成功と 401 を確認できる
  - _Requirements: 3.3, 3.4_
  - _Boundary: auth.guard_
  - _Depends: 2.1_

- [ ] 3. app に CORS・セッション・CSRF・ガードを配線する
  - credentials CORS（`CORS_ORIGIN`）、secure-session（HttpOnly / SameSite=Lax / `COOKIE_SECURE` / 有効期限 7 日）、csrf-protection を登録する
  - CSRF ヘッダ名をライブラリ既定で固定し、design.md CSRF 節に1行追記する
  - requireUser 除外: health / register / login / csrf / client-errors
  - CSRF 免除: register / login / csrf GET / health（logout と client-errors と業務変更系は CSRF 必須）
  - auth ルートを登録し、それ以外の `/api/*` に requireUser を適用する
  - 観測可能な完了状態: 未ログインで業務 GET が 401、register→me が Cookie 付きで 200、CSRF なしの業務 POST が拒否される
  - _Requirements: 2.3, 3.3, 3.4_
  - _Boundary: app.ts_
  - _Depends: 2.2, 2.3, 1.3_

- [ ] 4. (P) users を一覧のみへ縮退する
  - `POST /api/users` と `DELETE /api/users/:id` を削除する
  - `GET /api/users` は要ログインで PublicUser 一覧（表示名）を返す
  - 観測可能な完了状態: create/delete ルートが存在せず、ログイン済み list が 200 になる
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - _Boundary: UsersList_
  - _Depends: 3_

- [ ] 5. 認証まわりの統合テストを追加する
  - 登録・ログイン・me・logout、未ログイン業務 API 401、CSRF ルール、users 縮退を検証する
  - 観測可能な完了状態: 該当統合テストが CI 相当コマンドで green
  - _Requirements: 1.3, 1.7, 2.1, 2.2, 2.4, 3.3, 3.4, 4.1, 4.2, 6.1, 6.2_
  - _Depends: 3, 4_

- [ ] 6. Core: フロントエンド認証
- [ ] 6.1 (P) useApiClient に credentials・auth API・CSRF を入れる
  - `credentials: 'include'`、register/login/logout/me/csrf、createUser/deleteUser 削除
  - 初期化時およびログイン／登録成功直後に csrf を取得し、変更系へヘッダ付与する
  - 観測可能な完了状態: 型上 auth メソッドが使え、旧 createUser/deleteUser 参照がクライアントから消える
  - _Requirements: 1.1, 2.1, 2.4, 3.3, 4.1_
  - _Boundary: useApiClient_
  - _Depends: 3_

- [ ] 6.2 (P) useAuth と auth.global middleware を実装する
  - 公開は `/login` `/register`。他は me 成功必須、失敗時は描画せず `/login?redirect=`
  - ログイン済みで login/register に来たら `/` へ
  - 観測可能な完了状態: 未ログインで `/tasks` がログインへ飛び、ログイン後に業務画面へ入れる
  - _Requirements: 3.1, 3.2, 3.4_
  - _Boundary: auth.global, useAuth_
  - _Depends: 6.1_

- [ ] 6.3 (P) 登録・ログイン画面を確定モックどおり実装する
  - 左右分割、パスワード表示切替、上部エラー、登録成功は自動ログインで `/`、ログインは redirect 対応
  - 認証画面では業務ナビを出さない
  - 観測可能な完了状態: ブラウザで登録→ダッシュボード、ログイン失敗の固定文言を確認できる
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.5, 6.1, 6.2_
  - _Boundary: LoginPage, RegisterPage_
  - _Depends: 6.1_

- [ ] 6.4 ヘッダーに表示名・ログアウトを付け、旧ユーザー画面を廃止する
  - 既存ナビは維持し `/users` のみ除去。右に表示名と Secondary ログアウト
  - `/users` ページを削除し、直リンクは `/` または同等の非提供にする
  - 観測可能な完了状態: ログイン後ヘッダーに表示名があり、ログアウト後は業務画面に入れず、`/users` が使えない
  - _Requirements: 2.4, 3.4, 4.1, 4.4_
  - _Boundary: app.vue, app.helpers_
  - _Depends: 6.2, 6.3_

- [ ] 7. E2E を認証前提へ更新する
- [ ] 7.1 名前登録の代わりに登録＋ログインする共有 fixture へ置き換える
  - `/users` で名前だけ作っていた E2E を新ヘルパへ切り替える
  - 観測可能な完了状態: 旧 `/users` 名登録手順に依存する E2E が残っていない
  - _Requirements: 4.1, 4.4_
  - _Depends: 6.4_

- [ ] 7.2 認証のクリティカルパス E2E を追加する
  - 登録→ダッシュボードに表示名、ログイン失敗固定文言、ログアウト後の遮断、未ログイン `/tasks`→ログイン→復帰、担当者候補に表示名
  - 観測可能な完了状態: 上記シナリオの E2E が green
  - _Requirements: 1.7, 2.1, 2.2, 2.4, 3.2, 3.4, 4.2, 4.4, 6.1, 6.2_
  - _Depends: 7.1_

- [ ] 8. (P) steering を認証あり前提へ更新する
  - `product.md` / `tech.md` / `local-dev-pitfalls.md` から「認証なし・名前だけ User」前提を改め、アカウント登録と Cookie セッションがある前提にする
  - ワークスペース・RBAC・外部 IdP・機械用トークンは後続である旨を残す
  - CORS credentials と同一親ドメイン前提の注意を local-dev-pitfalls に追記する
  - 観測可能な完了状態: 当該 steering に認証なし前提の断定が残っていない
  - _Requirements: 7.1, 7.2_
  - _Boundary: steering_
  - _Depends: 3_
