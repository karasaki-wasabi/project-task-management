# Gap Analysis: module-boundary-cleanup

注意: ギャップ分析時点では要件未承認だった。その後ユーザーが要件を承認済み（`spec.json` 参照）。

## UIデザインゲート（claude design）の適用判断

- 判断: 本仕様は claude design ゲートを適用外とし、スキップする（ユーザー明示、2026-08-14）
- 根拠
  - `.kiro/steering/ui-design.md` の適用外: 「画面を持たないバックエンド・スキーマ・steering/spec文書のみの変更」
  - requirements / brief の Out of scope: フロントエンドの画面・ルーティング・コンポーネント変更なし
  - 対外 HTTP 契約も維持するため、見た目・情報設計の確定対象がない
- 設計フェーズへの制約
  - design.md に画面 UX・フロントコンポーネント構成を書き下ろさない
  - 後から画面変更がスコープに入った場合は本判断を再確認し、ゲートを適用する

---

## Design Synthesis (/kiro-spec-design)

### Summary
- Feature: module-boundary-cleanup
- Discovery Scope: Extension（既存バックエンドの境界修復）
- Key Findings:
  - `DbClient` 伝播パターンは既に実証済みで新規技術は不要
  - `tasks → caseService` 素朴置換は循環を生むため読み取り専用面が必須
  - 進捗・detach・throughput 集計・生成タスク列挙は tasks 公開 API に寄せると `task.closure` の漏洩も解消できる

### Generalization
- 「他モジュールの永続行を触る副作用」はすべて所有側（主に tasks／stages）の `client?: DbClient` 付き公開手続きに一般化する
- 案件の参照だけは write 面と分離した読み取り面に一般化する（循環回避）

### Build vs Adopt
- Adopt: 既存 `DbClient`、service オブジェクト公開、vitest、`structure.md` 規約
- Build: `caseReadService`、`taskIntegrityService`、`shared/date-only`、ファイル走査型の境界ガードテスト
- Reject: madge／ESLint import 禁止の必須導入（要件 7.4 および依存追加回避）

### Simplification
- `task-query` 全面分離はしない
- クロスモジュール向けのタスク行整合・集計は `tasksService` 拡張ではなく `taskIntegrityService` に分離（stages 循環回避）
- throughput 専用の所有例外文書化は採用せず、集計手続きを taskIntegrity に寄せる
- `task.closure` は `shared/` に移さず tasks 内に残し、他モジュールからの直 import のみ禁止

### Decision: caseReadService
- Context: R2 循環禁止と R1 公開 IF
- Alternatives: caseService に findById 追加 / 呼び出し元へ Case を渡すだけ / 読み取り面
- Selected: `case-read.service.ts`（repository のみ依存）
- Rationale: write 面の recurrence 依存から切り離せる
- Trade-offs: ファイル増。find／require の二系統が必要

### Decision: taskIntegrityService（validate-design Issue 1 対応）
- Context: `tasksService → developmentStagesService` と `developmentStagesService → tasksService.clear*` で閉路になる
- Alternatives: stages repository に task 更新を残す例外 / tasksService に全部載せる / 整合専用面
- Selected: `task-integrity.service.ts`（taskRepository + task.closure のみ。stages／cases／recurrence を import しない）
- Rationale: caseRead と同様に「狭い公開面」で循環を構造的に防ぐ。ユーザー承認（案1）
- Follow-up: stages は `tasksService` を import しない。ガードで検証

### Decision: 整合・集計の所有を taskIntegrity に
- Context: R4／R1、cases の task.closure import
- Selected: detach／clearStage／progress counts／period count／listGeneratedByAnchors を taskIntegrityService 公開
- Rationale: 完了判定述語と task 行更新を一箇所に閉じ、stages 循環も避ける
- Follow-up: detach／clear の where は現行どおり ID のみ（workspace 条件なし）。アンカー型は tasks 側ユニオンとし、`CaseRelativeAnchor` との集合一致をテストで固定する（recurrence 実行時依存を作らない）

### Decision: 境界ガードは自前 Vitest
- Context: R2.3／R7.2、madge 未導入
- Selected: `module-boundary.guard.test.ts` で repository 横断 import・service 閉路・task.closure 漏洩・stages→task.service 禁止を検査
- Rationale: 新規依存なしで CI に載せられる

### Risks & Mitigations
- delete オーケストレーション漏れ — 既存 routes/service テストを完了ゲートにする
- 集計意味の微差 — soft-delete バイパス条件を現行 throughput からコピーし同一テストで固定
- ガードの誤検知 — テストファイルと同一モジュール内 repository import を除外
- アンカー型の配置 — recurrence 実行時依存を避ける（tasks 側ユニオンまたは type-only）

---

## 1. Current State Investigation

### 既存資産・レイアウト

- `backend/src/modules/<domain>/` の feature-first（types / repository / service / routes）
- 対象ドメイン: tasks, cases, recurrence, holidays, development-stages, throughput, workspaces, comments, activity-logs, auth, users, client-errors
- 共有: `backend/src/shared/`（`db.ts`, `soft-delete.repository.ts` の `DbClient` / `SoftDeleteTx`, `workspace-scope.ts`, HttpError, logger 等）
- 規約: `structure.md` / `tech.md` が「他モジュールは service 公開 IF のみ」「routes → service → repository」を既定

### 正しいクロスモジュール依存（維持対象）

| 呼び出し側 | 依存先 service |
|---|---|
| tasks | developmentStagesService, workspaceService, activityLogService |
| cases | recurrenceService |
| recurrence | holidaysService, tasksService |
| comments | tasksService, activityLogService |
| workspaces | usersService |
| workspace-scope.guard | workspaceService.isMember |
| task.routes | commentService, activityLogService |

### 再利用可能なパターン

- `DbClient` 任意引数: `tasksService.create|delete(..., client)`, `recurrenceService.applyToCase|generateForAnchor(..., client)`, 多数の repository の `client: DbClient = db`
- `runActivityWrite` 系: グローバル `db` なら新規 TX、既存 client なら再利用
- `developmentStagesService.getById(id, workspaceId)` は存在するが `DbClient` 未対応
- `caseRepository.findById(..., client?)` は存在するが `caseService` に公開されていない

### テスト・検証の現状

- CI: migrate → vitest → build。循環依存検査（madge 等）は未導入
- 境界副作用は service / repository / routes テストで担保（案件削除 detach、進捗カウント、WS 初期段階、throughput の soft-delete 含む集計、recurrence の TX 経由 apply）

### 違反・グレーゾーンの実体

| # | 箇所 | 種別 | ギャップタグ |
|---|---|---|---|
| 1 | `tasks/task.service.ts` → `caseRepository.findById` | 他モジュール repository import | Missing（公開 IF） |
| 2 | `tasks/task.service.ts` → `client.developmentStage.findFirst` | 他ドメイン永続化直触り（TX 優先） | Missing（`getById` の client 対応） |
| 3 | `recurrence/recurrence.service.ts` → `holiday.repository` の `formatDateOnly`/`parseDateOnly` | repository からのヘルパー import | Missing（置き場移動） |
| 4 | `recurrence` → `client.task.findMany`（生成タスク列挙） | 他ドメイン永続化直触り | Missing（tasks 公開列挙） |
| 5 | `recurrence` → `client.case.findUnique`（applyToCase） | 他ドメイン永続化直触り | Missing（cases 参照公開＋循環回避） |
| 6 | `cases/case.repository` → `tx.task.updateMany`（削除時 detach） | 他ドメイン永続化直触り | Missing（tasks 公開 API または設計上の所有定義） |
| 7 | `cases/case.repository` → `db.task.count` + `task.closure` フィルタ（必須進捗） | 他ドメイン永続化＋ tasks 内部フィルタ import | Missing / Constraint |
| 8 | `development-stages` repository → `tx.task.updateMany`（段階削除時 null） | 他ドメイン永続化直触り | Missing |
| 9 | `throughput/throughput.repository` → `db.task.count` | 他ドメイン永続化直触り（意図的に soft-delete バイパス） | Missing / Constraint（所有の設計判断） |
| 10 | `workspaces/workspace.service` → `tx.developmentStage.createMany` | 他ドメイン永続化直触り（ブートストラップ） | Missing |

補足: `cases` → `tasks/task.closure.ts` は repository ではないが、タスク完了判定の Prisma where 断片を cases が直接 import している。Requirement 1 の解釈次第で「永続化実装の漏洩」か「共有述語」かが分かれる（Research Needed）。

## 2. Requirements Feasibility Analysis

| Requirement | 既存で満たせる部分 | ギャップ |
|---|---|---|
| R1 公開 IF 統一 | 正しい service 依存は既にある。パターンも揃っている | 上記 1–10 の解消。公開メソッド不足 |
| R2 循環禁止 | 現状 `cases→recurrence→tasks` で閉路なし | `tasks→caseService` 素朴置換で閉路発生。読み取り専用面が必要 |
| R3 書き込み一貫性 | `DbClient` 伝播が実証済み | delete 系が自前 `$transaction` のみで outer client 非対応 |
| R4 振る舞い維持 | 既存テストが仕様の観測点 | 実装移動時にテストの import／層を追随 |
| R5 対外契約 | ルート・クライアント契約は触らない方針と一致 | 変更しないことが制約（実装は内部のみ） |
| R6 日付ヘルパー | 実装は `holiday.repository` に同居 | `shared/` か holidays 公開への移動のみ |
| R7 検証・規約 | vitest／build あり。`structure.md` に文言あり | 完了検査手段の具体化（手動 Grep vs 軽いスクリプト）。循環検査は未整備。steering 追記は短い差分で可 |

### 複雑性シグナル

- 単純移動: 日付ヘルパー（S）
- パターン延長: `getById(..., client?)` 追加（S〜M）
- 設計判断が必要: 循環回避ファサード、進捗／throughput／detach の所有（M）
- 外部依存追加は不要（内部リファクタ）

### Research Needed（設計フェーズへ申し送り）

1. 循環回避の形: cases 読み取り専用モジュール／`caseQuery` ファサード／呼び出し元への検証結果渡し、のどれか
2. `task.closure` フィルタの置き場: `shared/` か tasks 公開 API か、cases 内に完了判定を閉じるか
3. throughput の `task.count`（soft-delete 含む）を tasks 公開集計にするか、read-model として throughput 所有を文書化するか
4. case／stage 削除の outer `DbClient` 参加を要件どおり必須にする範囲
5. 完了検証: 依存グラフ検査をテスト／script に入れるか、レビュー＋Grep で足りるか（要件は「検査した場合閉路なし」「直接参照が検出されない」）

## 3. Implementation Approach Options

### Option A: 既存 service／repository を延長（公開メソッド追加中心）

- 何を伸ばすか
  - `caseService` に `findById(..., client?)` 等
  - `developmentStagesService.getById` に `client?`
  - `tasksService` に detach／列挙／集計系
  - `developmentStagesService` にターミナル段階ブートストラップ
  - 日付ヘルパーを `shared/date-only.ts` 等へ移動
- 互換性
  - 対外 HTTP 非破壊。内部シグネチャ追加が主
- Trade-offs
  - 長所: 新規ファイル少、既存パターン踏襲、実装が速い
  - 短所: `tasks→caseService` で循環。cases／stages の service が肥大化しやすい

### Option B: 参照専用ファサード／クエリ面を新規作成

- 何を新設するか
  - 例: `cases/case-query.ts` または薄い `caseReadService`（findById + TX client のみ、write／recurrence 非依存）
  - 必要なら `tasks/task-query.ts`（列挙・count・detach）
  - 日付は `shared/` へ
- 統合点
  - write 系 service（`caseService`）は従来どおり recurrence 等に依存
  - tasks／recurrence は query 面のみ参照し閉路を断つ
- Trade-offs
  - 長所: R2 を構造的に満たしやすい。所有と読み取りを分離できる
  - 短所: ファイル増。query／write の責務境界を design で厳密に決める必要

### Option C: Hybrid（推奨候補として有力）

- 組み合わせ
  - 明確違反かつ循環リスク低: Option A（stages の `getById(client?)`、日付の `shared/` 移動、WS 初期段階の stages 公開 API）
  - 循環リスク高: Option B（cases 読み取り面、必要なら tasks の整合・集計公開面）
  - 所有論争あり（throughput／進捗 count）: design で「tasks 公開集計」か「所有例外の steering 明文化」を選ぶ
- 段階
  1. 日付移動 + stages TX 対応（低リスク）
  2. cases 読み取り面 + tasks の repository 直呼び解消
  3. recurrence の case／task 直触り解消
  4. detach／進捗／throughput／WS ブートストラップ
- Trade-offs
  - 長所: リスク分散、Approach A（厳格一掃）と両立
  - 短所: 計画とレビュー単位の調整が必要

## 4. Effort & Risk

- Effort: M（おおよそ 3〜7 日）
  - 違反は約 10 箇所相当だが、循環回避と所有定義の設計が支配的。大規模再編は不要
- Risk: Medium
  - TX 一貫性と循環依存が主な失敗モード。対外 API 非変更・既存テスト充実により回帰検知はしやすい。未知技術はなし

## 5. Design Phase への推奨（決定ではない）

- 優先して検討すべきアプローチ: Option C（Hybrid）
- 設計で先に決めること
  - cases 読み取り面の置き場と依存方向
  - detach／必須進捗／throughput／WS 初期段階の所有モジュールと公開シグネチャ
  - `task.closure` の扱い
  - 完了時の検査手段（Grep 手順か軽い依存グラフチェックか）
- steering
  - `structure.md` に「TX client 伝播」「循環を避ける読み取り面」を短く追記する案が R7 と整合

## Requirement-to-Asset Map（要約）

| 要件 | 主要資産 | Gap |
|---|---|---|
| R1 | 各 `*.service.ts` / repository | Missing: 公開 IF・直触り解消 |
| R2 | モジュール依存グラフ | Constraint: 素朴置換で閉路。Missing: 読み取り面 |
| R3 | `DbClient`, runActivityWrite, applyToCase | Constraint: delete の outer TX 非対応 |
| R4 | 既存 *.test.ts | Constraint: 移動に追随 |
| R5 | routes / useApiClient | Constraint: 変更禁止 |
| R6 | `holiday.repository` helpers | Missing: 移動先 |
| R7 | structure.md, CI vitest | Missing: 完了検査の具体手段 / 短い規約追記 |
