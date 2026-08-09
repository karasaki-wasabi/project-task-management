# Requirements Document

## Introduction

ワークスペースとメンバーシップ（`workspace-membership`が提供）が導入された後も、案件（Case）・タスク（Task）・繰り返しタスクテンプレート（RecurringTaskTemplate）・非営業日マスタ（NonBusinessDay）・開発ステージ列（DevelopmentStage）は全ワークスペース共通のグローバルデータのままであり、可視境界として機能していない。本仕様は、これら5リソースをいずれかのワークスペースに帰属させ、現在ワークスペースのメンバーだけが読み書きできるようにする。あわせて、タスクの担当者候補を現在ワークスペースのメンバーに限定する。

ログインユーザーがどのワークスペースにも所属していない、または現在ワークスペースを選択していない場合は、対象リソースの一覧・作成にアクセスできず、ワークスペース作成を促す空状態が表示される。

既存データは開発段階であり破棄前提でよい。クロスワークスペースでのデータ共有・移動、招待・RBAC、コメントや消化数ダッシュボードそのものの機能は本仕様の対象外とする。

## Boundary Context

- **In scope**
  - Case／Task／RecurringTaskTemplate／NonBusinessDay／DevelopmentStageの5リソースへのワークスペース帰属付与
  - 上記5リソースの一覧・取得・作成・更新・削除における、現在ワークスペース＋メンバーシップに基づくアクセス制御
  - 所属外のワークスペース・リソースIDを指定した操作の拒否
  - タスクの担当者候補を現在ワークスペースのメンバーに限定すること
  - 繰り返しタスクテンプレートによるタスク自動生成が、テンプレートと生成先の案件とで同一ワークスペースの組み合わせに限られること
- **Out of scope**
  - クロスワークスペースでのリソース検索・共有・移動
  - 招待リンク発行、ワークスペース内ロール／RBAC
  - コメント機能、操作ログ、消化ペース可視化（velocity-dashboard）そのものの機能追加
  - 既存グローバルデータの移行（開発段階のため破棄前提。スキーマ適合のみを目的とする）
  - `User`（アカウント）そのものの一覧・検索範囲の変更（アカウント一覧自体は引き続きワークスペースをまたいで存在する）
- **Adjacent expectations**
  - 本仕様は「ログイン済みである」ことと「現在ワークスペースの選択・ワークスペースメンバーシップの判定手段が存在する」ことを前提とし、その実現方法（ログイン状態の確立、メンバーシップの正本管理）自体は`user-auth`／`workspace-membership`が担う
  - `workspace-membership`側で「所属していないワークスペースを現在ワークスペースとして指定することはできない」ことが既に保証されている前提に立つ。本仕様は、その現在ワークスペースに対して個々のリソース操作が許可されるかどうかを扱う
  - 所属外操作の拒否を利用者にどのような形（存在を隠すか、権限不足として明示するか）で提示するかは本仕様では規定せず、design フェーズで確定する

## Requirements

### Requirement 1: リソースのワークスペースへの帰属
**Objective:** As a ワークスペースのメンバー, I want 新しく作成する案件・タスク等が自動的に現在のワークスペースに属する, so that 作成物がどの可視境界に属するかを意識せず一貫して扱える

#### Acceptance Criteria
1. When ワークスペースのメンバーが現在ワークスペースを選択した状態でCase／Task／RecurringTaskTemplate／NonBusinessDay／DevelopmentStageのいずれかを新規作成した場合、the Workspace Scope機構 shall 作成されたリソースを操作者の現在ワークスペースへ帰属させる
2. The Workspace Scope機構 shall 上記5リソースのいずれについても、いずれか1つのワークスペースへの帰属を必須とする
3. When 繰り返しタスクテンプレートの適用によりタスクが自動生成される場合、the Workspace Scope機構 shall 生成されたタスクを、適用元の案件と同一のワークスペースへ帰属させる

### Requirement 2: 現在ワークスペースが未選択の場合の一覧・作成アクセス
**Objective:** As a ログインユーザー, I want ワークスペースが未選択の状態では案件・タスク等の一覧や作成に進めない, so that 意図しない可視境界での操作を避けられる

#### Acceptance Criteria
1. If ログインユーザーがどのワークスペースにも所属していない、または現在ワークスペースを選択していない状態でCase等の一覧表示にアクセスした場合、the Workspace Scope機構 shall 一覧の内容を表示せず、ワークスペース作成を促す空状態を提示する
2. If ログインユーザーが現在ワークスペースを選択していない状態でCase等の新規作成を試みた場合、the Workspace Scope機構 shall 作成を実行せず、ワークスペース作成を促す空状態を提示する

### Requirement 3: 現在ワークスペースのメンバーによる読み書き制御
**Objective:** As a ワークスペースのメンバー, I want 自分が所属する現在ワークスペースの案件・タスク等だけを閲覧・操作できる, so that 所属外のデータが意図せず見えたり書き換えられたりしない

#### Acceptance Criteria
1. While ログインユーザーが現在ワークスペースを選択している, the Workspace Scope機構 shall 一覧表示において当該ワークスペースに帰属するリソースのみを対象とする
2. When ワークスペースのメンバーが現在ワークスペースに帰属するリソースの取得・更新・削除を実行した場合、the Workspace Scope機構 shall その操作を許可する
3. If ログインユーザーが現在ワークスペースに帰属しないリソースの取得・更新・削除を試みた場合、the Workspace Scope機構 shall その操作を拒否する
4. If ログインユーザーが自身の現在ワークスペースのメンバーでなくなっている状態で当該ワークスペースのリソースへ操作を試みた場合、the Workspace Scope機構 shall その操作を拒否する

### Requirement 4: 担当者候補のワークスペース内制限
**Objective:** As a ワークスペースのメンバー, I want タスクの担当者候補が現在ワークスペースのメンバーに限られる, so that 所属外の利用者を誤って担当者に指定できない

#### Acceptance Criteria
1. When ワークスペースのメンバーがタスクの担当者候補一覧を表示した場合、the Workspace Scope機構 shall 現在ワークスペースのメンバーのみを候補として提示する
2. If ワークスペースのメンバーがタスクの担当者として現在ワークスペースに所属しない利用者を指定しようとした場合、the Workspace Scope機構 shall その指定を拒否する

## Project Description (Input)

### Problem

ワークスペースとメンバーシップがあっても、案件・タスクがグローバルのままだと所属外のデータが見えてしまい、可視境界として機能しない。

### Current State

- Case／Task 等にワークスペースへの所属がない
- API はログイン必須になっていても、テナントフィルタはない
- 担当者（assignee）は全ユーザーから選べる可能性がある

### Desired Outcome

- 案件・タスク（および本システムでユーザーが扱う主要リソース）はいずれかのワークスペースに属する
- 現在ワークスペースのメンバーだけが、その配下のデータを読み書きできる
- 所属外 ID を指定した操作は拒否される
- 担当者選択の候補は、同一ワークスペースのメンバーに限られる
- 既存データは破棄前提でよい（開発段階）。マイグレーションはスキーマ適合を優先

### Approach

主要リソースに `workspaceId`（名称は design で確定）を追加し、list／get／update／delete を現在ワークスペース＋メンバーシップで強制する。作成時は現在ワークスペースに紐付ける。フロントの一覧・作成導線は現在ワークスペース前提に揃える。認証方式の詳細には依存せず、membership 判定 API／サービスを再利用する。

### Scope

- In
  - Case／Task 等へのワークスペース所属付与
  - API の所属チェックと 403／404 方針
  - 担当者候補のワークスペース内制限
  - 既存グローバル前提のテスト／E2E の更新
- Out
  - クロスワークスペース検索や移動の高度機能
  - 招待リンク、RBAC
  - velocity やコメント機能そのもの

### Boundary Candidates

- スキーマ／リポジトリのスコープ付与
- サービス層の所属ガード
- フロントの現在ワークスペース前提の一覧・フォーム

### Out of Boundary

- 認証セッション実装の変更
- メンバー招待 UX の拡張
- 詳細画面・消化数ダッシュボードの機能追加

### Upstream / Downstream

- Upstream
  - user-auth、workspace-membership
- Downstream
  - task-detail、velocity-dashboard、将来の MCP

### Existing Spec Touchpoints

- Extends（コードのみ、spec 文書は凍結）
  - task-delivery-management、case-management-ux、kanban-ux-redesign、task-case-calendar、recurrence-holidays-ux が触るデータアクセス面
- Adjacent
  - workspace-membership（所属の正本）

### Constraints

- 破棄前提のため複雑なデータ移行ツールは必須にしない
- ガード漏れが最大リスク。list だけでなく get-by-id も必ず検証する
- 画面変更があれば claude design ゲート対象
