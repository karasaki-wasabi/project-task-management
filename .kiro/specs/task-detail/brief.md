# Brief: task-detail

## Problem

タスクの確認・編集はカンバン等の詳細モーダルが中心で、履歴や議論を残す場所がない。簡易な確認と、コメント／操作ログ付きの深い作業を同じ UI に詰め込むと複雑になる。

## Current State

- タスク詳細ページ `/workspaces/:workspaceId/tasks/:taskId` で閲覧・編集・削除・複製、コメント、タイムラインを扱える
- `Comment` / `ActivityLog` とタイムライン API（`GET /api/tasks/:id/timeline`）が実装済み
- `TaskDetailModal` は簡易表示を基本とし、ステータス以外の軽微編集と「詳細ページを開く」導線を持つ。削除済みは `deletedAt` により参照専用
- 操作者はログインユーザー、データはワークスペーススコープが前提（user-auth / workspace-resource-scope 済み）
- フィールド語彙は `detail` / `scheduledEndDate`（task-field-rename 完了済み）

## Desired Outcome

- 既存モーダルは簡易表示（ステータス以外の最小編集）として残す
- タスク詳細画面（専用ページ）から、そのタスクの CRUD と関連情報を扱える
- 詳細画面にコメントを付けられる（誰が・いつ・内容）
- 詳細画面に操作ログ（誰が何をしたか）を時系列で見られる
- モーダルから詳細画面へ進める

## Approach

フロントにタスク詳細ルートを新設し、モーダルは簡易ビュー＋詳細への導線に役割分担する。コメントと操作ログはタスクに紐づく新ドメインとして追加し、actor はログインユーザーを使う。どのフィールド変更をログするかは requirements で列挙する。ワークスペースガードは既存の resource-scope を前提にし、本仕様では再発明しない。

## Scope

- In
  - タスク詳細ページと、モーダルからの導線
  - 詳細ページ上でのタスク CRUD（既存 API の利用／不足分の最小拡張）
  - コメントの作成・一覧（編集／削除の要否は requirements で決定）
  - 操作ログの記録と一覧表示
  - モーダルの簡易化（詳細と責務が被る部分の整理）
- Out
  - メンション通知、メール通知
  - ワークスペース横断の活動フィード
  - 細かい RBAC
  - velocity／ストーリーポイント（別仕様）

## Boundary Candidates

- 詳細ページシェル／導線
- コメント
- 操作ログ（記録と表示）
- モーダル簡易化

## Out of Boundary

- 認証・ワークスペース所属そのもの
- 消化数ダッシュボード
- 外部チャット連携

## Upstream / Downstream

- Upstream
  - user-auth（操作者）
  - workspace-resource-scope（データ可視範囲）
  - task-status-model（ステータス／開発段階語彙）
  - task-field-rename（`detail` / `scheduledEndDate` 語彙。本仕様より先行）
- Downstream
  - velocity-dashboard（詳細フォームへのポイント入力と隣接しうる）

## Existing Spec Touchpoints

- Extends（コードのみ）
  - TaskDetailModal を所有する kanban／calendar 周り
- Adjacent
  - case-management-ux（モーダル内の案件関連付けは維持または詳細へ寄せる判断を requirements で行う）
  - velocity-dashboard（storyPoints 入力欄の置き場）

## Constraints

- 操作ログは pino の運用ログを UI に流用しない。ドメインイベントとして永続化する
- 画面刷新のため claude design ゲート対象
- コメント／ログのリアルタイム更新（WebSocket）は必須にしない
- 非所属ワークスペースへの単一取得は 404 とし、リソースの有無を漏らさない
