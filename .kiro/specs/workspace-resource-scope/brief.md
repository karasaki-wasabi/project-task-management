# Brief: workspace-resource-scope

## Problem

ワークスペースとメンバーシップがあっても、案件・タスクがグローバルのままだと所属外のデータが見えてしまい、可視境界として機能しない。

## Current State

- Case／Task 等にワークスペースへの所属がない
- API はログイン必須になっていても、テナントフィルタはない
- 担当者（assignee）は全ユーザーから選べる可能性がある

## Desired Outcome

- 案件・タスク（および本システムでユーザーが扱う主要リソース）はいずれかのワークスペースに属する
- 現在ワークスペースのメンバーだけが、その配下のデータを読み書きできる
- 所属外 ID を指定した操作は拒否される
- 担当者選択の候補は、同一ワークスペースのメンバーに限られる
- 既存データは破棄前提でよい（開発段階）。マイグレーションはスキーマ適合を優先

## Approach

主要リソースに `workspaceId`（名称は design で確定）を追加し、list／get／update／delete を現在ワークスペース＋メンバーシップで強制する。作成時は現在ワークスペースに紐付ける。フロントの一覧・作成導線は現在ワークスペース前提に揃える。認証方式の詳細には依存せず、membership 判定 API／サービスを再利用する。

## Scope

- In
  - Case／Task 等へのワークスペース所属付与
  - API の所属チェックと 403／404 方針
  - 担当者候補のワークスペース内制限
  - 既存グローバル前提のテスト／E2E の更新
- Out
  - クロスワークスペース検索や移動の高度機能
  - 招待リンク、RBAC
  - velocity やコメント機能そのもの

## Boundary Candidates

- スキーマ／リポジトリのスコープ付与
- サービス層の所属ガード
- フロントの現在ワークスペース前提の一覧・フォーム

## Out of Boundary

- 認証セッション実装の変更
- メンバー招待 UX の拡張
- 詳細画面・消化数ダッシュボードの機能追加

## Upstream / Downstream

- Upstream
  - user-auth、workspace-membership
- Downstream
  - task-detail、velocity-dashboard、将来の MCP

## Existing Spec Touchpoints

- Extends（コードのみ、spec 文書は凍結）
  - task-delivery-management、case-management-ux、kanban-ux-redesign、task-case-calendar、recurrence-holidays-ux が触るデータアクセス面
- Adjacent
  - workspace-membership（所属の正本）

## Constraints

- 破棄前提のため複雑なデータ移行ツールは必須にしない
- ガード漏れが最大リスク。list だけでなく get-by-id も必ず検証する
- 画面変更があれば claude design ゲート対象
