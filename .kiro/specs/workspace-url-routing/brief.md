# Brief: workspace-url-routing

## Problem

ログインユーザーは、タスク・カンバン等をワークスペース単位で扱っているが、画面 URL が `/tasks` や `/kanban` のようにフラットなため、どのワークスペースを見ているかが URL から分からない。現在ワークスペースは `localStorage`（`currentWorkspaceId`）と API ヘッダ `x-workspace-id` に依存しており、ブックマーク共有・戻る／進む・複数タブで文脈がズレやすい。あわせて、URL 一覧と不整合の棚卸しもできていない。

## Current State

- フロントは Nuxt ファイルベースルーティングでフラットなページを持つ（`/tasks`, `/kanban`, `/kanban/stages`, `/cases`, `/calendar`, `/recurrence`, `/holidays`, `/throughput` 等）
- 現在ワークスペースは `useCurrentWorkspace` が `localStorage` で保持し、切替時も URL は変わらない
- データ可視境界自体は `workspace-resource-scope` で実装済み（API 側の所属検証）
- `/workspaces` はワークスペース管理画面。認証は `/login` `/register`
- Claude Design は利用制限中のため、本仕様の UI は既存の空状態・一覧表示を参考にする
- 専用のエラーページデザインは未着手（`docs/ideas.md` に積んである）

## Desired Outcome

- 業務画面の URL が `/workspaces/:workspaceId/...` 形式になり、見ているワークスペースが URL から分かる
- scoped ページでは URL の `workspaceId` が現在ワークスペースの正本になる
- `/` は「最後に使った WS」があればそのダッシュボードへ、なければワークスペース一覧・追加を表示する
- ヘッダー切替は同じ画面種のまま `workspaceId` だけ差し替え、クエリは可能な範囲で維持する
- 旧フラット URL・存在しない／非所属の `workspaceId` は 404（最低限表示）
- 現行→新 URL の一覧表が仕様成果物として残る

## Approach

URL を正本にする。

- `pages/workspaces/[workspaceId]/...` 配下へ業務画面を移す
- `/workspaces`（管理）と `/workspaces/:workspaceId/...`（業務）は Nuxt 上で共存させる
- `localStorage` は「最後に使った WS」（`/` からの復帰用）に限定する
- 所属判定は named middleware（または `workspaceId` があるときだけ動く処理）で行い、非所属・不明は `createError({ statusCode: 404 })`
- API の `x-workspace-id` 付与は既存 composable を継続利用し、URL 正本と衝突しないよう `refresh`／フォールバックを合わせ込む
- 旧 URL 互換リダイレクトは置かない
- 404 の見た目作り込みは ideas に残し、本仕様は最低限でよい

## Scope

- In
  - 業務画面の `/workspaces/:workspaceId/...` 化とナビ／リンク／空状態 CTA／ログイン redirect の更新
  - `/` の last-used リダイレクト、または WS 一覧・追加表示
  - WorkspaceSwitcher の同一画面種での URL 付け替え（クエリ維持）
  - 不正・非所属 `workspaceId` の 404
  - 旧フラット業務 URL を意図的に 404 にする
  - 最低限の 404 表示（既存 Nuxt エラー表示の範囲で可）
  - ユニット／E2E のパス更新
  - 現行→新 URL 一覧表（本 brief および design で維持）
- Out
  - エラーページの本格デザイン（404 / 500 等）→ `docs/ideas.md`
  - API パスを `/api/workspaces/:id/...` に変えること
  - `/api/throughput` のワークスペーススコープ化（`velocity-dashboard`）
  - 旧フラット URL の互換リダイレクト
  - Claude Design 新規モック
  - 凍結済み spec 文書の書き換え（コードと新規 spec で進める）

## Boundary Candidates

- ルーティングとページ配置（Nuxt `pages/` の移動・親子レイアウト）
- 現在ワークスペース文脈（URL 正本 + last-used 永続化 + Switcher）
- 所属ガードと 404（middleware）
- ナビ／内部リンク／E2E のパス一括更新と URL 一覧の維持

## Out of Boundary

- バックエンドのリソーススコープロジック変更（既存のヘッダ＋所属検証を前提に使う）
- ワークスペース CRUD／メンバー管理機能そのものの追加変更（パス整合と導線以外）
- 消化数 API のスコープ化、タスク詳細画面の新設
- エラーページのビジュアルデザインシステム整備

## Upstream / Downstream

- Upstream
  - `user-auth`（ログイン必須・redirect）
  - `workspace-membership`（所属・一覧・選択概念）
  - `workspace-resource-scope`（API スコープと未選択時空状態の前提）
- Downstream
  - `task-detail` / `velocity-dashboard` など今後の画面は新 URL 規約に従う
  - エラーページ ideas（見た目の作り込み）

## Existing Spec Touchpoints

- Extends
  - なし（凍結済み `workspace-membership` / `workspace-resource-scope` は文書更新せず、選択文脈の実装を本仕様で置き換える）
- Adjacent
  - `workspace-membership`: 現在 WS 選択 UX
  - `workspace-resource-scope`: 未選択時空状態・ヘッダ付与
  - `user-auth`: `/login?redirect=` が新 path を保持すること

## Constraints

- スタック: Nuxt 4（`ssr: false` SPA） / 既存 composable・middleware を拡張。追加ルーターライブラリは使わない
- URL 形: `/workspaces/:workspaceId/<page>`（`/login` 等との名前衝突回避）
- Claude Design 制限中: 既存 UI パターンを踏襲
- クエリ `caseId` は移行後も維持。テスト上の `view=mine` は実装されていない例示であり、新仕様で必須機能にはしない

## URL Inventory (draft)

業務画面の `:workspaceId` は実際のワークスペース ID に置き換わる。

| 区分 | 現行 URL | 新 URL | 備考 |
| --- | --- | --- | --- |
| 認証 | `/login` | `/login` | 変更なし。`redirect` は fullPath を保持 |
| 認証 | `/register` | `/register` | 変更なし |
| ランディング | `/` | `/` | last-used があれば `/workspaces/:workspaceId` へ。なければ WS 一覧・追加 |
| WS 管理 | `/workspaces` | `/workspaces` | 一覧・作成・メンバー・設定。`workspaceId` なし |
| ダッシュボード | `/`（選択中 WS の内容） | `/workspaces/:workspaceId` | ホーム相当を WS 配下へ |
| タスク | `/tasks` | `/workspaces/:workspaceId/tasks` | `?caseId=` を維持 |
| カンバン | `/kanban` | `/workspaces/:workspaceId/kanban` | |
| 開発段階 | `/kanban/stages` | `/workspaces/:workspaceId/kanban/stages` | 歴史的にネスト。空状態ガードも他画面に揃える |
| 案件 | `/cases` | `/workspaces/:workspaceId/cases` | |
| カレンダー | `/calendar` | `/workspaces/:workspaceId/calendar` | |
| 繰り返し | `/recurrence` | `/workspaces/:workspaceId/recurrence` | |
| 非営業日 | `/holidays` | `/workspaces/:workspaceId/holidays` | |
| 消化数 | `/throughput` | `/workspaces/:workspaceId/throughput` | UI は WS 配下。API スコープ化は別仕様 |
| 廃止（404） | `/tasks` 等の旧フラット業務 URL | （ページなし） | 互換リダイレクトなし |
| 廃止（404） | `/workspaces/<非所属or不明>/...` | 404 | 存在秘匿のため 404 |
| 既に削除 | `/events` | 404 | 既存 e2e で確認済み |

調査で見つかった変な点:

- `/kanban/stages` だけネストしていた（新 URL でも kanban 配下に残す）
- `/throughput` は UI のみ WS ゲートで API は未スコープ（変更しない）
- `/workspaces` ナビラベルと「管理画面」の役割が紛らわしいが、本仕様ではパス役割の明確化に留め、ラベル改名は必須としない
- テストにだけある `view=mine` クエリは本番機能ではない
