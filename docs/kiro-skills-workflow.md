# kiro-* スキルの使い方フロー

このプロジェクトは Kiro-style Spec-Driven Development を採用しており、`.kiro/steering/`(プロジェクト全体のルール)と `.kiro/specs/`(個別機能の仕様)の2種類の文脈を軸に、以下の順序でスキルを使います。

## Phase 0: Steering (任意・最初の1回 or 定期更新)

プロジェクト全体の文脈をAIに持たせる段階。

1. `kiro-steering`
  - `.kiro/steering/` の初期化・同期(`product.md`, `tech.md`, `structure.md`)
2. `kiro-steering-custom`
  - ドメイン固有のsteeringが必要なら追加

## Discovery (アイデア段階)

- `/kiro-discovery "idea"`
  - 単一spec or 複数spec(roadmap)かを判定し、`brief.md` / `roadmap.md` を作成

## Phase 1: Specification (要件→設計→タスク)

機能ごとに以下を順に実行。承認フロー(Requirements → Design → Tasks)が前提。

1. `kiro-spec-init`
  - 機能の説明からspecを初期化
2. `kiro-spec-requirements`
  - EARS形式で要件生成
3. `kiro-validate-gap` (任意)
  - 既存コードベースとのギャップ分析
4. `kiro-spec-design`
  - 要件→アーキテクチャ設計
5. `kiro-validate-design` (任意)
  - 設計レビュー
6. `kiro-spec-tasks`
  - 実装タスクへ分解

まとめて回すなら `kiro-spec-quick` (対話 or `--auto`)。
複数spec同時進行なら `kiro-spec-batch` (roadmap.mdから依存関係のウェーブごとに並列生成)。

## Phase 2: Implementation (実装)

- `kiro-impl`
  - タスク番号なし: 自律モード(サブエージェントごとにタスク+独立レビュー+最終検証)
  - タスク番号あり: 手動モード(メインコンテキストで選択タスクを実装、レビューはゲート)
  - 内部で以下も呼ばれる
    - `kiro-review`
      - タスク単位の敵対的レビュー
    - `kiro-debug`
      - 実装が詰まった時の根本原因調査
    - `kiro-verify-completion`
      - 完了主張前の証跡確認
- `kiro-validate-impl`
  - 全タスク完了後の機能横断的な整合性・全テスト検証

## 進捗確認 (いつでも)

- `kiro-spec-status`
  - 各specの進捗状況を表示

## 実行順序の要点

```
[任意] kiro-steering → kiro-steering-custom
  ↓
kiro-discovery → brief.md / roadmap.md
  ↓
単一spec: kiro-spec-init → requirements → [validate-gap] → design → [validate-design] → tasks
複数spec: kiro-spec-batch
  ↓
kiro-impl (タスクごとにreview/debug/verify-completionが自動介在)
  ↓
kiro-validate-impl(全タスク完了後)
  ↓
いつでも kiro-spec-status で状況確認
```
