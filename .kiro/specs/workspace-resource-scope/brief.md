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
- 所属外 ID を指定した操作は拒否される（リソース自体の ID 指定に加え、関連先 ID のクロスワークスペース指定も含む）
- 担当者選択の候補は、同一ワークスペースのメンバーに限られる
- `workspaceId` が付くリソースを扱う画面、およびそれらを集計する消化数画面は、未選択時にワークスペース作成へ誘導する
- 既存データは破棄前提でよい（開発段階）。マイグレーションはスキーマ適合を優先

## Approach

主要リソースに `workspaceId`（名称は design で確定）を追加し、list／get／update／delete を現在ワークスペース＋メンバーシップで強制する。作成時は現在ワークスペースに紐付ける。関連先リソース ID も同一ワークスペースであることをサービス層で検証する。フロントの一覧・作成導線は現在ワークスペース前提に揃える。認証方式の詳細には依存せず、membership 判定 API／サービスを再利用する。

## Scope

- In
  - Case／Task 等へのワークスペース所属付与
  - API の所属チェックと 403／404 方針
  - 関連先リソースの同一ワークスペース検証
  - 担当者候補のワークスペース内制限
  - 対象リソースを扱う全画面＋消化数画面の未選択時空状態
  - 既存グローバル前提のテスト／E2E の更新
- Out
  - クロスワークスペース検索や移動の高度機能
  - 招待リンク、RBAC
  - velocity やコメント機能そのもの（消化数 API のスコープ化は velocity-dashboard）

## Boundary Candidates

- スキーマ／リポジトリのスコープ付与
- サービス層の所属ガードと関連先整合性検証
- フロントの現在ワークスペース前提の一覧・フォーム

## Out of Boundary

- 認証セッション実装の変更
- メンバー招待 UX の拡張
- 詳細画面の機能追加、消化数集計ロジックそのものの変更

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
