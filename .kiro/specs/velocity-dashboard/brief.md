# Brief: velocity-dashboard

## Problem

タスク管理者(利用者本人)は、既存の「消化数ダッシュボード」(`task-delivery-management` Requirement 6, 実装済み)で期間ごとの完了タスク数と単純な件数フォーキャストは確認できるが、以下が把握できない。

- タスクの重さ(工数)を無視した件数ベースの数字しかないため、「軽いタスクを多くこなした週」と「重いタスクを少数こなした週」が同列に見え、実態のペースを見誤る
- 案件単位で「今のペースなら残りタスクが納期までに終わるか」「この案件にまだタスクを追加で積めるか(余力)」を判断する材料がない

## Current State

- `frontend/pages/workspaces/[workspaceId]/throughput/index.vue`(`workspace-url-routing`により旧`frontend/pages/throughput/index.vue`から移動済み): 期間開始/終了/完了数を並べる表のみ(グラフなし)。`workspace-resource-scope`によりワークスペース未選択時の空状態のみ追加済み
- `backend/src/modules/throughput/`: `Task.completedAt`を期間集計し、直近4期間の単純移動平均で次期件数を予測。**`/api/throughput`はワークスペーススコープ化されておらず、全ワークスペース横断で集計している**(`isWorkspaceScopedPath`の対象外、リポジトリにも`workspaceId`条件なし)。`workspace-resource-scope`は意図的にここを対象外とし、「選択済みでも集計は当面グローバルのまま残りうる点は`velocity-dashboard`で解消する」と本specへ明示的に申し送っている
- `task-status-model`(実装完了)により、`completedAt`の意味が形式化された:「`completedAt`が非nullであることと、タスクが完了種別の開発段階にあることは同値」という不変条件がDB制約と実装の両面で保証されている。同spec設計は「`throughput`は新しい概念に依存させない。同モジュールは`completedAt`のみを見る現在の実装を維持する」と明言しており、本specの集計方針(`completedAt`基準)はそのまま踏襲してよい
- `Task`モデルに見積もり工数フィールドは存在しない。`task-detail`(実装完了)の承認済み設計・モックは意図的にストーリーポイント入力欄を含んでいない(「ストーリーポイント入力欄は出さない」と明記)ため、本specでは既存の完成画面(タスク作成/編集フォーム)に新規入力欄を追加する形の変更になる
- `Case.endDate`は**nullable**。「余力ポイント」計算式(後述)は`Case.endDate`の存在を前提にしており、未設定時の扱いが未決定
- `Case.isCompleted`フラグが存在する(既定false)。完了済み案件を案件フィルタ・見通し表示の対象に含めるか未決定
- `task-delivery-management` specは実装完了(implementation-complete)として凍結されており、本specでは更新しない

## Desired Outcome

- 葉タスク(子を持たないタスク、および親の子タスク)にストーリーポイント(工数見積もりの相対値、requirements確定時に1以上の整数の自由入力へ変更)で工数見積もりを設定できる。親タスクはポイントを直接設定できず、子の合算が自動的に付与される
- 消化数ダッシュボードで、件数ベースに加えてポイント合計ベースの消化ペースを確認でき、直近実績から今後の期間で消化できそうなポイント数の目安がわかる
- 既定は全体ペース。案件でフィルタして案件スコープのペースも確認できる
- `/api/throughput`を現在のワークスペースにスコープ化する(`workspace-resource-scope`からの申し送り事項。全体ペースも「現在ワークスペース内の全体」を意味するようにする)
- 期間ごとの推移がグラフで直感的に把握できる(現状は表のみ)
- 案件を選んで、その案件の残タスク(未完了の件数・ポイント合計)と消化ペースを突き合わせ、「このペースで納期までに終わりそうか」「まだタスクを追加で積めそうか(余力)」の目安を確認できる

## Approach

既存の`backend/src/modules/throughput/`を拡張する(新規並行モジュールは作らない)。`Task.storyPoints`を追加し、消化数集計にポイント合計・案件フィルタ・案件別残タスク集計・グラフ向けデータを追加する。あわせて`/api/throughput`をワークスペーススコープ化する(Current State参照)。フロントエンドは表主体から推移グラフ主体の画面に作り直す。グラフ描画手段(ライブラリ導入 or 自作SVG)はdesignフェーズで判断する。

ストーリーポイント入力欄は、`task-detail`が実装済みのタスク作成/編集フォームに追加する形で導入する(意図的に空けられたプレースホルダーではなく、既存の完成画面への変更)。`task-detail`のrequirements/design文書は凍結として更新しないが、実装済みコンポーネントへの改修は本specのタスクとして扱う。

見通しの目安計算(要件で固定する前提):

- 必要期間数 ≈ ceil(残ポイント / 予測ポイント)
- 残期間数 ≈ 今日から`Case.endDate`までの週/月数(期間種別と揃える)
- 余力ポイント ≈ 予測ポイント × 残期間 − 残ポイント
- 進行中期間は既存どおり実績母数から除外する
- `Case.endDate`が未設定の案件、および`Case.isCompleted=true`の案件の扱いは要件確定時に決める(候補: 案件セレクタから除外、または見通し欄のみ「算出不可」表示にして消化ペース自体は表示する)

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
  - タスク status と開発段階の整理・再定義(必要なら本機能の前に別作業として扱う。本briefでは保留)
  - 案件未紐づけタスク専用の見通しUI、開発段階未設定専用の扱い(運用でストーリーポイントは実装・利用時に必ず付与されている前提とし、未設定向けの特別対応は作らない)
  - 認証・通知

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
  - `workspace-url-routing`（`throughput`ページは`pages/workspaces/[workspaceId]/throughput/`配下に移動済み）
  - `task-detail`（ポイント入力欄は実装済みフォームへの追加改修になる。設計時に既存レイアウトとの整合を取る）
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
- グラフ描画ライブラリは現状未導入(`frontend/package.json`にchart系依存なし)。導入するか自作SVGにするかはdesignフェーズで判断
- ストーリーポイント単位はフィボナッチ的相対値を想定していたが、requirements確定時に「1以上の整数の自由入力(フィボナッチ数列などへの強制はしない)」で確定した(このbrief記載時点からの変更点。requirements.md Requirement 1が正)
- 運用前提として、本機能を使うタスクにはストーリーポイントが付与されている。未設定向けの0計上・警告UIは作らない
- 画面は表からグラフ主体へ作り直すため、requirements確定後〜`/kiro-spec-design`前に`.kiro/steering/ui-design.md`のclaude designゲートを実施し、採用モックを`research.md`に記録してからdesignに進む
