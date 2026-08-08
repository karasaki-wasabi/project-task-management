# Gap Analysis: recurrence-holidays-ux

調査日: 2026-08-07(初回) / 整合更新: 2026-08-07  
対象要件: `.kiro/specs/recurrence-holidays-ux/requirements.md` (approvals.requirements.approved=false — 未承認だが分析は実施)  
言語: ja  
正本: `requirements.md`。claude design 確定後に要件を拡張したため、下記ギャップ記述の一部は初回分析時点のまま残し、拡張分は「Requirement-to-Asset Map」と「ビジュアルデザイン確定」で上書きする。

## Analysis Summary

- 案件連動(`case_relative`)の登録・生成・停止・削除・メモ独立は実装済み(現行は終了日起点のみ)。案件作成/終了日変更との配線も健全。
- 固定間隔(`fixed_interval`)はスキーマ・API・サービス・UI・多数のテスト/E2Eに残存。Req 1 が削除面の最大ギャップ。
- 要件拡張分(起点4種・非負固定方向オフセット・月次生成・再開)は未実装。デザインモックの符号付きオフセットは不採用(requirements 正)。
- `/recurrence` にテンプレート管理と非営業日マスタが同居。`/holidays` ページとナビ項目は未存在(Req 5/7)。実装フェーズ前のため `app.vue` への先行追加は行わない。
- 繰り返し画面は旧 UI。claude design は確定済み(Req 6)。見た目の実装は未着手。
- `product.md` / ルート `PRODUCT.md` は「固定間隔/納品連動」のまま(Req 8)。
- 推奨: Hybrid — バックエンド縮小+起点拡張、フロント画面分離+UX、migrate reset。Effort: M〜L(起点/月次が追加)、Risk: Medium。

## Requirement-to-Asset Map

| Req | Existing assets | Gap tag | Notes |
|-----|-----------------|---------|-------|
| 1 固定間隔廃止 | `recurrence.*`, schema enums/cols, UI kind/generate-due, rrule, 多数テスト/E2E | Missing (削除作業) | 能力が残存していることがギャップ。全面除去が必要 |
| 2 案件連動テンプレ登録 | register/stop/delete/list、終了日オフセットのみ | Missing / Partial | 起点4種・非負固定方向・再開が不足。UI/API の縮退と拡張が必要 |
| 3 案件連動生成継続 | `case.service` ↔ `onCaseCreated`/`onCaseEndDateChanged` | Constraint / Partial | メモ独立等は充足。開始日起点・日付未設定時スキップは拡張が必要 |
| 4 各月初/月末の周期生成 | なし(終了日1点のみ) | Missing | 複数暦月の生成・期間変更時の追加/除外が新規 |
| 5 画面分離 | `pages/recurrence/index.vue` 同居のみ | Missing | `/holidays` ページ・ナビ項目が不在(未実装が正しい) |
| 6 繰り返し UX | 旧インラインフォーム、claude design 確定済み | Missing (実装) | デザイン確定済。実装のみ残る |
| 7 非営業日専用画面 | holidays API・同居UIの業務機能 | Missing (分離) / Constraint | 業務ロジックは維持。ページ分離と UX 調整のみ |
| 8 product.md | `.kiro/steering/product.md`, ルート `PRODUCT.md` | Missing | 「固定間隔/納品連動」表記のまま |

---

## A. Current Architecture

### Backend modules / routes / key functions

| Module | Path | Routes / entrypoints |
|--------|------|----------------------|
| recurrence | `backend/src/modules/recurrence/` | `POST/GET /api/recurring-templates`, `POST .../:id/stop`, `DELETE .../:id`, `POST .../generate-due` |
| holidays | `backend/src/modules/holidays/` | `POST/GET /api/holidays`, `DELETE /api/holidays/:id`, `POST /api/holidays/sync` |
| cases → recurrence | `backend/src/modules/cases/case.service.ts` | `create` → `onCaseCreated`; `update` endDate 変化 → `onCaseCreated`(null→値) / `onCaseEndDateChanged`(値変更) |
| app wiring | `backend/src/app.ts` | `holidayRoutes`, `recurrenceRoutes` 登録済み |

Key service functions (`recurrence.service.ts`):
- `registerTemplate` / `stopTemplate` / `deleteTemplate` / `list`
- `generateDueInstances` — `listActiveByKind("fixed_interval")` + `rrule` (`computeFixedIntervalOccurrences`)
- `onCaseCreated` / `onCaseEndDateChanged` — `listActiveByKind("case_relative")` + offset + `resolveScheduledDate`
- `resolveScheduledDate` → `holidaysService.isBusinessDay` / `nextBusinessDay` / `previousBusinessDay`

Holidays (`holiday.service.ts` / `holiday.external-api.ts`):
- 手動 register/remove/list、`syncFromExternalApi` → `https://holidays-jp.github.io/api/v1/date.json`
- 取得失敗時はマスタ未変更で 502、既存日付は skip

### Prisma models / enums

`backend/src/prisma/schema.prisma`:
- `enum RecurrenceKind { fixed_interval, case_relative }`
- `enum IntervalUnit { day, week, month }`
- `enum NonBusinessDayPolicy { as_is, skip, next_business_day, previous_business_day }`
- `enum NonBusinessDaySource { manual, external_api }`
- `model RecurringTaskTemplate` — `kind`, `intervalUnit?`, `intervalValue?`, `boundCaseId?`, `caseOffsetDays?`, `defaultMemo?`, `nonBusinessDayPolicy`, `isActive`, soft-delete
- `model NonBusinessDay` — `date`, `label?`, `source`, `dateActiveKey` (STORED GENERATED、migration SQL 手編集)

マイグレーションは単一: `backend/src/prisma/migrations/20260805030211_init_domain_schema/`

### Frontend

| Asset | Path | Notes |
|-------|------|-------|
| Combined page | `frontend/pages/recurrence/index.vue` | テンプレート + 非営業日 + 「今すぐ生成」同居。kind デフォルト `fixed_interval` |
| Holidays page | (なし) | `/holidays` 未作成 |
| Nav | `frontend/app.vue` | `{ to: "/recurrence", label: "繰り返し設定" }` のみ。非営業日ナビなし |
| API client | `frontend/composables/useApiClient.ts` | holidays CRUD/sync + recurrence CRUD + `generateDueInstances`。`RecurrenceKind` に両 kind |

### Tests / e2e depending on fixed_interval or combined page

- `backend/src/modules/recurrence/recurrence.service.test.ts` — fixed_interval 登録/generateDue/ポリシー多数 + case_relative スイート
- `backend/src/modules/recurrence/recurrence.routes.test.ts` — 多くが fixed_interval、`generate-due` 専用 describe
- `backend/src/validation.integration.test.ts` — generate-due + policy via fixed_interval
- `backend/src/shared/business-event-logging.integration.test.ts` — generateDueInstances(fixed_interval)
- `backend/src/prisma/schema.integration.test.ts` — fixed_interval fixture
- `frontend/e2e/calendar.spec.ts` — `/recurrence` で日次 fixed_interval 登録 → 「今すぐ生成」で `scheduledDate` 付きタスクを用意(コメント明記)

case_relative 配線テスト: `backend/src/modules/cases/case.service.test.ts` (create/update endDate 系)

---

## B. What ALREADY satisfies Requirements 1–8

| Req | Status | Evidence |
|-----|--------|----------|
| 1 固定間隔廃止 | 未充足 | 下記 C |
| 2 案件連動テンプレ登録 | 部分充足 | offset/policy/defaultMemo/stop/delete は終了日起点で存在。起点4種・再開・非負固定方向は未実装 |
| 3 案件連動生成継続 | 部分充足 | 終了日ベースの生成・再計算・メモ独立は存在。開始日対応・未設定スキップの明示は拡張が必要 |
| 4 各月初/月末周期生成 | 未充足 | 現行に該当ロジックなし |
| 5 画面分離 | 未充足 | 単一 `/recurrence`。ナビ未追加が正しい状態 |
| 6 繰り返し UX 刷新 | デザイン充足 / 実装未充足 | claude design 確定済み。コードは旧フォームのまま |
| 7 非営業日専用画面 | 部分充足 | 業務 API/現行 UI 機能は存在。専用ルート・ナビ・UX 調整なし |
| 8 product.md 整合 | 未充足 | 「固定間隔/納品連動」のまま |

---

## C. What is MISSING for Requirements 1–8

### Req 1 — 固定間隔廃止
- API: `kind: fixed_interval` 受付、`intervalUnit`/`intervalValue`、`POST .../generate-due`
- Service: `generateDueInstances` / `computeFixedIntervalOccurrences` / rrule 分岐
- Schema: `RecurrenceKind.fixed_interval`, `IntervalUnit`, `intervalUnit`/`intervalValue`(および実質未使用の `boundCaseId` も整理候補)
- UI: kind セレクト、間隔入力、「今すぐ生成」
- Client: `generateDueInstances`, `RecurrenceKind` 両値
- Tests/e2e: fixed_interval 依存を除去または case_relative/別経路へ置換

### Req 2 — 案件連動テンプレ登録
- 起点4種の選択・永続化
- オフセットを0以上の整数に限定し、方向を起点ごとに固定(デザインの符号付きオフセットは不採用)
- 停止中テンプレートの再開(停止期間の欠落は遡及生成しない)
- UI を case_relative 専用に縮退(kind 選択削除)

### Req 3 — 案件連動生成継続
- 開始日/終了日それぞれに対応する起点の生成・再計算
- 起点日付未設定時は生成しない
- 廃止・拡張作業で既存の memo 独立・インスタンス独立を壊さない回帰

### Req 4 — 各月初/月末の周期生成
- 案件期間に含まれる暦月ごとのインスタンス生成
- 期間変更時の追加生成と期間外未完了インスタンスの除外
- 期間の片側未設定時は生成しない

### Req 5 — 画面分離 + ナビ
- `frontend/pages/holidays/index.vue`(仮)新設、`recurrence/index.vue` から休日セクション除去
- `app.vue` `navLinks` に「休日マスタ」を追加(実装フェーズで行う。先行実装しない)

### Req 6 — UX 刷新
- claude design 確定版を実装: `bg-primary-*`, ヘッダー+CTA、`ErrorAlert`、作成/詳細 Modal、一覧テーブル chrome
- 登録モーダルの起点 select は4択(モックは2択のまま。option追加のみ)

### Req 7 — 非営業日専用画面
- ページ分離 + 軽い UX polish(機能は register/delete/sync 維持)
- ナビ到達

### Req 8 — ドキュメント
- `.kiro/steering/product.md` Core Capabilities 更新(案件連動のみ、「納品連動」除去)
- ルート `PRODUCT.md` も同趣旨の旧称あり(steering 同期時に整合を検討)
- `tech.md` の rrule 記載も依存削除後に更新候補(Req 8 厳密スコープ外だが隣接)

---

## D. Integration points / risks

1. cases → recurrence
   - `case.service.ts` が唯一の生成トリガー(endDate 必須)。破壊厳禁。
2. rrule
   - `recurrence.service.ts` のみ。fixed_interval 削除で `backend/package.json` から除去可能。`tech.md` 追随。
3. migrate reset 先例
   - `task-case-calendar`: 単一 init migration を整理+`prisma migrate reset`。シャドウ DB 権限問題で `migrate diff --from-empty` + reset 運用、`date_active_key` 手編集必須(`tasks.md` Implementation Notes)。
   - brief も同方針。本番データなし前提。
4. e2e `calendar.spec.ts`
   - scheduledDate 付きタスクの正規 UI 経路が fixed_interval generate-due。廃止後は代替が必要(例: case_relative+案件作成、またはテスト専用セットアップ方針の設計判断)。
5. アクティブテンプレ汚染
   - テストコメント通り、残存 active テンプレが generateDue を汚染しタイムアウトした実績。廃止で経路消滅するが、cleanup 規律は case_relative でも重要。
6. 非営業日ポリシーテスト
   - 現状多くが fixed_interval+generateDue 経由。case_relative+休日日付けで再検証する必要。

---

## E. Reusable UX patterns (case-management / kanban)

| Pattern | Source | Reuse for |
|---------|--------|-----------|
| Page header + primary CTA | `frontend/pages/cases/index.vue` | テンプレ登録ボタン / 休日登録 |
| `ErrorAlert` | shared + cases/kanban | 両新画面 |
| `Modal` shell | `frontend/components/shared/Modal.vue` | 登録フォームをモーダル化する場合 |
| Domain Form/Detail modals | `CaseFormModal.vue`, `TaskDetailModal.vue` | テンプレ作成モーダルの構造参考 |
| `Badge` status pills | shared / cases | 有効/停止中 |
| `ring-1 ring-slate-200` white panels | cases/kanban | 一覧テーブル |
| `bg-primary-600` (not `bg-blue-600`) | cases/kanban | recurrence は現状 blue 直書き → 要置換 |
| Nav link list | `frontend/app.vue` | 休日リンク追加 |
| helpers + unit tests colocation | `cases/index.helpers.ts` | フィルタ等を切り出すなら同様 |

claude design は本スペック制約(Google Stitch 不使用)。ビジュアルは確定済み([[ui-design]])。実装フェーズ前のソース変更は行わない。

---

## F. External dependencies

### rrule
- 使用箇所: `recurrence.service.ts` の fixed_interval のみ(confirmed)。
- case_relative は日付加算のみで未使用。
- 廃止後: 依存削除 + tech.md 更新が自然。

### Holidays sync API
- URL: Holidays JP `api/v1/date.json`(認証なし)
- 制約: 手動トリガーのみ(自動ポーリング out of scope); 障害時 502・マスタ不変; 既存日付 skip
- 本スペックで API 契約変更は不要。UI 移設のみ。

---

## G. File path inventory (likely to change)

### Backend (remove/shrink fixed_interval)
- `backend/src/prisma/schema.prisma`
- `backend/src/prisma/migrations/20260805030211_init_domain_schema/migration.sql` (+ reset)
- `backend/src/modules/recurrence/recurrence.types.ts`
- `backend/src/modules/recurrence/recurrence.repository.ts`
- `backend/src/modules/recurrence/recurrence.service.ts`
- `backend/src/modules/recurrence/recurrence.routes.ts`
- `backend/src/modules/recurrence/recurrence.service.test.ts`
- `backend/src/modules/recurrence/recurrence.routes.test.ts`
- `backend/src/validation.integration.test.ts`
- `backend/src/shared/business-event-logging.integration.test.ts`
- `backend/src/prisma/schema.integration.test.ts`
- `backend/package.json` / `package-lock.json` (rrule 削除)

### Backend (preserve behavior — touch carefully)
- `backend/src/modules/cases/case.service.ts` (+ `.test.ts`)
- `backend/src/modules/holidays/*` (業務ロジックは維持、変更最小)

### Frontend
- `frontend/pages/recurrence/index.vue` (分離・UX)
- `frontend/pages/holidays/index.vue` (新規)
- `frontend/app.vue` (nav)
- `frontend/composables/useApiClient.ts`
- 任意: `frontend/components/recurrence/*`, `frontend/components/holidays/*` (Modal 化する場合)
- `frontend/e2e/calendar.spec.ts` (generate-due 依存の置換)

### Docs / steering
- `.kiro/steering/product.md` (Req 7)
- `.kiro/steering/tech.md` (rrule 記載、隣接)
- `PRODUCT.md` (ルート概要の旧称)

### Do not edit (project convention)
- `.kiro/specs/task-delivery-management/*` 等の過去 spec

---

## Implementation approach options

### Option A: Extend existing
- `/recurrence` を編集して休日セクション削除、kind UI 削除、API を縮小。
- Trade-off: 速いが画面責務・ファイル肥大は残りやすい。休日ページは結局新規が必要。

### Option B: New components only
- 休日ページ・Modal 群を新規、旧ページ大幅置換。バックエンドも新モジュールは不要。
- Trade-off: UI 分離はきれい。スキーマ/API 削除は別途必須。

### Option C: Hybrid (推奨)
- Backend: 既存 recurrence/holidays モジュールを縮小(fixed_interval・generate-due・rrule 削除)しつつ、起点4種・非負固定方向オフセット・月次生成・再開を拡張。
- Schema: migrate reset で interval 列/enum 整理、起点種別フィールド追加。
- Frontend: `/recurrence` 刷新 + `/holidays` 新設 + nav。claude design 確定版に Modal/primary 適用。
- Tests: fixed_interval 系削除、ポリシー/メモ独立・月次・再開は case_relative 経路で検証。calendar e2e は代替データ経路を設計で確定。

Effort: M〜L — 削除面に加え起点/月次/再開の新規ロジックがある。  
Risk: Medium — calendar e2e と generate-due 依存テスト、migration reset 手編集(`date_active_key`)、月次再計算の境界。

---

## Research Needed (design phase)

1. `RecurrenceKind` / `kind` カラムを削除して case_relative 専用モデルにするか、列を残して値を固定するか。
2. `boundCaseId` / `IntervalUnit` をスキーマから同時削除するか(UI 未露出、fixed_interval 専用ルール)。
3. calendar e2e の `scheduledDate` シード代替(案件+case_relative vs API/DB セットアップ例外)。
4. `POST /api/recurring-templates/generate-due` を完全削除するか、空応答互換を残すか(破壊的変更の許容)。
5. ~~claude design: 繰り返し画面の情報設計(インライン vs Modal、一覧列、停止/削除確認)。~~ → 確定。「ビジュアルデザイン確定(claude design連携)」参照。
6. ~~ナビラベル文言と並び順。~~ → 確定。「休日マスタ」を既存ナビ末尾(「ユーザー」の右隣)に置く。実装は `/kiro-impl` で行う(`app.vue` は未変更が正しい)。

新たに追加(Requirement 2/4 拡張に伴う設計判断):

7. 起点「案件期間内の各月初/各月末」の周期生成をどう実装するか — 案件作成/期間変更時に複数インスタンスをどう生成・再計算するか(既存の「未完了インスタンス1件を再計算」ロジックからの拡張が必要)。
8. テンプレート再開(`resume`)APIの設計 — `isActive`の単純反転で足りるか、停止期間中にスキップされた生成対象の扱いをどう保証するか(requirements は遡及生成しない)。
9. 起点種別の永続化表現(enum カラム名など)と、オフセット非負+固定方向のバリデーション配置。

---

## ビジュアルデザイン確定(claude design連携)

**識別情報**: Claude Designプロジェクト「繰り返し設定と休日マスタの統合」(`claude.ai/design/p/393e75bf-c398-4b2e-9f7e-2919a82caea9`, ファイル`繰り返し設定・休日マスタ.dc.html`)。MCPでファイルを再読込し内容を確認済み。

**採用したレイアウト・主要コントロール**(モックの見た目):
- 繰り返し設定画面: ページヘッダー+primary CTA「テンプレートを登録」、一覧テーブル(名前/オフセット/非営業日の扱い/状態)、行クリックで詳細モーダルへ。種別列は廃止(案件連動固定のため)。
- 登録は作成専用モーダル(`CaseFormModal`踏襲)。テンプレート名/優先度/起点/オフセット日数/非営業日の扱い/既定メモ。
- 詳細は閲覧+停止/再開トグル+削除のみのモーダル(`CaseDetailModal`踏襲)。状態はトグルスイッチ+状態バッジの併記。削除はモーダル内インライン確認ステップ(「本当に削除しますか?」)、`window.confirm`不使用。
- 休日マスタ画面: `users/index.vue`踏襲のインラインフォーム+テーブル(日付/ラベル/取得元バッジ/削除)。モーダル不使用。
- ナビゲーション: 既存項目末尾(「ユーザー」の右隣)に「休日マスタ」を置く(実装は未着手)。

**不採用案**:
- 繰り返し設定・休日マスタ画面の同居(画面責務混在のため分離を採用)。
- デザインモックの符号付きオフセット(負数で逆方向)。わかりにくいため削除してよい、と確定。requirements の非負整数+起点ごとの固定方向を正とする。期間外生成は Out of scope。

**デザイン確定後に requirements へ追加した差分**(見た目の大きな変更ではないためモック未更新):
- 起点をモックの2択(案件開始日/案件終了日)から4択へ拡張(各月初/各月末を追加)。実装時は同一`<select>`への option 追加で足りる。
- 停止/再開はモックのトグル見た目のまま。バックエンドで再開を実装し、停止期間中の欠落は遡及生成しない(Req 2.7)。
- 将来、月初/月末起点に固有の追加UI(複数インスタンスのプレビュー表示など)が必要になった場合は、その時点で改めてclaude designでの確認が必要([[ui-design]])。

**プロセス上の注意**:
- 仕様フェーズで `frontend/app.vue` にナビを先行追加した記述が一時混入したが、実装前のため差し戻し済み。ナビ追加は実装タスクで行う。

---

## Document Status

- Framework: `.claude/skills/kiro-validate-gap/rules/gap-analysis.md`
- Method: codebase grep/read of recurrence, holidays, cases, frontend pages/nav/client, tests/e2e, steering, task-case-calendar migration precedent。claude design MCPでモック再読込し requirements と突合。
- External research: Holidays JP URL confirmed in-repo; rrule usage scoped in-repo (no web fetch required)
- 正本: `requirements.md`(デザイン後の機能追加を含む)。`brief.md` も同内容に同期済み。

## Next Steps

1. 要件を承認する
2. `/kiro-spec-design recurrence-holidays-ux` で設計書作成(上記 Research Needed および下記追記の意思決定)
3. または `/kiro-spec-design recurrence-holidays-ux -y` で要件承認+設計へ直行

---

# 追記ギャップ分析: 起点オフセット拡張 + テンプレート再開 (2026-08-07T14:30:12Z)

調査動機: claude design 確定後に requirements へ追加された (1) 起点4種と非負固定方向オフセット (2) 停止→再開 について、コードベースを再調査した。要件は未承認だが分析は実施。

## Analysis Summary

- 現行の案件連動は「終了日 − caseOffsetDays」のみ。`caseOffsetDays ≥ 0` バリデーションは既にあり、非負整数という点は新規要件と一致する。
- 起点種別フィールド・開始日起点・各月初/月末の周期生成・開始日変更トリガーはすべて Missing。
- 停止は `POST /api/recurring-templates/:id/stop` + repository `isActive=false` まで実装済み。再開用の service / route / API client / UI 操作は存在しない(Missing)。
- 再開の「停止期間中を遡及しない」は、現行がイベント駆動生成であることから、再開時に既存案件を走査しない(= `isActive=true` に戻すだけ)で要件を満たせる見込み。設計で明文化が必要。
- `findIncompleteInstance` はテンプレート×案件で未完了1件前提。月次(複数暦月)ではモデル前提が崩れるため、再計算ロジックの再設計が必要(High complexity signal)。

## 1. 起点オフセット — Current State

### データモデル
- `RecurringTaskTemplate`: `caseOffsetDays Int?` のみ。起点種別(開始日/終了日/各月初/各月末)を表すカラム・enum はない。
- 計算はサービス内で終了日固定: `addDays(formatDateOnly(endDate), -(caseOffsetDays ?? 0))`(`recurrence.service.ts`)。

### バリデーション(既に非負)
- `validateRegisterInput`: `caseOffsetDays` は整数かつ `< 0` なら 400。テスト `rejects a negative caseOffsetDays` あり。
- 新規要件の「0以上の整数 + 起点ごとの固定方向」のうち、非負制約は現状のまま流用可能。符号付きオフセットは現行にも無く、デザインモックの負数入力とは元々不一致だった。

### 生成トリガー(`case.service.ts`)
- create: `endDate !== null` のときのみ `onCaseCreated`。
- update: `endDate` 入力があるときのみ分岐(null→値で `onCaseCreated`、値変更で `onCaseEndDateChanged`)。
- `startDate` の設定・変更では recurrence を呼ばない。

### 再計算前提
- `findIncompleteInstance(templateId, caseId)`: `status !== done` の Task を1件。終了日起点の「1テンプレ1案件1インスタンス」向け。
- 月次では同一テンプレ×案件に複数 `scheduledDate` のインスタンスが立つ想定のため、この API だけでは Req 4.4(期間変更時の追加/除外)を表現できない。

## 2. 起点オフセット — Gaps (Req 2.1–2.3, 3, 4)

| 必要能力 | 現状 | Gap tag |
|----------|------|---------|
| 起点4種の登録・永続化 | フィールドなし。常に終了日扱い | Missing |
| 開始日+オフセット(後方向) | 計算・トリガーなし | Missing |
| 終了日+オフセット(前方向) | 実装済み(`− caseOffsetDays`) | 充足(方向固定の明示は設計で整理) |
| 各月初/月末 + 期間内暦月ループ | なし | Missing |
| 期間外スキップ(Req 4.3) | なし(終了日起点は期間外概念なし) | Missing |
| 開始日/終了日未設定時は当該起点を生成しない(Req 3.3, 4.2) | 終了日 null 時スキップのみ。開始日起点なし | Partial / Missing |
| startDate 変更時の再計算/初回生成 | 未配線 | Missing |
| 月次の期間変更時追加・除外(Req 4.4) | 1件再計算のみ | Missing |

### 実装アプローチ候補(起点)

Option A: Extend existing
- `caseOffsetDays` を残し、起点 enum カラムを追加。`onCaseCreated`/`onCaseEndDateChanged` を分岐拡張し、`case.service` に startDate トリガーを追加。
- Pros: 既存終了日パスを最小変更で流用。非負バリデーション再利用。
- Cons: `onCaseEndDateChanged` 名と「1件 find」前提が月次に合わない。関数分割・リネームがほぼ必須。

Option B: New generation helpers
- `computeOccurrenceDates(template, case)` を新設し、起点ごとの日付列を返す。create/update は共通エントリから呼ぶ。旧 `onCaseEndDateChanged` は薄くする or 置換。
- Pros: 月次(複数日)と単一起点を同じインターフェースに載せられる。テストしやすい。
- Cons: case.service との契約変更が広い。既存テストの書き換え量大。

Option C: Hybrid(推奨 incl. 情報のみ)
- 単一起点(開始/終了)は既存関数を拡張。月次は別ヘルパー+「期間差分の差分適用」を新設。schema に起点 enum 追加、migrate reset。
- Pros: リスクを月次に局所化。
- Cons: 2系統の生成パスが残る期間がある。

Effort(起点部分): L(月次再計算が支配的)。Risk: Medium〜High(期間差分・完了済み保護・冪等 `(sourceTemplateId, scheduledDate)`)。

## 3. テンプレート再開 — Current State

### Backend
- あり: `recurrenceRepository.stop` → `isActive: false`。`recurrenceService.stopTemplate`。`POST /api/recurring-templates/:id/stop`(204)。
- なし: `resume` / `activate` / `isActive: true` への更新パス。routes・service・repository のいずれにも再開相当なし。
- 生成側: `listActiveByKind` が `isActive: true` のみ。停止中は create/update トリガーでも拾われない(テスト `ignores stopped case_relative templates` あり)。

### Frontend
- `useApiClient`: `stopRecurringTemplate` のみ。resume メソッドなし。
- `pages/recurrence/index.vue`: 「停止」ボタンは `:disabled="!template.isActive"` で一方向。停止中テンプレを再度有効にする操作なし。
- デザイン確定版は詳細モーダルのトグルで双方向(有効↔停止中)。Req 2.6/2.7 および Req 6.3 と整合させるには API+UI 双方が必要。

### 再開の意味(現行アーキテクチャとの整合)
- 案件連動生成は cron ではなく、案件 create/update の同期イベント駆動。
- したがって「停止期間中に本来発生していたはずのインスタンスを遡らない」(Req 2.7)は、再開時に既存案件を一括走査して欠落分を埋めない、と解釈するのが自然。
- 再開後に新たに起きるイベント(新規案件、日付の null→値、日付値変更、月次の期間変更)だけが生成対象になる。
- 注意: 停止中に作成された案件は、再開後も日付が変わらない限りインスタンスが付かない。これが要件意図かどうかは design で一文確認推奨(現状 requirements の文言とは矛盾しない)。

## 4. テンプレート再開 — Gaps (Req 2.6–2.7, 6.3)

| 必要能力 | 現状 | Gap tag |
|----------|------|---------|
| 停止 | API/UI あり | 充足 |
| 再開 API | なし | Missing |
| 再開 service/repository | なし(`isActive=true` 更新経路なし) | Missing |
| API client / UI トグル双方向 | 停止のみ | Missing |
| 再開時に遡及生成しない保証 | 明示コードなし(走査自体が無いのでデフォルトで満たしうる) | Constraint / Unknown(設計で固定) |
| 既に active なテンプレへの resume / 既に stopped への stop の冪等 | stop は再度 false にできるが専用仕様なし | Research Needed |

### 実装アプローチ候補(再開)

Option A: `POST /api/recurring-templates/:id/resume`(stop 対称)
- Pros: 既存 stop と対になる。意図が明確。監査ログを分けやすい。
- Cons: エンドポイントが増える。

Option B: `PATCH /api/recurring-templates/:id` with `{ isActive: boolean }`
- Pros: トグルUIと1:1。将来の軽微更新にも拡張しやすい。
- Cons: 汎用 PATCH の範囲が曖昧になりやすい。stop 既存との二重経路。

Option C: Hybrid — stop は残し resume を追加。UI トグルは内部で stop/resume を呼ぶ
- Pros: 破壊的変更が少なく、デザインのトグルと要件の語彙(停止/再開)に一致。
- Cons: 2エンドポイント。

推奨(情報): Option A または C。どちらの場合も再開は `isActive=true` のみとし、既存案件への一括生成は行わない方針を design に書く。

Effort(再開部分): S。Risk: Low(ただし「再開時バックフィルしない」をテストで固定すること)。

## 5. Integration / risks (本追記スコープ)

1. `case.service` の startDate 配線追加時に、endDate の4分岐ロジックと対称な状態機械が必要(未設定→値、値変更、値→未設定)。
2. 月次除外(Req 4.4)で未完了インスタンスを「生成対象から除外」する手段が未定義(論理削除? scheduledDate クリア? 物理相当の削除禁止なら soft-delete)。design 必須。
3. 再開と月次の組み合わせ: 停止中に期間が変わった場合、再開時点では何もしない(イベントが過去)でよいか。現行イベント駆動なら「何もしない」が一貫。
4. 一意制約 `(sourceTemplateId, scheduledDate)` は月次の冪等に有利。除外後の再追加も同制約で制御可能。

## 6. Research Needed (design へ持ち越し・本追記で具体化)

1. 起点種別の永続化: 新規 enum 名(`caseAnchor` 等)と、`caseOffsetDays` の意味を「常に非負の距離、方向は起点が決める」とスキーマ/API でどう表現するか。
2. 月次の「期間外未完了インスタンスの除外」操作の具体手段。
3. startDate 変更時に呼ぶサービス関数の分割(`onCaseStartDateChanged` vs 共通 `syncCaseRelativeInstances`)。
4. 再開 API 形状(resume vs PATCH isActive)と、再開時に既存案件を走査しないことの受け入れ確認。
5. 停止中に作られた案件が、再開後も日付変更までインスタンス無しでよいか(要件解釈の確認)。

## Document Status (本追記)

- Framework: gap-analysis.md
- Method: `recurrence.{service,routes,repository,types,*.test}.ts`、`case.service.ts`、`schema.prisma`、`useApiClient.ts`、`pages/recurrence/index.vue` を再読込
- 正本: `requirements.md` Req 2.1–2.7 / 3 / 4 / 6.3
- 初回ギャップ分析は上書きせず本節を追記

---

# Design Discovery / Synthesis (2026-08-07T14:36:37Z)

Discovery type: light extension(既存 recurrence/cases/holidays/frontend の拡張)。外部新規ライブラリは追加せず、`rrule` を削除する。

## Design Decisions

### Generalization
- 案件 create/update からの生成・再計算・月次差分を `RecurrenceService.syncForCase` に単一化する。旧 `onCaseCreated` / `onCaseEndDateChanged` は廃止する。
- 起点ごとの日付列計算を内部ヘルパーに寄せ、単一起点も月次も同じ同期ループで扱う。

### Build vs Adopt
- 新規スケジューラ/ジョブ基盤は作らない。既存の同期イベント駆動を拡張する。
- UIは既存 `Modal`/`Badge`/`ErrorAlert`/`DatePicker` と users ページのインラインフォームを採用。新規デザインシステムは作らない。
- `rrule` は fixed_interval 専用のため削除(Adopt 解除)。

### Simplification
- `RecurrenceKind` / `IntervalUnit` / `boundCaseId` / `generate-due` を削除し、テンプレートは案件連動のみとする。
- 再開は `POST .../resume` で `isActive=true` のみ。既存案件の一括補完はしない。
- 月次の期間外未完了インスタンス除外は `tasksService.delete`(ソフトデリート)で行い、専用の「除外」状態は新設しない。

### Resolved Research Needed
1. 起点永続化: `CaseRelativeAnchor` enum(`case_start`/`case_end`/`period_month_start`/`period_month_end`)。`caseOffsetDays` は非負距離。
2. 月次除外: 未完了かつ望ましい日付集合外の生成タスクをソフトデリート。
3. Case 連携: ~~`syncForCase` に統合。startDate/endDate の入力がある update と create 後に呼ぶ。~~  
   破棄(後続「要件再整理: 案件運用ケース合意」および design.md)。確認付き `templateOperations` を案件 create/update に載せるモデルへ置換済み。本項を正として実装しないこと。
4. 再開API: `POST /api/recurring-templates/:id/resume`(stop 対称)。
5. 停止中作成案件: 再開後も日付変更まで未生成でよい(2.7の意図)。

注: 上記 Generalization の「`syncForCase` に単一化」「同期イベント駆動を拡張」も同日の要件再整理で撤回済み。正本は design.md と後続節。

## Risks
- 月次の差分同期と完了済み保護のテスト漏れ
- migrate reset 時の `date_active_key` 手編集忘れ
- calendar E2E シード置換漏れ

---

# 要件再整理: 案件運用ケース合意 (2026-08-08)

利用者確認の結果、常時自動同期モデルを撤回し、案件作成・編集時の確認付き適用モデルへ切り替えた。

## UX決定
- 複数条件が同時に立つ場合は、ポップアップ連発ではなく「チェックボックス一覧 → 最終確認」の1フローとする
- ステップウィザードより、全体を見渡せるチェックリストの方が、一括コミット前提の本フローに合う
- 案件確認UIの見た目は追加のclaude designが必要([[ui-design]])。繰り返し/休日画面は既存確定を継続利用

## 運用ルール要約
- 作成: 両方未設定でも未設定確認のうえ作成(タスクは付けない)。片方未設定も未設定確認のうえ作成。両方ありは確認なしで開始/終了/月初月末を生成
- 編集: 日付差分から適用候補を構築。未チェックは日付のみ保存。キャンセルは保存も適用もしない
- 削除/再生成対象: 当該案件・当該起点のテンプレート生成タスク全部(完了済み含む)。手動タスクは除外。論理削除
- 生成元: その時点の有効テンプレートのみ。削除は現行テンプレの有無を問わない → Task に `sourceAnchor` スナップショットが必要

## 設計への反映
- `design.md` / `requirements.md` を上記に合わせて更新済み
- 旧 `syncForCase` 自動呼び出し前提の記述は破棄

---

# 設計レビュー指摘への決定 (2026-08-08)

validate-design の NO-GO 3件への合意:

1. Task 一意制約は活性行のみ(休日 `date_active_key` と同型の STORED GENERATED COLUMN + UNIQUE)。regenerate 後の同日再作成を可能にする。P2002 冪等 no-op は活性重複に限定
2. 案件の日付保存とテンプレート適用は `POST/PATCH /api/cases` に `templateOperations` を載せ、CaseService 同一トランザクションで実行。適用専用の第2 HTTP は設けない
3. 新規作成で開始・終了が両方未設定でも確認ダイアログを出す(Req 3.1 を改訂)。タスクは追加しない

追加の文書・設計補完(別エージェント指摘への対応):

1. research の Design Discovery / Resolved #3(`syncForCase` 自動呼び出し)に破棄注記を付与。正本は要件再整理以降と design.md
2. `templateOperations` 導出: 候補純関数1箇所。省略=フル候補、`[]`=適用なし、確認UIはユーザー選択の部分集合を送信(サーバーは部分集合検証のみ)
3. CaseFormModal: 未設定確認 → create(+テンプレ同一TX) → 既存の未割当関連付け/再試行、の順序を design System Flows に明記

---

# ビジュアルデザイン確定: 案件テンプレート適用確認 (2026-08-08)

**識別情報**: 同一Claude Designプロジェクト「繰り返し設定と休日マスタの統合」内の追加ファイル  
`https://claude.ai/design/p/393e75bf-c398-4b2e-9f7e-2919a82caea9`  
ファイル: `案件テンプレート適用確認.dc.html`  
(既存の `繰り返し設定・休日マスタ.dc.html` とは別画面。MCPで再読込済み)

## 採用した構成

ネストモーダル(背面に薄く案件フォーム、前面に確認UI)。幅520px、既存Modal言語(primary `#1d4ed8`、slateボーダー、角丸12)。

### 画面A: 新規作成時の未設定確認
- タイトル: 「案件を作成しますか?」
- 本文: 開始日のみ/終了日のみ/両方未設定で切替
- 開始日・終了日の現状サマリー(未設定は琥珀色)
- 補足: あとから日付設定で追加・付け替え可能
- アクション: 「作成する」(primary) / 「戻る」
- props `missingDates` で3パターン切替

### 画面B: 適用候補チェックリスト
- タイトル: 「テンプレートタスクへの反映」
- 日付変更サマリー(取り消し線の旧値 → 新値)
- 候補行: チェックボックス + タグ(追加/生成し直し/削除) + タイトル + 補足
- 初期選択オン。行クリックでトグル。選択中はindigoリング
- フッター注記: チェック外しは日付のみ保存 / 手動タスク除外・完了済みも対象
- アクション: 「次へ」 / 「キャンセル」

### 画面C: 最終確認
- タイトル: 「実行内容の確認」
- 選択済みのみ箇条書き再掲。ゼロ選択時は操作なし文言
- 「あわせて案件の開始日・終了日を保存します。」
- 削除/生成し直しを含むとき琥珀色の注意バナー
- アクション: 「実行する」(primary) / 「戻る」(Bへ)

## 要件との対応
- Req 3.5–3.6(作成時未設定確認) → 画面A
- Req 4.1–4.4, 4.12–4.13(編集時チェックリスト+最終確認+キャンセル未保存) → 画面B/C
- 破壊的操作の注意表示はモックで強化済み(論理削除だがUX上の警告として採用)

## 実装メモ
- コンポーネント名想定: `CaseTemplateApplyConfirm.vue`(`Modal`上、または同等ネスト)
- タグ種別: add / regen / del で色分け
- キャンセル・×・Esc・オーバーレイで中止(保存なし)をトースト相当で示すデモあり → 実装では不要でも挙動は合わせる
