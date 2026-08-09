# Brief: workspace-membership

## Problem

ログインできても、可視境界がないと「誰とどの案件・タスクを共有するか」を表現できない。ユーザーはワークスペースを持ち、そこに他ユーザーを迎えたい。

## Current State

- 認証導入後も、データはまだグローバル（ワークスペース概念なし）
- 案件（Case）は納期付きの仕事単位であり、チームの可視境界ではない
- 招待・メンバーシップのモデル／API／UI はない

## Desired Outcome

- ログインユーザーがワークスペースを作成できる
- ワークスペースに、既存の登録ユーザーを検索してメンバー追加できる（メール送信なし）
- 現在操作中のワークスペースを選択できる
- メンバー一覧を確認でき、追加したメンバーは当該ワークスペースの対等な利用者になる（細かいロールは持たない）
- 用語は「ワークスペース」に統一し、案件（Case）と混同しない

## Approach

Workspace と Membership を新モジュールとして追加する。作成者は自動的にメンバーになる。メンバー追加はユーザー検索（名前／ログイン識別子）で行い、招待リンクは作らない。フロントにワークスペース作成・切替・メンバー管理の最小 UI を置く。データ本体の projectId 移行は次仕様に任せ、本仕様では所属関係と選択コンテキストまでを完了とする。

## Scope

- In
  - Workspace／Membership モデルと CRUD（作成、一覧、メンバー追加・一覧）
  - ワークスペース設定の更新（名前・識別色。メンバーであれば誰でも可。claude designでのモック確定時に要件へ追加）
  - 現在ワークスペースの選択（サーバまたはクライアントで一貫した方法）
  - ユーザー検索によるメンバー追加 UI
- Out
  - 案件・タスクへの workspace 外部キー付与とアクセス強制（次仕様）
  - 招待リンク、メール招待、オーナー専用権限などの細分ロール
  - ワークスペース削除の高度なポリシー（必要なら最小限のみ）

## Boundary Candidates

- Workspace 集約（作成・一覧・現在選択）
- Membership（検索追加・一覧）
- ワークスペース UI シェル

## Out of Boundary

- Case／Task のスコープ強制
- リンク招待、メール、OAuth
- RBAC（管理者／一般の差）

## Upstream / Downstream

- Upstream
  - user-auth（ログインユーザーが操作主体）
- Downstream
  - workspace-resource-scope
  - 担当者選択をメンバーに限定する変更

## Existing Spec Touchpoints

- Extends
  - なし（新境界）。凍結 spec は更新しない
- Adjacent
  - case-management-ux、task-delivery-management（案件・タスクの意味は次仕様でワークスペース配下へ）

## Constraints

- ログイン済みならワークスペース内では対等
- UI 文言は「ワークスペース」。API／DB も workspace 系に揃える
- 画面追加のため claude design ゲート対象
