# Gap Analysis: workspace-url-routing

分析日: 2026-08-12  
対象要件: `.kiro/specs/workspace-url-routing/requirements.md`（`approvals.requirements.approved: false` のため、要件改訂の余地あり）

## 1. 現状調査

### 再利用できる資産

| 資産 | パス | 現状の役割 |
| --- | --- | --- |
| 現在 WS | `frontend/composables/useCurrentWorkspace.ts` | `useState` + `localStorage`（`currentWorkspaceId`）。`refresh()` は保存 ID が無効／未設定かつ所属ありなら先頭 WS を自動選択して persist |
| Switcher | `frontend/components/workspaces/WorkspaceSwitcher.vue` | `select(id)` のみ。URL は変更しない。作成モーダルと `/workspaces` への管理リンクあり |
| 作成モーダル | `frontend/components/workspaces/WorkspaceCreateModal.vue` | 作成後 `refresh()` → `select(created.id)` |
| 認証ガード | `frontend/middleware/auth.global.ts` | 未ログインは `/login?redirect=<fullPath>`。公開パスはログイン済みなら `/` へ |
| ログイン戻り先 | `frontend/pages/login.vue` | `/` 始まりの `redirect` を復元 |
| ナビ | `frontend/app.helpers.ts` の `navLinks` → `app.vue` | `/`, `/tasks`, `/kanban`, … `/workspaces` の静的配列 |
| 空状態 | 業務ページ約 9 箇所（`data-testid="workspace-empty-state"`） | `currentId === null` 時。多くは `/workspaces` へのリンク CTA |
| API 文脈 | `frontend/composables/useApiClient.ts` | scoped パスに `x-workspace-id`（本仕様の Out: API パス階層化なし） |
| 404 | カスタム `error.vue` なし | 未定義ルートは Nuxt 標準表示（`e2e/events-removed.spec.ts` が確認） |

### ページ配置

- 業務画面はすべてフラット: `pages/index|tasks|kanban(+stages)|cases|calendar|recurrence|holidays|throughput`
- `pages/workspaces/index.vue` は管理画面のみ。`pages/workspaces/[workspaceId]/` は未存在
- `ssr: false` の静的 SPA（`nuxt generate`）。動的 path はホスティングの SPA fallback 前提

### 慣習

- ファイルベースルーティング、グローバル middleware は auth のみ
- コンポーネント／composable の明示 import（テスト容易性）
- E2E は Playwright、`fixtures.ts` で WS 作成＋ localStorage 選択

## 2. 要件実現性（Requirement → Asset Map）

| Req | ギャップ | 現状 | 必要なもの |
| --- | --- | --- | --- |
| 1 業務 URL | Missing | フラット 9 画面＋静的ナビ | `pages/workspaces/[workspaceId]/...` への移動、ナビ／画面内リンクの WS 付き化、`caseId` 維持 |
| 2 `/` 分岐 | Partial / Conflict | `/` がダッシュボード本体。所属ありなら `refresh` が常に何か選択 | last-used → `/workspaces/:id` リダイレクト。所属ありでも last-used 無効時は `/` で一覧・追加（`refresh` 先頭自動選択と衝突） |
| 3 URL 正本 | Missing | 正本は localStorage / `currentId` | route param → 現在 WS。黙った自動切替の禁止 |
| 4 Switcher | Missing | `select` のみ | 同一画面種での path 付け替え＋意味あるクエリ維持 |
| 5 404 | Missing | 旧 URL は正常動作。所属不正の画面ガードなし | 旧ページ削除による意図的 404、所属 middleware / `createError(404)`、最低限表示 |
| 6 WS 消失 | Partial | 削除時 `clearCurrentIf` + `refresh`（先頭へ）。URL 不変。遠隔除名の画面監視なし | 同画面種への付け替え or `/`、所属変化の検知方針 |
| 7 認証・管理据え置き | Exists | `/login` `/register` `/workspaces` 据え置き。`fullPath` 保持済み | 新 scoped URL でも現行ロジックで足りる想定。テストの期待 path 更新のみ |
| 8 所属ゼロ | Partial | 各ページ empty → `/workspaces`。scoped URL 自体がない | `/` 上で一覧・作成を完結。scoped アクセスは 404 |

### 結合破壊の規模（概数）

- 業務 page `.vue`: 約 9（移動必須）
- 空状態複製: 約 9（scoped 化後は「空」より `/`／404 寄せが主）
- フラット path のハードコード（非 e2e）: `app.helpers.ts` / `app.vue` / `index.vue` / `kanban/index.vue` / 各種 page・middleware テストなど
- e2e: `page.goto` 参照が約 20 ファイル。`fixtures.ts` の localStorage 前提も見直し対象
- バックエンド API ルート変更は不要（Out of scope）

### 最大の衝突

`useCurrentWorkspace.refresh()`（L17–35）は、保存 ID が無効でも所属が 1 件以上あれば先頭を選んで persist する。Requirement 2.2（前回利用が無い／無効なら `/` で一覧・追加）と両立しない。設計でフォールバック方針を明示する必要がある。

## 3. 実装アプローチ案

### Option A: 既存を拡張中心

- ページを nested へ移動し、`useCurrentWorkspace` / Switcher / `navLinks` / auth を拡張
- 新規ファイルは所属ガード middleware と `/` 用一覧 UI 部品程度

Trade-offs:

- 既存パターン踏襲で速い
- `refresh` と Switcher に責務が集まり、composable が肥大化しやすい

### Option B: 新規コンポーネント中心

- `useWorkspaceRoute`（URL ↔ 現在 WS）、`buildWorkspacePath`、所属ガード middleware、`/` 専用ランディングを新設
- `useCurrentWorkspace` は last-used 記憶＋一覧取得に縮退

Trade-offs:

- URL 正本と last-used の境界がはっきりする
- ファイル数と配線が増える

### Option C: ハイブリッド（推奨候補）

- 延長: `auth.global` / login redirect / `useApiClient` ヘッダ / CreateModal（成功後の遷移追加）
- 意味変更つき延長: `useCurrentWorkspace`（先頭自動選択廃止、last-used 専用化）、`WorkspaceSwitcher`（path rewrite）
- 新規: 所属ガード middleware、`workspacePath` ヘルパー、`pages/workspaces/[workspaceId].vue` 親、`/` の一覧・追加表示（既存 `/workspaces` UI を流用または薄く共有）
- 置換: フラット業務 pages → nested、静的 `navLinks` → WS 付きビルダー
- 移行: 旧フラット page は残さず削除して 404（互換リダイレクト禁止）。一括切替前提

Trade-offs:

- 要件と衝突点を分離しやすい
- 計画（ページ移動順・テスト更新順）の調整が必要

## 4. 工数・リスク

- Effort: L（1–2 週間相当）
  - ページ移動・ナビ・Switcher・`refresh` 意味変更・E2E 全面更新が主。API／DB 変更なし
- Risk: Medium
  - 技術は既知（Nuxt ルーティング）だが、触るフロント面が広く、Req2 と現行 `refresh` の衝突・削除／除名検知が設計依存

## 5. Design フェーズへの申し送り

### 推奨の進め方（決定ではない）

Option C を軸に、次を design で確定する。

1. `refresh` のフォールバック: 所属ありでも last-used 無効なら自動選択せず `currentId=null`（`/` 一覧へ）とするか
2. last-used キー: 既存 `currentWorkspaceId` を転用するか、意味を分けてリネームするか
3. 所属ガードの置き場: 親 `[workspaceId].vue` の named middleware vs 条件付き global
4. `/` 一覧 UI: `/workspaces` 管理画面との部品共有範囲（Claude Design なし前提）
5. Switcher で維持するクエリの範囲（最低 `caseId`。他は設計で列挙）
6. Req6 の検知: 自操作削除直後／API 403・404／`refresh` 後の所属差分のどれを必須にするか
7. `nav` の active 判定を `/workspaces/:id/...` に合わせる方法
8. 静的ホスティングの SPA fallback が深い動的ルートで足りるか（運用確認）

### Research Needed（design で深掘り）

- Nuxt 4 における `pages/workspaces/index.vue` と `pages/workspaces/[workspaceId]/index.vue` の正式な共存レイアウト（親 `<NuxtPage />` の要否）
- `createError({ statusCode: 404 })` を SPA（`ssr: false`）で出したときの標準エラー表示の見た目・e2e での断言方法
- 作成直後の遷移先を `/workspaces/:id`（ダッシュボード）に統一するか、作成コンテキスト（どの画面から開いたか）を維持するか

### 制約（変更しない）

- API は `x-workspace-id` ヘッダ維持。パス階層化なし
- 旧フラット URL への互換リダイレクトなし
- エラーページ本格デザインは ideas 送り

---

## Design Discovery (2026-08-12)

### Summary
- Feature: `workspace-url-routing`
- Discovery Scope: Extension（既存 Nuxt SPA へのルーティング拡張）
- Key Findings:
  - `pages/workspaces/index.vue`（管理）と `pages/workspaces/[workspaceId]/...`（業務）は共存可能。親 `[workspaceId].vue` + named middleware が安全
  - `refresh()` 先頭自動選択の廃止が Req2 充足の前提
  - Claude Design はユーザー明示スキップ（制限中・既存 UI 踏襲）

### ビジュアルデザイン確定（claude design 連携）— ゲートスキップ

- Context: `.kiro/steering/ui-design.md` は画面変更時に claude design 必須。ただし「ユーザーが明示的にスキップを指示した場合のみ例外」
- User instruction: discovery 時に「claude design がリミット制限中なので、既存の表示を参考にしながら作成する」と指示
- Decision: 本ゲートをスキップし、`/workspaces` 空状態・一覧・Switcher・既存ダッシュボードの視覚言語を踏襲する
- Scope of UI: 新規ビジュアル言語は作らない。`/` の一覧・追加は既存 empty／管理画面のパターンを再利用した `WorkspacePickerPanel` 程度
- 本格 404 デザインは `docs/ideas.md` のまま Out

### Research Log

#### Nuxt nested routes under workspaces
- Context: 管理 `/workspaces` と業務 `/workspaces/:id/...` の衝突懸念
- Findings: 静的 `index.vue` と動的 `[workspaceId]` は共存。親レイアウトで `<NuxtPage />` + `definePageMeta({ middleware: ['workspace-member'] })` が管理画面を誤 404 しない
- Implications: design は named middleware を親に限定

#### createError 404 on SPA
- Context: カスタム `error.vue` なしで Req5.3 を満たせるか
- Findings: 未定義 path は既に Nuxt 標準 404（`events-removed` e2e）。`createError({ statusCode: 404 })` も同系統の表示で最低限足りる
- Implications: 本仕様で `error.vue` を新設しない

#### 作成後遷移
- Context: CreateModal 成功後の行き先
- Findings: scoped 上で作成したなら同一画面種へ、`/` や管理からなら新 WS ダッシュボードが自然
- Implications: design の CreateModal 節に反映

### Architecture Pattern Evaluation

| Option | Description | Strengths | Risks | Notes |
|--------|-------------|-----------|-------|-------|
| A Extend only | composable/Switcher に全部載せる | ファイル少 | refresh/Switcher 肥大 | 非推奨 |
| B New stack | 専用 route SDK | 境界明確 | 過剰 | 不採用 |
| C Hybrid | path helper + middleware + composable 縮退 + page move | 要件衝突を分離 | 移動面が広い | 採用 |

### Design Decisions

#### Decision: refresh は先頭自動選択しない
- Context: Req 2.2 と現行 `refresh` の衝突
- Alternatives: (1) 自動選択維持して `/` だけ例外 (2) 自動選択廃止
- Selected: (2) last-used が無効なら `currentId=null`
- Rationale: URL 正本と `/` 一覧分岐が一致する
- Trade-offs: 既存テスト／E2E の「所属があれば必ず選択」前提を書き換える

#### Decision: localStorage キーは転用し意味だけ縮退
- Context: 新キー vs `currentWorkspaceId` 転用
- Selected: キー名維持、意味は last-used
- Rationale: 移行コスト低減。scoped 正本は URL

#### Decision: Switcher のクエリは route.query を丸ごと引き継ぐ
- Context: 「意味あるクエリ」の範囲
- Selected: 移行元 `route.query` を維持（`caseId` を含む）
- Rationale: 画面ごとの許可リストより単純で Req1.4/4.2 を満たす

#### Decision: 単一切替・互換リダイレクトなし
- Context: 旧 URL 移行
- Selected: フラット page 削除で 404
- Rationale: Req 5.2

### Synthesis Outcomes
- Generalization: 「WS 付き path の構築／差し替え」を `workspacePath` に集約（ナビ・Switcher・リンクが共有）
- Build vs Adopt: Nuxt 標準ルーティング／`createError` を採用。追加ライブラリなし
- Simplification: 業務ページの `currentId === null` 空状態は middleware 保証により削除。`/` と 404 に寄せる

### Risks & Mitigations
- E2E 大量更新 — fixtures で「作成→ダッシュボード URL へ」を共通化
- nav active 判定 — prefix match を design どおり実装時に確認
- SPA fallback — 既存ホスティング前提を Migration に明記

### validate-design フォローアップ（2026-08-12）

- Req 6: リアルタイム監視はしない。検知は削除直後／次の scoped 入場／scoped API 所属拒否時。失ったと分かったら他所属同一画面種、なければ `/`
- `buildNavLinks(null)`: `/` と `/workspaces` のみ（業務リンクなし）で固定
- Traceability の幽霊 API `withWorkspaceId` を削除し `workspacePath` + query に統一
