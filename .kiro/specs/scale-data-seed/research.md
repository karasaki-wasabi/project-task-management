# Research & Design Decisions: scale-data-seed

## Summary
- **Feature**: scale-data-seed
- **Discovery Scope**: Extension（既存 `prisma/` オペレータ入口の延長。HTTP ドメイン追加なし）
- **Key Findings**:
  - 開発用 `seedManualConfirmationData` は先頭で `clearAllTables`（全表 TRUNCATE）。規模投入は別エントリ必須
  - WS スコープ削除は未整備。soft-delete 拡張付き `db` では物理削除できず、再投入で行が累積しうる
  - 既存オペレータ CLI はすべて `backend/src/prisma/`。規模 CLI も同配置が妥当

## Research Log

### 既存 seed / wipe
- **Context**: Req 1（開発用シード分離）、Req 5（専用掃除）、Req 7（衝突注意）
- **Sources Consulted**: `backend/src/prisma/seed.ts`, `seed-manual-data.ts`, `clear-tables.ts`, `reset-for-e2e.ts`, `backend/package.json`, `.kiro/steering/testing.md`, `local-dev-pitfalls.md` §11
- **Findings**:
  - `db:seed` → 全消し → 固定少数デモ
  - E2E `db:reset-for-e2e` → 全消しのみ
  - WS 単位削除 API／スクリプトは無い
- **Implications**: 規模投入は `clearAllTables` を呼ばない。掃除も全表 TRUNCATE を使わない

### スキーマ最小セットと一覧可視性
- **Context**: Req 2–4
- **Sources Consulted**: `schema.prisma`（Task / Workspace / User / DevelopmentStage / Case）, `task.routes.ts` list
- **Findings**:
  - Task 必須: `title`, `priority`, `workspaceId`。`scheduledEndDate` は任意だがカレンダー再現に必要
  - list は soft-delete 除外の WS 全件。削除済み行の水増しは不可（Req 4.4）
  - WS 不変条件: 完了・中止の端末段階が必要（`ensureTerminalStages` と同型のデータを Prisma 直で用意可能）
- **Implications**: 案件は任意。端末段階 + 多数タスク + 終了予定日付き比率が中核

### サービス再利用 vs Prisma 直
- **Context**: 実装境界
- **Sources Consulted**: `workspace.service.ts`, `seed-manual-data.ts`, `shared/db.ts` soft-delete
- **Findings**:
  - `workspaceService.create` は HttpError / 業務イベント / ランダム ID 前提
  - デモ seed は生 `PrismaClient` + 固定 ID
  - soft-delete 拡張付き Client の `deleteMany` は論理削除のみ
- **Implications**: 規模 CLI はデモ seed と同様に生 Prisma + 固定 ID。掃除は raw / 生 API の物理削除

### createMany 性能
- **Context**: 数千〜数十万件
- **Sources Consulted**: リポジトリ内 `createMany` 利用、Prisma/MySQL プレースホルダ上限の一般知識
- **Findings**:
  - `task.repository.createMany` は逐次 `create`（規模不向き）
  - リポにチャンク定数なし。MySQL はプレースホルダ上限があるためチャンク必須
- **Implications**: 生 Prisma の `createMany` を数千行単位でチャンク

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A. prisma/ CLI + 生 Prisma | seed-scale スクリプト群 | 既存 seed と対称、HTTP 境界を汚さない | モジュール service 不使用 | **採用** |
| B. HTTP 管理 API | 認証付き bulk seed エンドポイント | UI から実行可 | 本番誤爆リスク、本仕様 Out | 不採用 |
| C. workspaceService 再利用 | 公開 service 経由で WS 作成 | 不変条件を自動充足 | 固定 ID・物理削除・大量投入と相性が悪い | 端末段階だけ同型データを直書きで再現 |

## Design Decisions

### Decision: 固定 ID の計測用ユーザー／WS
- **Context**: 後続 `api-load-harness` が環境変数で WS / 資格情報を参照する（Req 2, 6）
- **Alternatives Considered**:
  1. 毎回ランダム ID を stdout のみに出す
  2. 固定 UUID / 固定メール（デモ seed の `SEED_*` と同型）
- **Selected Approach**: 規模専用の固定定数（デモ seed の ID とは別名前空間）
- **Rationale**: 再現性と harness の設定が単純
- **Trade-offs**: ID 衝突はデモ seed と分離した定数で回避する必要あり

### Decision: 既定件数 6000、環境変数で上書き
- **Context**: Req 3.2（未指定時は既定または拒否）、Req 3.4（数千件帯）
- **Selected Approach**: 既定 `6000`。`SCALE_TASK_COUNT`（正の整数）で上書き。不正値は失敗終了
- **Rationale**: e2e で固まった件数帯を既定にすると手順が最短
- **Follow-up**: 数十万はチャンクと実行時間の実測で確認

### Decision: 再投入前に WS スコープ物理削除
- **Context**: Req 3.3（累積しない）、Req 5
- **Selected Approach**: 投入・掃除とも FK 順で `workspace_id` 配下を物理削除。ユーザー行は再利用のため残す（掃除モードでユーザー削除するかは「WS 削除まで」を必須とし、ユーザーは固定のため残置可）
- **Rationale**: soft-delete では行が残り再投入で肥大化
- **Trade-offs**: 生 Prisma / raw SQL が必要。アプリの soft-delete 規約の例外であることを design / コメントで明示

### Decision: 終了予定日付き比率
- **Context**: Req 4.2
- **Selected Approach**: 既定で投入タスクの 80% に、当日を中心とした前後数ヶ月の `scheduledEndDate` を分散付与。残りは null（一覧のみ負荷）
- **Rationale**: カレンダー再現と「日付なし行」の混在を両立

### Decision: オペレータ手順の置き場
- **Context**: Req 1.3, 5.4, 7
- **Selected Approach**: `.kiro/steering/local-dev-pitfalls.md` に規模 seed 節を追加。`testing.md` へ一行クロスリンク可
- **Rationale**: 既存の `db:seed` 手順と同文書に揃える

## Risks & Mitigations
- 共有 DB で E2E / `db:seed` が規模データを消す — 手順に明記（Req 7）。テストは小件数＋必ず掃除
- 数十万件で MySQL / ディスク逼迫 — チャンク、件数上限の文書化（実装時に妥当な上限を設定可）
- 固定パスワードのリポジトリ記載 — 計測専用・開発 DB 限定と明記。本番投入禁止（Req 7.3）

## References
- `backend/src/prisma/seed-manual-data.ts` — 既存デモ seed パターン
- `backend/src/prisma/clear-tables.ts` — 全表 TRUNCATE（規模では使用禁止）
- `.kiro/specs/scale-data-seed/requirements.md`
- `.kiro/specs/api-load-harness/brief.md` — 下流の認証・WS 前提

---

# Gap Analysis (kiro-validate-gap)

実施日: 2026-08-25。要件と現行コードベースの差分。設計フェーズ向けの情報提供（最終実装決定そのものではない）。なお本スペックは既に `design-generated` のため、下記は既存 `design.md` との整合確認にも使える。

## Current State

### 既存アセット
- `backend/src/prisma/seed.ts` + `seed-manual-data.ts`
  - 固定 UUID / 固定メール、argon2 hash、生 `PrismaClient`、`createMany` で少数デモ投入
  - 先頭で必ず `clearAllTables`（全表 TRUNCATE）
- `backend/src/prisma/clear-tables.ts` / `reset-for-e2e.ts`
  - DB 全体 wipe のみ。WS スコープ削除なし
- `backend/package.json`
  - `db:seed` / `db:reset-for-e2e` のみ。規模用 script なし
- テスト内 `hardDelete` / `$executeRawUnsafe("DELETE FROM … WHERE workspace_id = ?")`
  - 物理削除パターンはテストに多数存在（例: `workspace-scope.create-override.integration.test.ts`）
- `seed.integration.test.ts`
  - デモ seed 経路の統合検証先例（破壊的・実 DB）
- soft-delete 拡張 `shared/db.ts`
  - アプリ経路の `deleteMany` は論理削除。規模の非累積掃除には不向き
- steering
  - `local-dev-pitfalls.md` §11 はデモ seed のみ。規模 seed の手順・衝突注意は未記載
  - `testing.md` は Vitest/E2E 共有 MySQL 制約あり。負荷用規模データの言及なし

### 未存在（実装ギャップ）
- `seed-scale.ts` / `cleanup-scale.ts` / `scale-data*.ts`
- `db:seed-scale` / `db:cleanup-scale`
- `SCALE_*` 固定定数（デモ `SEED_*` とは別名前空間）
- 件数パラメータ・チャンク投入・日付比率ロジック
- WS スコープ掃除の本番オペレータ入口
- 規模データ向け docs

## Requirement-to-Asset Map

| Req | 必要能力 | 既存資産 | Gap |
|-----|----------|----------|-----|
| 1.1 専用入口 | npm script + CLI | `db:seed` のみ（全消し前提） | Missing |
| 1.2 全表消去しない | clearAllTables 非呼び出し | seed は必ず呼ぶ | Constraint（既存経路は使えない） |
| 1.3 手順文書 | local-dev-pitfalls 追記 | §11 はデモのみ | Missing |
| 2.1–2.4 専用 WS / 資格 / 端末段階 | 固定 ID ensure | デモ seed のパターン流用可。SCALE 専用は無し | Missing（パターン有・実装無） |
| 3.1–3.4 件数指定・再実行非累積 | env パース + 削除後 createMany | createMany 少数先例。件数 env・再投入なし | Missing |
| 4.1–4.4 データ形状 | active タスク多数 + scheduledEndDate 比率 | デモは少数・一部に日付 | Missing |
| 5.1–5.4 WS 掃除 | 物理削除 CLI | テスト hardDelete のみ | Missing（パターン有・入口無） |
| 6.1–6.3 サマリ出力・非所有 | stdout 契約 | seed.ts の console.log 先例 | Missing（規模用） |
| 7.1–7.3 衝突注意 | docs | testing.md の共有 DB 記述は流用可 | Missing（規模特化の明記） |

## Implementation Approach Options

### Option A: Extend `seed-manual-data.ts` / `db:seed`
- 概要: 既存 seed にフラグや件数分岐を足し、規模モードを同居させる
- Pros: ファイル増が少ない
- Cons: 先頭 `clearAllTables` と衝突しやすい。デモと規模の責務が混線（Req 1 違反リスク）。`seed.integration.test.ts` 破壊的テストがさらに危険に
- 評価: 非推奨

### Option B: 新規 prisma CLI（推奨候補）
- 概要: `scale-data.ts` + `seed-scale` / `cleanup-scale` エントリ、`SCALE_*` 定数、package.json script、docs 追記。デモ seed / clear-tables は触らない
- Pros: Req 1 の分離が明確。既存破壊的 seed テストと干渉しにくい。structure.md の prisma/ オペレータ配置と一致
- Cons: ファイルが増える。物理削除順をスキーマ追従でメンテする必要
- 評価: 要件適合度が高い

### Option C: Hybrid（新規 CLI + テスト hardDelete ヘルパの共有化）
- 概要: Option B に加え、WS スコープ物理削除を共有ユーティリティ化してテストと CLI で共用
- Pros: 削除順の単一正本
- Cons: テスト用 helper とオペレータ CLI の結合が過剰になりうる。本仕様必須ではない一般化
- 評価: 削除順が複雑化したら後続検討。初回は B で十分

## Effort & Risk

- Effort: **S〜M**（既存 seed / hardDelete パターン踏襲。新規は CLI・定数・小件数統合テスト・docs。HTTP/スキーマ変更なし）
- Risk: **Low〜Medium**
  - Low: 技術は既知（Prisma createMany、argon2、tsx）
  - Medium 要素: 共有 DB での誤 wipe / テスト干渉、数万件超の投入時間・ディスク（手順と小件数テストで緩和）

## Research Needed（設計・実装で詰める残り）
- MySQL プレースホルダ上限に対する安全なチャンクサイズの実測確認（設計は目安 1000）
- 数十万件投入時の現実的な所要時間とディスク（SLO は本仕様外だがオペレータ案内用）
- 掃除対象テーブル集合を `TABLES_IN_TRUNCATE_ORDER` からどう導出・同期するか（スキーマ追加時の漏れ防止）
- stdout サマリを `api-load-harness` が機械パースするか、環境変数手設定で足りるか（下流 brief 側）

## Recommendations for Design / Implementation

- 優先アプローチ: Option B（新規 prisma CLI）。現行 `design.md` はこの方針と整合している
- 既存 `db:seed` / `clearAllTables` を規模経路から呼ばないことを実装・テストの両方で守る
- `SEED_*` と衝突しない `SCALE_*` 固定 ID を必須とする
- 統合テストは小件数 + 必須 cleanup。6000 件の手動確認は docs に任せ CI 必須にしない
- 設計承認前に見直すなら: チャンクサイズ、削除テーブル順、stdout 契約の下流互換

## Alignment with Existing design.md

既存設計（Approach A: k6 下流前提、本仕様は prisma CLI）は本ギャップ分析の Option B と一致。重大な再設計は不要。上記 Research Needed は実装タスク化時の確認項目として残す。
