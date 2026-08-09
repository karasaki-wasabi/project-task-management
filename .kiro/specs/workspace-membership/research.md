# Gap Analysis: workspace-membership

## 1. Requirement-to-Asset Map

| Requirement | 既存資産 | ギャップ |
|---|---|---|
| 1. ワークスペースの作成 | `shared/db.ts`（`db`インスタンス）、`shared/soft-delete.repository.ts`（`deletedAt`を持てば自動適用） | **Missing**: `Workspace` Prismaモデル、`workspaces`モジュール一式（types/repository/service/routes）。**Constraint**: 「作成者」を誰として扱うかは、user-authが`requirements-generated`（未承認・design未生成）段階でcurrentUser取得インターフェースがまだ確定していないため、当面は明示的な入力値として受け取る設計が必要 |
| 2. 現在ワークスペースの選択・切替 | なし | **Missing**: 「現在ワークスペース」を保持する場所（サーバ側でユーザーに紐付けて永続化 or クライアント側のみ）が未定義。既存コードに類似の「ユーザーごとの選択状態」を持つ前例なし |
| 3. メンバー一覧の閲覧 | `cases`モジュールのCRUD構成パターン | **Missing**: `WorkspaceMember`モデル（本コードベース初の多対多中間テーブル、既存に前例なし） |
| 4. ユーザー検索によるメンバー追加 | `users`モジュールの`listUsers()`（全件取得のみ、検索・フィルタなし） | **Missing**: 表示名／メールアドレスでの検索クエリ。既存`/api/users`は検索パラメータを持たない |
| 5. メンバーの対等な権限 | — | ギャップなし（ロールフィールドを追加**しない**ことが実装上の制約。既存User/Taskにロール概念は元々存在しない） |
| 6. ワークスペース設定の更新（名前・色、メンバー全員可） | `cases`モジュールのupdate系パターン（Zod検証＋`HttpError`） | **Missing**: `Workspace`モデルへの`color`列（固定6色パレット、enum相当）。既存モジュールに列挙型の入力検証パターンの前例は薄く、Zodの`z.enum`等で設計する必要あり |
| 7. ワークスペースの削除（作成者のみ） | `shared/http-errors.ts`（`badRequest`/`notFound`のみ） | **Missing**: `forbidden`（403）ファクトリが未定義。作成者判定も要件1と同じcurrentUser未確定の制約を継承 |

### user-auth の進捗反映（2026-08-09追記）
user-auth の `requirements.md` が生成された（`spec.json.phase: "requirements-generated"`、承認済みではなく design.md も未生成）。以下が確定情報として使えるようになった:
- User はメールアドレス（一意・登録識別子）と表示名（displayName相当、フィールド名は未確定）を持つアカウントへ拡張される（user-auth Requirement 1.1〜1.2）。ワークスペースメンバー検索の対象フィールドを「表示名またはメールアドレス」と確定できる（requirements.mdを更新済み）
- currentUser 取得は `auth` モジュール（Option C想定、未確定）に閉じ、workspace-membershipは所属判定だけに依存できる設計を意図している（user-auth/research.md「後続仕様との接続」）。ただし具体的な取得手段（Fastify decorator名・フロント型）はuser-authのdesign.md生成まで未確定のまま
- 担当者候補の供給源は「名前だけ登録」から「自己登録アカウント」へ切り替わる想定（user-auth Requirement 4.2, 4.4）。workspace-resource-scope側の関心事であり本仕様には影響しない

### Research Needed（設計フェーズへ持ち越し）— 全項目解決済み（2026-08-09、design.md確定時点で追記）
- ~~**currentUserの扱い**~~ → 解決。セクション6のとおり`user-auth`の`requireUser`/`request.currentUser`をそのまま前提にできることが確定し、design.mdもその形で確定させた（暫定パラメータ方式は不要になった）
- ~~**現在ワークスペースの永続化方式**~~ → 解決。design.md「Build vs Adopt」およびセクション9のとおり、サーバー側テーブルを作らずクライアント側`localStorage`を採用
- ~~**検索仕様**~~ → 解決。design.md "Backend/users（拡張）"のとおり`contains`（大文字小文字を区別しない）での部分一致に確定
- ~~**ワークスペース切替UIの配置**~~ → 解決。セクション8のとおりclaude designで案B（ナビと表示名/ログアウトの間）に確定

## 2. Current State Investigation（要約）

- **モジュール標準パターン**: `backend/src/modules/<domain>/`に`types.ts`/`repository.ts`/`service.ts`/`routes.ts`の4点セット。エラーは`HttpError`（`badRequest`/`notFound`）をserviceからthrow、Prismaの`P2025`は`isRecordNotFoundError`で`notFound`に変換する定型パターンが繰り返し登場
- **親子2エンティティが1モジュール内で完結する前例はなし**（Case⇔Taskは別モジュール間の越境アクセス）。Workspace⇔WorkspaceMemberは新パターンになる
- **usersモジュール**: 認証なし前提が`user.service.ts`冒頭コメントに明記。CRUDはcreate/list/deleteのみでupdate・検索なし
- **shared/soft-delete.repository.ts**: `deletedAt`カラムを持てば新モデルも自動的に論理削除規約に乗る（repository側で個別対応不要）
- **フロントエンド**: `useApiClient.ts`が唯一のHTTPクライアント（ドメインごとにメソッド追記）。`AssigneeFilter.vue`が「一覧取得→select」の近い参考実装。ページは`frontend/pages/<domain>/index.vue`が基本形。ワークスペース切替は`frontend/app.vue`のヘッダーが有力候補（現状ロゴ＋ナビのみ）
- **Prisma schema**: 多対多（中間テーブル）の実例なし。WorkspaceMemberが本コードベース最初の中間テーブルモデルになる
- **テスト**: `*.repository.test.ts`/`*.routes.test.ts`は実MySQLに対する統合テスト（モックなし）、`hardDelete()`ヘルパーで後始末する定型パターン

## 3. Implementation Approach Options

### Option A: 既存 users モジュールを拡張
**却下推奨**。Workspace/WorkspaceMemberはusersと責務が異なる別集約であり、`users`に混ぜると単一責任が崩れる。ユーザー検索機能のみusers側に追加し、Workspace本体は別モジュールに置く形が妥当。

- ✅ ユーザー検索APIの追加箇所としては自然（`users`が検索対象の本体を持つため）
- ❌ Workspace/Membershipのライフサイクルをusersに混在させると責務が肥大化

### Option B: 新規 `workspaces` モジュール（Workspace + WorkspaceMember 統合）
**推奨**。1モジュール内に`Workspace`と`WorkspaceMember`の両repositoryを置き、`workspace.service.ts`がメンバーシップ判定も含めて公開インターフェースとして提供する。

- 統合先: `backend/src/modules/workspaces/`
  - `workspace.types.ts`（Workspace/WorkspaceMemberの型）
  - `workspace.repository.ts` + `workspace-member.repository.ts`（ファイル分割は設計判断）
  - `workspace.service.ts`（作成・削除・現在ワークスペース選択・メンバー追加・一覧・所属判定）
  - `workspace.routes.ts`
- 既存`users`モジュールへは「検索用の新規エンドポイント（または関数）」の追加のみで済み、越境は最小限
- workspace-resource-scope（次仕様）が「membership判定サービスを再利用する」前提を置いているため、`workspace.service.ts`に判定用の公開関数を用意しておくと後続で流用しやすい

**Trade-offs**:
- ✅ 既存パターン（4点セット）をそのまま踏襲できる
- ✅ 後続spec（workspace-resource-scope）からの再利用インターフェースを一箇所に集約できる
- ❌ 本コードベース初の中間テーブルのため、参考実装なしで設計判断が必要（ファイル分割・命名）

### Option C: Hybrid（`workspaces`と`workspace-members`を別モジュールに分離）
**必要なら検討**。責務をより厳密に分けたい場合の選択肢。

- ✅ 将来ロール等の拡張がmembership側だけで完結しやすい
- ❌ 現時点の要件（ロールなし、招待リンクなし）に対しては過剰分割になりやすく、2モジュール間の依存方向管理が増える

## 4. Implementation Complexity & Risk

- **Effort: M（3〜7日）**
  - 理由: 新規Prismaモデル2つ、新規モジュール1つ（4点セット×統合）、フロント新規ページ＋ヘッダーUI追加、users側への検索機能追加、`forbidden`エラー追加、ワークスペース設定更新（名前・固定6色パレット）。CRUD自体は既存パターンの踏襲で完結し、外部連携なし
- **Risk: Medium**
  - 理由: (a) 中間テーブルパターンが本コードベース初で参考実装なし、(b) currentUser取得手段がuser-auth未設計のため「作成者」「操作者」の受け渡し方式を暫定的に決める必要がある、(c) 画面変更を伴うためclaude designゲートの完了が設計着手の前提条件になる

## 5. Recommendations for Design Phase

- **推奨アプローチ**: Option B（`backend/src/modules/workspaces/`に統合、`users`へは検索機能のみ追加）→ design.mdで採用確定
- **設計フェーズで決定すべき事項**（2026-08-09追記: design.md確定によりすべて解決済み）
  1. ~~currentUserの暫定受け渡し方式~~ → 解決。`user-auth`の`requireUser`/`request.currentUser`をそのまま利用する形で確定（暫定方式は不要）
  2. ~~現在ワークスペースの永続化方式~~ → 解決。クライアント側`localStorage`を採用
  3. ~~`WorkspaceMember`のファイル分割方針~~ → 解決。`workspace.repository.ts`に統合（別ファイルへの分割は行わない）
  4. ~~ユーザー検索のマッチング仕様~~ → 解決。`name`/`email`への`contains`（大文字小文字を区別しない）
  5. ~~`shared/http-errors.ts`への`forbidden`ファクトリ追加~~ → 解決。design.md Modified Filesに記載
- **設計着手前の前提条件**: 画面変更（ワークスペース作成・切替・メンバー管理UI）を伴うため、`.kiro/steering/ui-design.md`のclaude designゲートを先に完了させ、`research.md`に「ビジュアルデザイン確定」セクションを追記する必要がある（本ドキュメントの追記、または別セクションとして）

---

## 6. user-auth design.md 反映（2026-08-09追記）

user-auth が `phase: "design-generated"`（requirements承認済み、designは未承認）まで進んだ。以下、workspace-membership の設計・ギャップ分析に影響する確定事項と、変わらなかった点を整理する。

### 確定した情報（設計フェーズでそのまま使える）

- **currentUser取得**: `requireUser` preHandler が認証ガードを行い、ハンドラは `request.currentUser`（design.md表記は「または同等」と含みを残すが、実質この形で確定）からユーザーを参照する。Cookie/セッションの実装詳細には依存しない。workspace-membershipの新設ルート（`workspaces.routes.ts`）も同じ`requireUser`を`preHandler`として適用すればよく、以前の「currentUserの受け渡し方式を暫定決定する」という課題は解消された
- **PublicUserの形状確定**: `{ id, email, name, createdAt, updatedAt }`。表示名は独立した`displayName`列ではなく既存`name`カラムを転用している。要件4（ユーザー検索）の対象フィールドは`name`（表示名）・`email`で確定
- **`GET /api/users`の現状**: `PublicUser[]`を返すのみで検索・ページングパラメータなし、`POST`/`DELETE`は廃止済み。workspace-membershipが検索機能を追加する際は、この既存エンドポイントへのクエリパラメータ拡張、または新規エンドポイント追加のいずれかを設計判断する必要がある（未解決、従来どおり）
- **`unauthorized`（401）は追加済み、`forbidden`（403）は未追加**: `shared/http-errors.ts`にuser-authが`unauthorized()`を追加したが`forbidden()`はまだ無い。要件7（作成者のみ削除）のために引き続き`forbidden`ファクトリの新規追加が必要（ギャップ変わらず）
- **CSRF**: 変更系（POST/PATCH/DELETE）は`@fastify/csrf-protection`によるトークン必須が全APIの前提になった。workspace-membershipのワークスペース作成・削除・メンバー追加エンドポイントも例外リストに入らない限りCSRF対象になる。フロントは`useApiClient`が起動時に取得したトークンを付与する既存の仕組みに乗るだけでよく、新規のCSRF設計は不要
- **CORS/Cookie**: `credentials: true`、SPAは`credentials: 'include'`で確定。workspace-membershipのAPI呼び出しもこの前提にそのまま乗る

### 重要な相互依存（要注意）

- user-auth design.mdの **Revalidation Triggers** に「`User`が担当者以外の意味をさらに持つ変更（ワークスペースメンバー検索など）」が明記されている。これはworkspace-membershipの要件4（ユーザー検索）がまさに該当するため、**workspace-membershipの設計・実装に着手する際は、user-auth側のdesign.mdの再検証（Revalidation）が必要になる可能性がある**（例: `GET /api/users`のクエリ拡張がuser-auth側の「UsersListService」の責務を変える場合）。設計フェーズでこの再検証要否を明示的に判断すること

### 変わらなかった点

- ワークスペース・現在ワークスペースの永続化方式は引き続き未決定（user-auth側もNon-Goalsとして明示的に対象外としている）
- `WorkspaceMember`（中間テーブル）の設計に使える前例はuser-auth側にもなし
- Effort/Risk評価は変更なし（Medium/M）。currentUser取得の不確実性は解消されたが、中間テーブル新規性とUser所有権の相互依存確認という新たな確認事項が生じたため、総合的なリスク水準は据え置きとする

---

## 8. ビジュアルデザイン確定（claude design連携）（2026-08-09追記）

- プロジェクト: 「モックアップ仕様と推奨設計」
  - URL: https://claude.ai/design/p/8e1071f6-44d1-4a2b-9353-d9a376082c6e?file=Workspace+Membership.dc.html
  - ファイル: `Workspace Membership.dc.html`

### 採用レイアウト・主要コントロール

1. **ヘッダーのワークスペース切替（配置は案B・決定）**: 既存 sticky ヘッダーの「ナビ」と「表示名／ログアウト」の間（右クラスタの左端）に、Secondaryボタン型の切替トリガー（識別色ドット＋ワークスペース名＋▼）を配置。案A（アプリ名の直右）は「案件の絞り込みタブに見える」として不採用
   - ドロップダウン内: 見出し「ワークスペース」、所属ワークスペース一覧（チェックマークで選択中を表示）、区切り線の下に「＋ ワークスペースを作成」「ワークスペースを管理」
   - 狭幅（640px未満）: ワークスペース名は`max-width:120px`+ellipsis、ナビは2段目に折り返し、切替ボタンはユーザー名の左に常に残す
2. **ワークスペース0件時の空状態**: ヘッダーの切替ボタンは淡色（灰色ドット＋「ワークスペース未選択」）。本文に空状態カード（見出し「ワークスペースがありません」、説明文、Primaryボタン「ワークスペースを作成」）
3. **作成モーダル**: 既存`Modal`コンポーネントの型（中央オーバーレイ・右上×・タイトル/本文/アクション3分割）を踏襲。入力は「ワークスペース名」のみ＋ヘルプ文「作成したユーザーが自動的に最初のメンバーになります。」。未入力時は上部に赤アラートボックス
4. **メンバー管理画面**: 見出しは「ワークスペース」ラベル＋識別色ドット＋ワークスペース名(h1)。右に「設定」（Secondary）「メンバーを追加」（Primary）
5. **メンバー追加はインライン検索パネル（モーダルではない・決定）**: 「メンバーを追加」押下でページ内にパネルが展開。検索欄「表示名またはメールアドレスで検索」、既存メンバーは結果から除外する旨の説明文、結果0件時は「該当するユーザーがいません。」。追加は行内ボタンで即時反映。**理由**: 連続追加が主用途であり、一覧への反映がその場で見えることを優先。モーダルは「不可逆または画面遷移を伴う操作」（作成・削除確認・設定）に用途を限定する方針
6. **メンバー一覧**: 表示名／メールアドレスの2列テーブル、下部に「メンバー N人」の件数表示。狭幅では2行スタックのリスト表示に切替
7. **削除操作**: 作成者にのみ「ワークスペースを削除」ボタン（白背景・文字色red-700）と説明文「ワークスペースを削除できるのは作成者のみです。削除すると所属する案件の共有範囲も失われます。」を表示。削除確認はModal型で「本当に削除しますか」＋影響説明＋Destructiveボタン（bg red-600）
8. **ワークスペース設定モーダル（新規要件、要件6として採用）**: メンバー管理画面の「設定」から開く。名前（テキスト）、色（固定6色パレットからの選択、識別マーク専用でボタン/状態色とは別系統）。保存は要件5（対等な権限）の方針どおりメンバー全員可、削除のみ作成者限定という非対称をモックの注記でも明示

### 不採用案

- ヘッダー切替の案A（アプリ名直右配置）
- メンバー追加のモーダル方式（インラインパネルを採用したため）

### 設計フェーズへの申し送り

- **色の実装**: 固定6色パレット（`#2563eb` `#0f766e` `#b45309` `#be123c` `#6d28d9` `#475569`）。自由入力なし。Prismaでは`enum`または`z.enum`によるDB制約を検討
- **削除確認の文言が案件（Case）閲覧に言及**: モック本文に「メンバーN人はこのワークスペースの案件を閲覧できなくなります」とあるが、案件のワークスペーススコープ化は次仕様（workspace-resource-scope）が担当であり、本仕様の実装時点ではまだ機能として存在しない。design.mdでは本仕様のリリース時点の文言（案件スコープ言及なし）にするか、workspace-resource-scope実装後に反映する文言として据え置くかを判断すること
- 検索・一覧のページネーションはモックに含まれず（メンバー数が少数である前提の見た目）。要件・設計として明示的にページネーション非対応と決めるか、将来課題として残すかは設計フェーズで判断

---

## 9. Design Synthesis（2026-08-09追記、design.md確定分）

`/kiro-spec-design`実行時に適用した3つの観点と、design.mdでの決定事項。

### Generalization
- `WorkspaceService.isMember(id, userId)`をワークスペース内の全操作（設定更新・削除・メンバー一覧・検索追加）が共有する単一の判定関数として設計し、`workspace-resource-scope`が再利用する公開インターフェースとして安定させた。実装スコープはメンバーシップ判定のみに留め、将来のロール判定等への拡張は行わない

### Build vs Adopt
- 現在ワークスペースの永続化は、検討していたサーバー側テーブル（`WorkspaceSelection`相当）を採用せず、ブラウザ標準の`localStorage`のみで実装する（新規依存ライブラリなし）
- 理由: 「現在ワークスペース」はUI状態に過ぎず、実際のアクセス制御は各APIエンドポイントの`isMember`判定が担う。サーバー側に持たせても複数デバイス間同期以外の価値がなく、個人〜小規模チーム利用が前提の本プロダクトでは過剰。またサーバー側案は共通soft-delete拡張の制約上、機能上不要な`deletedAt`列を追加する必要が生じ複雑化する
- Requirement 2.4（非所属ワークスペースを現在ワークスペースにできない）は、クライアント側が所属一覧外のIDを拒否することと、各APIの`isMember`検証の二重で担保する設計とした

### Simplification
- 当初のgap分析で挙げていた「現在ワークスペースの永続化方式」の選択肢のうち、サーバー側案を採用しないことで新規テーブル・エンドポイントを1つ削減した
- 削除確認文言から「案件（Case）を閲覧できなくなる」という、本仕様にまだ存在しない機能への言及を外し、汎用的な文言に変更した（ユーザー確認済み）
- 「ワークスペースがありません」空状態は、モックが背景に描いていた`/cases`ページではなく、本仕様が新設する`/workspaces`ページのみに実装することとした。既存の凍結spec（`case-management-ux`）配下のページには一切手を入れない境界を優先した

---

## 10. user-auth tasks.md 反映（2026-08-09追記）

user-auth が `phase: "tasks-generated"`（requirements/design/tasksすべて承認済み、`ready_for_implementation: true`）まで進み、一部タスクは実装済み。

### 設計判断の裏付けが取れた項目
- `requireUser`ガード（タスク2.3）は「有効セッションのuserIdから`PublicUser`を付与」と明記されており、design.mdの`request.currentUser: { id, email, name }`という想定と一致
- CSRF免除リストは`register`/`login`/`csrf GET`/`health`のみ、`logout`含む変更系は全てCSRF必須（タスク3, Implementation Notes）— design.mdの前提と一致
- ヘッダー変更（タスク6.4「表示名・ログアウトを右に、既存ナビは維持」）— `WorkspaceSwitcher`をナビと表示名の間に置く配置（claude design案B）の前提と一致
- `forbidden`（403）はuser-auth側で追加されない（タスク1.3は`unauthorized`の401ヘルパーのみ）ことを確認。workspace-membership側で追加する計画は変更不要

### 設計レビューのCritical Issue 1が解消される見込み
`/kiro-validate-design`で指摘した「currentUserをどう注入してテストするか」は、user-authタスク1.3「統合テストからセッションCookie付与とCSRFヘッダ付与ができるテストヘルパーを用意する」で解決される。design.mdのTesting Strategyにこのヘルパー再利用を明記した

### 実装進捗（コード確認、2026-08-09時点・当時のスナップショット）
- 当時完了: タスク1.1（依存・環境変数）、1.2（`User`への`email`/`passwordHash`追加）。`shared/http-errors.ts`に`unauthorized()`追加済み
- 当時未着手と記録していたもの: タスク1.3（テストヘルパー）、2系（authモジュール）、3（app.ts配線・`requireUser`適用）、6.4（ヘッダー変更）
- 以降の現状はセクション12を正とする

---

## 11. 承認後の整合性修正（2026-08-09追記）

タスク承認後の最終レビューで、design.md／tasks.mdに以下の不整合が見つかり修正した。

### design.md: `usersService.search`の戻り値型の食い違い（実装に影響しうる）
- Service Interface（旧記述）は`usersService.search(query): Promise<WorkspaceUserSummary[]>`、API Contract（`GET /api/users`）は`PublicUser[]`と、同じ検索機能について異なる型を記載していた
- 修正: `usersService.search`は`GET /api/users`（クエリなし時）と同じ`PublicUser[]`を返す仕様に統一。既存メンバー除外・`WorkspaceUserSummary`への変換は`WorkspaceService.searchAddableUsers`側の責務と明記した（`users`モジュールに`workspaces`固有の型を持ち込まない）
- 本仕様自身の設計（`GET /api/workspaces/:id/members`等）はこの型を経由しないため実害はなかったが、`usersService.search`を実装する際に誤った戻り値型で実装されるリスクがあったため修正した

### design.md: Components and Interfacesにモーダル2件の行が欠落
- `WorkspaceCreateModal`／`WorkspaceSettingsModal`はFile Structure Planと文章中には記載があったが、Components summary tableに正式な行がなかった。追加した

### tasks.md: 同一境界の兄弟タスクと比べて`_Depends:_`が抜けていた3件
- 3.2（`_Depends: 2.1, 2.2_`を追加）、6.4・6.6（いずれも`_Depends: 5.1_`を追加）。タスク番号の昇順で実行順序自体は偶然成立していたが、明示的な依存宣言を揃えた

---

## 12. main 取り込み後の実装突合（2026-08-09追記）

`workspace-membership`ブランチへ最新`main`（`user-auth`実装完了を含む）を取り込み、仕様文書と実装の矛盾を突合した。

### コードで確認した現状
- `user-auth`は`phase: "implementation-complete"`
- `app.ts`にCookieセッション・CSRF・`requireUser`（`/api/*`のうち認証免除パス以外）が配線済み
- `request.currentUser`の型は`PublicUser`（`{ id, email, name, createdAt, updatedAt }`）
- ヘッダー右端に表示名・ログアウトが存在する（`WorkspaceSwitcher`をナビとの間に置く前提は成立）
- 統合テスト用ヘルパー`withSessionCookie` / `withCsrfToken`（`backend/src/test/auth.fixture.ts`）と、E2E共有 fixture（`frontend/e2e/fixtures.ts`）が存在する
- `shared/http-errors.ts`に`unauthorized`はあるが`forbidden`は未追加（本仕様タスク1.2で追加する計画は変更不要）
- `GET /api/users`は一覧のみ。`q`検索・`Workspace`モデル・`workspaces`モジュールは未実装（本仕様の未着手範囲）

### 文書側の修正
- `design.md`の Existing Architecture Analysis が「`requireUser`等が未着手」と書いていたため、実装済みの現状に合わせて更新した
- `design.md`の Allowed Dependencies で`currentUser`形状を`PublicUser`に合わせ、`http-errors`の既存ヘルパー一覧を補った
- `design.md`の`app.vue`注記から「user-auth未実装時の暫定配置」を削除し、既存ヘッダーへの差し込み位置のみ残した
- `tasks.md`の Implementation Notes を、前提条件が満た済みである旨と実在ヘルパー名に更新した
- `design.md`の Testing Strategy 注記も、同上の実在ヘルパー名に合わせた
