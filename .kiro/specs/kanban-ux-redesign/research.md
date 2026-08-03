# Research & Design Decisions Template

## Summary
- **Feature**: `kanban-ux-redesign`
- **Discovery Scope**: Extension (既存フロントエンド機能の情報設計再構成、バックエンド変更なし)
- **Key Findings**:
  - `GET /api/tasks`は`deliveryId`/`assigneeUserId`のみでフィルタ可能で、開発段階未設定判定・検索・ソートに対応するクエリパラメータは存在しない。バックエンド変更をスコープ外とする本仕様の制約上、これらはすべてフロントエンドが一度取得した全タスク配列に対してクライアント側で計算する。
  - 既存の`frontend/pages/kanban/index.vue`は状態管理ライブラリを使わずページローカルな`ref`/`computed`のみで構成されている(design.md記載の方針)。今回の再設計もこのパターンを踏襲し、新規のcomposableやグローバルストアは導入しない。
  - 既存E2E(`frontend/e2e/kanban.spec.ts`)は開発段階マスタの登録フォームが`/kanban`ページ上にあることを前提にしている。Requirement 7でマスタ管理を別画面に移すため、このテストは新しいページへのナビゲーションを含む形に書き換えが必要。

## Research Log

### 担当者フィルタ・進捗集計に必要なデータの取得方法
- **Context**: 担当者フォーカス表示(Req 1)・チーム負荷サマリー(Req 2)・開発段階未設定タスクの一覧(Req 3)・子タスク進捗表示(Req 5.4)が、いずれもバックエンドの新規エンドポイントなしで実現できるか確認する必要があった。
- **Sources Consulted**: `backend/src/modules/tasks/task.routes.ts`, `backend/src/modules/tasks/task.types.ts`, `frontend/composables/useApiClient.ts`
- **Findings**:
  - `listTasks()`は`assigneeUserId`未指定なら全タスクを返す。ページは現状もこの全件取得を行い、`computed()`でクライアント側フィルタしている(`unassignedStageTasks`, `tasksForStage`)。
  - `Task`型に子タスクの完了数・全体数は含まれないが、`parentTaskId`により親子関係は取得済みの配列内から復元できる。
  - `listUsers()`・`listDevelopmentStages()`も同様に全件取得型で、追加のクエリパラメータは持たない。
- **Implications**: 担当者別集計・開発段階未設定判定・検索・ソート・子タスク進捗比率は、いずれも「全タスク配列に対するクライアント側の導出計算」として設計する。バックエンドAPI契約は変更しない。

### 開発段階マスタ管理UIの画面分離
- **Context**: ユーザーからのフィードバックにより、操作頻度の低い開発段階マスタ管理(追加・名称変更・並び替え・削除)をカンバン画面から独立した別画面に移すことになった(Requirement 7)。
- **Sources Consulted**: `frontend/pages/kanban/index.vue`(既存実装), `frontend/e2e/kanban.spec.ts`, `.kiro/steering/structure.md`(1画面=1ドメインの方針)
- **Findings**: 既存のマスタ管理UIとロジック(`loadStages`, `createStage`, `renameStage`, `moveStage`, `deleteStage`)は`/kanban`ページ内に閉じている。移動先ページとして、Nuxtのファイルベースルーティングの慣行(`pages/<domain>/index.vue`)に沿い、カンバンドメインのサブルートとして`pages/kanban/stages.vue`(`/kanban/stages`)を新設するのが既存の命名パターンと最も自然に整合する。
- **Implications**: 既存のマスタ管理テンプレート/ロジックはほぼそのまま新ページへ移設できる。`/kanban`ページ側には新ページへの導線(リンク)のみを残す。既存E2Eテストのマスタ登録手順を新ページへのナビゲーションに書き換える。

### 開発段階未設定タスクのドラッグ操作の継続
- **Context**: Requirement 3により「未割り当て」が常設列から折りたたみ+展開リストに変わるため、既存の「未割り当てプールからのドラッグで初回の開発段階を設定する」操作(Requirement 12.7、design.mdのKanbanView Sequence)が失われないか確認が必要だった。
- **Findings**: HTML5 Drag and Drop APIは`draggable`属性を持つ要素であればリスト行でもカードでも同様に動作する(既存実装も`<li draggable>`ベース)。展開後のリスト行に同じ`draggable`属性と`data-task-id`を持たせれば、開発段階別ボードへのドラッグは表示形式によらず継続できる。
- **Implications**: 展開後の開発段階未設定タスク一覧は「検索・ソート可能なリスト」であると同時に、行ごとに既存と同じドラッグソースとして機能させる。折りたたみ状態ではドラッグ元自体が存在しない(Requirement 3.2)ため、ドラッグするには先に展開する必要がある — この導線をUIヒントとして明示する。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| クライアント側導出計算(採用) | 全タスク/全ユーザーを取得し、フォーカス表示・負荷集計・検索/ソートをフロントエンドの`computed`で導出 | バックエンド変更不要、既存パターン(unassignedStageTasks等)の自然な拡張 | タスク総数が数百件規模まで増えると再計算コストが無視できなくなる可能性(現状は数十〜百件規模を想定) | 少人数チーム(product.md想定)の運用規模では十分 |
| バックエンドに集計/検索APIを新設 | `/api/tasks/summary`等を新設しサーバー側で集計・検索・ソート | 大規模データでも性能劣化しにくい | 本仕様の境界(バックエンドAPI変更なし)に反する | 採用しない。将来タスク件数が数千件規模になった場合の再検討候補としてのみ記録 |

## Design Decisions

### Decision: 担当者フォーカス表示と開発段階別ボードの絞り込みを単一の担当者セレクタで駆動する
- **Context**: Requirement 1(担当者フォーカス表示)とRequirement 4(開発段階別ボードの担当者絞り込み)がいずれも「担当者による絞り込み」を扱っており、UIコントロールを分けると、以前検討したStitchモックアップで発生した「チェックボックスが乱立し役割が曖昧になる」問題を再発させるリスクがある。
- **Alternatives Considered**:
  1. フォーカス表示用と絞り込み用に別々のセレクタ/チェックボックスを用意する
  2. 単一の担当者セレクタ(既存`AssigneeFilter.vue`と同じパターン)で両方を駆動する
- **Selected Approach**: 単一の担当者セレクタを採用する。「すべて」の場合はフォーカス領域を非表示にしボード全体を表示、特定の担当者を選択した場合はフォーカス領域にその担当者のタスクを表示しつつ、ボードもその担当者に絞り込む。
- **Rationale**: Stitchでの検討過程で、複数のトグルが役割の重複・曖昧さを生むことが繰り返し問題になった。単一のセレクタに統一することで、UIの状態数を減らし実装・テストの両面を単純化できる。
- **Trade-offs**: 「ボードは全員分を見ながらフォーカス領域だけ特定の1人に絞りたい」という利用シーンには対応できない。Requirement 1/4の記述上もこの分離は要求されていないため許容する。
- **Follow-up**: 実運用で「ボードは全員分のまま特定の人だけハイライトしたい」という要望が出た場合は、別途ハイライト機構を追加スペックとして検討する。

### Decision: 子タスク進捗はクライアント側で導出し、Task型やAPIは変更しない
- **Context**: Requirement 5.4は子タスクを持つタスクに完了数/全体数の進捗表示を求めるが、バックエンドAPI変更はスコープ外。
- **Alternatives Considered**:
  1. バックエンドに集計済みの進捗フィールドを追加する
  2. フロントエンドが取得済みの全タスク配列から`parentTaskId`を辿って都度算出する
- **Selected Approach**: 2を採用。ページ内で全タスク配列から「あるタスクIDを親に持つタスクの件数」と「その中でstatusが`done`の件数」を`computed`で導出する。
- **Rationale**: 本仕様の境界(バックエンド変更なし)を満たしつつ、既存の全件取得パターンで十分に実現可能。
- **Trade-offs**: タスク件数が非常に多い場合、親子関係の導出計算がO(n)スキャンになるが、想定運用規模(1チームあたり数十〜百件規模)では問題にならない。
- **Follow-up**: 将来的にタスク件数が大幅に増える場合、バックエンド側での集計提供を別スペックとして検討する。

## Risks & Mitigations
- 全タスク配列に対するクライアント側計算が、想定を超えるタスク件数(例: 数千件)で性能劣化する — 現在の想定運用規模(1チーム10名程度、未割り当て50件規模)では許容範囲。件数が大幅に増えた場合はバックエンド側集計への切り出しを別途検討する。
- 開発段階マスタ管理ページの分離により既存E2E(`frontend/e2e/kanban.spec.ts`)が壊れる — 実装タスクの中でテストのナビゲーション手順を新ページ対応に書き換える。
- 単一セレクタ方式(Design Decision参照)が「ボード全体を見ながら特定の人だけ確認したい」という需要を満たせない — Requirements上は許容されている前提だが、実装後のフィードバックで再検討の余地を残す。

## References
- 本セッション内のGoogle Stitchによる方向性比較検討(Personal Lens / Ownership Forward / Hybrid Overview / Focused Hybrid)の結論を踏まえた要件定義(`.kiro/specs/kanban-ux-redesign/requirements.md`)

---

# Gap Analysis (Retrospective, Post-Implementation)

> **前提の違いに関する注記**: 通常この文書はdesign phase着手前のbrownfield調査として書かれるが、本セクションは`kanban-ux-redesign`が実装・6回の`/impeccable critique`ラウンド・`/kiro-validate-impl`(GO判定)・requirements.md/design.mdの実装後改訂まで完了した**後**に、ユーザーからの明示的な依頼で追加実行したものである。したがって「実装方針の選択肢を提示する」という通常の目的ではなく、「現状のコードベースとrequirements.mdの間に残っているギャップを棚卸しする」ことを目的とする。

## Summary
- **Feature**: `kanban-ux-redesign`
- **Discovery Scope**: Retrospective(実装完了済み機能の現状棚卸し)
- **Key Findings**:
  - requirements.md(実装後改訂版)とコードベースの間に、機能面でのギャップは**現状ゼロ**。全7 Requirementが実装・E2E検証済みで、`/kiro-validate-impl`はGO判定済み。
  - ただし、プロジェクト共通のsteering文書(`tech.md`)が、本仕様で新規導入した`vue-draggable-plus`という主要な技術選定を反映していない(spec配下のdesign.mdには実装後改訂として記載済みだが、`.kiro/steering/tech.md`のKey Librariesには載っていない)。
  - 元のresearch.md(実装前)が「Follow-up」として記録していたリスク(「ボードは全員分のまま特定の人だけ確認したい、という要望が出た場合は別途検討する」)が、実際にround 3のユーザーフィードバックとして顕在化し、Requirement 4の改訂という形で解消済み — 予測が的中し、適切にクローズされたケースとして記録する。
  - 残っている「ギャップ」は、いずれも新規Requirementではなく、既存の6ラウンドにわたる`/impeccable`critiqueで意図的にP3判断(緊急度低)とされたUXの磨き残しと、スケール時の再検証トリガー(design.mdに既記載)のみ。

## Document Status
既存の`research.md`(実装前の調査記録)の末尾に、本セクションを追記する形で保存する。実装前セクションは削除・変更しない(意思決定の履歴として保持)。

## Next Steps
本機能に対して新たな実装作業は不要(`/kiro-validate-impl`済みでGO判定)。以下のいずれかが次の自然なアクションになりうる:
- 下記「Requirement-to-Asset Map」で✅以外の項目があれば、それぞれ個別の小規模タスクとして着手する(いずれも既存パターンの延長、Option A「既存拡張」に該当する見込み)
- 現状維持でよければ、このスペックはこのままクローズしてよい

---

## 1. Current State Investigation

### 既存実装の構成(現状)
- `frontend/pages/kanban/index.vue` — ページオーケストレーション。`definePageMeta({ fullWidth: true })`でアプリ共通の`max-w-6xl`制限から離脱(実装後の改訂、design.md参照)
- `frontend/pages/kanban/stages.vue` + `components/kanban/DevelopmentStageManager.vue` — 開発段階マスタ管理(Requirement 7)
- `frontend/components/kanban/{AssigneeFocusTray,TeamWorkloadSummary,UnassignedBacklogPanel,TaskCard}.vue` — design.mdのFile Structure Plan通り、各`.helpers.ts`/`.helpers.test.ts`を伴う(DOM test環境がないため、純粋ロジックを`.helpers.ts`に切り出してvitestでカバーする既存の全社的パターンを踏襲)
- `frontend/composables/{useDialogFocusTrap,useSameListMoveGuard}.ts` — design.mdのFile Structure Planには当初なかったが、`Frontend/kanban`の所有範囲内で自然に追加されたcomposable(境界違反ではない、`/kiro-validate-impl`で確認済み)
- `frontend/assets/css/main.css` — ドラッグ状態のCSSクラス(`task-card-chosen`等)。同様に当初計画外だが境界内
- `frontend/e2e/kanban*.spec.ts`(9ファイル) — 元の計画では3ファイル(`kanban.spec.ts`, `kanban-assignee-focus.spec.ts`相当, `kanban-backlog.spec.ts`相当)だったが、6ラウンドにわたるバグ修正の過程で全ドラッグ経路を洗い出し、6ファイル追加(`kanban-drag-cancel`, `kanban-tray-reject`, `kanban-picker-cancel`, `kanban-tray-cancel`, `kanban-tray-assign-and-move`, `kanban-action-menu-noop`)

### 依存関係
- `vue-draggable-plus`(Sortable.jsラッパー) — `package.json`には記載済みだが、**`.kiro/steering/tech.md`のKey Librariesには未記載**。design.mdには「実装後の改訂」として記載済み。steering文書は`/kiro-steering`で個別に更新が必要(本skillの対象外)。
- バックエンド(`backend/src/modules/tasks|development-stages|users`) — 本仕様期間中に変更なし(`git log`で確認済み、Out of Boundary遵守)。

## 2. Requirements Feasibility Analysis(現状ギャップ)

| Requirement | 実装状況 | 対応アセット | ギャップ分類 |
|---|---|---|---|
| 1. 担当者フォーカス表示 | ✅ 完了・E2E検証済み | `AssigneeFocusTray.vue`, `kanban-assignee-focus.spec.ts` | なし |
| 2. 担当者別の作業負荷サマリー | ✅ 完了・E2E検証済み | `TeamWorkloadSummary.vue`, 閾値ベースの`isOverloaded`(round 2改訂) | なし |
| 3. 開発段階未設定タスクの一覧管理 | ✅ 完了・E2E検証済み | `UnassignedBacklogPanel.vue`, `kanban-backlog.spec.ts` | なし |
| 4. 担当者フォーカスの選択操作(改訂版) | ✅ 完了・requirements.md改訂済み・E2E検証済み | `TeamWorkloadSummary.vue`のv-model, `kanban-assignee-focus.spec.ts` | なし(2026-08-03に文書を実装に合わせて改訂) |
| 5. タスクカードの状態・優先度・進捗表示 | ✅ 完了 | `TaskCard.vue`, `TaskCard.helpers.ts` | なし |
| 6. 既存カンバン操作の継続性 | ✅ 完了・E2E検証済み(9ファイル) | `onDropOnStage`/`confirmPendingMove`/`confirmActionMenu`、`useSameListMoveGuard.ts` | なし |
| 7. 開発段階マスタ管理画面の分離 | ✅ 完了 | `stages.vue`, `DevelopmentStageManager.vue` | なし |

**Non-functional(design.md Revalidation Triggers、未発火・監視継続)**:
- タスク総件数が想定運用規模(チーム10名程度、バックログ50件規模)を大幅に超えた場合 — クライアント側`computed`導出の前提が崩れる。**Unknown / Research Needed**(発生時に再検証)。
- 認証・現在ユーザー概念が別スペックで導入された場合 — Requirement 1の「担当者フォーカス」が自動判定の「自分」に置き換わる可能性。**Unknown / Research Needed**。
- Task/User/DevelopmentStageのAPI契約が変更された場合。**Constraint**(現状変更なし)。

**意図的に対応しなかった項目(P3、`/impeccable`第6ラウンドで確認済み)**:
- マウスユーザー向けに、キーボード操作メニューの存在を示す視覚的手がかりが薄い(`TaskCard`の"⋯"ヒントのコントラストが低い) — 緊急度低、ヘルプ機構自体がこの製品にないため据え置き。
- フォーカス欄からドラッグしてカラムへ向かい、フォーカス欄へ戻る際の**ドラッグ中のみ**発生する一瞬のハイライト残留(ドロップ後は確実に消える、round 6 Assessment Bが発見・報告した軽微な既知事項)。

## 3. Implementation Approach Options(今後もし手を入れる場合)

現状ギャップがないため、A/B/C比較は「もしRevalidation Triggersが発火した場合」を仮定した参考情報として記録する。

### Option A: 既存拡張(推奨)
スケール超過時、`computeWorkloadCounts`/`computeBacklogTasks`等(`pages/kanban/index.helpers.ts`)にページネーション/仮想スクロールを追加する形。既存の「全件取得+クライアント側computed」パターンを維持しつつ、表示側のみ最適化する。
- ✅ バックエンド契約を変えずに済む可能性がある(表示件数を絞るだけなら)
- ❌ 検索・ソート・集計自体の計算コストは解消しない(取得件数を絞らない限り)

### Option B: バックエンド集計API新設
`research.md`(実装前)で既に不採用と判断済み(本仕様のBoundary Commitments違反)。将来、認証導入等で境界そのものを見直すタイミングであれば再検討候補。

### Option C: ハイブリッド(段階的)
まずOption Aで表示側を最適化し、実際のボトルネックが集計計算側にあると判明した時点でOption Bを別スペックとして起票する。

**Effort/Risk(トリガー発火時)**: Effort M(既存`computed`ロジックの再設計)、Risk Low(既存パターンの延長、新規技術要素なし)。

## 4. Recommendations

- 現時点でこのスペックに対する追加実装は不要。`/kiro-validate-impl`のGO判定、`requirements.md`/`design.md`の実装後改訂により、仕様と実装は一致している。
- `.kiro/steering/tech.md`のKey Librariesに`vue-draggable-plus`を追記することを推奨する(`/kiro-steering`で実施、本スペックの範囲外)。
- Revalidation Triggers(スケール超過・認証導入・API契約変更)は監視を継続し、発火時にこのセクションのOption A/B/Cを起点に再度gap analysisを行う。
