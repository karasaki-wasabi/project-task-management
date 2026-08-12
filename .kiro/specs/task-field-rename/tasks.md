# Implementation Plan

- [ ] 1. 基盤: スキーマとマイグレーション
- [x] 1.1 詳細・終了予定日・既定詳細の物理列を改名し、生成列を付け替える
  - Prisma のフィールド名と `@map`、先頭コメントを新識別名へ更新する
  - 手書きマイグレーションで、生成列と一意インデックスを落としてから列をリネームし、`scheduled_end_date` 参照の生成列と一意制約を付け直す
  - 適用後に生成式が新列を参照していることを確認する
  - 開始予定日の列や公開キーは追加しない
  - 観測可能: 既存行の本文と終了予定日が新列名で読め、テンプレート生成の一意制約が維持される
  - _Requirements: 1.1, 2.1, 3.1, 5.1, 5.2, 5.3, 6.1, 6.2_

- [x] 1.2 シードを新識別名へ追従させる
  - 手動シードが投入するタスクとテンプレートのキーを新名にする
  - 観測可能: シード再投入後、タスクの詳細・終了予定日とテンプレートの既定詳細が新キーで取得できる
  - _Depends: 1.1_
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 2. バックエンド: タスク公開契約の改名
  - 型・検証・サービス・リポジトリの識別名を `detail` / `scheduledEndDate` に揃える
  - 応答に旧名 `memo` / `scheduledDate` を含めない
  - 旧キー `memo` のみの更新では詳細本文が変わらないことをテストする
  - 観測可能: 作成・更新・取得の応答が `detail` と（値がある場合）`scheduledEndDate` を返し、`memo` / `scheduledDate` を含まない
  - _Depends: 1.1_
  - _Boundary: tasks module_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3_

- [ ] 3. バックエンド: 繰り返しテンプレートの改名
- [x] 3.1 (P) テンプレートの登録・更新・取得を `defaultDetail` に揃える
  - 型・検証・サービス・リポジトリを `defaultDetail` に揃える
  - 応答に旧名 `defaultMemo` を含めない
  - 観測可能: テンプレートの登録・取得応答が `defaultDetail` を返し、`defaultMemo` を含まない
  - _Depends: 1.1_
  - _Boundary: recurrence module_
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3.2 テンプレート生成タスクへの詳細・終了予定日の引き継ぎを新名にする
  - 生成時に既定詳細をタスクの `detail` へ、算出した終了予定日を `scheduledEndDate` へ渡す
  - 観測可能: 生成されたタスクの詳細がテンプレートの既定詳細と一致し、終了予定日が新キーで保持される
  - _Depends: 2, 3.1_
  - _Boundary: recurrence module_
  - _Requirements: 2.3, 3.4_

- [x] 4. バックエンド横断検証
  - テンプレート・案件・終了予定日の活性一意制約が新列でも成立することを確認する
  - 横断の検証テストが新キーを期待するよう更新する
  - 観測可能: 該当の統合テストが新識別名で成功する
  - _Depends: 2, 3.2_
  - _Requirements: 2.2, 5.4_

- [ ] 5. フロントエンド: API 境界と画面文言
- [ ] 5.1 (P) API クライアントの型と呼び出しを新識別名へ揃える
  - タスクとテンプレートの型・ペイロードを新名にする
  - 観測可能: クライアント型に旧名 `memo` / `scheduledDate` / `defaultMemo` が残らない
  - _Depends: 1.1_
  - _Boundary: useApiClient_
  - _Requirements: 1.1, 2.1, 3.1_

- [ ] 5.2 (P) タスク詳細モーダルと一覧作成フォームの文言を揃える
  - 「詳細」表示と「メモ」を含まない空表示にする
  - 関連する操作対象の識別子を新名に合わせる
  - 観測可能: モーダルと一覧フォームに「メモ」「詳細(メモ)」が現れない
  - _Depends: 5.1_
  - _Boundary: TaskDetailModal, tasks index_
  - _Requirements: 4.1, 4.2_

- [ ] 5.3 (P) 繰り返しテンプレート画面の既定詳細文言を揃える
  - フォームと詳細表示を「既定詳細」にし、関連識別子を新名にする
  - 観測可能: 繰り返し画面に「既定メモ」が現れない
  - _Depends: 5.1_
  - _Boundary: RecurrenceFormModal, RecurrenceDetailModal_
  - _Requirements: 4.3_

- [ ] 5.4 (P) カレンダーの終了予定日参照を新プロパティ名へ揃える
  - helpers・ページコメント・E2E 内の識別子を更新する（フィールド名ラベルは新設しない）
  - 案件の開始日・終了日文言は変更しない
  - 観測可能: カレンダー helpers のテストが `scheduledEndDate` で従来どおり成功する
  - _Depends: 5.1_
  - _Boundary: calendar helpers, calendar page, calendar e2e_
  - _Requirements: 2.4, 4.4, 4.5, 5.4_
