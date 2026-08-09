# Gap Analysis: workspace-resource-scope

## 1. 前提となる依存関係の状態

- `workspace-membership`は要件・設計・タスクの文書化までは完了しているが、**コード実装は未着手**（別ブランチ`workspace-membership`にspec文書のみコミット済み、`Workspace`/`WorkspaceMember`モデルは現在のブランチのスキーマに存在しない。`grep -r "workspace"` は`backend/`/`frontend/`のソースコードに一件もヒットしない）
- `user-auth`はバックエンドが完了済み（`requireUser`が`app.ts`のグローバル`preHandler`として全`/api/*`に適用済み、`PublicUser`型は`{ id, email, name, createdAt, updatedAt }`）。フロントエンドの認証UI（ログイン画面・`useAuth`・ヘッダー表示名）は未実装（tasks.md 6.x系が未チェック）
- したがって本仕様は、**`workspace-membership`の実コードが存在しない状態では設計・実装ともに着手できない**（Upstreamという弱い表現ではなく、ハードな順序ゲートとして扱うべき）

## 2. Requirement-to-Asset Map

| Requirement | 関連する既存資産 | ギャップ |
|---|---|---|
| 1（リソースのワークスペース帰属） | `Case`/`Task`/`RecurringTaskTemplate`/`NonBusinessDay`/`DevelopmentStage`の各`schema.prisma`モデル、各`<domain>.repository.ts`の作成メソッド | **Missing**: 5モデル全てに`workspaceId`列がない。**Constraint**: `shared/soft-delete.repository.ts`のPrisma Client Extensionは`$allModels`の`where`句への注入のみを行い、`create`の`data`側には関与しない（`soft-delete.repository.ts:29-63`）ため、同様の仕組みを作っても各モジュールの作成呼び出し全箇所で`workspaceId`を明示的に渡す実装が別途必要 |
| 1.3（テンプレート生成の整合性） | `recurrence.service.ts`の`applyToCase(caseId, ...)`が`case.findUnique`で対象案件を解決 | **Missing**: テンプレート・案件双方のワークスペース一致検証が存在しない。テンプレート適用の呼び出し経路に検証を挟む改修が必要 |
| 2（未選択時の空状態） | なし（`useCurrentWorkspace`相当のcomposableは`workspace-membership`未実装のため現ブランチに存在しない） | **Missing**: フロントの一覧・作成導線が空状態判定を持たない。**Unknown**: 空状態表示は各ページ（`pages/cases`, `pages/tasks`等）が個別に判定するか、共通レイアウト/ミドルウェアで一括ガードするか未確定（design課題） |
| 3（現在ワークスペース＋メンバーシップでの読み書き制御） | `shared/http-errors.ts`（`badRequest`/`unauthorized`/`notFound`のみ、`forbidden`403は未実装）、`task.repository.ts:53-64`の`list(filter)`によるwhere句合成の先例、`auth.guard.ts`の`requireUser`という「preHandlerでrequestに検証済み情報を付与する」先例 | **Missing**: `forbidden`ヘルパー（`workspace-membership`側のdesign.mdも同ヘルパーの追加を計画しており重複実装のリスクあり）。`case.repository.ts`の`findById`/`update`/`delete`は`id`のみで`where`を構成しており（`case.repository.ts:21-45`）、`task.repository.ts`も同様（`:30-51`）——スコープ用パラメータを持たない。`case.repository.ts:33`の`list()`は注入可能な`client`引数を無視し`db`を直接使用しており、他メソッドとの一貫性がない |
| 4（担当者候補のワークスペース内制限） | `GET /api/users`（`user.repository.ts:12-14`、全件無条件）、`workspace-membership`計画中の`WorkspaceService.listMembers(id)` | **Missing**: ワークスペース内メンバーのみを返す担当者候補エンドポイントが存在しない。**Reuse候補**: `workspace-membership`の`listMembers`をそのまま担当者候補取得に転用できる可能性がある（新規検索ロジックを重複実装しない） |

## 3. 未解決の設計論点（Research Needed）

1. **ワークスペース文脈の伝達方法**: `workspace-membership`自身のエンドポイントはパスに`:id`を含む（`/api/workspaces/:id/members`等）が、`Case`/`Task`は現在フラットな`/api/cases`・`/api/tasks`。一覧・作成時に「対象ワークスペース」をクエリパラメータ・ヘッダー・パスネストのいずれで受け取るかは未確定。フロントの`useApiClient.ts`は`query`オブジェクトをそのまま`$fetch`に渡す構造（`useApiClient.ts:185-201`, `listTasks`の`{ query: filter }`パターン）のため、クエリパラメータ／ヘッダーいずれも既存パターンに乗せやすいが、既存の`~15`本のE2E・フロント呼び出し箇所への影響度が選択肢によって大きく異なる
2. **where句への`workspaceId`注入方式**: `soft-delete.repository.ts`と同様のPrisma Client Extension（`query.$allModels`フック）を新設するか、各`repository.ts`のメソッド引数に`workspaceId`を素朴に追加するか。前者は「ガード漏れが最大リスク」という制約への対処として一元化できる一方、`create`側は自動化できないため効果が限定的
3. **`isMember`等の再利用契約**: `workspace-membership`のdesign.mdは`WorkspaceService.isMember(id, userId): Promise<boolean>`を「他モジュールから再利用する所属判定」として公開する計画だが、**未実装のインターフェース**であるため、本仕様の設計時点でシグネチャが凍結されているか`workspace-membership`側の実装状況を`/kiro-spec-status workspace-membership`で確認する必要がある
4. **`forbidden`（403）ヘルパーの実装主体**: `workspace-membership`のdesign.mdは`shared/http-errors.ts`への`forbidden`追加を自らのBoundary Commitmentとして計画済み。実装順序次第で本仕様が同じ変更を重複して行うリスクがあるため、どちらが先に着手するかで調整が必要
5. **E2Eテストの改修範囲**: `assignee-filter.spec.ts`、`kanban*.spec.ts`（8本）、`cases.spec.ts`、`task-list.spec.ts`、`calendar.spec.ts`、`dashboard.spec.ts`、`events-removed.spec.ts`など計15本前後が単一グローバルデータ前提。`user-auth`のtasks.md 7.1が計画する「登録+ログインの共有fixture」と同様に、「ワークスペース作成+参加」の共有fixtureを新設するかは設計判断
6. **RecurringTaskTemplateの新規作成導線**: テンプレート一覧・作成画面がどこにあるか（`recurrence`モジュール自体の画面構成は本仕様のスコープ外）を確認し、作成時に現在ワークスペースへ帰属させる導線がどのファイルに存在するか設計時に特定する必要がある

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

- **Effort: L（1〜2週間）** — 5リソース×スキーマ/repository/service/routes/テストのフルスタック変更、共有ガード新設、フロント側のワークスペース文脈配線（`workspace-membership`実装分に相乗り）、担当者候補APIの新設、繰り返し生成の整合性チェック追加、既存E2E約15本の改修が全て必要。範囲の広さ次第でXLに寄る可能性あり
- **Risk: Medium** — モジュール構成・Zod検証・`HttpError`パターン・soft-delete拡張という先例があり技術的には既知の延長線上だが、(a) 5モジュール横断でガード漏れが起きやすい構造的リスク、(b) 未実装の`workspace-membership`への強い依存、(c) ワークスペース文脈の伝達方式が未決定、という3点が中リスク要因として残る

## 6. UIデザインゲート（claude design）の適用判断

- **判断**: 本仕様はclaude designゲートを**スキップする**（ユーザー明示指示、2026-08-09）
- **対象となりうる画面変更**: 要件2（現在ワークスペース未選択時、Case／Task の一覧・作成で空状態を表示しワークスペース作成へ誘導する）は`pages/cases`・`pages/tasks`の主要操作フローを変更するため、`.kiro/steering/ui-design.md`の適用条件（既存画面の主要操作フローの変更）に文言上は該当する
- **スキップ理由**: 新しい見た目・情報設計をゼロから確定する必要がなく、`workspace-membership`側で既に確定済みの空状態パターン（`pages/workspaces`の「ワークスペースがありません」空状態、作成モーダルへの導線）をそのまま踏襲するのみであるため。既存のcases/tasks一覧chrome・Modal・配色を変更せず、条件分岐で空状態コンポーネントを差し込む形に限定する
- **設計フェーズへの制約**: design.mdでは、この空状態が`workspace-membership`の確定済みコンポーネント／パターンをどのファイル・コンポーネント単位で再利用するかを具体的に記載すること（新規の見た目を書き下ろさない）。再利用元のコンポーネントが`workspace-membership`実装時に変更された場合は本判断の再確認が必要（Revalidation Trigger）

## 8. Design Decisions（Synthesis）

design.md 生成前に確定した横断判断。詳細な根拠は上記4節のOption比較を参照。

### Generalization
- 5リソース（Case/Task/RecurringTaskTemplate/NonBusinessDay/DevelopmentStage）は「作成時に現在ワークスペースへ帰属」「list/get/update/deleteを現在ワークスペース＋メンバーシップで強制」という同一パターンの繰り返しであるため、共有ヘルパー（`requireWorkspaceMember`前提ハンドラ、`withWorkspaceScope`where句合成関数）としてインターフェースを一般化する。各モジュール固有のクエリ組み立てはモジュール内に残す（Option Cの踏襲）
- 担当者候補（Requirement 4）は、`workspace-membership`が提供する`GET /api/workspaces/:id/members`と同一のデータ（ワークスペースメンバー一覧）を要求しているに過ぎないため、新規バックエンドエンドポイントを作らず既存の`listMembers`をフロントの担当者ピッカーから直接再利用する

### Build vs Adopt
- ワークスペース文脈の伝達方式は、`X-Workspace-Id`リクエストヘッダを新規採用する（Build）。パスネスト（`/api/workspaces/:id/cases`等）は`workspace-membership`の設計と一貫するが、既存の`/api/cases`・`/api/tasks`等フラットパス・既存E2E約15本・フロント呼び出し全箇所の書き換えを要し影響が過大なため不採用。クエリパラメータ方式も候補だったが、GET以外（POST/PATCH/DELETE）でも一貫した伝達手段が必要なため、全メソッドで扱えるヘッダーを採用
- `X-Workspace-Id`ヘッダの付与は、フロントの`useApiClient.ts`が既に確立している CSRF ヘッダ自動付与パターン（`request()`内でのヘッダーマージ）と同じ仕組みに乗せる（Adopt: 既存パターンの延長、新規ライブラリ不要）
- メンバーシップ判定は`workspace-membership`の`WorkspaceService.isMember`をそのまま採用（Adopt）。本仕様側で判定ロジックを再実装しない
- where句への`workspaceId`注入はPrisma Client Extension（Option B）を採用せず、通常の関数（`withWorkspaceScope`）をBuildする（既存soft-delete拡張の"暗黙的な全モデル適用"は、`workspaceId`列を持たないモデル（User/Workspace/WorkspaceMember等）の除外分岐が必要になり複雑化するため）

### Simplification
- 担当者候補APIを新設しない（上記Generalization参照）。`pages/tasks`の担当者ピッカーを`listUsers()`から`listWorkspaceMembers(currentWorkspaceId)`へ差し替えるだけに留める
- `forbidden`（403）ヘルパーは`shared/http-errors.ts`に無ければ本仕様が追加するが、`workspace-membership`が先に実装されていれば既に存在するはずのため、実装時に存在確認してから追加する（重複実装を避ける）
- 現在ワークスペース未選択時（Requirement 2）は、フロントの空状態表示（クライアント側ゲート）のみに依存せず、バックエンドの`requireWorkspaceMember`が`X-Workspace-Id`欠落時に400を返すことで独立して境界を保証する（クライアント側の判定だけに安全性を委ねない）

## 7. design フェーズへの推奨事項

- 実装着手前に`/kiro-spec-status workspace-membership`で当該仕様の実装進捗を確認し、`Workspace`/`WorkspaceMember`モデルと`WorkspaceService.isMember`/`listMembers`が実コードとして存在する状態になってから本仕様のdesignを確定すること（brief.mdのUpstreamは順序ゲートとして扱う）
- Option Cをベースラインとして検討することを推奨（brief.mdの「ガード漏れが最大リスク」という制約に対して一元化と個別最適のバランスが良い）が、`forbidden`ヘルパーの実装主体は`workspace-membership`側の実装状況を見て重複を避けること
- ワークスペース文脈の伝達方式（クエリ／ヘッダー／パスネスト）を design.md の Architecture セクションで最初に確定し、それに応じて影響範囲（フロント呼び出し・E2E改修規模）を見積もり直すこと

## 9. `/kiro-validate-design` レビュー結果と反映（2026-08-09）

design.mdレビューで指摘された3点を反映済み。

1. **ガード漏れの型的防止が弱い** → `shared/workspace-scope.ts`に`VerifiedWorkspaceId`（branded type）を導入。`requireWorkspaceMember`のみが生成でき、各モジュールの`workspaceId`引数はこの型を要求する。未検証の生`string`を渡す箇所は明示的な`as`キャストが必要になりレビューで検出しやすくなる
2. **`shared/`のレイヤ違反** → `requireWorkspaceMember`本体（`workspacesService.isMember`に依存する部分）を`shared/workspace-scope.ts`から`backend/src/workspace-scope.guard.ts`（`app.ts`と同階層）へ分離。`shared/workspace-scope.ts`にはモジュール非依存の`WORKSPACE_HEADER_NAME`／`VerifiedWorkspaceId`型／`withWorkspaceScope`のみを残す
3. **要件4.1の範囲超過** → 担当者「候補」制限の適用対象を、作成時候補（`pages/tasks/index.vue`）とカンバン再割当（`pages/kanban/index.vue`経由）に絞り込み、`components/users/AssigneeFilter.vue`・`pages/calendar/index.vue`（既存アサイン済みタスクのフィルタ・表示用途）は対象外とした。過去にワークスペースを離脱したメンバーがアサイン済みのタスクも引き続き検索・表示できる状態を維持する
