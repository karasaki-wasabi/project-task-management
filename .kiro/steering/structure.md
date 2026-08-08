# Project Structure

## Organization Philosophy

ドメイン(業務領域)ごとのモジュール構成(feature-first)。バックエンドは`backend/src/modules/<domain>/`単位でルート・サービス・リポジトリ・型を1ディレクトリにまとめ、フロントエンドはNuxtのファイルベースルーティング(`pages/<domain>/index.vue`)に対応させて同じドメイン境界を保つ。ドメイン境界はdesign.mdの`Boundary Commitments`(This Spec Owns / Out of Boundary / Allowed Dependencies)に対応する。

## Directory Patterns

### バックエンドモジュール
**Location**: `backend/src/modules/<domain>/`
**Purpose**: 1ドメイン(tasks, cases, holidays, throughput, recurrence, users, client-errors, development-stages など)につき1ディレクトリ。以下4ファイルの組み合わせが基本形
- `<domain>.types.ts` — ドメイン型・入力型・エラー型(Prisma生成型を`import type`で再エクスポートすることが多い)
- `<domain>.repository.ts` — Prisma経由のデータアクセス(ソフトデリートは`shared/soft-delete.repository.ts`のPrisma Client Extensionが自動適用するため、repository側で明示的に気にする必要はない)
- `<domain>.service.ts` — 業務ロジック。エラーは`HttpError`をthrowするのが基本形(`TasksService`のみ一部`Result<T, E>`パターンを併用、[[error-handling]]参照)
- `<domain>.routes.ts` — Fastifyプラグインとしてのルート定義。Zodスキーマでリクエスト検証し、単体で(アプリ全体を組み立てずに)テスト可能な形にする

**Example**: `backend/src/modules/tasks/{task.types,task.repository,task.service,task.routes}.ts`

### バックエンド共有コード
**Location**: `backend/src/shared/`
**Purpose**: 全モジュール共通のインフラ(ログ基盤`logger.ts`/`business-event-logger.ts`、DBクライアント`db.ts`、`HttpError`、ソフトデリートのPrisma拡張、`Result`型)。モジュール固有のロジックはここに置かない

### バックエンド機能横断テスト
**Location**: `backend/src/*.test.ts`(`src/`直下)
**Purpose**: 単一モジュールに閉じない検証(例: `app.routes.test.ts`は全モジュールのルート登録確認、`validation.integration.test.ts`は複数モジュールをまたぐ実HTTP経路での統合検証)。モジュール固有のテストは各`modules/<domain>/`配下にコロケーションする

### フロントエンドページ
**Location**: `frontend/pages/<domain>/index.vue`
**Purpose**: 1画面 = 1ドメイン。Nuxtのファイルベースルーティングでそのまま`/​<domain>`にマップされる

### フロントエンド共有コンポーネント/コンポーザブル
**Location**: `frontend/components/<domain>/`, `frontend/composables/`
**Purpose**: 複数ページで再利用するUI部品(例: `components/tasks/TaskNode.vue`の再帰階層表示、`components/users/AssigneeFilter.vue`)とロジック(`useApiClient.ts`がバックエンドAPIへの唯一のHTTP境界、`useErrorReportRateLimit.ts`のような純粋関数の抽出)。`nuxt.config.ts`で`components: [{ path: "~/components", pathPrefix: false }]`を設定しているため、サブディレクトリのコンポーネントもディレクトリ名プレフィックスなしで`<ComponentName>`のまま参照できる([[local-dev-pitfalls]]参照)

### フロントエンドE2E
**Location**: `frontend/e2e/*.spec.ts`
**Purpose**: Playwright。`vitest.config.ts`で`test.exclude`により通常のVitest実行からは除外される([[testing]]参照)

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
  - 他モジュールへ依存する場合はそのモジュールの`service`公開インターフェース経由のみ(例: `cases`→`recurrence`、`recurrence`→`holidays`/`tasks`)で、内部実装やPrismaクエリへ直接アクセスしない
- 境界(Boundary)の遵守
  - 新しいタスクを実装する際は、design.mdの`Boundary Commitments`とtasks.mdの`_Boundary:_`注記を確認し、他ドメインの責務を無断で肩代わりしない(例: 通知配信・認証・外部連携はOut of Boundary)
- フロントエンドのAPI境界
  - `frontend/composables/useApiClient.ts`が唯一のHTTPクライアント
  - ページ/コンポーネントから直接`$fetch`/`fetch`を呼ばない(例外: `plugins/error-reporter.client.ts`のエラー通報のみ、設計上の意図的な例外)

---
_Document patterns, not file trees. New files following patterns shouldn't require updates_
