# Requirements Document

## Project Description (Input)

開発者・計測担当が、一覧 API の負荷再現に必要な数千〜数十万件規模のデータを用意できない。現行の開発 seed と E2E fixture は少数件前提で、タスク一括投入用の専用コマンドもなく、Vitest / E2E と同一 MySQL を共有しているため規模データを安定して置けない。専用ワークスペースへ再現可能な規模データを投入・掃除できる入口を、開発用 `db:seed` とは分けて用意し、`api-load-harness` と `list-api-performance` が同じデータ前提を参照できるようにする。

## Introduction

一覧 API の負荷計測には、開発用の少数デモデータでは足りない件数のタスクが必要である。本仕様は、計測担当が開発用シードとは別の入口から、専用ワークスペースへ指定件数の規模データを投入・再投入・掃除でき、後続の負荷ハーネスと一覧性能改善が同じ前提を使えるようにする。

## Boundary Context

- **In scope**
  - 開発用シードとは分離した、規模データ投入のオペレータ向け入口
  - 負荷計測専用として識別できるワークスペースと、ログイン可能な計測用アカウント／所属の用意
  - 投入件数などオペレータが指定できるパラメータ
  - 一覧・カレンダー負荷の再現に足るデータ形状（少なくとも多数のタスク。終了予定日付きを含む）
  - 専用ワークスペース範囲での再投入と掃除
  - 投入結果を後続計測が参照できるよう、識別子・件数・利用方法が分かること
  - 共有開発 DB 上で、全表消去系の既存手順と規模データが衝突しうる旨のオペレータ向け注意
- **Out of scope**
  - k6 等の負荷シナリオ本体と閾値設計（`api-load-harness`）
  - 一覧 API や画面の性能改善（`list-api-performance`）
  - フロント描画用モックや Storybook 用データ
  - 書き込み API 負荷専用のデータ生成機能
  - CI での毎回必須実行、クラウド上での実負荷代行
  - 開発用シード（少数デモ）や E2E 用全表リセット手順そのものの置き換え
- **Adjacent expectations**
  - 既存の開発用シードと E2E 用全表リセットは、これまでどおり DB 全体を空にしうる。規模データはそれらと共存しない前提をオペレータが理解できること
  - `api-load-harness` は本仕様が用意する専用ワークスペースと計測用資格情報を用いて一覧 GET を叩く
  - `list-api-performance` は本仕様で投入したデータ量を改善前後の比較前提にできる
  - ワークスペース作成時に必要な端末段階（完了・中止）など、既存プロダクト不変条件は満たした状態で投入結果が使えること

## Requirements

### Requirement 1: 開発用シードから分離した投入入口
**Objective:** As a 計測担当, I want 開発用の少数デモ投入とは別の入口で規模データを投入する, so that 普段の開発データを意図せず消さずに負荷用データを用意できる

#### Acceptance Criteria
1. The Scale Data Seed shall 開発用の少数デモデータを投入する既存手順とは区別できる、規模データ専用の実行入口を提供する
2. When 計測担当が規模データ投入を実行する, the Scale Data Seed shall 開発用シード実行時に行われるようなデータベース全体の全表消去を、その投入の一部として行わない
3. The Scale Data Seed shall 規模データ投入の実行方法を、オペレータが手順として辿れる形で示す

### Requirement 2: 計測専用ワークスペースと利用資格
**Objective:** As a 計測担当, I want 負荷計測専用のワークスペースとログイン手段を得る, so that 一覧 API をワークスペース付きで再現可能に叩ける

#### Acceptance Criteria
1. When 計測担当が規模データ投入を実行する, the Scale Data Seed shall 負荷計測専用として識別できるワークスペースを用意する（新規作成、または既存の専用ワークスペースの再利用）
2. When 規模データ投入が成功する, the Scale Data Seed shall そのワークスペースに所属し、アプリケーションへログインできる計測用アカウントを利用可能にする
3. When 規模データ投入が成功する, the Scale Data Seed shall 後続計測が必要とするワークスペース識別子と、計測用アカウントの利用に必要な情報をオペレータが確認できる形で示す
4. The Scale Data Seed shall 投入後のワークスペースが、既存プロダクトのワークスペース不変条件（端末の開発段階の充足を含む）を満たした状態であるようにする

### Requirement 3: 件数指定によるタスク規模の再現
**Objective:** As a 計測担当, I want 投入するタスク件数を指定する, so that 数千件からより大きい規模まで同じ手順で再現できる

#### Acceptance Criteria
1. When 計測担当が規模データ投入を実行する, the Scale Data Seed shall オペレータが指定したタスク件数（またはそれに相当する規模パラメータ）に従い、専用ワークスペース内にその件数のタスクが一覧取得で見える状態にする
2. If 計測担当が件数を指定せずに投入を実行する, then the Scale Data Seed shall 文書化された既定の件数を用いるか、件数未指定を拒否して投入を行わないのいずれかとし、曖昧な件数のまま成功扱いにしない
3. When 計測担当が同一の専用ワークスペース向けに規模データ投入を再度実行する, the Scale Data Seed shall そのワークスペース内の規模投入対象データが、指定（または既定）件数に対応した再現可能な状態になるよう整える（件数の意図しない累積増加を残さない）
4. The Scale Data Seed shall 少なくとも、一覧 API の負荷再現で問題となった件数帯（数千件）を指定可能な範囲に含める

### Requirement 4: 一覧・カレンダー負荷に足るデータ形状
**Objective:** As a 計測担当, I want 投入データが一覧およびカレンダー利用に近い形である, so that 実運用に近い負荷を再現できる

#### Acceptance Criteria
1. When 規模データ投入が成功する, the Scale Data Seed shall 専用ワークスペースのタスク一覧取得で、指定件数に応じた多数のタスクが返る状態にする
2. When 規模データ投入が成功する, the Scale Data Seed shall 投入タスクのうち十分な割合に終了予定日を付与し、カレンダー表示向けのデータ量再現に使えるようにする
3. Where 案件などタスク以外の関連データが投入結果の利用に必要な場合, the Scale Data Seed shall それらを専用ワークスペース内に限って用意する
4. The Scale Data Seed shall ソフトデリート済みのみの件数水増しなど、通常の一覧に現れない行だけで指定件数を満たしたことにしない

### Requirement 5: 専用範囲の掃除
**Objective:** As a 計測担当, I want 規模データだけを片付けられる, so that 計測後に共有 DB を過度に汚したままにしない

#### Acceptance Criteria
1. The Scale Data Seed shall 専用ワークスペースに紐づく規模データを取り除くための、オペレータ向け掃除手段を提供する
2. When 計測担当が規模データの掃除を実行する, the Scale Data Seed shall データベース全体の全表消去に頼らず、専用ワークスペース範囲の削除として効果を持てる
3. When 規模データの掃除が成功する, the Scale Data Seed shall その専用ワークスペース向けの一覧取得で、規模投入分のタスクが残っていない状態にする
4. The Scale Data Seed shall 掃除手段の実行方法を、オペレータが手順として辿れる形で示す

### Requirement 6: 後続計測との前提共有
**Objective:** As a 計測担当, I want 投入結果の要点が残る, so that 負荷ハーネスと性能改善が同じデータ前提を使える

#### Acceptance Criteria
1. When 規模データ投入が成功する, the Scale Data Seed shall 少なくとも次をオペレータが後から参照できる形で残すか表示する: 専用ワークスペース識別子、投入タスク件数、計測用アカウントの利用方法
2. The Scale Data Seed shall `api-load-harness` および `list-api-performance` が参照すべきデータ前提（専用ワークスペース上の規模タスク）を、本仕様の成果として一貫して提供する
3. The Scale Data Seed shall 負荷シナリオの中身・閾値・一覧 API の改善内容自体は定義しない

### Requirement 7: 共有 DB 上の衝突に関するオペレータ注意
**Objective:** As a 計測担当, I want 規模データが消える／他手順と衝突する条件を知る, so that 計測結果の前提崩れを避けられる

#### Acceptance Criteria
1. The Scale Data Seed shall 既存の開発用シードや E2E 用の全表リセットを実行すると規模データも消える旨を、オペレータ向け手順に明記する
2. The Scale Data Seed shall 規模データ投入・掃除を、通常の自動テスト実行と同時に同じ共有 DB へ向けないよう注意を手順に含める
3. The Scale Data Seed shall 本番環境や共有ステージングへ無秩序に規模データを投入しない旨の注意を手順に含める
