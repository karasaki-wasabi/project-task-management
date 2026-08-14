# Gap Analysis: velocity-dashboard

以下のギャップ表は design 前の調査記録。実装の正本は design.md / tasks.md。`module-boundary-cleanup` 完了後の前提は末尾「再整合」を参照する。

## 1. Requirement-to-Asset Map

| Requirement | 関連する既存アセット | ギャップ種別 | 内容 |
|---|---|---|---|
| R1 葉タスクへのストーリーポイント設定 | `backend/src/prisma/schema.prisma`(`Task`モデル)、`backend/src/modules/tasks/task.types.ts`(`CreateTaskInput`/`UpdateTaskInput`)、`task.routes.ts`(Zodスキーマ)、`task.service.ts` | Missing | `Task.storyPoints`列が存在しない。作成/更新の入力型・バリデーションも未対応 |
| R1 入力欄(UI) | 作成フォーム、`TaskDetailModal.vue`、詳細は`TaskFieldCard.vue`（`[taskId].vue`はカードを載せるだけ） | Missing | ストーリーポイント入力欄は3箇所。分割ダイアログには置かない |
| R2 親タスクの自動合算 | `task.service.ts`の`assertParentChangeIsValid`(祖先探索・サイクル検出)、`countIncompleteChildren`、`update`(`parentTaskId`変更経路)、`task.repository.ts` | Missing | 子構成変化(追加・削除・付け替え)や子のポイント変化を契機に親(および祖先)のストーリーポイントを再計算する処理が丸ごと未実装。再計算のトリガー箇所は「タスク作成(親付き)」「タスク更新(`parentTaskId`変更・`storyPoints`変更)」「タスク削除」の複数経路にまたがる |
| R3.1 `/api/throughput`のワークスペーススコープ化 | `backend/src/app.ts`(`WORKSPACE_SCOPED_PATH_PREFIXES`、`isWorkspaceScopedPath`)、`backend/src/workspace-scope.guard.ts`、`frontend/composables/useApiClient.ts`(`WORKSPACE_SCOPED_PATH_PREFIXES`の別定義、`isWorkspaceScopedPath`)、`backend/src/validation.integration.test.ts`・`app.routes.test.ts`(同種のprefixリストを個別に保持) | Missing / Constraint | 現状`/api/throughput`はどちらのリストにも含まれておらず、`requireWorkspaceMember`もヘッダー付与も行われない。**プレフィックスリストがバックエンド・フロントエンド・2つのテストファイルの計4箇所に重複定義**されており、追加時は全箇所の同期が必要(既存の設計判断であり本specで統合するかは design 判断) |
| R3.2-3.6 ポイント込み集計・葉タスクのみ計上・進行中期間除外 | `throughput.service.ts`、`taskIntegrityService.countCompletedInPeriodIncludingDeleted`（`throughput.repository.ts`は削除済み） | Missing / Reuse候補 | 現行は全WS横断の件数のみ（論理削除込み）。ポイント・WS・案件フィルタは integrity 側へ拡張する。進行中期間の除外は`buildPeriodBoundaries`を再利用 |
| R4 案件フィルタ | `listCases`、`Case.isCompleted` | Partial | 案件一覧は既存。完了済み除外は`CaseFilterSelect`が行う。`throughput`へ`caseId`を追加する |
| R5 推移グラフ | `frontend/package.json`(dependencies) | Missing | チャート系ライブラリは未導入。自作インラインSVGで確定 |
| R6 ポイントのフォーキャスト | `throughput.service.ts`の`FORECAST_WINDOW`/`MIN_PERIODS_FOR_FORECAST`/単純移動平均ロジック | Partial | 件数向けロジックは実装済みで、ポイント向けに同型のロジックを追加するだけで済む(パターン再利用) |
| R7 案件の見通し(残タスク・必要期間数・余力) | `taskIntegrityService.countRequiredForCaseProgress`（必須タスク専用、流用しない）、`caseReadService.findInWorkspace`、`throughput.service.ts`の期間境界 | Missing / Reuse候補 | 未完了件数・ポイントは integrity に新メソッド。残期間数は新規。`openTaskFilter`は tasks 内で使う |
| 全要件共通: `Case.isCompleted=true`除外、`endDate`未設定時の「算出不可」 | `Case`モデル(`isCompleted`, `endDate`は両方nullable/boolean) | Constraint | データモデル上は両方とも既存列で対応可能。UI側の「算出不可」表示は新規 |

## 2. Research Needed(設計フェーズへの持ち越し) — 解消済み

設計・タスク生成後、および`module-boundary-cleanup`完了後の再点検で以下はすべて確定した。未決として扱わない。

- 「未完了タスク」の定義: 中止(`cancelled`)は残タスクから除外する（`openTaskFilter`）
- プレフィックスリストの重複: 本specでは4箇所へ`/api/throughput`を足すだけ。共有定数化はしない
- チャート描画手段: 自作インラインSVG。ライブラリ非導入
- `storyPoints`の型: `Int?`。範囲は Zod の1以上の整数のみ。DB CHECK は足さない
- 3箇所の UI: 作成フォーム、`TaskDetailModal`、詳細は`TaskFieldCard`（`[taskId].vue`本体ではない）
- 集計の置き場: `throughput.repository`は再導入しない。`taskIntegrityService`を拡張する。`task.closure`は tasks 外へ出さない
- 案件参照: `caseReadService.findInWorkspace`。`caseService.getById`は新設しない
- 論理削除済みの完了: 件数・ポイントの両方に含める（現行件数と同じ）。ポイントの葉判定は論理削除込みの子が0件
- 完了件数は親を含む。ポイント合計だけ葉
- 残期間数は実数（切り捨てしない）。`0`は算出不可ではない。進捗バーは残期間`0`では割らない
- 分割ダイアログにポイント欄は置かない
- 未選択空状態は復活させない

## 3. Implementation Approach Options

### Option A: 既存モジュールを拡張(Extend)
- **対象ファイル**:
  - Backend: `schema.prisma`、`task.types.ts`/`task.routes.ts`/`task.service.ts`、`task-integrity.service.ts`、`throughput.{types,service,routes}.ts`、`app.ts`
  - Frontend: `useApiClient.ts`、`tasks/index.vue`・`TaskDetailModal.vue`・`TaskFieldCard.vue`、`pages/workspaces/[workspaceId]/throughput/index.vue`
- **互換性**: `throughput`の既存レスポンス形状(`ThroughputSummary`)を拡張するため、フィールド追加は後方互換(既存consumerは`throughput`ページのみで本spec内で同時に書き換えるため実質問題なし)
- **トレードオフ**: ✅ 既存パターン(Zod検証・`HttpError`・`withWorkspaceScope`・`task.closure.ts`のフィルタ群)をそのまま再利用できる。✅ brief/design.mdの「新規並行モジュールは作らない」方針に合致。❌ `task.service.ts`・`throughput.service.ts`双方に新しい責務(再計算・見通し計算)が積み増され、ファイルが肥大化する可能性(特に`task.service.ts`は既にサイクル検出・クローズ判定など複雑)

### Option B: 新規コンポーネントを作成(New)
- **対象**: ストーリーポイント再計算ロジックを`task.service.ts`から切り出した専用モジュール(例: `story-points`ドメイン)として新設し、`tasks`モジュールからはフックのように呼び出す
- **トレードオフ**: ✅ `task.service.ts`の肥大化を避けられる。✅ 再計算ロジックを単体テストしやすい。❌ `structure.md`の「1ドメイン1ディレクトリ」規約から外れた小粒モジュールが増える。❌ `tasks`↔新モジュール間の依存方向(どちらが呼ぶか)を新たに設計する必要があり、`task.service.ts`が担う「祖先を辿る」処理と責務が重複しやすい

### Option C: ハイブリッド
- ストーリーポイントの列追加・入力検証・親子整合(サイクル検出等の既存処理と密結合な部分)は`tasks`モジュール内で拡張(Option A)、消化数集計・案件フィルタ・見通し計算は`throughput`モジュール内で拡張(Option A)としつつ、両モジュールをまたぐ「葉タスク判定」(`childTasks: { none: {} }`)のようなクエリ条件だけを`task.closure.ts`と同じ並びの共有ヘルパー(例: `task.closure.ts`に`leafTaskFilter`を追加)として`tasks`モジュールの公開点に置き、`throughput`から利用する
- **トレードオフ**: ✅ 既存の`task.closure.ts`パターン(`completedTaskFilter`等)への自然な追加であり、モジュール分割の粒度を増やさない。✅ 「他モジュールのPrismaクエリへ直接アクセスしない」という`structure.md`の依存規約(`tasks`の公開型/フィルタとして提供すれば違反しない)を守れる。❌ 追加のシンボル(`leafTaskFilter`)を`tasks`モジュールの公開面に増やすため、設計時に「どこまでを`tasks`が公開してよいか」の線引きが必要

**推奨の方向性（module-boundary-cleanup 後に更新）**: 列追加と親子再計算は`tasks`、期間境界・フォーキャスト・見通しは`throughput`に置く。タスク行の集計クエリは Option C の「WhereInput を throughput が import」ではなく、`taskIntegrityService`の手続きとして tasks が所有する。`leafTaskFilter`は tasks 内専用。案件参照は`caseReadService`。

## 4. Implementation Complexity & Risk

| 対象 | Effort | Risk | 根拠 |
|---|---|---|---|
| `Task.storyPoints`列追加・入力検証(R1) | S | Low | 既存の`priority`等と同型の単純列追加+Zod検証。ただし[[prisma-migrations方針]]により単一initマイグレーションへの畳み込みと`prisma migrate reset`が必要(手順自体は確立済み) |
| 親タスク自動合算・多階層再帰反映(R2) | M | Medium | ロジック自体は単純だが、再計算のトリガー箇所(作成・`parentTaskId`変更・`storyPoints`変更・削除)が`task.service.ts`内の複数の既存経路に散らばっており、既存のサイクル検出・クローズ制約と整合させながら差し込む必要がある |
| ストーリーポイント入力欄(UI 3箇所) | M | Medium | ロジックは同じでも、3つの異なるUIパターン(フォーム/モーダル/インライン編集)への実装が必要で、想定より touchpoint が多い |
| `/api/throughput`ワークスペーススコープ化(R3.1) | S | Low | `withWorkspaceScope`パターンの適用のみ。ただしprefixリスト4箇所の同期漏れに注意 |
| ポイント込み集計・葉タスク限定(R3.2-3.6) | S〜M | Low | `taskIntegrityService`へのクエリ条件追加。既存の期間境界計算はそのまま再利用可能 |
| 案件フィルタ(R4) | S | Low | 既存`list`/`isCompleted`列を使うクエリ条件追加のみ |
| 推移グラフ(R5) | M〜L | Medium | チャートライブラリ選定・導入、またはSVG自作のいずれでも実装工数が発生。フロントエンドの新しい表現形式のため実装後のブラウザ確認(`run`スキル等)が要る |
| ポイントのフォーキャスト(R6) | S | Low | 既存の件数向けロジックと同型のロジックをもう1系統追加するだけ |
| 案件の見通し(R7) | M〜L | Medium | 「今日から`endDate`までの残期間数」計算が新規ロジックであり、期間種別(週/月)・進行中期間の扱いとの整合を新たに設計する必要がある。既存の必須タスク集計とは異なる「全未完了タスク」集計も新規 |

**全体感**: 個々の変更は既存パターンの延長で収まるものが多く、突出してリスクの高い箇所は無い(外部ライブラリ・外部API連携なし)。全体としては **M〜L** 相当(複数モジュール・複数UI touchpointにまたがる中規模機能追加)。

## 5. Recommendations for Design Phase

- **優先して決めること**: 「未完了タスク」の中止タスク扱い、プレフィックスリスト重複の統合可否、チャート描画手段の3点は設計初期に確定させると後工程の手戻りが減る
- **`tasks`モジュールの公開面の設計**: `throughput`が`tasks`の「葉タスク」概念に依存する形になるため、`task.closure.ts`スタイルの共有フィルタ(型のみで具体データアクセスは伴わない)としてどこまで公開するかをdesign.mdの`Boundary Commitments`で明文化する
- **UI touchpointの実装順**: 3箇所ある入力欄のうち、まず1箇所(例: タスク詳細ページのインライン編集)で挙動を固め、残り2箇所へパターン展開する進め方がタスク分割上扱いやすい
- **持ち越すべき既知の未決事項**: 中止タスクの扱い、`storyPoints`の実用上の上限有無、`endDate`ロジックの期間種別整合の3点をdesign.mdの「Boundary Commitments」または「Data Models」節で明示的に解消すること

---

## ビジュアルデザイン確定(claude design連携)

- プロジェクト: https://claude.ai/design/p/421ae5f1-ee17-41d5-ba0a-74841621de54?file=%E6%B6%88%E5%8C%96%E6%95%B0%E3%83%80%E3%83%83%E3%82%B7%E3%83%A5%E3%83%9C%E3%83%BC%E3%83%89+%E3%83%A2%E3%83%83%E3%82%AF.dc.html
- モックファイル名: `消化数ダッシュボード モック.dc.html`(2ラウンドで確定)
- 確定した内容
  - **推移グラフ**: 完了タスク数(件)と完了ストーリーポイント(pt)を、それぞれ単一軸で独立表示する上下2段の複合カード(モック内`1c`)を採用。期間ラベル(x軸)は下段のみに1回表示し、上下段を縦に整列。ホバーで上下段の同じ期間を同時ハイライトし、件数とptを突き合わせられるようにする。案件選択時・実績データ不足時も同一構成を適用する
    - **不採用**: 棒(件数・左軸)+折れ線(ポイント・右軸)のデュアル軸複合(`1a`/`1b`)。単位・スケールの異なる2指標を1つの軸に重ねると、スケールの取り方次第で実際には無い相関を見せてしまう(dataviz観点のアンチパターン)ため、2ラウンド目で不採用に変更した
  - **見通しパネル(R7)の数値表示**: 「必要期間数」は`ceil(残ポイント ÷ 今後の目安ポイント)`の**切り上げ整数**で表示する(例:「3 週」、補助テキストで計算式を明示)。案件終了日未設定時・予測データ不足時は該当項目を「算出不可」表示にし、算出可能な項目(未完了件数・ポイント、endDateがあれば残期間数)は表示を継続する。進捗バーの「消化率の目安」も切り上げ後の必要期間数を用いて計算する
  - **実績データ不足時の文言・閾値**: 既存実装の`MIN_PERIODS_FOR_FORECAST = 2`(`backend/src/modules/throughput/throughput.service.ts`)に合わせ、「実績データ不足のため、今後の目安は表示できません。2 期間以上の実績が集まると表示されます」という文言・閾値で統一する(2ラウンド目で「3期間以上」の誤記から修正)
  - **案件フィルタのUI**: 検索可能セレクト(案件名の部分一致で絞り込み、先頭固定の「全体(ワークスペース)」で選択解除)を採用。完了済み(isCompleted=true)案件は選択肢に出さない旨をセレクト内に明示する。ネイティブselect案(15件程度までしか実用的でない)は不採用
  - **ストーリーポイント入力欄(3箇所)**: 葉タスクは直接入力可能な数値入力(1以上の整数)、親タスクは「子の合計(自動計算)」バッジ付きの読み取り専用表示という2状態を、(a)タスク新規作成フォーム、(b)タスク編集モーダル、(c)タスク詳細の`TaskFieldCard`（既存の項目ピッカー方式を踏襲、親タスクの行はホバー時の下地・カーソル・ピッカーを一切出さずツールチップで理由を説明）の3箇所すべてに適用する
- 経緯: 第1ラウンドでdual-axisチャート(1b)が「採用推奨」だったが、レビューでdataviz観点のアンチパターンに該当すると判断し、第2ラウンドで1c(単一軸2段)ベースへ差し替え。あわせて必要期間数の丸め(切り上げ整数化)と実績データ不足の閾値文言(2期間以上)を実装済みロジックに合わせて修正し、確定した

---

## Design Synthesis(design.mdの前段判断)

### 1. Generalization
- 「葉タスク」判定を`task.closure.ts`に`leafTaskFilter`として追加するが、tasks モジュール内（`taskIntegrityService` / `taskRepository`）専用とする。throughput は WhereInput を import せず、integrity の手続きだけを呼ぶ
- ストーリーポイントの「直接入力値」と「導出値」を別カラム・別フラグにせず、「子を持つか」で動的に判定する1カラム設計に一般化した。子の追加・削除のたびにフラグの整合を取る必要がなくなる

### 2. Build vs. Adopt
- 推移グラフはインラインSVGの自作を採用し、chart系ライブラリ(Chart.js/ApexCharts等)は導入しない。理由: 要求されるグラフ表現(2段・単一軸・期間の縦整列・ホバー同期)は単純な形状で、`frontend/package.json`に新規依存を増やすコストに見合わない(既存の「グラフ描画ライブラリ未導入」制約とclaude designモックがSVGベースで確定していることとも整合する)
- 案件検索セレクトは既存`AssigneeFilter.vue`と同型のカスタム実装を採用(コンボボックス系ライブラリは導入しない)。既存パターンの再利用で十分

### 3. Simplification
- ストーリーポイントの範囲制約はDB制約(CHECK制約等)を追加せず、アプリケーション層(Zod)のみで課す。既存の`priority`等と同じ方針を踏襲し、DBスキーマを不必要に複雑化しない
- 「消化率の目安」(必要期間数/残期間数の比率)や見通しバッジの文言判定はAPIレスポンスに含めず、フロントエンドで表示時に導出する。バックエンドの`ThroughputSummary`は生データ(件数・ポイント・必要期間数・残期間数・余力ポイント)のみを返し、表示用の派生値・文言を持たない
- `/api/throughput`のワークスペーススコープ対象パスリストの4箇所重複(`app.ts`・`useApiClient.ts`・2テストファイル)は、本specでは統合(共有定数化)しない。既存のまま`/api/throughput`を4箇所に追加するだけに留める — 重複解消は本specのスコープ外の既存の設計判断であり、今回のためだけにリファクタリングしない

---

## /kiro-validate-design レビュー結果と対応

`/kiro-validate-design velocity-dashboard`で3件のCritical Issueを指摘し、design.mdへ反映済み(条件付きGO → 全件対応によりGO)。

1. **ストーリーポイント変更が操作ログ(タイムライン)に記録されない**: `FieldName` enum(`activity-log.types.ts`・`schema.prisma`)に`storyPoints`を追加し、`TasksService.update`の`recordFieldChanges`呼び出しに含めるよう修正。親タスクの自動再計算による更新は記録対象外のまま(利用者操作ではないため)
2. **`GET /api/throughput`のAPI契約が未記載**: `ThroughputRoutes(拡張)`に独立した詳細ブロック(API Contractテーブル + `ThroughputPeriod`/`CaseOutlook`/`ThroughputSummary`のTypeScript型定義)を追加
3. **`ThroughputService`が`cases`モジュールの`caseRepository`に直接依存**: 当時は`caseService.getById`新設で解消する方針だった。`module-boundary-cleanup`後は既存の`caseReadService.findInWorkspace`を使う（`caseService.getById`は新設しない）

---

## 全ドキュメント横断の整合性チェックと対応

タスク生成後、ユーザーの指示でbrief/requirements/design/research/tasksの全ドキュメントを再点検し、以下8件を修正した。

1. `caseId`が他ワークスペースに属する場合のエラーコードがdesign.md内で矛盾(Service Interface Preconditionsは`not_found`相当、API ContractとError Handlingは400) → 既存の`assertRelatedResourcesInWorkspace`規約に合わせ`validation_error`(400)に統一
2. `ThroughputRepository`の葉タスク限定ポイント集計の説明が自己矛盾(「全タスク対象、葉/親を問わない」と書きながら直後に「葉タスクのみ」と反転) → 件数は全タスク対象・ポイントは葉タスク限定、と明確に書き直し
3. ダッシュボードページ作り直しで、`workspace-resource-scope`実装済みの「ワークスペース未選択時の空状態」保護が明記されていなかった → design.mdのOut of Boundaryとtasks.mdタスク4.5に、この分岐を維持する旨を明記
4. design.mdのFile Structure Planが実在しない型`GetSummaryInput`を参照 → 実際のService Interface(位置引数)に合わせて`CaseOutlook`型新設の記述に訂正
5. brief.mdの制約記述(「ストーリーポイント単位はフィボナッチ的相対値」)がrequirements確定内容(自由入力の正整数)と矛盾したまま残っていた → requirements確定時の変更点として注記
6. `TaskDetailModal.vue`の帰属スペックの誤り(requirements.md/design.mdはタスク編集モーダルも`task-detail`実装済みとしていたが、実際は`kanban-ux-redesign` Requirement 8由来) → 両ドキュメントで`kanban-ux-redesign`を正しく併記
7. design.mdの`CaseService(拡張)`のReq Coverageが「7.1, 7.2」だったが、`getById`は7.2(endDate取得)にのみ関与し7.1とは無関係 → 「7.2」のみに訂正
8. tasks.mdタスク6.2に、他ワークスペースの`caseId`指定時のテストシナリオが明記されていなかった → タスク3.4・6.2の両方に追加

---

## module-boundary-cleanup 完了後の再整合（実装前）

`velocity-dashboard`の tasks 承認後に`module-boundary-cleanup`が完了し、次がコード上の前提になった。

- `throughput.repository.ts`は削除済み。完了件数は`taskIntegrityService.countCompletedInPeriodIncludingDeleted`
- `task.closure`のモジュール外 import は`module-boundary.guard.test.ts`が禁止
- 案件読み取りの正本は`caseReadService.findInWorkspace`。`tasks`の`caseRepository`直呼びは解消済み
- scoped 消化数ページから未選択空状態は削除済み

これに合わせて brief / requirements / design / tasks を更新した。design の旧 Option C（throughput が`leafTaskFilter`を import、`caseService.getById`新設、repository 拡張）は採用しない。
