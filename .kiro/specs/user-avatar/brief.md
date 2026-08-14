# Brief: user-avatar

## Problem

現在、ユーザー名が表示される箇所（担当者バッジ、コメント投稿者、ワークスペースメンバー一覧、担当者選択、ヘッダーの現在ユーザーなど）はテキストのみか、`TaskCard.vue` の一部で固定色のイニシャル円が使われているだけで、ユーザーごとに視覚的な区別がつかない。プロフィール画像アップロード機能は存在せず、今後も本仕様の対象外である。

## Current State

- `frontend/components/kanban/TaskCard.vue`: 担当者イニシャルを `bg-primary-100` の固定色円で表示（ユーザー間で色の区別なし）
- `TaskFieldCard.vue`、`TaskTimeline.vue`（コメント投稿者・操作ログ）、`TeamWorkloadSummary.vue`、ワークスペースメンバー一覧（`/workspaces`）、各種担当者セレクタ: すべて名前のみのプレーンテキスト表示
- `User` 型は `id` を常に保持しており、コメント／操作ログのAPIレスポンスにも `authorUserId` 等の形で `userId` が含まれている。バックエンド変更は不要
- `frontend/components/shared/` に `Badge.vue` 等の小さな表示コンポーネント（コンポーネント + `.helpers.ts` + `.test.ts` の三点構成）の先例があり、新規コンポーネントもこの構成に従う想定
- アイコン／ハッシュ／色計算系の外部ライブラリは未導入。実装はゼロから行う

## Desired Outcome

- 全アカウントにGitHub風の決定的な識別用アイコン（identicon）が、ユーザー名が表示されるほぼ全箇所に一貫したコンポーネントとして表示される
- 同一ユーザーは常に同一のパターン・色になる（`userId` を種として生成）
- `TaskCard.vue` の既存イニシャル円は新しい identicon コンポーネントに置き換えられ、見た目が統一される

## Approach

生成アルゴリズムは以下の3案をclaude designで比較し、採用案を確定する（画面変更を伴うため `.kiro/steering/ui-design.md` のclaude designゲート対象）。

1. 単色対称グリッド（GitHub本家方式）: 5x5等のグリッドを左右対称にし、ハッシュ由来の単一色で塗る。最もシンプルで実装・テストが軽い
2. 多色グリッド（Blockies/Ethereum方式）: 同じ対称グリッドだが、背景・主色・差し色の3色をハッシュから決定し、色彩に幅を持たせる
3. 回転対称の幾何模様（Jdenticon風）: 三角形・多角形をハッシュで配置し4回回転対称でパターンを形成。より有機的でモダンな見た目だが実装がやや複雑

いずれも外部ライブラリを追加せず、`userId` の決定的ハッシュからSVGを生成するクライアントサイド実装とする。

## Scope

- **In**
  - `userId` を種としたidenticon生成アルゴリズムの実装（上記3案からclaude designで1案を確定）
  - 再利用可能な `UserAvatar` 系コンポーネント（`frontend/components/shared/` 配下、既存の Badge 系と同じ三点構成）の新規追加
  - 以下の箇所へのidenticon表示統合:
    - 担当者バッジ（`TaskCard.vue`。既存の固定色イニシャル円を置き換え）
    - 担当者フィールド（`TaskFieldCard.vue`）
    - コメント投稿者（`TaskTimeline.vue`）
    - ワークスペースメンバー一覧（`/workspaces`。メンバー追加を含む管理画面。`WorkspaceSettingsModal`はユーザー名を表示しないため対象外）
    - チーム稼働状況（`TeamWorkloadSummary.vue`）
    - ヘッダーの現在ユーザー表示
    - その他ユーザー名が独立したラベルとして表示される箇所全般
- **Out**
  - ユーザー設定ページ（プロフィール編集画面そのもの）の新規・変更
  - 画像アップロードや他アイコンへの変更機能（今後も identicon 固定で、ユーザーによる差し替えは提供しない）
  - 操作ログの文中埋め込みアクター名（例:「田中 がステータスを...」）への埋め込み表示。文中はテキストのみを維持し、レイアウト変更は行わない
  - ネイティブ `<select>` の担当者セレクタ（`AssigneeFilter.vue` 等）内へのidenticon描画。HTML仕様上オプション内にSVGを置けないため対象外
  - バックエンドAPI変更（既存レスポンスの `userId` で完結するため不要見込み。設計時に再確認）

## Boundary Candidates

- identicon生成アルゴリズム（純粋関数、`userId` → SVG/パターン記述）
- 表示コンポーネント（`UserAvatar.vue` 本体、サイズ・レイアウトのバリエーション）
- 既存画面への統合（各画面ファイルの差し替え作業）

## Out of Boundary

- ユーザー設定ページ
- アイコン変更・画像アップロード機能
- 操作ログ文中埋め込みへの対応
- ネイティブselect内での表示
- `WorkspaceSettingsModal`（ワークスペース名と識別色の編集のみ。ユーザー名を表示しない）
- `TaskDetailModal`の担当者表示（閲覧は「担当者: 名前」の複合バッジ、編集はネイティブselect）

## Upstream / Downstream

- **Upstream**: `user-auth`（`User.id` の存在）、`task-detail`（コメント・操作ログのUI構造）、`workspace-membership`（メンバー一覧）
- **Downstream**: 今後ユーザー設定ページやアバターアップロード機能が追加される場合、identicon はアップロード画像未設定時のフォールバックとして再利用される想定（本仕様のスコープ外だが設計上の含みとして記録）

## Existing Spec Touchpoints

- **Extends**: なし（新規の共有UIコンポーネント追加のため独立スペックとする。ただし表示統合先は `task-detail` / `workspace-membership` / `kanban-ux-redesign` の画面群にまたがる）
- **Adjacent**: `task-detail`（コメント・操作ログ）、`workspace-membership`（メンバー一覧）、`kanban-ux-redesign`（TaskCard・TeamWorkloadSummary）

## Constraints

- 画面変更を伴うため `.kiro/steering/ui-design.md` のclaude designゲート必須。3つのアルゴリズム案をモックで比較し、`research.md` に採用/不採用を記録してから設計・実装に進む
- 外部ライブラリ追加は行わず、SVG生成をクライアントサイドの純粋関数として実装する
- 種は `userId`（安定・重複なし）を使用し、表示名の変更・重複の影響を受けないようにする
