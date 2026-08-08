# Implementation Plan

## Implementation Notes

- migrate reset 時は `non_business_days.date_active_key` と Task 活性一意キーの STORED GENERATED COLUMN + UNIQUE を migration.sql 手編集で維持([[local-dev-pitfalls]] #5)。`prisma migrate dev` で drift DROP しない
- Prisma TX クライアントを CaseService → RecurrenceService.applyToCase → TasksService.create/delete へ渡す(同一TX)
- `templateOperations`: 省略=フル候補、`[]`=適用なし、非部分集合=400
- UI は research.md の Claude Design 確定に従う
- `product.md` / `tech.md`(rrule削除)の更新は本スペック範囲(Req 10 / design Boundary)
- MySQL は STORED GENERATED の基列に ON DELETE/UPDATE を付けられないため、`tasks.case_id` / `source_template_id` の FK は RESTRICT(手編集 migration コメント参照)
- `applyToCase` は実装済みだが Prisma TX クライアント未配線。タスク4で CaseService → apply → tasks create/delete へ TX を通す

- [x] 1. Foundation: スキーマとマイグレーション
- [x] 1.1 RecurringTaskTemplate / Task スキーマを案件連動のみへ更新する
  - `CaseRelativeAnchor` を追加し、テンプレートに `caseAnchor`・非負の `caseOffsetDays` を必須化する
  - `kind` / `intervalUnit` / `intervalValue` / `boundCaseId` と `RecurrenceKind` / `IntervalUnit` を削除する
  - Task に `sourceAnchor` を追加し、旧 `@@unique([sourceTemplateId, scheduledDate])` をやめ、活性行のみ一意となる生成列(+ UNIQUE)を schema/コメントで表現する
  - 観測可能な完了状態: `prisma validate` が通り、生成 Client に `caseAnchor` / `sourceAnchor` / `CaseRelativeAnchor` が現れ、fixed_interval 関連型が消える
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 5.3_

- [x] 1.2 単一 init マイグレーションを再生成し、生成列を手編集して DB に適用する
  - 既存 migrations を整理し init を再生成する。Task 活性一意キーと `date_active_key` を SQL 手編集で入れる
  - `migrate reset` で開発 DB に適用する
  - 観測可能な完了状態: 活性 Task の同一 (template, case, scheduledDate) は拒否され、論理削除後の同キー再作成は成功する統合テストまたは手動検証ができる
  - _Requirements: 1.1, 5.5_
  - _Depends: 1.1_

- [x] 2. Core: 繰り返しテンプレート API(固定間隔廃止・再開・起点4種)
- [x] 2.1 登録・一覧・停止・再開・削除 API を案件連動のみに更新する
  - generate-due / rrule 依存を削除する。登録入力は起点4種・非負オフセット・非営業日ポリシー・既定メモとする
  - `onCaseCreated` / `onCaseEndDateChanged` など無確認の自動適用入口を RecurrenceService から削除する(呼び出し側の切替はタスク4)
  - resume で isActive=true のみ行い、既存案件への遡及生成はしない
  - 観測可能な完了状態: fixed_interval 登録と generate-due が存在せず、resume 後は新規生成対象に戻るが既存案件は走査されないことをテストで確認できる。旧自動適用メソッドがサービス公開面に残っていない
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8_
  - _Boundary: RecurrenceService_
  - _Depends: 1.2_

- [x] 2.2 起点4種の予定日計算と有効テンプレからの生成ヘルパを実装する
  - case_start/end と period_month_* の方向固定オフセット、期間外スキップ、raw 後に非営業日ポリシー、skip 時は生成しない
  - 生成時に caseId・既定メモ・sourceAnchor を載せ、有効テンプレのみ使う
  - 生成後にインスタンスメモだけを変更しても、テンプレート既定メモや他インスタンスのメモが変わらないことをテストで確認する
  - 観測可能な完了状態: 4起点と期間外スキップ・NBD・メモ独立性のユニット/統合テストが green
  - _Requirements: 2.3, 5.1, 5.6, 5.7, 5.8, 6.1, 6.2, 6.3_
  - _Boundary: RecurrenceService_
  - _Depends: 2.1_

- [x] 3. Core: 案件への明示適用(applyToCase)と候補構築
- [x] 3.1 (P) buildCaseTemplateApplyCandidates 純関数を backend に置く
  - 旧→新日付から start/end/month の generate/regenerate/delete 候補を返す
  - 作成時は旧日付 null。遷移表は design の適用操作表どおり。候補ゼロ遷移も含めて固定する
  - 観測可能な完了状態: 遷移ごとの候補キー(ゼロ件含む)をユニットテストで固定できる
  - _Requirements: 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12_
  - _Boundary: caseTemplateApplyCandidates_
  - _Depends: 1.2_

- [x] 3.2 applyToCase で起点別の生成・削除・生成し直しを実行する
  - 公開 HTTP は設けず CaseService 同一 TX からのみ呼ぶ。削除は sourceAnchor+caseId、完了済み含む、手動タスク除外、論理削除
  - 停止テンプレは生成に使わず、旧生成タスクは削除対象。活性一意衝突は冪等 no-op
  - 観測可能な完了状態: 各 operation キーと手動タスク非削除・完了済み削除・停止テンプレ挙動のテストが green
  - _Requirements: 3.2, 3.3, 3.4, 5.1, 5.2, 5.3, 5.4, 5.5_
  - _Boundary: RecurrenceService_
  - _Depends: 2.2, 3.1_

- [x] 4. CaseService の無確認フックを除去し、templateOperations 付き create/update を同一 TX で行う
  - 省略=フル候補、`[]`=適用なし、非部分集合=400。適用失敗で案件行もロールバック
  - TX クライアントを apply / tasks 書き込みへ渡す
  - 観測可能な完了状態: 両方日付あり作成でテンプレタスクが付き、apply 失敗時に案件が残らないこと、`[]` で日付のみ更新できることをテストで確認できる
  - _Requirements: 3.2, 3.3, 3.4, 3.6, 4.3, 4.13_
  - _Boundary: CaseService_
  - _Depends: 3.2_

- [x] 5. Core: フロント API クライアントと候補関数の移植
- [x] 5.1 (P) useApiClient を新テンプレ契約と templateOperations に追従させる
  - fixed_interval / generateDue を削除。resume・caseAnchor 等を追加。createCase/updateCase に templateOperations を載せる
  - 観測可能な完了状態: 型チェックで旧 kind/generateDue 参照がクライアントから消え、新フィールドが型付けされる
  - _Requirements: 1.1, 1.2, 2.1, 2.7_
  - _Boundary: useApiClient_
  - _Depends: 2.1, 4_

- [x] 5.2 (P) frontend の buildCaseTemplateApplyCandidates を backend と同仕様にし、一致テストを置く
  - 同一入力で操作キーの集合と順序が一致することを検証する(候補ゼロ遷移を含む)
  - 観測可能な完了状態: 一致テストが CI で green
  - _Requirements: 4.1, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12_
  - _Boundary: caseTemplateApplyCandidates_
  - _Depends: 3.1_

- [ ] 6. Core: 案件確認 UI
- [x] 6.1 (P) CaseTemplateApplyConfirm を確定デザインどおり実装する
  - 画面A(未設定確認)、B(チェックリスト)、C(最終確認)。ネストモーダル。キャンセル/×/Esc で abort
  - 観測可能な完了状態: 3画面の切替と選択結果の返却をコンポーネントテストまたはブラウザで確認できる
  - _Requirements: 3.1, 3.5, 4.1, 4.2, 4.3, 4.4_
  - _Boundary: CaseTemplateApplyConfirm_
  - _Depends: 5.2_

- [ ] 6.2 CaseFormModal に未設定確認→create→未割当関連付けの順序を組み込む
  - 両方日付ありは確認スキップで operations 省略。片方/両方未設定は画面A。既存の関連付け再試行は維持
  - 観測可能な完了状態: 確認キャンセルで案件が作られず、作成後の関連付け失敗時は案件+テンプレが残って再試行できる
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  - _Boundary: CaseFormModal_
  - _Depends: 5.1, 6.1_

- [ ] 6.3 (P) CaseDetailModal に編集時チェックリスト→最終確認→PATCH を組み込む
  - 候補ゼロは直接保存。キャンセルは未保存。選択部分集合(空含む)を送る
  - 観測可能な完了状態: 日付変更で B/C が出て、チェック外しで日付のみ更新され、キャンセルでサーバ状態が変わらない
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13_
  - _Boundary: CaseDetailModal_
  - _Depends: 5.1, 6.1_

- [ ] 7. Core: 繰り返し設定画面と休日マスタ画面の分離・UX
- [ ] 7.1 (P) 繰り返しテンプレの Form/Detail Modal を案件連動のみ・確定デザインに更新する
  - 起点4種・非負オフセット・停止/再開/削除。固定間隔入力を持たない
  - 観測可能な完了状態: Modal 単体で登録・停止・再開・削除ができ、固定間隔フィールドが無い
  - _Requirements: 1.3, 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 8.2, 8.3_
  - _Boundary: RecurrenceFormModal, RecurrenceDetailModal_
  - _Depends: 5.1_

- [ ] 7.2 (P) /holidays 専用ページを追加し、app.vue ナビから両画面へ到達可能にする
  - 休日 CRUD・外部祝日 sync の画面を新設する。ナビリンクの所有はこのタスク(app.vue)
  - /recurrence からの休日 UI 除去は 7.3 の責務とし、このタスクは `pages/holidays` とナビ以外を触らない
  - 観測可能な完了状態: /holidays で追加削除 sync ができ、ナビに /recurrence と /holidays の両方がある
  - _Requirements: 7.1, 7.3, 7.4, 9.1, 9.2, 9.3, 9.4_
  - _Boundary: HolidaysPage, app.vue_
  - _Depends: 5.1_

- [ ] 7.3 /recurrence ページをテンプレ専用一覧に刷新し、休日 UI と固定間隔操作を除去する
  - カンバン/案件と統一感のある見た目で一覧・Modal 起動を提供する
  - 観測可能な完了状態: /recurrence に休日操作と固定間隔が無く、7.1 の Modal 経由で運用できる
  - _Requirements: 1.3, 7.1, 7.2, 8.1, 8.2, 8.3_
  - _Boundary: RecurrencePage_
  - _Depends: 7.1, 7.2_

- [ ] 8. Integration: ステアリング追従とカレンダー E2E シード置換
- [ ] 8.1 (P) product.md を案件連動のみの記載に更新し、tech.md から rrule 依存を外す
  - 「納品連動」等の旧称と固定間隔の現行能力記載を消す
  - 観測可能な完了状態: product.md / tech.md が Req 10 と design に一致する
  - _Requirements: 10.1, 10.2, 10.3_

- [ ] 8.2 (P) カレンダー等の fixed_interval / generate-due 依存シード・E2E を案件連動作成に置換する
  - 観測可能な完了状態: 関連 E2E が新モデルで green
  - _Requirements: 1.2, 3.4_
  - _Depends: 4, 7.3_

- [ ] 9. 適用・TX・候補一致・UI 主要経路の横断回帰を通す
  - design Testing Strategy の主要項目(起点計算、operations、手動タスク非削除、omit/`[]`/400、regenerate 同日再作成、FE/BE 候補一致、作成/編集確認、メモ独立性)を満たすテストが green
  - 観測可能な完了状態: バックエンド該当テストとフロント主要テスト/型チェックが通る
  - _Requirements: 1.1, 2.3, 3.6, 4.3, 5.2, 5.4, 5.8, 6.1, 6.3_
  - _Depends: 6.2, 6.3, 7.3, 8.2_
