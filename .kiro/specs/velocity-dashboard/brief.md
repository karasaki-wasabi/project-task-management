# Brief: velocity-dashboard

## Problem

タスク管理者(利用者本人)は、既存の「消化数ダッシュボード」(`task-delivery-management` Requirement 6, 実装済み)で期間ごとの完了タスク数と単純な件数フォーキャストは確認できるが、以下が把握できない。

- タスクの重さ(工数)を無視した件数ベースの数字しかないため、「軽いタスクを多くこなした週」と「重いタスクを少数こなした週」が同列に見え、実態のペースを見誤る
- 案件単位で「今のペースなら残りタスクが納期までに終わるか」「この案件にまだタスクを追加で積めるか(余力)」を判断する材料がない

## Current State

実装完了後の状態（discovery 時点の前提は Desired Outcome / Approach に残す）。

- `frontend/pages/workspaces/[workspaceId]/throughput/index.vue`: コントロール行・2段推移グラフ・目安サマリー・案件選択時の見通しパネル。表主体の一覧は廃止済み。scoped ページのため未選択空状態は出さない
- `backend/src/modules/throughput/`: 期間境界と件数・ポイントのフォーキャスト、任意の`caseId`による案件フィルタと案件見通しを持つ。完了集計は`taskIntegrityService.countCompletedWithPointsInPeriodIncludingDeleted`へ委譲（`throughput.repository.ts`は再導入しない）。`/api/throughput`は`WORKSPACE_SCOPED_PATH_PREFIXES`対象で、現在ワークスペースに閉じる
- `Task.storyPoints`（`Int?` / DB `story_points`）と操作ログ用`FieldName.storyPoints`を持つ。葉への直接入力、親への合算再計算、親への直接入力拒否は tasks モジュールが担う
- `task-status-model`(実装完了)により、`completedAt`が非nullであることと完了種別の開発段階にあることは同値。本specの集計は`completedAt`基準のまま
- `Case.endDate`は nullable。未設定時は残期間数・必要期間数・余力を算出不可とし、消化ペース自体は表示する（requirements Requirement 7）
- `Case.isCompleted`は既定 false。完了済み案件は案件フィルタ・見通しのセレクタから除外する（requirements Requirement 4 / 7）
- `task-delivery-management` / `task-detail` 等の凍結 spec 文書は更新しない（コード拡張のみ）
- `module-boundary-cleanup`は実装完了。集計は`taskIntegrityService`、案件参照は`caseReadService`を使う

## Desired Outcome

- 葉タスク(子を持たないタスク、および親の子タスク)にストーリーポイント(工数見積もりの相対値、requirements確定時に1以上の整数の自由入力へ変更)で工数見積もりを設定できる。親タスクはポイントを直接設定できず、子の合算が自動的に付与される
- 消化数ダッシュボードで、件数ベースに加えてポイント合計ベースの消化ペースを確認でき、直近実績から今後の期間で消化できそうなポイント数の目安がわかる
- 既定は全体ペース。案件でフィルタして案件スコープのペースも確認できる
- `/api/throughput`を現在のワークスペースにスコープ化する(`workspace-resource-scope`からの申し送り事項。全体ペースも「現在ワークスペース内の全体」を意味するようにする)
- 期間ごとの推移がグラフで直感的に把握できる（discovery 時点では表のみだった）
- 案件を選んで、その案件の残タスク(未完了の件数・ポイント合計)と消化ペースを突き合わせ、「このペースで納期までに終わりそうか」「まだタスクを追加で積めそうか(余力)」の目安を確認できる

## Approach

既存の`backend/src/modules/throughput/`を拡張する(新規並行モジュールは作らない)。`Task.storyPoints`を追加し、消化数集計にポイント合計・案件フィルタ・案件別残タスク集計・グラフ向けデータを追加する。タスク行の集計は`taskIntegrityService`を拡張して行い、`throughput.repository.ts`は再導入しない。あわせて`/api/throughput`をワークスペーススコープ化する(Current State参照)。フロントエンドは表主体から推移グラフ主体の画面に作り直す。グラフは自作インラインSVG（design で確定）。

ストーリーポイント入力欄は、`task-detail`が実装済みのタスク作成フォームと詳細の`TaskFieldCard`、`kanban-ux-redesign`の編集モーダルに追加する。`task-detail`のrequirements/design文書は凍結として更新しないが、実装済みコンポーネントへの改修は本specのタスクとして扱う。

見通しの目安計算(要件で固定する前提):

- 必要期間数 ≈ ceil(残ポイント / 予測ポイント)
- 残期間数 ≈ 今日から`Case.endDate`までの日数を週7日・月30日で割った実数（切り捨てしない。過去なら0）
- 余力ポイント ≈ 予測ポイント × 残期間 − 残ポイント
- 進行中期間は既存どおり実績母数から除外する
- `Case.endDate`未設定の案件は見通し3項目を算出不可。`Case.isCompleted=true`の案件はセレクタから除外する

## Scope

- **In**:
  - `Task.storyPoints`の追加と、葉タスク向けのタスク作成・編集フォーム入力欄
  - 親タスクのストーリーポイントは子の合算を自動付与(親自身は入力不可)
  - `/api/throughput`のワークスペーススコープ化(`workspace-resource-scope`からの申し送り事項)
  - 期間ごとの完了タスク数・完了ポイント合計の集計とグラフ表示(推移)
  - 既定は全体ペース(現在ワークスペース内)。案件フィルタで案件スコープのペースも表示
  - 直近実績に基づく、今後の期間の完了タスク数・完了ポイントの目安(フォーキャスト)
  - 案件を選択して、その案件の残タスク(未完了の件数・ポイント合計)と消化ペースを突き合わせ、納期までに終わりそうか・追加で積めそうか(余力)の目安を表示する
- **Out**:
  - 見積もり工数の自動算出(手動設定のみ。親への子合算は集計ルールであり工数推定ではない)
  - 優先度別・担当者別の消化数内訳
  - 案件の必須タスク進捗表示そのものの変更(既存Requirement 3の表示ロジックは変更しない、参照のみ)
  - タスク status と開発段階の整理・再定義（`task-status-model`が完了済み。本specは変更しない）
  - 案件未紐づけタスク専用の見通しUI、ストーリーポイント未設定タスク専用の警告UI（未設定は集計上0として扱う。警告は出さない）
  - 分割ダイアログ・子追加 UI へのポイント欄
  - 認証・通知
  - `throughput.repository.ts`の再導入、`caseService.getById`の新設

## Boundary Candidates

- 見積もり入力(Taskスキーマ + フォーム): 葉タスクへのポイント設定と親への子合算表示。`task-detail`実装済みフォームへの追加改修を含む
- 消化数集計エンジン(バックエンド): ワークスペーススコープ化・期間集計・ポイント集計・案件フィルタ・案件別残タスク集計・フォーキャスト・余力計算
- ダッシュボード画面(フロントエンド): グラフ表示・全体/案件フィルタ・見通し表示

## Out of Boundary

- 見積もりの自動算出ロジック
- 案件の必須タスク判定・進捗算出ロジックの変更(既存のまま利用する)
- 優先度・担当者別の内訳表示
- タスク status / 開発段階の意味整理
- 案件未紐づけ・開発段階未設定向けの特別機能
- 認証・ワークスペース・通知機能そのもの（前提として利用するだけ）

## Upstream / Downstream

- Upstream
  - `task-delivery-management`で実装済みの`Task`/`Case`(案件)モデル、既存`throughput`モジュールの期間境界計算ロジック(週次UTC月曜始まり等)
  - `task-status-model`（`completedAt`⇔完了種別開発段階の不変条件を保証。`throughput`はこの上に乗るだけで概念追加はしない）
  - `workspace-resource-scope`（集計・見通しは現在ワークスペース配下に閉じる。`/api/throughput`の未スコープ化は本specへの明示的な申し送り事項）
  - `workspace-url-routing`（`throughput`ページは`pages/workspaces/[workspaceId]/throughput/`配下に移動済み。未選択空状態は削除済み）
  - `task-detail`（ポイント入力欄は実装済みフォームおよび`TaskFieldCard`への追加改修になる）
  - `module-boundary-cleanup`（集計は`taskIntegrityService`、案件参照は`caseReadService`。`task.closure`のモジュール外 import は禁止）
- Downstream
  - 特になし。将来的に優先度・担当者別内訳や工数の自動算出が必要になった場合は別specとして切り出す

## Existing Spec Touchpoints

- Extends（コードのみ、spec文書は凍結）
  - `task-delivery-management`が実装した`Task`モデル・`throughput`モジュール・案件(Case)モデルをベースに拡張する。`task-delivery-management`の`requirements.md`/`design.md`/`tasks.md`は更新しない
  - `task-detail`が実装したタスク作成/編集フォームにストーリーポイント入力欄を追加する。`task-detail`の仕様文書は更新しないが、実装済みUIコンポーネントには変更が入る
- Adjacent
  - `case-management-ux`（案件UI）、`kanban-ux-redesign`（カード表示パターン）、`task-detail`（詳細画面との入力導線）

## Constraints

- 既存スタックを踏襲: Nuxt 4 / Fastify 5 / Prisma / MySQL、Zodバリデーション、pinoログ
- グラフは自作インラインSVG。chart 系ライブラリは導入しない
- ストーリーポイント単位はフィボナッチ的相対値を想定していたが、requirements確定時に「1以上の整数の自由入力(フィボナッチ数列などへの強制はしない)」で確定した(このbrief記載時点からの変更点。requirements.md Requirement 1が正)
- ストーリーポイント未設定は許容する。集計では0として扱い、未設定向けの警告 UI は作らない
- 画面は表からグラフ主体へ作り直す。採用モックは`research.md`の「ビジュアルデザイン確定(claude design連携)」に記録済み
