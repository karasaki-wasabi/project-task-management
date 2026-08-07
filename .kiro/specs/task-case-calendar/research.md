# Gap Analysis: task-case-calendar

## 現状調査

### 再利用可能な資産
- **`frontend/components/shared/DatePicker.helpers.ts`**: 月グリッド生成ロジック(`DateCell`型: `date`/`inCurrentMonth`/`isToday`/`isSelected`/`dayOfWeek`)、`WEEKDAY_KANJI`定数、ローカルカレンダー日付の文字列変換(`formatLocalDateOnly`/`parseLocalDateOnly`、UTC変換を避ける明示的な理由あり)がすでに実装・単体テスト済み。カレンダー画面の月グリッド生成はこれを流用または`DatePicker`と共有可能な形に抽出することで新規実装を最小化できる。
- **`GET /api/tasks`**(`backend/src/modules/tasks/task.routes.ts`): `caseId`/`assigneeUserId`/`unassignedCase`のクエリフィルタを持つ。日付範囲フィルタはないが、既存の`/events`画面も全件取得後にクライアント側でフィルタ・マージしており、規模(小規模社内ツール)からして同じパターンで十分。
- **`GET /api/cases`**(`listCases()`): フィルタなしで全件取得。既存のダッシュボード・カンバン画面も同様に全件取得後クライアント側で絞り込み。
- **`AssigneeFilter.vue`**: 単一選択・デフォルト「すべて」のパターンが確立済み。Requirement 5はこれをそのまま流用できる。
- **`StatusBadge.vue`/`PriorityBadge.vue`**: タスクの状態・優先度の視覚的区別(Requirement 2.3/2.4)に転用可能。
- **`Modal.vue`**: タスク・案件の詳細確認(Requirement 6)への転用可能な既存モーダル基盤。カンバンの`TaskDetailModal.vue`パターンも参考になる。

### 削除・変更が必要な既存資産(非タスクイベント廃止に伴う)
- **`backend/src/modules/events/`**: `event.routes.ts`/`event.service.ts`/`event.repository.ts`/`event.types.ts`と対応するテストファイル一式。削除対象。
- **`backend/src/app.ts`**: `eventRoutes`のimport・`app.register(eventRoutes)`の登録。削除対象。
- **`backend/src/prisma/schema.prisma`**: `Event`モデル(120-135行目)、`Case.events`リレーション(68-84行目付近)。削除対象。マイグレーションは現状`20260805030211_init_domain_schema`の1件のみのため、リセット方針([[recurrence-simplification]]と同様)が低コストで実行できる。
- **`backend/src/modules/cases/case.repository.ts:37`**: 案件削除時に`tx.event.updateMany({ where: { caseId: id }, data: { caseId: null } })`でEventの`caseId`を解除している処理。Event削除に伴い、この行自体を削除する必要がある(**要設計判断**: 案件削除ロジックのトランザクション構成に影響しないか確認)。
- **`backend/src/shared/business-event-logging.integration.test.ts`**: `eventsService`(`modules/events/event.service.js`)をimportし、Event作成時のビジネスイベントログ(`findEvent("event.created")`等)を検証している可能性が高い。Event削除に伴い、このテストケースの削除または他ドメインへの置き換えが必要(**Research Needed**: 具体的にどのログ種別を検証しているか、design phaseで該当箇所を精査し、テストカバレッジの欠落を作らないようにする)。
- **`frontend/pages/events/index.vue`**: 削除対象。
- **`frontend/composables/useApiClient.ts`**: `AppEvent`インターフェース、`listEvents`/`createEvent`/`deleteEvent`メソッド。削除対象。
- **`frontend/pages/index.vue`**(ダッシュボード): 「直近のイベント」セクション(`upcomingEvents`関連の状態・テンプレート)。削除対象。
- **`frontend/app.vue:56`**: ナビゲーション項目`{ to: "/events", label: "タイムライン" }`。新しいカレンダー画面のパス・ラベルに置き換え。
- **`backend/src/app.routes.test.ts:61`**: `["/api/events", "GET"]`のルート登録確認。削除対象、カレンダー用の新規エンドポイントを追加する場合はそちらを追加。

### 規約・パターン
- ドメイン境界: `backend/src/modules/<domain>/`の4ファイル構成(`structure.md`)。新規カレンダー機能をバックエンドの新規モジュールとして持つか、既存の`tasks`/`cases`モジュールのクライアント側集約のみで完結させるかは設計判断(下記オプション参照)。
- フロントエンド: `frontend/pages/<domain>/index.vue`の1画面1ドメイン規約。
- 日付はローカルカレンダー日付文字列(`YYYY-MM-DD`)で統一(`DatePicker`の規約を踏襲)。

## 要件別の実現可能性

| Requirement | 必要な技術要素 | 既存資産で充足 | ギャップ |
|---|---|---|---|
| 1. 月表示グリッド | 月グリッド生成、本日強調 | `DatePicker.helpers.ts`のロジック(要抽出・共有化) | なし(抽出方法は設計判断) |
| 2. タスク期限日の点表示 | タスク一覧取得、状態/優先度バッジ | `listTasks()`、`StatusBadge`/`PriorityBadge` | 同日多数タスクの省略表示UIは新規実装(パターン先例: kanbanのチーム負荷サマリー「+N名」折りたたみ) |
| 3. 案件期間のバー表示 | 案件一覧取得、期間の日跨ぎ描画 | `listCases()` | 期間バーの描画(複数日にわたるセルまたぎのレイアウト)はこのプロジェクトに前例がなく新規実装。CSS Grid/絶対配置のいずれかで実現可能(Research Needed: 具体的な描画手法は設計時に検討) |
| 4. 月移動 | 状態管理のみ | `DatePicker`のクイック選択実装が参考になる | なし |
| 5. 担当者絞り込み | `AssigneeFilter`、`assigneeUserId`フィルタ | `AssigneeFilter.vue`、`listTasks({ assigneeUserId })` | なし |
| 6. タスク・案件の詳細確認 | モーダルまたは遷移 | `Modal.vue`、カンバンの`TaskDetailModal`パターン | 案件用の詳細確認手段(`case-management-ux`の`CaseDetailModal`が既存であれば流用可能性あり、要確認) |
| 7. 非タスクイベント機能の廃止 | 上記「削除が必要な既存資産」一覧 | - | `case.repository.ts`のEvent参照除去、`business-event-logging.integration.test.ts`の修正が主な削除以外の変更点 |
| 8. ダッシュボード整合 | セクション削除 | `frontend/pages/index.vue`の該当ブロック | なし |

## 実装アプローチの選択肢

### Option A: 既存パターンの拡張(推奨)
- カレンダー画面はバックエンドに新規モジュールを設けず、既存の`GET /api/tasks`・`GET /api/cases`をクライアント側で月単位に集約・描画する(現行`/events`画面の「クライアント側マージ」方針を踏襲)。
- `DatePicker.helpers.ts`の月グリッド生成ロジックを`frontend/utils/`または`shared/`配下の共有ヘルパーに抽出し、`DatePicker`本体とカレンダー画面の両方から参照する。
- **トレードオフ**: ✅ 新規バックエンドモジュール不要、開発が速い。✅ 既存の「小規模データを全件クライアント取得」という規模感に合致。❌ 将来タスク数が大幅に増えた場合、月ごとの絞り込みをサーバー側で行う必要が出てくる可能性(現状の運用規模: 担当者最大10名程度、1人あたり進行中タスク5件程度を踏まえると当面問題にならない見込み)。

### Option B: カレンダー専用バックエンドエンドポイントの新設
- `GET /api/calendar?month=YYYY-MM`のような集約エンドポイントを新設し、サーバー側でタスク期限日・案件期間を月範囲でフィルタして返す。
- **トレードオフ**: ✅ 将来のデータ量増加に強い。✅ クライアント側の集約ロジックが薄くなる。❌ 新規バックエンドコード(ルート・サービス)が増える。❌ 現状の運用規模では過剰投資になりやすく、`design.md`の「Simplification」判断(`/events`のクライアント側マージ採用時の判断)と矛盾する。

### Option C: ハイブリッド
- 初期実装はOption Aで進め、パフォーマンス上の懸念が実際に顕在化した場合にOption Bへ移行する。
- **トレードオフ**: ✅ 過剰実装を避けつつ将来の拡張余地を残す。❌ 移行のタイミング判断が別途必要。

**推奨**: Option A。既存の`/events`画面が同じ思想(クライアント側マージ)ですでに承認・実装されており、`product.md`が明記する運用規模(小規模チーム)にも合致する。

## Research Needed(設計フェーズへの持ち越し事項)
1. **案件期間バーの描画手法**: 複数日・複数週にまたがるバーをCSS Gridでどう表現するか(週をまたぐ場合の分割描画を含む)。このプロジェクトに前例がないため設計時に具体化が必要。
2. **`business-event-logging.integration.test.ts`の修正範囲**: Event作成に紐づくビジネスイベントログのテストケースが他に存在するか、削除で十分か置き換えが必要かを精査する。
3. **案件の詳細確認手段**: `case-management-ux`で実装済みの`CaseDetailModal`(存在する場合)がカレンダー画面からもそのまま呼び出せるか、独自の簡易表示で十分かを設計時に確認する。
4. **`case.repository.ts`の案件削除トランザクション**: Event関連行の削除がトランザクションの他の処理に影響しないか確認する。

## 工数・リスク評価

| 領域 | 工数目安 | リスク | 理由 |
|---|---|---|---|
| カレンダー画面(月グリッド・タスク点表示・案件バー・月移動・絞り込み・詳細確認) | M(3〜7日) | Medium | 既存パターン(DatePicker、AssigneeFilter、Modal)の組み合わせだが、案件期間バーの描画は新規パターン |
| 非タスクイベント機能の廃止(バックエンド・フロントエンド・DB) | S〜M(2〜4日) | Low〜Medium | 削除作業が主だが、`case.repository.ts`とビジネスイベントログテストへの副作用調査が必要 |
| `product.md`更新・ダッシュボード整合 | S(1日未満) | Low | 単純な記述・セクション削除 |

## 設計フェーズへの推奨事項
- **推奨アプローチ**: Option A(既存API・パターンの拡張、新規バックエンドモジュールなし)
- **主要な設計判断事項**:
  - `DatePicker.helpers.ts`の月グリッド生成ロジックの共有化方法(抽出先ディレクトリ、インターフェース)
  - 案件期間バーの具体的な描画レイアウト(週またぎの扱い)
  - タスク・案件詳細確認のUI形態(モーダル vs 既存画面への遷移)
  - Event削除に伴う`case.repository.ts`・ビジネスイベントログテストの具体的な修正内容

---

## Light Discovery 結果(`/kiro-spec-design`実行時、Extension分類)

### 1. 月グリッド生成: 抽出不要、直接import(Build vs Adopt → Adopt)
`frontend/components/shared/DatePicker.helpers.ts`は`generateMonthGrid(year, month, todayIso, selectedIso): DateCell[]`・`weekdayKanji`・`computeTodayIso`・`formatSlashDate`をすでに`export`しており、`DatePicker.vue`専用の内部関数ではない。抽出・共有化の作業は不要で、カレンダー画面から相対importするだけで済む(このリポジトリの規約はNuxtの自動importではなく明示的な相対importでヘルパーを読み込む方式、`kanban/index.helpers.ts`と同じパターン)。research.mdの当初懸念(「共有化方法の検討が必要」)は解消。

### 2. タスク・案件の詳細確認: 新規モーダル不要、既存コンポーネントをそのまま再利用(Build vs Adopt → Adopt)
- `frontend/components/kanban/TaskDetailModal.vue`: `defineProps<{ taskId: string | null; users: User[]; stages: DevelopmentStage[]; cases: Case[] }>()` — `taskId`を渡すだけで詳細を表示する設計。カレンダー画面でも同一Propsで再利用できる。
- `frontend/components/cases/CaseDetailModal.vue`: `defineProps<{ caseId: string | null }>()` — 同様に`caseId`を渡すだけ。
- したがってRequirement 6は新規コンポーネント不要、両モーダルをカレンダー画面から呼び出すのみで充足する。

### 3. 案件期間バーの描画(Simplification)
複数日にまたがる案件をピクセル単位の絶対配置バーとして重なり回避まで含めて描画するのは、Google Calendarのような多段スタッキングアルゴリズムが必要になり過剰実装(このアプリの運用規模は同時並行の案件数件程度、`product.md`)。**日単位セグメントチップ方式**を採用する: 月グリッドの各日セルの中に、その日に該当する案件の帯セグメントを描画し、範囲の開始日は左端を丸め、終了日は右端を丸め、中間日は角丸なしにすることで、セル境界をまたいでも視覚的に連続したバーに見せる。同日に複数案件が重なる場合は縦に積むだけとし、重なり回避の高度なレイアウトは行わない(Non-Goalとして明記)。

### 4. Event削除に伴うテスト影響範囲(確定)
- `backend/src/shared/business-event-logging.integration.test.ts`: `eventsService`のimportと`"logs event.deleted with the deleted event's id"`のテストケース(151-172行目付近)を削除。他の`findEvent(...)`呼び出しはビジネスイベントログ機構の共通ヘルパー名であり、Entityとしての`Event`とは無関係(誤って触らないよう注意)。
- `backend/src/modules/cases/case.repository.ts`: `delete()`内の`tx.event.updateMany(...)`行を削除。コメント(「Task/Event records」)も「Task records」に修正。
- `backend/src/modules/cases/case.repository.test.ts`: `"deletes a case and detaches (does not cascade-delete) linked Task/Event records (Requirement 8.1, 8.2)"`テストから`linkedEvent`/`survivingEvent`関連のセットアップ・アサーション・`hardDelete("events", ...)`を削除し、タイトルも「Task records」のみに修正。
- `backend/src/modules/cases/case.routes.test.ts`(151-163行目付近): 同様に案件削除のHTTPレベルテストから`linkedEvent`関連コードを削除。
- `backend/src/app.routes.test.ts`: `["/api/events", "GET"]`の行を削除。
- `case.service.test.ts`の`findEvent(event: string)`はビジネスイベントログ用ヘルパーの誤検出(Entityとは無関係)、変更不要。

### 5. 新規ページ配置
`structure.md`の「1画面1ドメイン」規約に従い、`frontend/pages/calendar/index.vue`として新設する(`frontend/pages/events/`は削除)。ロジックは`kanban/index.helpers.ts`・`cases/index.helpers.ts`と同じ「pure logicをcolocateされた`.helpers.ts`に分離し単体テストする」パターンを踏襲する。

---

## ビジュアルデザイン確定(claude design連携、機能実装完了後)

機能実装(task 1.1〜6.2)完了後、当初のrequirements.md/design.mdに明記していた「claude designで対話的に確定する」ステップが実装フェーズで抜け落ちていたことが判明し、事後的にビジュアルデザインの確定パスを実施した。

claude designプロジェクト「タスク管理カレンダー画面検討」(`カレンダー画面.dc.html`)を取り込み、以下を確定した(「2a」案を採用、その後さらに週7行固定ロジックへ改訂):

### 採用したレイアウト方針
- **案件バー**: 日セルごとに独立したセグメントではなく、週単位のレーン割り当て(区間スケジューリング、最大3レーン)で重なりを検出して詰め、絶対配置のオーバーレイ(`grid-column`のスパンで日付範囲を表現)として描画する。レーンに収まらない案件は週の右端に「他N件」チップとしてまとめ、クリックでその週の全案件を一覧表示するポップアップを開く。表示件数Nは最大9、それ以上は「他9+件」とし、チップ幅は「他9+件」が入るサイズを予約する
- **タスク省略表示**: 日セルの省略も案件と同じ「他N件」表記に統一する。Nは最大99、それ以上は「他99+件」とし、表示領域はその最長形が1行で収まる前提で確保する
- **週の高さの固定**: 案件のレーン数(0〜3、あふれチップ含む)とタスクの表示行数の合計を、どの週も常に7行に揃える(`bandRows = min(lanes.length + (dropped?1:0), 3)`、`maxTasks = 7 - bandRows`)。これにより週によってセルの高さがバラつかない
- **案件の配色**: 6色パレット(水色・藤色・空色・紫・薄い水色・スレート)を案件ごとに固定で割り当て、バーの塗り色・文字色に使う。完了済み案件はパレット色を使わずスレート+打ち消し線に統一
- **開始日/終了日未定の案件**: 設定されている方の日付からグラデーションでフェードし、「‹」「›」の矢印で「前/先に続く」ことを示す(点マーカーの代替表現)
- **タスク行**: 当初案(状態・優先度バッジ)から変更し、**タイトル+開発段階バッジ**のみを表示。期限超過(期限日が本日より前かつ未完了)のタスクは赤背景+赤枠+太字タイトルで強調する(requirements.md Requirement 2.3/2.4を改訂)
- **日セルの色分け**: 日曜・祝日は薄い赤背景+赤文字、土曜は薄い青背景+青文字、本日は黒丸の日付数字+薄い黄色背景。列幅は日曜・土曜のみ狭める(`0.72fr` vs 平日`1fr`)
- **「案件バー」表示切替**: 案件バーを一時的に隠す操作を追加(requirements.md Requirement 9として新規追加、初期状態は表示)。claude designのモックアップはボタン(背景色が変わる)だったが、レビュー時に修正指示があり、`CaseFormModal.vue`/`CaseDetailModal.vue`ですでに3箇所使われている既存のトグルスイッチパターン(`role="switch"`、`toggle-switch`/`toggle-knob`クラス、`bg-primary-600`/`bg-slate-300`、`translate-x-4`/`translate-x-0.5`)をそのまま流用する。ラベルは「案件バーを表示」とし、`この案件を完了にする`と同じ「ラベルテキスト+スイッチ」の並び方を踏襲する
- **個別タスク・案件クリック**: 新しいプレビューポップアップは作らず、既存の`TaskDetailModal`/`CaseDetailModal`をそのまま開く(タスク4.4の実装を維持)
- **「他N件」ポップアップ**(`詳細ポップアップ.dc.html`): 案件・タスク共通の一覧ポップアップコンポーネントを新規作成する。行タイトル+日付/期間を一覧表示し、行クリックで対応する既存の詳細モーダルを開く。案件の週次あふれ・タスクの日次あふれの両方で同じコンポーネントを使う

### 既存資産との整合
- 配色・角丸・枠線(`ring-1`、影なし)は`DESIGN.md`のルールと一致。日セルの背景色分け(土日・本日)は「badge-only色ルール」の例外として、期限超過の強調表示(`danger-bg`)と同じ精神で許容する
- side-stripeは使わない、青は「進行中」等の状態色専用というDESIGN.mdのDon'tは維持

### 設計上の変更点(design.md改訂が必要な箇所)
- `CalendarHelpers.buildCaseSegments`(日セル単位のposition算出)を、週単位のレーン割り当て関数に置き換える必要がある(研究1の「日単位セグメントチップ方式」の簡素化判断は撤回し、実際の重なり回避レイアウトを実装する)
- design.mdのNon-Goals「同日に複数の案件期間が重なった場合の重なり回避レイアウト(略)は行わない」は撤回する(claude designで重なり回避レイアウトが確定したため)
- 新規コンポーネント: 「他N件」一覧ポップアップ(タスク・案件共通)
