# Gap Analysis: workspace-resource-scope

本書の Gap Map（§2）や Effort 見積もりは discovery／設計時点のスナップショットである。実装完了後の正本は `tasks.md`（全タスク完了）とコード、および `.kiro/steering/` の現行記述を参照すること。

## 1. 前提となる依存関係の状態

（2026-08-10 更新: `main` に `workspace-membership` がマージ済みであることを確認）

- `workspace-membership`は実装完了済み（`phase: implementation-complete`）。`Workspace`／`WorkspaceMember`モデル、`workspaceService.isMember`／`listMembers`、`useCurrentWorkspace`、`api.listWorkspaceMembers`、`pages/workspaces`の空状態マークアップ（インライン。共有コンポーネントではない）が実コードに存在する
- `user-auth`も実装完了済み。`requireUser`が`app.ts`のグローバル`preHandler`として全`/api/*`に適用済み、`PublicUser`は`{ id, email, name, createdAt, updatedAt }`。フロントのログイン／登録・`useAuth`・ヘッダー表示名も存在する
- `shared/http-errors.ts`の`forbidden`（403）は`workspace-membership`が追加済み。本仕様のタスク1.2は存在確認のみでよい
- ハードな順序ゲート（Upstream実装待ち）は解消済み。本仕様の残ギャップは5リソースへの`workspaceId`付与とスコープ強制、およびフロントの文脈配線である

## 2. Requirement-to-Asset Map

| Requirement | 関連する既存資産 | ギャップ |
|---|---|---|
| 1（リソースのワークスペース帰属） | `Case`/`Task`/`RecurringTaskTemplate`/`NonBusinessDay`/`DevelopmentStage`の各`schema.prisma`モデル、各`<domain>.repository.ts`の作成メソッド | **Missing**: 5モデル全てに`workspaceId`列がない。**Constraint**: `shared/soft-delete.repository.ts`のPrisma Client Extensionは`$allModels`の`where`句への注入のみを行い、`create`の`data`側には関与しない（`soft-delete.repository.ts:29-63`）ため、同様の仕組みを作っても各モジュールの作成呼び出し全箇所で`workspaceId`を明示的に渡す実装が別途必要 |
| 1.3（テンプレート生成の整合性） | `recurrence.service.ts`の`applyToCase(caseId, ...)`が`case.findUnique`で対象案件を解決 | **Missing**: テンプレート・案件双方のワークスペース一致検証が存在しない。テンプレート適用の呼び出し経路に検証を挟む改修が必要 |
| 2（未選択時の空状態） | `useCurrentWorkspace`（実装済み）、`pages/workspaces/index.vue`の空状態マークアップ（`data-testid="workspace-empty-state"`、インライン） | Missing: 対象8画面（index/cases/tasks/kanban/calendar/recurrence/holidays/throughput）に未選択時の分岐がない。Reuse: workspaces画面と同じ視覚パターンを各ページにコピーする（共有コンポーネント抽出はしない）。`throughput`はAPIスコープ化を本仕様では行わず空状態のみ |
| 3（現在ワークスペース＋メンバーシップでの読み書き制御） | `forbidden`（実装済み）、`task.repository.ts`の`list(filter)`によるwhere句合成の先例、`auth.guard.ts`の`requireUser` | Missing: 5モジュールの`findById`／`update`／`delete`は`id`のみで`where`を構成しスコープ用パラメータを持たない。`case.repository.ts`の`list()`は注入可能な`client`引数を無視し`db`を直接使用しており、他メソッドとの一貫性がない |
| 4（担当者候補のワークスペース内制限） | `GET /api/users`（全件）、`GET /api/workspaces/:id/members`と`api.listWorkspaceMembers`（実装済み）。戻り値は`WorkspaceUserSummary`（`userId`／`name`／`email`） | Missing: 担当者ピッカー呼び出しがまだ`listUsers()`のまま。注意: 既存UIは`User.id`前提のため、`listWorkspaceMembers`へ差し替える際は`userId`→選択値／表示用のマッピングが必要（単純な呼び出し置換だけでは型・option valueが壊れる） |

## 3. 未解決の設計論点（Research Needed）

1. ワークスペース文脈の伝達方法
   - design で`X-Workspace-Id`ヘッダーに確定済み（下記「8. Design Decisions」参照）。フロントの`useApiClient.ts`は`request()`内でヘッダーを合成する（CSRF付与と同型。現行は`request()`本体付近）
2. where句への`workspaceId`注入方式
   - design で通常関数`withWorkspaceScope`（Option C）に確定済み
3. `isMember`等の再利用契約
   - 実装済み。公開は`workspaceService.isMember(id, userId): Promise<boolean>`／`listMembers(id, requestingUserId): Promise<WorkspaceUserSummary[]>`（export名は単数の`workspaceService`）
4. `forbidden`（403）ヘルパーの実装主体
   - `workspace-membership`が追加済み。本仕様は追加しない
5. E2Eテストの改修範囲
   - `assignee-filter.spec.ts`、`kanban*.spec.ts`、`cases.spec.ts`、`task-list.spec.ts`、`calendar.spec.ts`、`dashboard.spec.ts`、`events-removed.spec.ts`など計15本前後が単一グローバルデータ前提。「ワークスペース作成+参加」の共有fixture新設は tasks 10.1 で実施する
6. RecurringTaskTemplateの新規作成導線
   - テンプレート一覧・作成画面の所在確認は実装時に行い、作成時に現在ワークスペースへ帰属させる
7. `NonBusinessDay.date_active_key`のグローバルUNIQUE
   - 現行はワークスペース非依存の一意制約（`non_business_days_date_active_key_key`）。`workspaceId`追加後も据え置くと、別ワークスペース間で同日の非営業日登録が衝突する。migrationでワークスペース単位の一意性（例: `(workspace_id, date_active_key)`）へ組み替える必要がある（design.md Data Models／Migration Strategy参照）

## 4. Implementation Approach Options

### Option A: 各モジュールへ個別に拡張
5モジュール（`cases`/`tasks`/`recurrence`/`holidays`/`development-stages`）それぞれの`schema.prisma`モデル・`repository.ts`・`service.ts`・`routes.ts`に直接`workspaceId`とメンバーシップ検証を追加する。`task.repository.ts`の`caseId`/`assigneeUserId`フィルタ先例をそのまま踏襲できる。

- ✅ 新しい共有抽象を作らずに済み、既存のモジュール構成（`structure.md`のドメイン境界原則）にそのまま従う
- ✅ 各モジュールの変更が独立しており、モジュール単位でレビュー・テストしやすい
- ❌ 5モジュール×4ファイルで検証ロジックが重複しやすく、brief.mdが名指しする最大リスク「ガード漏れ」（一覧だけ直してget-by-idを忘れる等）が起きやすい
- ❌ `forbidden`判定や`isMember`呼び出しのコピペが5箇所に散り、将来の仕様変更（例: メンバーシップ判定基準の変更）で修正漏れが起きやすい

### Option B: 横断的なPrisma拡張として一元化
`soft-delete.repository.ts`と同様の`$allModels`向けPrisma Client Extensionを新設し、`where`句への`workspaceId`注入を自動化する。

- ✅ 「ガード漏れが最大リスク」という制約に対し、読み取り系（list/get/update/deleteのwhere側）を一箇所でテスト・保証できる
- ✅ 既存のsoft-delete拡張と同じ思想で保守者が理解しやすい
- ❌ `create`の`data`側は拡張の対象外（`soft-delete.repository.ts`も`create`には関与していない）のため、5モジュールの作成呼び出し全箇所で`workspaceId`付与が別途必要になり、効果が読み取り系に限定される
- ❌ 対象モデルの見分け（`$allModels`は文字通り全モデルに適用されるため、`workspaceId`列を持たないモデル—`User`, `Workspace`, `WorkspaceMember`自身等—を除外する分岐が必要）でsoft-delete拡張より複雑になる

### Option C: 共有ガード関数 + モジュール個別のwhere句拡張（ハイブリッド）
`requireUser`に倣った`requireWorkspaceMember`相当の共有ヘルパー（メンバーシップ検証とcurrentWorkspace解決を一箇所に集約）と、`where`句合成のための軽量ユーティリティ関数（Prisma拡張ではなく通常の関数）を`shared/`に新設し、各モジュールの`repository.ts`/`routes.ts`から呼び出す。

- ✅ 「メンバーか否かの判定」という最もミスが許されない部分を一箇所に集約しつつ、各モジュール固有のクエリ構造（`task.repository.ts`のフィルタ合成等）はそのモジュール内に残せる（`structure.md`の「モジュール間はサービスの公開インターフェース経由でのみ依存」原則とも整合）
- ✅ Prisma拡張ほど暗黙的でなく、`create`呼び出し漏れも通常の関数呼び出しとして目視・テストで検出しやすい
- ❌ Option Bほどの自動保証はなく、各モジュールでの呼び出し漏れは依然としてレビューで防ぐ必要がある
- ❌ 新しい共有プリミティブの設計（シグネチャ・エラー方針）に事前調整が必要

## 5. Effort & Risk

- **Effort: L（1〜2週間）** — 5リソース×スキーマ/repository/service/routes/テストのフルスタック変更、共有ガード新設、フロント側のワークスペース文脈配線（`workspace-membership`実装分に相乗り）、担当者候補を既存`listWorkspaceMembers`へ切替、繰り返し生成の整合性チェック追加、既存E2E約15本の改修が全て必要。範囲の広さ次第でXLに寄る可能性あり
- Risk: Medium — モジュール構成・Zod検証・`HttpError`パターン・soft-delete拡張という先例があり技術的には既知の延長線上だが、(a) 5モジュール横断でガード漏れが起きやすい構造的リスク、(b) `NonBusinessDay`の一意制約をワークスペース単位へ組み替える migration 手編集、(c) 担当者候補の`WorkspaceUserSummary.userId`と既存`User.id`前提UIの整合、が中リスク要因として残る

## 6. UIデザインゲート（claude design）の適用判断

- **判断**: 本仕様はclaude designゲートを**スキップする**（ユーザー明示指示、2026-08-09）
- **対象となりうる画面変更**: 要件2（現在ワークスペース未選択時、Case／Task の一覧・作成で空状態を表示しワークスペース作成へ誘導する）は`pages/cases`・`pages/tasks`の主要操作フローを変更するため、`.kiro/steering/ui-design.md`の適用条件（既存画面の主要操作フローの変更）に文言上は該当する
- スキップ理由
  - 新しい見た目・情報設計をゼロから確定する必要がなく、`workspace-membership`側で既に確定済みの空状態パターン（`pages/workspaces/index.vue`内のインラインマークアップ、「ワークスペースがありません」、作成モーダルへの導線）をそのまま踏襲するのみであるため。既存のcases/tasks一覧chrome・Modal・配色を変更せず、条件分岐で同パターンのマークアップを差し込む形に限定する
- 設計フェーズへの制約
  - 空状態は共有Vueコンポーネントとしては切り出されていない。design.mdでは再利用元を`pages/workspaces/index.vue`のマークアップ／視覚パターンとして具体的に記載する（新規の見た目を書き下ろさない）。再利用元の見た目が変更された場合は本判断の再確認が必要（Revalidation Trigger）

## 8. Design Decisions（Synthesis）

design.md 生成前に確定した横断判断。詳細な根拠は上記4節のOption比較を参照。

### Generalization
- 5リソース（Case/Task/RecurringTaskTemplate/NonBusinessDay/DevelopmentStage）は「作成時に現在ワークスペースへ帰属」「list/get/update/deleteを現在ワークスペース＋メンバーシップで強制」という同一パターンの繰り返しであるため、共有ヘルパー（`requireWorkspaceMember`前提ハンドラ、`withWorkspaceScope`where句合成関数）としてインターフェースを一般化する。各モジュール固有のクエリ組み立てはモジュール内に残す（Option Cの踏襲）
- 担当者候補（Requirement 4）は、`workspace-membership`が提供する`GET /api/workspaces/:id/members`と同一のデータ（ワークスペースメンバー一覧）を要求しているに過ぎないため、新規バックエンドエンドポイントを作らず既存の`listMembers`／`api.listWorkspaceMembers`をフロントの担当者ピッカーから直接再利用する。ただし戻り値の識別子は`userId`であり、既存`User.id`前提UIとのマッピングが必要

### Build vs Adopt
- ワークスペース文脈の伝達方式は、`X-Workspace-Id`リクエストヘッダを新規採用する（Build）。パスネスト（`/api/workspaces/:id/cases`等）は`workspace-membership`の設計と一貫するが、既存の`/api/cases`・`/api/tasks`等フラットパス・既存E2E約15本・フロント呼び出し全箇所の書き換えを要し影響が過大なため不採用。クエリパラメータ方式も候補だったが、GET以外（POST/PATCH/DELETE）でも一貫した伝達手段が必要なため、全メソッドで扱えるヘッダーを採用
- `X-Workspace-Id`ヘッダの付与は、フロントの`useApiClient.ts`が既に確立している CSRF ヘッダ自動付与パターン（`request()`内でのヘッダーマージ）と同じ仕組みに乗せる（Adopt: 既存パターンの延長、新規ライブラリ不要）
- メンバーシップ判定は`workspace-membership`の`workspaceService.isMember`をそのまま採用（Adopt）。本仕様側で判定ロジックを再実装しない
- where句への`workspaceId`注入はPrisma Client Extension（Option B）を採用せず、通常の関数（`withWorkspaceScope`）をBuildする（既存soft-delete拡張の"暗黙的な全モデル適用"は、`workspaceId`列を持たないモデル（User/Workspace/WorkspaceMember等）の除外分岐が必要になり複雑化するため）

### Simplification
- 担当者候補APIを新設しない（上記Generalization参照）。`pages/tasks`／`pages/kanban`の担当者ピッカーを`listUsers()`から`listWorkspaceMembers(currentWorkspaceId)`へ差し替える。戻り値は`WorkspaceUserSummary`（主キー相当は`userId`）なので、既存の`User.id`前提のoption／props利用箇所では`userId`を選択値に使うよう合わせて変更する
- `forbidden`（403）ヘルパーは`workspace-membership`が追加済み。本仕様は存在確認のみ行い、重複実装しない
- 現在ワークスペース未選択時（Requirement 2）は、フロントの空状態表示（クライアント側ゲート）のみに依存せず、バックエンドの`requireWorkspaceMember`が`X-Workspace-Id`欠落時に400を返すことで独立して境界を保証する（クライアント側の判定だけに安全性を委ねない）

## 7. design フェーズへの推奨事項

- Upstream（`workspace-membership`）は実装完了済み。本仕様は実装着手可能な状態にある
- Option C（共有ガード＋モジュール個別のwhere句拡張）を採用済み。`forbidden`は追加しない
- ワークスペース文脈の伝達方式は`X-Workspace-Id`ヘッダーで確定済み
- 実装時は`NonBusinessDay`の一意制約のワークスペース化と、担当者候補の`userId`マッピングを落とさないこと

## 9. `/kiro-validate-design` レビュー結果と反映（2026-08-09）

design.mdレビューで指摘された3点を反映済み。

1. **ガード漏れの型的防止が弱い** → `shared/workspace-scope.ts`に`VerifiedWorkspaceId`（branded type）を導入。`requireWorkspaceMember`のみが生成でき、各モジュールの`workspaceId`引数はこの型を要求する。未検証の生`string`を渡す箇所は明示的な`as`キャストが必要になりレビューで検出しやすくなる
2. `shared/`のレイヤ違反 → `requireWorkspaceMember`本体（`workspaceService.isMember`に依存する部分）を`shared/workspace-scope.ts`から`backend/src/workspace-scope.guard.ts`（`app.ts`と同階層）へ分離。`shared/workspace-scope.ts`にはモジュール非依存の`WORKSPACE_HEADER_NAME`／`VerifiedWorkspaceId`型／`withWorkspaceScope`のみを残す
3. 要件4.1の範囲超過 → 担当者「候補」制限の適用対象を、作成時候補（`pages/tasks/index.vue`）とカンバン再割当（`pages/kanban/index.vue`経由）に絞り込み、`components/users/AssigneeFilter.vue`・`pages/calendar/index.vue`（既存アサイン済みタスクのフィルタ・表示用途）は対象外とした。過去にワークスペースを離脱したメンバーがアサイン済みのタスクも引き続き検索・表示できる状態を維持する

## 10. main マージ後の文書整合（2026-08-10）

`workspace-membership`実装を`main`経由で取り込み、現行コードと仕様文書を突合した結果を反映した。

- 解消した前提ずれ
  - Upstream未実装の記述を実装済みへ更新
  - export名を`workspaceService`に統一
  - 空状態を「共有コンポーネント」ではなく`pages/workspaces/index.vue`のインライン視覚パターンと明記
  - 担当者候補の`WorkspaceUserSummary.userId`と既存`User.id`の差分を明記
  - `NonBusinessDay.date_active_key`のグローバルUNIQUEをワークスペース単位へ組み替える必要性を追記
- 軽微な追記
  - `useApiClient`の行番号依存をやめ、`request()`内のヘッダー合成パターンを参照する表現へ変更
  - `spec.json`の`ready_for_implementation`を`true`へ更新

## 11. 実装前レビュー反映（2026-08-10）

- 空状態対象を cases/tasks 以外へ拡大
  - `workspaceId`が付くリソースを扱う画面すべてに加え、消化数画面も含める
  - 具体: `pages/index.vue`・`cases`・`tasks`・`kanban`・`calendar`・`recurrence`・`holidays`・`throughput`
  - `/api/throughput`のスコープ化は引き続き`velocity-dashboard`の責務。本仕様は未選択時空状態のみ先入れし、Downstreamで失念しないよう申し送る
- 関連先リソースの同一ワークスペース検証を明示
  - Taskの`caseId`／`parentTaskId`／`developmentStageId`はPrisma FKだけではワークスペース横断紐付けを防げない
  - requirements 3.5・design.md TaskService・tasks 3.3 に記載し、実装レビュー観点とする
