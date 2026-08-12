# Requirements Document

## Introduction

タスクの「メモ」「予定日」は、画面・後続仕様上の意味（詳細・終了予定日）と、公開インタフェース上の識別名（`memo`・`scheduledDate`）がずれている。完了済み仕様文書は更新しない運用のため、このままでは二重語彙が長く残る。本仕様は、タスクの詳細本文を `detail`（表示名「詳細」）へ、終了予定日を `scheduledEndDate`（表示名「終了予定日」）へ改名し、繰り返しテンプレートの既定値およびアプリ全体の表示文言を揃える。将来の開始予定日は `scheduledStartDate` と命名予約するが、本仕様では追加しない。`task-detail` 以降は改名後の語彙を前提とする。

## Boundary Context (Optional)

- **In scope**
  - タスクの詳細本文フィールドの公開識別名・永続識別名の `memo` → `detail` 改名
  - タスクの終了予定日フィールドの公開識別名・永続識別名の `scheduledDate` → `scheduledEndDate` 改名
  - 繰り返しテンプレートの既定詳細（現行 `defaultMemo`）の同様の改名と表示文言揃え
  - タスク作成・更新・取得、テンプレート作成・更新・取得、およびそれらを用いる画面での新識別名・新表示名への統一
  - 既存データが改名後も同じタスク／テンプレートから参照できることの保証
  - 将来の開始予定日識別名 `scheduledStartDate` の命名予約の明文化（フィールド追加はしない）
- **Out of scope**
  - `scheduledStartDate`（開始予定日）フィールドの追加およびその入力 UI
  - タスク詳細ページ、コメント、操作ログ（`task-detail` の管掌）
  - 案件の開始日・終了日（`startDate` / `endDate`）および案件の「期限超過」表示の改名・再定義
  - 完了済み仕様文書（`.kiro/specs` 内の歴史文書）の書き換え
  - 旧識別名との並行受け付け（互換エイリアス）
- **Adjacent expectations**
  - 本仕様完了後、`task-detail` は `detail` / `scheduledEndDate` を前提に設計・実装する
  - カレンダー上の日付配置や超過判定が参照する日付は、改名後も同一の終了予定日フィールドであり、判定ロジックの意味は変えない（識別名と、フィールド名として表示する場合の文言のみ揃える）
  - 将来開始予定日を追加する仕様は、公開識別名を `scheduledStartDate` とする

## Requirements

### Requirement 1: タスク詳細フィールドの識別名
**Objective:** As a ワークスペースのメンバー, I want タスクの詳細本文が一貫した識別名で扱われる, so that 画面と後続機能で「メモ」と「詳細」が混在しない

#### Acceptance Criteria
1. The Field Rename Feature shall タスクの詳細本文を表す公開識別名を `detail` とする
2. The Field Rename Feature shall タスクの表現（取得結果を含む）に旧識別名 `memo` を含めない
3. When ワークスペースのメンバーがタスクの作成または更新で詳細本文を送る場合, the Field Rename Feature shall 公開識別名 `detail` のみを受け付ける
4. If タスクの作成または更新リクエストが詳細本文を旧識別名 `memo` のみで送った場合, the Field Rename Feature shall 当該詳細本文の更新として受け付けない

### Requirement 2: タスク終了予定日フィールドの識別名
**Objective:** As a ワークスペースのメンバー, I want タスクの終了予定日が一貫した識別名で扱われる, so that 将来の開始予定日と混同せず追跡できる

#### Acceptance Criteria
1. The Field Rename Feature shall タスクの終了予定日を表す公開識別名を `scheduledEndDate` とする
2. The Field Rename Feature shall タスクの表現（取得結果を含む）に旧識別名 `scheduledDate` を含めない
3. When システムがタスクの終了予定日を設定または返却する場合, the Field Rename Feature shall 公開識別名 `scheduledEndDate` を用いる
4. The Field Rename Feature shall 案件の開始日・終了日の識別名を変更しない

### Requirement 3: 繰り返しテンプレートの既定詳細
**Objective:** As a ワークスペースのメンバー, I want 繰り返しテンプレートの既定詳細も同じ語彙で扱える, so that 生成されるタスクの詳細と名前が一致する

#### Acceptance Criteria
1. The Field Rename Feature shall 繰り返しテンプレートの既定詳細本文を表す公開識別名を `defaultDetail` とする
2. The Field Rename Feature shall 繰り返しテンプレートの表現に旧識別名 `defaultMemo` を含めない
3. When ワークスペースのメンバーが繰り返しテンプレートの作成または更新で既定詳細を送る場合, the Field Rename Feature shall 公開識別名 `defaultDetail` のみを受け付ける
4. When 繰り返しテンプレートからタスクが生成される場合, the Field Rename Feature shall テンプレートの既定詳細を生成タスクの `detail` として引き継ぐ

### Requirement 4: 画面表示文言の統一
**Objective:** As a ワークスペースのメンバー, I want 画面上でも詳細・終了予定日という呼称で見える, so that API 名と画面語彙が一致する

#### Acceptance Criteria
1. The Field Rename Feature shall タスクの詳細本文を指す画面文言を「詳細」とし、「メモ」「詳細(メモ)」などの旧・過渡表記を用いない
2. While タスクの詳細本文が未設定である, the Field Rename Feature shall 空表示に「メモ」という語を含めない
3. The Field Rename Feature shall 繰り返しテンプレートの既定詳細を指す画面文言を「既定詳細」とし、「既定メモ」を用いない
4. Where タスクの終了予定日をフィールド名として画面に表示する場合, the Field Rename Feature shall 表示名を「終了予定日」とする
5. The Field Rename Feature shall 案件の開始日・終了日の画面文言を本仕様で変更しない

### Requirement 5: 既存データの継続参照
**Objective:** As a ワークスペースのメンバー, I want 改名後もこれまで入力した内容を同じタスクから見られる, so that 移行のためにデータを打ち直さなくてよい

#### Acceptance Criteria
1. When フィールド改名が適用された後に既存タスクを取得した場合, the Field Rename Feature shall 改名前に保持していた詳細本文を `detail` として返す
2. When フィールド改名が適用された後に終了予定日を持つ既存タスクを取得した場合, the Field Rename Feature shall 改名前に保持していた終了予定日を `scheduledEndDate` として返す
3. When フィールド改名が適用された後に既存の繰り返しテンプレートを取得した場合, the Field Rename Feature shall 改名前に保持していた既定詳細を `defaultDetail` として返す
4. The Field Rename Feature shall 改名によって既存タスクの終了予定日に基づく一覧配置や超過判定の対象集合を変えない

### Requirement 6: 開始予定日の命名予約
**Objective:** As a 後続仕様の実装者, I want 開始予定日の識別名が先に決まっている, so that 終了予定日と対称な名前で拡張できる

#### Acceptance Criteria
1. The Field Rename Feature shall タスクの開始予定日フィールドを追加しない
2. The Field Rename Feature shall 将来のタスク開始予定日の公開識別名として `scheduledStartDate` を予約名とし、本仕様の成果物（要件・設計）に明記する
