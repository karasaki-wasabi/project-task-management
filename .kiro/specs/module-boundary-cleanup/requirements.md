# Requirements Document

## Introduction

バックエンドはドメインごとのモジュールに分かれ、他モジュールへの依存は当該モジュールの service 公開インターフェース経由のみと定められている。しかし現状、他モジュールの repository や永続化実装への直接参照が残り、判定ロジックの二重化・公開契約変更時の追従漏れ・複数モジュールにまたがる書き込みの一貫性の場当たり対応が起きやすい。

本仕様は、クロスモジュール参照をすべて所有側の公開インターフェースへ寄せる厳格一掃により、モジュール境界を修復する。対外 HTTP 契約とフロントエンドの振る舞い・画面は変えない。循環するモジュール依存を新たに導入しない。

## Boundary Context

- **In scope**
  - 他モジュールの repository および他ドメインの永続化実装への直接参照の解消
  - クロスモジュール利用を所有側が公開した手続き（通常の service、または明示した読み取り／整合専用面）経由に統一すること
  - 複数モジュールにまたがる既存の書き込み・整合・集計・初期投入の振る舞いを、境界修復後も維持すること
  - モジュール依存に閉路を導入しないこと
  - 対外 HTTP のパス・入出力形・ステータスコードの意味を維持すること
  - 境界修復を検証できる回帰手段（既存テストの継続通過と、直接参照が残っていないことの確認）
  - 必要に応じたプロジェクト規約文書（steering）への短い追記
- **Out of scope**
  - フロントエンドの画面・コンポーネント・URL ルーティングの変更
  - 新機能追加（消化数ダッシュボード画面など）および HTTP パス設計の変更（ワークスペース識別子の URL 化、検索クエリ名の改名など）
  - モジュールの大規模再編や新規ドメインの切り出し
  - import 禁止の静的解析ルール強制（任意の後続とし、本仕様の必須成果にはしない）
  - 完了済み仕様文書の書き換え
- **Adjacent expectations**
  - 既存の正しい service 間依存（例: 案件→繰り返し、繰り返し→休日／タスク、コメント→タスク）は維持し、破壊しない
  - ワークスペース所属判定は既存どおり所属モジュールの公開判定を用い、他モジュールへ判定ロジックを複製しない
  - `velocity-dashboard` など後続仕様は、本仕様が公開する内部集計・参照手段を利用し得るが、本仕様の完了を必須前提にはしない
  - フロントの API クライアント契約（Cookie／CSRF、対象 API へのワークスペースヘッダ付与を含む）は変更しない

## Requirements

### Requirement 1: クロスモジュール参照の公開インターフェース統一
**Objective:** As a バックエンド開発者, I want 他モジュールへの参照が公開インターフェース経由だけになる, so that ドメイン判定の二重化と契約追従漏れを防げる

公開インターフェースには、各モジュールの通常の service に加え、循環回避などのために明示した読み取り専用／整合専用の公開面（例: 案件参照面・タスク整合面）を含む。repository および他ドメインの永続化実装への直接参照は含めない。

#### Acceptance Criteria
1. The Module Boundary Cleanup shall ドメインモジュール間の依存を、依存先モジュールが公開した手続き（通常の service、または明示した読み取り／整合専用の公開面）経由のみとする
2. The Module Boundary Cleanup shall 他モジュールの repository への直接参照を本番コードに残さない
3. The Module Boundary Cleanup shall 他ドメインの永続化実装への直接参照を本番コードに残さない
4. When あるモジュールが他モジュールのデータを参照または変更する必要がある場合, the Module Boundary Cleanup shall 依存先が公開した手続きのみを用いる

### Requirement 2: 循環依存の禁止
**Objective:** As a バックエンド開発者, I want モジュール依存に閉路が無い, so that 変更影響を追跡でき、組み立て・テストが破綻しない

#### Acceptance Criteria
1. The Module Boundary Cleanup shall ドメインモジュール間の依存グラフに閉路を導入しない
2. If 公開インターフェースへの寄せ替えが閉路を生じる場合, then the Module Boundary Cleanup shall 閉路を解消する参照境界（読み取り専用の公開面など）を設けて依存を一方向に保つ
3. When 境界修復が完了した時点で依存関係を検査した場合, the Module Boundary Cleanup shall 閉路が検出されない状態である

### Requirement 3: 複数モジュールにまたがる書き込み一貫性
**Objective:** As a バックエンド開発者, I want 既存の複数モジュール連携書き込みが一貫したまま残る, so that 境界修復で部分成功や不整合が増えない

#### Acceptance Criteria
1. While 複数モジュールにまたがる既存の一連の書き込み操作が実行される, the Module Boundary Cleanup shall その操作全体が成功するか、呼び出し側から見て一貫して失敗するかを維持する
2. When 既存の連携書き込みが同一の書き込み単位で他モジュールの公開手続きを呼ぶ場合, the Module Boundary Cleanup shall 未確定の中間状態を他の公開手続きから読み取れないよう、同一書き込み単位への参加を可能にする
3. The Module Boundary Cleanup shall 境界修復のために、既存の連携書き込みを別々の独立した書き込みへ分割して一貫性を弱めない

### Requirement 4: 既存の整合・集計・初期投入振る舞いの維持
**Objective:** As a ワークスペースのメンバー, I want 境界修復後も案件・タスク・段階・集計まわりの既存振る舞いが変わらない, so that 画面や API の利用感が後退しない

#### Acceptance Criteria
1. When 案件が削除される場合, the Module Boundary Cleanup shall 当該案件に紐づくタスクの切り離しなど、既存と同じ整合結果になる
2. When 案件の必須タスク進捗が参照される場合, the Module Boundary Cleanup shall 境界修復前と同じ数え方・除外規則に基づく結果を返す
3. When 開発段階が削除される場合, the Module Boundary Cleanup shall 当該段階を参照していたタスクの参照解除など、既存と同じ整合結果になる
4. When ワークスペースが新規作成される場合, the Module Boundary Cleanup shall 完了および中止の開発段階が既存と同じ初期状態で用意される
5. When 消化数などの完了集計が参照される場合, the Module Boundary Cleanup shall 境界修復前と同じ集計対象・除外規則に基づく結果を返す
6. The Module Boundary Cleanup shall 上記の整合・集計・初期投入を、所有側モジュールの公開インターフェース経由でのみ他モジュールから利用可能にする

### Requirement 5: 対外契約の維持
**Objective:** As a フロントエンド開発者, I want HTTP API の対外契約が変わらない, so that 画面とクライアントを作り直さずに境界修復だけを取り込める

#### Acceptance Criteria
1. The Module Boundary Cleanup shall 既存の対外 HTTP パスを変更しない
2. The Module Boundary Cleanup shall 既存の対外リクエストおよびレスポンスの公開識別名・形を、意図した互換破壊なしに維持する
3. When 境界修復前後で同一の正当な API 操作を行った場合, the Module Boundary Cleanup shall 成功／失敗の区分およびクライアントが依存する応答の意味を変えない
4. The Module Boundary Cleanup shall 認証・CSRF・ワークスペースヘッダ付与を含むクライアント側の呼び出し前提を変更しない
5. The Module Boundary Cleanup shall フロントエンドの画面・ルーティング・コンポーネントを本仕様の成果として変更しない

### Requirement 6: 日付など共有ユーティリティの適切な公開
**Objective:** As a バックエンド開発者, I want モジュール固有でない日付ヘルパーが永続化層に隠れない, so that 他モジュールが repository を import せずに同じ変換を使える

#### Acceptance Criteria
1. The Module Boundary Cleanup shall ドメイン固有でない日付の解釈・整形ヘルパーを、特定モジュールの repository から他モジュールが import する状態にしない
2. When 複数モジュールが同一の日付のみ表現を解釈または整形する必要がある場合, the Module Boundary Cleanup shall 共有の置き場または所有モジュールの公開インターフェース経由で利用できるようにする

### Requirement 7: 検証と規約の可視性
**Objective:** As a バックエンド開発者, I want 境界修復の完了を確認でき規約が参照できる, so that 後続仕様が同じルールで依存を追加できる

#### Acceptance Criteria
1. When 境界修復が完了した時点で既存のバックエンド自動テストを実行した場合, the Module Boundary Cleanup shall 本仕様に起因する失敗を残さない
2. When 境界修復が完了した時点で本番コードを検査した場合, the Module Boundary Cleanup shall Requirement 1 に反する直接参照が検出されない
3. The Module Boundary Cleanup shall モジュール間依存は公開した手続き（通常の service、または明示した読み取り／整合専用面）経由のみであること、および循環依存を導入しないことを、プロジェクトの規約文書から参照できる状態にする
4. The Module Boundary Cleanup shall import 禁止の静的解析ルール導入を必須成果としない
