# Research & Gap Analysis: task-field-rename

## Analysis Summary
- 本仕様は新規ドメイン追加ではなく、既存 `tasks` / `recurrence` / FE 型・文言の横断的な識別名・表示名揃えである
- 既存資産は揃っており、欠けているのは「新名への置換」そのものと、それに追随するマイグレーション・テスト・シードである
- 最大の技術リスクは、`template_case_date_active_key`（STORED GENERATED）が SQL 上で `scheduled_date` を参照している点である
- 推奨アプローチは既存モジュールを機械的に拡張する Option A（新規モジュールは不要）
- 規模は M（ファイル数は多いがパターンは一様）、リスクは Medium（生成列の手書きマイグレーション）

---

# Gap Analysis（`/kiro-validate-gap`）

## Current State Investigation

### データモデル
- `Task.memo`（DB `memo`、`@map` なし）
- `Task.scheduledDate`（DB `scheduled_date`）
- `RecurringTaskTemplate.defaultMemo`（DB `default_memo`）
- `Task.templateCaseDateActiveKey` — Unsupported 生成列。式内で `scheduled_date` を参照（`schema.prisma` 先頭コメントおよび `migrations/20260805030211_init_domain_schema/migration.sql`）

### API / サービス
- `POST/PATCH /api/tasks` の Zod: `memo`（`scheduledDate` は公開ボディに無い。recurrence 内部 create のみ）
- タスク応答は Prisma 行のまま → `memo` / `scheduledDate` が JSON に載る
- recurrence 登録・更新: `defaultMemo`。生成時に `Task.memo` と `scheduledDate` を設定

### フロントエンド
- `useApiClient.ts`: `memo` / `scheduledDate` / `defaultMemo`
- `TaskDetailModal.vue`: ラベル「詳細(メモ)」、空表示「(メモなし)」、id `task-detail-memo`
- `tasks/index.vue`: placeholder「メモ」
- `RecurrenceFormModal.vue` / `RecurrenceDetailModal.vue`: 「既定メモ…」/「既定メモ」、id `recurrence-form-memo`
- カレンダー: `scheduledDate` でセル配置・超過判定。フィールド名ラベル「予定日」「終了予定日」は現状なし（Requirement 4.4 の Where 節は、ラベルを出す画面ができたとき／既存で出している箇所向け）

### テスト・シード
- Backend: `task.*.test.ts`、`recurrence.*.test.ts`、`schema.integration.test.ts`、`validation.integration.test.ts`、`seed-manual-data.ts`
- Frontend: calendar helpers テスト、recurrence モーダル／helpers テスト、`useApiClient.test.ts`、e2e コメント内の旧名

### 改名不要（別概念）
- `Case.startDate` / `Case.endDate`、案件の「期限超過」
- 完了済み `.kiro/specs/*` 歴史文書（Out of scope）

## Requirement-to-Asset Map

| Requirement | 既存資産 | ギャップ |
|---|---|---|
| 1. 詳細 `detail` | `Task.memo`、routes/service/repository、FE 型・モーダル・一覧 | **Missing**: 全経路の `memo`→`detail`（永続列名・公開キー・型・テスト）。**Constraint**: 旧キー並行受付なし → Zod は `detail` のみ |
| 2. 終了予定日 `scheduledEndDate` | `Task.scheduledDate`、recurrence 生成、カレンダー helpers、応答 JSON | **Missing**: 全経路の `scheduledDate`→`scheduledEndDate`。**Constraint**: 生成列 SQL の `scheduled_date` 参照更新。案件日付は触らない |
| 3. `defaultDetail` | `defaultMemo`、recurrence routes/service/FE | **Missing**: `defaultMemo`→`defaultDetail`、生成時の `detail` 引き継ぎ更新、UI「既定詳細」 |
| 4. 画面文言 | 上記 UI 文字列 | **Missing**: 「詳細」「既定詳細」への置換、空表示から「メモ」除去。**Partial**: 「終了予定日」ラベルを出す既存画面はほぼ無い（Where 条件）。カレンダーにラベルを新設するかは設計判断（要件は「表示する場合」） |
| 5. 既存データ継続 | MySQL 上の既存行 | **Missing**: 値を保持したままのリネームマイグレーション。**Constraint**: 一意キー生成列の再定義。超過判定ロジックの意味は維持（識別名だけ変更） |
| 6. `scheduledStartDate` 予約 | なし | **Missing**: 設計書への明記のみ。カラム追加はしない（ギャップというよりドキュメント成果） |

## Implementation Approach Options

### Option A: 既存モジュールを横断リネーム（推奨）
- Prisma フィールド／`@map`／マイグレーション、tasks・recurrence の types/routes/service/repository、FE 型・コンポーネント・テスト・シードを一括置換
- 新規モジュールは作らない
- Trade-offs
  - 既存パターンに沿い、責務境界を増やさない
  - 変更ファイル数は多いが差分は機械的
  - 生成列の手書き SQL を設計で固定する必要あり

### Option B: 互換レイヤ（旧名受付＋新名公開）
- 要件の「旧識別名との並行受け付けは Out of scope」に反する
- 採用しない

### Option C: 段階的リネーム（DB 先・API 後など）
- 一時的に二重名が残り、要件 1/2/5 の「表現に旧名を含めない」と衝突しやすい
- 個人開発・破壊的改名許容の前提では過剰。採用しない（一発切替の Option A を推奨）

## Complexity & Risk
- Effort: M（3〜7日相当の横断置換。ロジック新設は少ないがテスト・マイグレーションが厚い）
- Risk: Medium（`template_case_date_active_key` の生成列再定義と Prisma Unsupported の手書きマイグレーション。アプリロジック自体は低リスク）

## Research Needed（設計フェーズへ）
1. ~~`scheduled_date` → `scheduled_end_date` への生成列付け替え手順~~ → 設計で確定（drop unique → drop generated → rename → recreate）
2. ~~物理列を改名するか `@map` だけか~~ → 物理列も改名（`detail` / `scheduled_end_date` / `default_detail`）
3. ~~Requirement 4.4 のカレンダーラベル新設~~ → 新設しない。既存旧文言の置換とプロパティ名更新のみ

## Recommendations for Design Phase
- Preferred: Option A
- マイグレーション設計を design.md の中心成果の一つにする（生成列を含む）
- 変更ファイル一覧を tasks 分割しやすい単位（schema、tasks API、recurrence、FE 文言、テスト／シード）で列挙する
- `scheduledStartDate` は Boundary / Naming 節に明記し、スキーマには追加しない

---

# Design Discovery & Synthesis（`/kiro-spec-design`）

## Discovery Type
Light discovery（既存モジュールの横断拡張）。新規ライブラリ調査なし。

## Design Decisions
- Option A を採用。互換レイヤ・段階的二重名は採用しない
- 物理列も改名し、公開 JSON・Prisma・DB を一致させる
- 生成列は「DROP → 列 RENAME → 新式で ADD」の順で手書きマイグレーションする
- Requirement 4.4: 終了予定日ラベルが無い画面にはラベルを新設しない（カレンダーはプロパティ名のみ）
- 空表示は「メモ」を含まない（「—」等）。DOM id も新フィールド名に合わせる
- `scheduledStartDate` / `scheduled_start_date` は Naming map で予約のみ

## Synthesis
- Generalization: 3 フィールドの改名は同一パターン（schema → API → FE → tests）
- Build vs Adopt: 既存 Prisma マイグレーション手書き慣習を採用。追加ツールなし
- Simplification: 新規モジュール・アダプタ・フィーチャーフラグなし。一発切替
