# Research & Design Decisions

## Summary
- **Feature**: `task-delivery-management`
- **Discovery Scope**: New Feature(greenfield)。ソースコード・技術スタックともに未確定の状態からの設計。
- **Key Findings**:
  - 固定間隔(毎日/毎週/毎月)の繰り返しは iCalendar RFC 5545 準拠の `rrule` ライブラリで十分にカバーできる。自作の日付計算は不要。
  - 納品日を起点としたオフセット型の繰り返し(見積書作成など)は RRULE の対象外(納品という業務イベントに従属する単発計算)であり、シンプルな日付演算で実装する方が過剰設計を避けられる。
  - Fastify + Prisma + TypeScript は型安全な REST API 構築の定番構成であり、steering(tech.md)の候補方針と整合する。DBは当初PostgreSQLを候補としたが、後にMySQLへ変更した(詳細は本ファイル後半のDecision参照)。
  - AWS App Runner + RDS の連携は実績が多いが、App Runner 単体にはジョブスケジューラ機能がないため、定期実行(繰り返しタスク生成)のトリガー方式はインフラ側の別途検討事項とする。

## Research Log

### Node.jsバージョン選定(2026年7月時点)
- **Context**: 初期設計でNode 20を候補としたが、ユーザーからEOLの指摘を受け再調査
- **Sources Consulted**: [endoflife.date: Node.js](https://endoflife.date/nodejs), [Node.js 26.0.0 (Current)](https://nodejs.org/en/blog/release/v26.0.0)
- **Findings**: 2026年7月24日時点でサポート対象はNode 22(Maintenance LTS)、Node 24(Active LTS)、Node 26(Current、2026年5月リリース、LTS昇格は2026年10月予定)。Node 20は既にEOL。
- **Implications**: 本番運用の安定性を優先し、Active LTSであるNode 24を採用する(Node 26はCurrentでLTS未昇格のため見送り)。

### フロントエンドフレームワーク(Nuxtバージョン)
- **Context**: ユーザーがVueに慣れているためNuxt3.x指定を希望したが、Nuxt3系のEOL状況を確認
- **Findings**: Nuxt3系は2026-01-31にEOL済み。現行の保守バージョンはNuxt4.x。
- **Implications**: Nuxt 4.x + Vue 3を採用。steeringのS3+CloudFront静的配信方針に合わせ、`nuxi generate`による静的SPAビルド(`ssr: false`)とする。

### バックエンドWebフレームワーク(Fastify vs Express)
- **Context**: 初期設計でFastifyを提案したが、Expressとの比較検討をユーザーから要望された
- **Sources Consulted**: [Express vs Fastify (2026) — Stackwise](https://stackwise.info/compare/express-vs-fastify), [Fastify Alternatives 2026 — Encore](https://encore.dev/articles/fastify-alternatives)
- **Findings**: Fastifyはスループット・型安全性(ルートごとのジェネリクス)・組み込みスキーマバリデーションで優位。Expressはエコシステム規模(週間3000万DL超)・情報量・学習コストの低さで優位。
- **Implications**: ユーザーは型安全性と仕様駆動開発との親和性を優先し、Fastifyを最終選定。Expressの資料量の少なさは、実装フェーズでのつまずきリスクとして記録しておく。

### 非営業日を考慮した繰り返しタスクの繰り越し
- **Context**: ユーザーフィードバック「定例会などの繰り返しタスクは祝日で次の日に繰越などの例外があり得る」「ずらし方も設定できるとよい(そのまま登録/登録しない/次営業日/前営業日)」「外部の祝日APIとの連携がほしい。トリガーは手動でよい」
- **Sources Consulted**: [Holidays JP API](https://holidays-jp.github.io/), [山田ツール 日本の祝日API](https://yamada-tools.jp/docs/holiday-api)
- **Findings**: 日本の祝日データを無料・無認証で取得できるJSON APIが複数存在する(Holidays JP APIはGoogleカレンダー由来のデータをJSON/CSVで提供)。更新頻度は低い(祝日改定は年数回程度)ため、定期ポーリングの必要性は低い。
- **Implications**: 非営業日マスタは手動登録に加え、ユーザーが明示的に操作した時のみ外部APIから取得・反映する(`HolidaysService.syncFromExternalApi`)。定期的な自動ポーリングは実装しない。繰り返しタスクテンプレートは`rolloverOnNonBusinessDay`のboolean案から、`nonBusinessDayPolicy`(そのまま登録/登録しない/次営業日/前営業日の4値)へ変更し、要件8.3〜8.7として反映した。

### 繰り返しタスクの実装方式
- **Context**: 要件5(固定間隔・納品連動の繰り返しタスク)をどう実装するか
- **Sources Consulted**: [rrule (npm)](https://www.npmjs.com/package/rrule), [rrule GitHub](https://github.com/jkbrzt/rrule), [Managing Recurring Events in Node.js with rrule](https://blog.cybermindworks.com/post/managing-recurring-events-in-node-js-with-rrule)
- **Findings**: `rrule` は TypeScript 実装済みで daily/weekly/monthly 等の頻度指定・次回発生日計算を型安全に扱える。最新版は数年更新がないが、RFC 5545 という枯れた標準に基づくため機能追加の必要性が低く、リスクは限定的。
- **Implications**: 固定間隔の繰り返しタスク生成には `rrule` を採用(build-vs-adopt: adopt)。納品連動(オフセット)側は「納品日 - Nオフセット日数」を計算するだけであり、RRULE化すると過剰設計になるため専用の軽量ロジックとする。

### バックエンド構成
- **Context**: tech.md で「候補: TypeScript / Go」「Next.js + Express/Fastify、または Go製API」と未確定だった技術選定
- **Sources Consulted**: [Prisma × Fastify](https://www.prisma.io/fastify), [Fastify Prisma REST API boilerplate](https://github.com/remediios/fastify-prisma-rest-api)
- **Findings**: Fastify + Prisma + Zod + TypeScript の組み合わせは型安全な検証・ORM・スキーマ管理を一貫して提供でき、小〜中規模API向けの定番パターン。
- **Implications**: 本フィーチャーの技術スタックとして Node.js + TypeScript + Fastify + Prisma + MySQL を採用する(DBの最終選定は後述のDecision参照)。Go案は当面見送り(学習目的のCI/CD・AWS段階デプロイと相性の良いエコシステムを優先)。

### インフラ連携(App Runner + RDS)
- **Context**: steering(tech.md)記載の段階的AWSデプロイ方針(S3/CloudFront → App Runner → RDS → ECS Fargate)との整合確認
- **Sources Consulted**: [App Runner + RDS 実践例](https://medium.com/@things-to-know/apprunner-rds-the-easiest-way-to-avoid-deployment-struggles-8c735a803c51), [AWS re:Post: App Runner and RDS](https://repost.aws/questions/QUnm9sWqVHTyKYX_UOKnpmHg/app-runner-and-rds)
- **Findings**: App Runner は VPCコネクタ経由でRDSに接続可能。ただしApp Runner自体には定期実行(スケジューラ)機能がないため、繰り返しタスクの自動生成トリガーは別途(EventBridge Scheduler等)の検討が必要。
- **Implications**: 本設計では「いつ生成処理を呼び出すか」というインフラ的トリガーの選定を対象外とし、生成ロジック自体をトリガー非依存のサービス関数として定義する(Open Questionとして記録)。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| レイヤードアーキテクチャ(Controller-Service-Repository) | ルーティング/業務ロジック/永続化を層で分離 | シンプルで小〜中規模APIに適合、型安全なレイヤー間契約を定義しやすい | ドメインが複雑化すると層が肥大化する可能性 | 本フィーチャーの規模・チーム(個人開発)に見合う |
| ヘキサゴナル(ポート&アダプター) | ドメインコアを外部依存から完全分離 | テスタビリティが高い、将来の技術差し替えに強い | 初期のボイラープレートが多く、個人学習フェーズでは過剰 | 現時点では不採用。将来ドメインが複雑化した際に再検討 |

## Design Decisions

### Decision: 繰り返しタスクの実装ライブラリ
- **Context**: 固定間隔の繰り返しタスク生成をどう実装するか
- **Alternatives Considered**:
  1. `rrule` ライブラリを採用
  2. 独自の日付計算ロジックをスクラッチ実装
- **Selected Approach**: `rrule` を採用し、`RecurrenceService` の内部実装として利用する
- **Rationale**: RFC 5545 という標準に基づき、境界値(月末日指定など)のバグを避けられる
- **Trade-offs**: ライブラリの更新頻度が低い点はリスクだが、枯れた仕様のため許容
- **Follow-up**: 実装時に `rrule` の現行バージョンでの型定義を確認する

### Decision: タスク分割は階層化機能を再利用する
- **Context**: 要件2.1(親子階層)と要件2.3(タスク分割)は別々の機能に見えるが、根は同じ「1つのタスクを複数の粒度に分解する」という要求
- **Alternatives Considered**:
  1. 階層化と分割を独立したデータ構造・APIとして実装
  2. 分割を「元タスクを親化し、分割後のタスクを子タスクとして生成する」処理として階層化機能の上に一般化する
- **Selected Approach**: 2を採用。`Task.parentTaskId` の自己参照構造のみを設け、分割は「子タスク生成 + 元タスクの親子関係付与」というAPI操作として実装する
- **Rationale**: データモデルとAPIを一本化でき、実装・レビューコストを抑えられる(Generalization)
- **Trade-offs**: 分割の「元タスクの入力欄が空になる」等のUI体験は別途検討が必要
- **Follow-up**: 分割後に親タスク自身を独立した作業単位として残すか、進捗表示のみに使うかはタスクフェーズで詳細化

### Decision: 納品連動の繰り返しタスクはグローバルテンプレートとして扱う
- **Context**: ユーザーフィードバック「納品日ごとの繰り返しタスクも設定できると嬉しい(見積書作成、納品ドキュメント作成など)」
- **Alternatives Considered**:
  1. 納品ごとに毎回手動でテンプレートを紐付ける
  2. テンプレートを1つ登録すれば、以後作成される全ての納品に自動適用される
- **Selected Approach**: 2を採用。`RecurringTaskTemplate(kind=DELIVERY_RELATIVE)` は特定の納品に紐付かないグローバル設定とし、新しい納品が登録されるたびにオフセット日数からタスクインスタンスを自動生成する
- **Rationale**: ユーザーの要望が「毎回同じ種類のタスクを作り直したくない」という点にあるため、納品作成時の自動生成が最も手間を減らせる
- **Trade-offs**: 特定の納品だけテンプレートを除外したい場合の運用は今回スコープ外(手動削除で対応)
- **Follow-up**: 除外指定が必要になった場合は別途要件化する

### Decision: 消化ペースの見積もりは単純移動平均とする
- **Context**: 要件6.3(今後の消化数の目安の表示)
- **Alternatives Considered**:
  1. 直近数期間の完了タスク数の単純移動平均
  2. 回帰分析等の高度な予測モデル
- **Selected Approach**: 1を採用。直近4期間の完了タスク数の平均を「今後の目安」として表示する。過去実績が2期間未満の場合は目安を表示しない
- **Rationale**: 個人利用規模のデータ量では高度な予測モデルの効果が薄く、実装コストに見合わない(Simplification)
- **Trade-offs**: 季節性やスパイクを考慮できないが、要件が求める「大まかな目安」には十分
- **Follow-up**: 実運用でずれが大きい場合に加重平均等へ改善余地あり

### Decision: 繰り返しタスクの既定メモはコピー方式とし、参照方式にしない
- **Context**: ユーザーフィードバック「共通で全体的に適用する情報と、1回きりの情報とを分けて保存できたほうがよい」(例: 定例会の会議URLが回によって変わる)
- **Alternatives Considered**:
  1. テンプレートの`defaultMemo`を各タスクインスタンスが常に参照する(インスタンス側では編集不可)
  2. 生成時に`defaultMemo`をインスタンスの`memo`へコピーし、以降はインスタンスごとに独立して編集可能にする
- **Selected Approach**: 2を採用
- **Rationale**: 「1回だけURLが変わる」という要望に応えるには、生成後の個別編集が必須。参照方式では実現できない
- **Trade-offs**: テンプレートの`defaultMemo`を後から変更しても、既に生成済みのインスタンスには反映されない(新規生成分のみに適用)
- **Follow-up**: 既存インスタンスへの一括反映が必要になった場合は別途要件化する

### Decision: 全テーブル共通で論理削除(deleted_at)を採用する
- **Context**: ユーザーフィードバック「各スキーマにはcreated_atだけでなくupdated_atの最終更新日時、deleted_atによる論理削除を保存するようにしたい」
- **Alternatives Considered**:
  1. 物理削除(DELETE文)のみ
  2. 論理削除(`deleted_at`列)を全テーブル共通で採用し、一覧・詳細取得は既定で除外
- **Selected Approach**: 2を採用。Repository層に共通のソフトデリート実装(`shared/soft-delete.repository.ts`)を置き、各モジュールが個別実装しないようにする
- **Rationale**: `ThroughputService`の期間集計は過去の完了タスクを参照するため、物理削除すると過去実績が変動してしまう。誤操作からの復旧余地を残す観点でも論理削除が適する
- **Trade-offs**: 論理削除済みレコードがDBに残り続けるため、長期的にはデータ量が増える。今回の個人利用規模では許容範囲と判断
- **Follow-up**: 物理削除(完全消去)やデータ保持期間ポリシーが必要になった場合は別途要件化する

### Decision: ログ計測はPino構造化ログ+CloudWatch Logsに留め、専用基盤は導入しない
- **Context**: ユーザーから「不具合発生時に追えるようにする」ためのログ計測を学習目的で実装したいとの要望。大規模な仕組みは不要という前提
- **Alternatives Considered**:
  1. ELK Stack / Datadog等の専用ログ集約基盤を導入
  2. Pinoによる構造化ログ出力 + App Runner標準のCloudWatch Logs転送のみ
- **Selected Approach**: 2を採用
- **Rationale**: 個人〜小規模利用の学習用システムでは専用基盤は過剰投資。App Runnerは追加設定なしでstdout/stderrをCloudWatch Logsへ転送するため、構造化ログさえ出力しておけばCloudWatch Logs Insightsで十分検索・分析できる(Simplification)
- **Trade-offs**: 高度な可視化(ダッシュボード、アラート)は将来別途検討が必要
- **Follow-up**: チーム利用規模に発展した場合、Loki+GrafanaやOpenSearch等への移行を別スペックで検討する

### Decision: ローカル開発環境をDocker Compose化する
- **Context**: 開発ホストのNode.jsが20.12.2であり、design.mdで採用したNode 24と不一致。加えてユーザーが後日リポジトリをWindows側からWSL側へ移動する予定がある
- **Alternatives Considered**:
  1. ホストにnvm等でNode 24を直接インストールして開発する
  2. backend/frontend/mysqlをDocker Compose上のコンテナとして起動し、ホストのNode.jsバージョンに依存しない開発環境にする
- **Selected Approach**: 2を採用。`docker-compose.yml`でbackend/frontend/mysqlの3サービスを定義し、backend/frontendは開発用(bind mount + ホットリロード)と本番ビルド用のステージを持つマルチステージDockerfileとする
- **Rationale**: ホスト側のNode.jsバージョン管理から独立できるほか、WSLへの移動後も同じ`docker compose up`で開発環境を再現できる(相対パス構成のため)
- **Trade-offs**: Docker Desktop起動が前提になる、初回ビルド時間がかかる
- **Follow-up**: 本番のコンテナ/デプロイ構成そのものはOut of Boundaryのまま。frontendのprodステージは静的ビルド専用とし、常駐コンテナとしては運用しない(steeringのS3+CloudFront方針)

### Decision: DBをPostgreSQLからMySQLへ変更する
- **Context**: ユーザーからMySQL/MariaDBおよびMongoDBの実務経験はあるがPostgreSQLの経験は薄く、今後の実務でもPostgreSQLを使う可能性が低いとのフィードバック。AWSホスティングを前提に最適なDBを再検討した
- **Alternatives Considered**:
  1. PostgreSQLを継続採用
  2. MySQLへ変更
  3. MongoDBへ変更
- **Selected Approach**: 2(MySQL)を採用
- **Rationale**:
  - AWS RDSはMySQL/MariaDB/PostgreSQLを同格でサポートしており、AWSホスティングを理由にPostgreSQLを選ぶ必然性はない
  - MySQLはユーザーの実務経験と直結し、学習効果の実務転用性が高い。将来Auroraへ移行する場合もAurora MySQL互換という選択肢がある
  - Prisma ORMはMySQLを問題なくサポートしており、ORM変更は不要(datasourceのproviderを`mysql`に変更するのみ)
  - MongoDB(ドキュメント指向)は、タスクの親子階層・外部キー参照・必須タスク数の集計など本フィーチャーのリレーショナルな性質と相性が悪く不採用
- **Trade-offs**: PostgreSQLが得意とする部分ユニークインデックス(`WHERE`句付きUNIQUE INDEX)がMySQLには存在しないため、`non_business_days`テーブルの「論理削除済みを除いた日付一意制約」は生成カラム(`STORED GENERATED COLUMN`)を使った代替実装が必要になった(design.md Physical Data Model参照)
- **Follow-up**: Prismaのmigration生成時にMySQLの生成カラム構文(`GENERATED ALWAYS AS (...) STORED`)がサポートされているか実装時に確認する

### Decision: カンバンのドラッグ&ドロップは既定でHTML5標準APIを採用し、UX次第でライブラリ導入も許容する
- **Context**: 開発段階マスタとカンバン管理(要件12)の追加にあたり、カード移動UIの実装方式を検討した(light discovery、既存フロントエンドはNuxt 4 SPA、外部UIライブラリは未導入)。当初はHTML5標準APIのみに固定する案としたが、ユーザーから「デザイン次第ではライブラリ導入も検討してほしい」とフィードバックがあり、条件付きの判断に見直した
- **Alternatives Considered**:
  1. ブラウザ標準のHTML5 Drag and Drop API(`draggable`属性 + `dragstart`/`dragover`/`drop`イベント)
  2. `vue-draggable-plus`(内部で`SortableJS`を利用、Vue 3対応、ドラッグ中のプレビュー・アニメーション・タッチ操作をサポート)等のVue向けドラッグ&ドロップライブラリを新規導入
- **Selected Approach**: 既定は1(build)、ただし以下の判断基準に該当する場合は2(adopt)へ切り替えてよい
- **切り替え判断基準**(実装時にUI/UXデザインを見て判断する):
  - ドラッグ中に元の位置にプレースホルダーを表示する、カードが滑らかに追従するなど、標準APIの既定の見た目(ゴースト画像・カクつき)では実現しづらい視覚表現が必要になった場合
  - タッチデバイス(スマートフォン・タブレット)での操作性が要件として重要になった場合(HTML5 Drag and Drop APIはタッチ操作のネイティブサポートが弱い)
  - 同一列内の並び替えなど、列間移動以外のドラッグ操作が追加で必要になった場合
- **Rationale**: 実装着手前の設計段階では、実際のUI(見た目・動き)を確定できないため、最小コストな標準APIから始めつつ、実装中に判断基準へ該当したら軽量ライブラリへ切り替えられる余地を残す。過剰な先読みで最初からライブラリを導入する(YAGNI違反)ことも、UXの問題を見て見ぬふりして標準APIに固執することも避ける
- **Trade-offs**: 切り替え可能性を残すことで、実装時に判断コストが発生する。ライブラリを採用した場合は`frontend/package.json`に新規依存が増える
- **Follow-up**: 実装時にどちらを選んだか、選んだ理由を`tasks.md`の`## Implementation Notes`に記録する(このプロジェクトの既存の判断ログ運用パターンを踏襲)

### Decision: 開発段階マスタの削除は既存のdeliveries削除パターンを再利用する
- **Context**: 開発段階マスタ削除時、当該段階が設定されていたタスクの扱いをどう実装するか(要件12.5)
- **Alternatives Considered**:
  1. `deliveries`削除時の`Task.deliveryId`null更新と同じトランザクションパターンを`development-stages`削除でも踏襲する
  2. 新しいイベント駆動の仕組み(削除イベントを発行しTasksServiceが購読する)を導入する
- **Selected Approach**: 1
- **Rationale**: 既に承認済みの設計(`deliveries.repository.ts`の`delete`)が同一のトランザクション内FK null更新パターンとして存在し、これを再利用すれば新しい非同期メッセージング基盤を導入せずに済む(design.md Architecture Integration「Existing patterns preserved」参照)
- **Trade-offs**: なし(既存パターンの純粋な再利用)
- **Follow-up**: なし

## Risks & Mitigations
- リスク: 繰り返しタスク生成のトリガー(スケジューラ)基盤が未定 — 生成ロジックをトリガー非依存の関数として設計し、後からcron/EventBridge等を選択可能にする
- リスク: `rrule` のメンテナンス頻度低下 — RFC標準準拠のため仕様変更リスクは低いが、実装時に代替ライブラリ(`simple-rrule`等)への切り替えパスを確保する
- リスク: 納品連動テンプレートの自動生成が意図しない大量タスクを生む可能性 — テンプレートの有効/停止フラグと、生成後のインスタンス個別削除を許可する
- リスク: HTML5 Drag and Drop APIのPlaywrightでの自動テストは、ネイティブのマウスイベントシーケンス(`dragstart`→`dragover`→`drop`)を明示的にディスパッチする必要があり、通常のクリック操作より実装コストが高い — E2E実装時にPlaywrightの`dragTo()`または手動イベントディスパッチのいずれかを検証し、`.kiro/steering/testing.md`に手順を記録する
- リスク: 開発段階マスタが空(1件も登録されていない)状態でカンバン画面を開くと表示する列が存在しない — フロントエンドはこの状態で「開発段階が未登録です」等の空状態を表示する(要件12にはこの文言までは規定されていないため、実装時にUI文言を決定する)

## References
- [rrule (npm)](https://www.npmjs.com/package/rrule) — 固定間隔繰り返しの標準ライブラリ候補
- [Prisma × Fastify](https://www.prisma.io/fastify) — バックエンド構成の参考
- [AWS re:Post: App Runner and RDS](https://repost.aws/questions/QUnm9sWqVHTyKYX_UOKnpmHg/app-runner-and-rds) — インフラ連携時の考慮点
- [endoflife.date: Node.js](https://endoflife.date/nodejs) — Node.jsバージョンのサポート状況確認
- [Express vs Fastify (2026) — Stackwise](https://stackwise.info/compare/express-vs-fastify) — フレームワーク比較
