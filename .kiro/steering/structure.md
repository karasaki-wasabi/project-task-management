# Project Structure

## Organization Philosophy

ドメイン(業務領域)ごとのモジュール構成(feature-first)。バックエンドは`backend/src/modules/<domain>/`単位でルート・サービス・リポジトリ・型を1ディレクトリにまとめ、フロントエンドはNuxtのファイルベースルーティング(`pages/<domain>/index.vue`)に対応させて同じドメイン境界を保つ。ドメイン境界はdesign.mdの`Boundary Commitments`(This Spec Owns / Out of Boundary / Allowed Dependencies)に対応する。

## Directory Patterns

### バックエンドモジュール
**Location**: `backend/src/modules/<domain>/`
**Purpose**: 1ドメイン(auth, tasks, cases, holidays, throughput, recurrence, users, workspaces, client-errors, development-stages など)につき1ディレクトリ。以下4ファイルの組み合わせが基本形
- `<domain>.types.ts` — ドメイン型・入力型・エラー型(Prisma生成型を`import type`で再エクスポートすることが多い)
- `<domain>.repository.ts` — Prisma経由のデータアクセス(ソフトデリートは`shared/soft-delete.repository.ts`のPrisma Client Extensionが自動適用するため、repository側で明示的に気にする必要はない)
- `<domain>.service.ts` — 業務ロジック。エラーは`HttpError`をthrowするのが基本形(`TasksService`のみ一部`Result<T, E>`パターンを併用、[[error-handling]]参照)
- `<domain>.routes.ts` — Fastifyプラグインとしてのルート定義。Zodスキーマでリクエスト検証し、単体で(アプリ全体を組み立てずに)テスト可能な形にする

**Example**: `backend/src/modules/tasks/{task.types,task.repository,task.service,task.routes}.ts`

`auth` は登録・ログイン・ログアウト・現在ユーザー・CSRF・`requireUser` ガードを所有する。業務ハンドラは Cookie 実装詳細に触れず、付与された `currentUser`(PublicUser)のみを参照する。

`users` はログイン必須の全アカウント一覧(`GET /api/users`)に縮退する。任意の `q`（表示名・メールの部分一致）を受け付けるが、未指定時は従来どおり全件を返す。担当者フィルタやカレンダー表示など、ワークスペース非限定の参照用途が主である。タスク作成・カンバン再割当の担当者「候補」は `workspaces` のメンバー一覧を使う。アカウント作成・削除は `auth` 側の責務であり、`POST /api/users` と `DELETE /api/users/:id` は提供しない。

`workspaces` はワークスペースとメンバーシップを所有する。所属判定(`isMember` / `workspaceService`)の公開入口でもあり、リソーススコープのガードとタスク担当者検証がこれを再利用する。現在ワークスペースのサーバー永続化は持たない。

### バックエンド共有コード
**Location**: `backend/src/shared/`
**Purpose**: 全モジュール共通のインフラ(ログ基盤`logger.ts`/`business-event-logger.ts`、DBクライアント`db.ts`、`HttpError`、ソフトデリートのPrisma拡張、`Result`型、ワークスペース文脈`workspace-scope.ts`の定数・`VerifiedWorkspaceId`・`withWorkspaceScope`)。モジュール固有のロジックはここに置かない。ドメイン固有でない日付のみの解釈・整形（`date-only.ts`）は例外としてここに置く

ワークスペース所属ガード(`requireWorkspaceMember`)は`backend/src/workspace-scope.guard.ts`に置き、`app.ts`が対象パスへ配線する。対象プレフィックスは`/api/cases`・`/api/tasks`・`/api/recurring-templates`・`/api/holidays`・`/api/development-stages`・`/api/throughput`の6つ。バックエンドの配列と`frontend/composables/useApiClient.ts`の同名リスト、および`app.routes.test.ts`・`validation.integration.test.ts`の重複定義は同期必須（いずれかを変えたら他も揃える）。

### バックエンド機能横断テスト
**Location**: `backend/src/*.test.ts`(`src/`直下)
**Purpose**: 単一モジュールに閉じない検証(例: `app.routes.test.ts`は全モジュールのルート登録確認、`validation.integration.test.ts`は複数モジュールをまたぐ実HTTP経路での統合検証、`module-boundary.guard.test.ts`は他モジュール repository 直 import とモジュール間 service 閉路の検査)。モジュール固有のテストは各`modules/<domain>/`配下にコロケーションする

### フロントエンドページ
**Location**:
  - 業務画面: `frontend/pages/workspaces/[workspaceId]/<domain>/...`（URL は `/workspaces/:workspaceId/...`）
  - ランディング: `frontend/pages/index.vue`（`/`。last-used 有効ならダッシュボードへ、なければ一覧・追加）
  - WS 管理: `frontend/pages/workspaces/index.vue`（`/workspaces`。識別子なし）
  - 認証: `frontend/pages/login.vue` / `register.vue`
**Purpose**: 業務画面の可視境界は URL の `workspaceId` を正本とする（`workspace-url-routing`）。旧フラット業務 path（`/tasks` 等）はページ無しで 404

### フロントエンド共有コンポーネント/コンポーザブル
**Location**: `frontend/components/<domain>/`, `frontend/composables/`, `frontend/utils/workspacePath.ts`
**Purpose**: 複数ページで再利用するUI部品(例: `components/tasks/TaskNode.vue`の再帰階層表示、`components/users/AssigneeFilter.vue`)とロジック(`useApiClient.ts`がバックエンドAPIへの唯一のHTTP境界、`useErrorReportRateLimit.ts`のような純粋関数の抽出)。`nuxt.config.ts`で`components: [{ path: "~/components", pathPrefix: false }]`を設定しているため、サブディレクトリのコンポーネントもディレクトリ名プレフィックスなしで`<ComponentName>`のまま参照できる([[local-dev-pitfalls]]参照)

認証状態は `composables/useAuth.ts` が共有する。`useApiClient.ts` は `credentials: 'include'` と CSRF ヘッダ付与を担い、ページから直接 Cookie／CSRF を扱わない。上記6プレフィックスのAPI呼び出しには現在ワークスペースIDを`x-workspace-id`として付与する。scoped API が所属拒否（403）を返したときは一覧を再取得し、失っていれば `relocateAfterWorkspaceLost` する。

現在ワークスペース文脈は `composables/useCurrentWorkspace.ts` が共有する（Nuxt `useState` + `localStorage`キー`currentWorkspaceId`）。scoped 画面では URL の `workspaceId` が正本で、`localStorage` は `/` 分岐と管理画面向けの last-used 専用。`refresh()`は last-used が所属内のときだけ `currentId` に載せ、無効／未設定なら `null` のまま（先頭自動選択はしない）。ページから `localStorage` キーを直接操作しない。パス組み立ては `utils/workspacePath.ts`（`buildNavLinks` 含む）。

### フロントエンド認証ミドルウェア
**Location**: `frontend/middleware/auth.global.ts`
**Purpose**: `/login`・`/register` 以外の業務ルートを要ログインにする。未ログイン時は業務内容を描画せず `/login?redirect=` へ誘導する。ログイン済みで認証画面へ来た場合は `/` へ戻す。

### フロントエンドワークスペース所属ミドルウェア
**Location**: `frontend/middleware/workspace-member.ts`
**Purpose**: `pages/workspaces/[workspaceId].vue` に named で適用。非所属・不明の `workspaceId` は 404。所属なら `syncFromRoute`。管理画面 `/workspaces` には付けない。

### フロントエンドE2E
**Location**: `frontend/e2e/*.spec.ts`
**Purpose**: Playwright。`vitest.config.ts`で`test.exclude`により通常のVitest実行からは除外される([[testing]]参照)。認証済み状態は `frontend/e2e/fixtures.ts` の登録＋ログイン共有 fixture を使う。

## Naming Conventions

- **バックエンドファイル**: `<domain>.<layer>.ts`(kebab-caseのドメイン名 + レイヤー種別)、テストは`<domain>.<layer>.test.ts`または統合テストは`<name>.integration.test.ts`
- **Vueコンポーネント**: PascalCase(`TaskNode.vue`, `AssigneeFilter.vue`)。ページは`index.vue`固定(Nuxtのルーティング規約)
- **TypeScript**: 型・インターフェースはPascalCase、関数・変数はcamelCase。Prismaのカラムはsnake_case(`@map`)だが、Prisma ClientとJSON APIの境界面は一貫してcamelCase

## Import Organization

```typescript
// バックエンド: 常に相対パス + .js拡張子(NodeNext ESM)
import { badRequest } from "../../shared/http-errors.js";
import { tasksService } from "./task.service.js";
```
パスエイリアス(`@/`等)は使用していない。フロントエンドはNuxtの自動インポート(`composables/`配下の関数、`components/`配下のコンポーネント)を前提とし、明示的な`import`を書かない。

## Code Organization Principles

- 依存方向
  - `routes.ts` → `service.ts` → `repository.ts`の一方向
  - 他モジュールへ依存する場合は、依存先が公開した手続き経由のみ
    - 通常の `service` 公開インターフェース（例: `cases`→`recurrence`、`recurrence`→`holidays`/`tasks`）
    - 当該モジュールが明示した読み取り専用／整合専用の公開面
      - `caseReadService`（案件参照）と `taskIntegrityService`（タスク行の整合・集計）を例とする
      - 専用面の網羅一覧ではない
    - repository および他ドメインの永続化実装への直接アクセスは不可
  - 循環するモジュール依存を導入しない
    - 公開手続きへの寄せ替えが閉路を生じる場合は、読み取り専用／整合専用の公開面で依存を一方向に保つ
  - 複数モジュールにまたがる連携書き込み
    - `DbClient` を渡し、同一の書き込み単位に参加させる
  - Prisma の where 断片
    - 所有モジュール外へ直接 export／import しない（例: `task.closure`）
  - `tasksService` と `taskIntegrityService` を混同しない
    - `tasksService` は業務検証で他ドメインを参照しうる
    - `taskIntegrityService` はタスク行の整合・集計のみを公開する
- 境界(Boundary)の遵守
  - 新しいタスクを実装する際は、design.mdの`Boundary Commitments`とtasks.mdの`_Boundary:_`注記を確認し、他ドメインの責務を無断で肩代わりしない
  - 例
    - 通知配信・外部 IdP・機械用トークンは、当該仕様の Out of Boundary であれば肩代わりしない
    - セッション発行や `requireUser` は `auth` モジュールの責務であり、業務モジュールが Cookie 実装詳細に依存しない
    - ワークスペース所属判定は `workspaces` モジュールの `isMember` 経由とし、他モジュールへ判定ロジックを複製しない
- フロントエンドのAPI境界
  - `frontend/composables/useApiClient.ts`が唯一のHTTPクライアント
  - ページ/コンポーネントから直接`$fetch`/`fetch`を呼ばない(例外: `plugins/error-reporter.client.ts`のエラー通報のみ、設計上の意図的な例外)

---
_Document patterns, not file trees. New files following patterns shouldn't require updates_
