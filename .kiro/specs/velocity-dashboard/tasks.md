# Implementation Plan: velocity-dashboard

- [ ] 1. Foundation: データモデルと共有プリミティブ
- [ ] 1.1 `Task.storyPoints`列と操作ログ用`FieldName`の追加
  - `schema.prisma`の`Task`モデルに`storyPoints Int? @map("story_points")`を追加する
  - `schema.prisma`の`FieldName` enumに`story_points`相当の値を追加する
  - `activity-log.types.ts`の`FieldName`ユニオン型に`"storyPoints"`を追加する
  - 既存の単一initマイグレーション(`*_init_domain_schema`)を再生成し、生成列(`template_case_date_active_key`等)を手編集で復元したうえで`prisma migrate reset`を適用する
  - 完了条件: `prisma migrate reset`後、`SHOW CREATE TABLE tasks`で`story_points`列が存在し、既存の生成列・UNIQUE制約が保持されていることを確認できる
  - _Requirements: 1.2, 1.4_

- [ ] 1.2 (P) 葉タスク判定フィルタの追加
  - `task.closure.ts`に`leafTaskFilter`(直接の子のうち`deletedAt`が`null`のものが0件、というPrisma `WhereInput`)を追加する
  - 完了条件: 子が全員ソフトデリート済みのタスクに対しても`leafTaskFilter`が真になることを単体テストで確認できる
  - _Requirements: 3.3_
  - _Boundary: task.closure.ts_

- [ ] 1.3 (P) 案件参照用の公開サービスメソッド追加
  - `case.service.ts`に`getById(id, workspaceId): Promise<Case | null>`を追加する(`caseRepository.findById`への薄いラッパー、業務ロジックなし)
  - 完了条件: 現在ワークスペースに属さない/存在しない`id`に対して例外を投げず`null`を返すことをテストで確認できる
  - _Requirements: 7.2_
  - _Boundary: CaseService_

- [ ] 2. Core: tasksモジュール — ストーリーポイントの入力・自動合算
- [ ] 2.1 (P) ストーリーポイントの入力型とバリデーション追加
  - `CreateTaskInput`/`UpdateTaskInput`(`task.types.ts`)に`storyPoints`を追加する(作成時は`number`任意、更新時は`number | null`任意)
  - `task.routes.ts`の作成/更新Zodスキーマに`storyPoints`検証(1以上の整数、更新時は`null`も許可)を追加する
  - 完了条件: `storyPoints`に0以下または非整数の値を送ると`POST/PATCH /api/tasks`が400を返す
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - _Boundary: task.types.ts, task.routes.ts_
  - _Depends: 1.1_

- [ ] 2.2 (P) 葉/親判定と祖先再計算の永続化ロジック追加
  - `task.repository.ts`に`hasChildren(taskId, workspaceId, client?)`を追加する(トップレベルクエリでソフトデリート済み子を自動除外)
  - `task.repository.ts`に`recalculateAncestorStoryPoints(startTaskId, workspaceId, client)`を追加する。`startTaskId`から`parentTaskId`を辿ってルートまで、各タスクの`storyPoints`を直接の子の合計(子が0件なら`null`、子はあるが全員未設定なら`0`)に更新する
  - 完了条件: 3階層以上のタスクツリーで、末端の子のポイントを変更すると祖先チェーン全体の`storyPoints`が単体テストで正しく再計算される。子を0件に戻すと当該タスクの`storyPoints`が`null`に戻る
  - _Requirements: 1.5, 2.1, 2.2, 2.3, 2.4_
  - _Boundary: task.repository.ts_
  - _Depends: 1.1_

- [ ] 2.3 TasksService: 直接入力拒否の検証と再計算トリガーの配線
  - `update`に「`storyPoints`が指定され、かつ対象タスクが1件以上の子を持つ場合は`validation_error`を返す」検証を追加する
  - `create`(`parentTaskId`指定時)・`addChild`・`splitTask`・`update`(`storyPoints`変更時・`parentTaskId`変更時)・`delete`の各経路の末尾で、影響を受ける親(`parentTaskId`変更時は旧親・新親の両方)を起点に`recalculateAncestorStoryPoints`を呼び出す(いずれも既存の`runActivityWrite`が提供するトランザクション内で実行する)
  - `update`で`storyPoints`が変化した場合、既存の`title`/`priority`等と同様に`recordFieldChanges`へ変更前後の値を渡し、操作ログ(タイムライン)に記録する。祖先再計算による自動更新は記録対象に含めない
  - 完了条件: 子を持つタスクへ`PATCH /api/tasks/:id`で`storyPoints`を指定すると400が返り、葉タスクへの`storyPoints`変更はタスク詳細のタイムラインに記録される
  - _Requirements: 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_
  - _Boundary: TasksService_
  - _Depends: 2.1, 2.2_

- [ ] 3. Core: throughputモジュール — ワークスペーススコープとポイント集計・見通し
- [ ] 3.1 ThroughputRepository: スコープ付き集計クエリの拡張
  - 全メソッドに`workspaceId`(`VerifiedWorkspaceId`)スコープを追加する
  - 既存の完了数集計を、葉タスク(`leafTaskFilter`)限定の完了ストーリーポイント合計込みの集計に拡張する(未設定ポイントは0扱い)。任意の`caseId`によるフィルタに対応する
  - 案件の未完了タスク集計メソッドを新規追加する。**未完了件数は`openTaskFilter`を全タスクに適用して算出し、未完了ポイント合計は`openTaskFilter`と`leafTaskFilter`を組み合わせて葉タスクのみを対象に合算する(親タスクの導出済み合計と子タスクの値を両方数えると二重計上になるため)**
  - 完了条件: 未完了の親タスクと、その子である未完了の葉タスクの両方が存在するデータで、未完了ポイント合計が葉タスク分のみになる(親タスク分が加算されない)ことを単体テストで確認できる
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.2, 7.1_
  - _Boundary: ThroughputRepository_
  - _Depends: 1.1, 1.2_

- [ ] 3.2 ThroughputService: スコープ付きオーケストレーションとポイントのフォーキャスト
  - `getSummary`にワークスペーススコープと任意の`caseId`スコープを組み込む(既存の期間境界計算はそのまま踏襲)
  - 完了ストーリーポイント合計の直近実績に基づくフォーキャストを、既存の完了タスク数と同型のロジック(直近実績の単純移動平均、最小期間数未満は`null`)で算出する
  - 完了条件: 実績期間数が最小期間数未満のとき、完了タスク数・完了ストーリーポイントいずれのフォーキャストも`null`になることを単体テストで確認できる
  - _Requirements: 3.1, 3.2, 3.6, 4.1, 4.2, 4.3, 6.1, 6.2, 6.3_
  - _Boundary: ThroughputService_
  - _Depends: 3.1_

- [ ] 3.3 ThroughputService: 案件見通しの算出
  - `caseId`指定時、対象案件の未完了件数・ポイント合計、残期間数(`endDate`が設定されている場合のみ、週=7日/月=30日近似)、必要期間数(`endDate`設定かつフォーキャストが算出可能かつ0より大きい場合のみ、切り上げ整数)、余力ポイント(必要期間数と同じ条件)を算出する
  - `endDate`未設定の場合は残期間数・必要期間数・余力ポイントの3項目すべてを`null`にする。`endDate`は設定されているがフォーキャストが算出不可(未算出または0)の場合は、残期間数のみ算出し必要期間数・余力ポイントを`null`にする
  - 完了条件: `endDate`未設定のケースと、`endDate`設定済みだがフォーキャストが0のケースそれぞれで、design.mdのゲーティング表通りの`null`/非`null`パターンになることを単体テストで確認できる
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - _Boundary: ThroughputService_
  - _Depends: 3.2, 1.3_

- [ ] 3.4 ThroughputRoutes: クエリパラメータとレスポンスの拡張
  - クエリスキーマに任意の`caseId`(文字列)を追加する
  - `request.currentWorkspaceId`を`ThroughputService.getSummary`へ渡すよう配線する
  - レスポンスに完了ストーリーポイント合計・ポイントのフォーキャスト・(`caseId`指定時のみ)案件見通しを含める
  - 現在ワークスペースに属さない`caseId`が指定された場合は、空集計ではなく400(`validation_error`)を返す
  - 完了条件: `GET /api/throughput?caseId=...`のレスポンスに`caseOutlook`が含まれ、`caseId`省略時は含まれないこと、他ワークスペースの`caseId`を指定すると400が返ることを確認できる
  - _Requirements: 3.1, 4.2_
  - _Boundary: ThroughputRoutes_
  - _Depends: 3.2, 3.3_

- [ ] 3.5 Integration: `/api/throughput`のワークスペーススコープ有効化
  - `app.ts`の`WORKSPACE_SCOPED_PATH_PREFIXES`に`/api/throughput`を追加し、`requireWorkspaceMember`が適用されるようにする
  - `app.routes.test.ts`・`validation.integration.test.ts`の同名`WORKSPACE_SCOPED_PREFIXES`にも同じ追加を行う
  - 完了条件: `x-workspace-id`ヘッダーなしで`GET /api/throughput`を呼ぶと400、他ワークスペースのIDを指定すると403が返る
  - _Requirements: 3.1_
  - _Boundary: app.ts_
  - _Depends: 3.4_

- [ ] 4. Core: フロントエンド消化数ダッシュボードの部品
- [ ] 4.1 (P) APIクライアントの型・メソッド拡張
  - `useApiClient.ts`の`Task`/`CreateTaskInput`/`UpdateTaskInput`に`storyPoints`を追加する
  - `ThroughputPeriod`/`ThroughputSummary`型を完了ポイント・ポイントのフォーキャスト・案件見通し込みに拡張し、`getThroughput`に任意の`caseId`引数を追加する
  - `WORKSPACE_SCOPED_PATH_PREFIXES`に`/api/throughput`を追加する
  - 完了条件: `getThroughput`呼び出し時、`/api/throughput`宛のリクエストに`x-workspace-id`ヘッダーが付与される
  - _Requirements: 1.1, 1.4, 3.1, 4.2, 6.1, 6.2, 7.1, 7.2, 7.3, 7.4, 7.5_
  - _Boundary: useApiClient.ts_
  - _Depends: 2.1, 3.5_

- [ ] 4.2 (P) 推移グラフコンポーネントの新規作成
  - `ThroughputTrendChart.vue`を新規作成し、完了タスク数(上段)・完了ストーリーポイント(下段)をそれぞれ単一軸で独立表示する2段構成のインラインSVGチャートを実装する
  - x軸(期間ラベル)は下段のみに表示し上下段を縦に整列させる。ホバー時に上下段の同じ期間を同時にハイライトする
  - 完了条件: 期間データを渡すと、棒(件数)と折れ線(ポイント)がそれぞれ独立した軸目盛りで描画され、同一期間にホバーすると上下段が同時にハイライトされる
  - _Requirements: 5.1, 5.2, 5.3_
  - _Boundary: ThroughputTrendChart_

- [ ] 4.3 (P) 案件フィルタコンポーネントの新規作成
  - `CaseFilterSelect.vue`を新規作成し、案件名の部分一致で絞り込む検索可能セレクトを実装する(`AssigneeFilter.vue`と同型のUIパターン)
  - 呼び出し側から渡された案件一覧のうち`isCompleted=true`のものを候補から除外し、先頭に固定の「全体(ワークスペース)」を表示して選択解除できるようにする
  - 完了条件: 完了済み案件を含む一覧を渡しても、検索候補・選択肢に完了済み案件が表示されない
  - _Requirements: 4.2, 4.3, 4.4, 7.6_
  - _Boundary: CaseFilterSelect_

- [ ] 4.4 (P) 案件見通しパネルコンポーネントの新規作成
  - `CaseOutlookPanel.vue`を新規作成し、未完了件数・ポイント合計、必要期間数、残期間数、余力ポイントをグリッド表示する
  - 各項目が`null`の場合は「算出不可」表示に切り替える。必要期間数と残期間数から間に合うかのバッジと進捗バーをフロントエンド側で算出して表示する
  - 完了条件: `requiredPeriods`/`marginPoints`が`null`のpropsを渡すと、該当項目が「算出不可」表示になり他の項目(未完了件数・ポイント)は通常表示のままになる
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - _Boundary: CaseOutlookPanel_

- [ ] 4.5 消化数ダッシュボードページの作り直し
  - `pages/workspaces/[workspaceId]/throughput/index.vue`を、コントロール行(期間種別・表示件数・案件フィルタ)+`ThroughputTrendChart`+目安サマリーカード+(案件選択時のみ)`CaseOutlookPanel`の構成に作り直す
  - 案件フィルタの選択・解除に応じて、表示中の集計・グラフ・見通しパネルを再取得して切り替える
  - 既存の「現在ワークスペース未選択時の空状態表示」分岐(`workspace-resource-scope`実装済み)は削除・変更せずそのまま維持する
  - 完了条件: 案件を選択すると案件スコープのグラフと見通しパネルが表示され、選択解除すると全体表示(見通しパネル非表示)に戻る。ワークスペース未選択状態でページを開くと、作り直し後も既存の空状態表示になる
  - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  - _Depends: 4.1, 4.2, 4.3, 4.4_

- [ ] 5. Core: ストーリーポイント入力欄の3画面統合
- [ ] 5.1 (P) タスク作成フォームへの入力欄追加
  - `pages/workspaces/[workspaceId]/tasks/index.vue`のタスク作成フォームにストーリーポイント入力欄を追加する(新規作成タスクは常に葉タスクのため常に入力可能)
  - 完了条件: フォームでポイントを入力してタスクを作成すると、作成されたタスクに値が保存されている
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - _Boundary: tasks create form_
  - _Depends: 2.3, 4.1_

- [ ] 5.2 (P) カンバン編集モーダルへの入力欄追加
  - `TaskDetailModal.vue`の編集フォームにストーリーポイント入力欄を追加する。対象タスクが子を持つ場合は入力欄の代わりに「子の合計(自動計算)」の読み取り専用表示に切り替える
  - 完了条件: 子を持つタスクを開くと編集不可の合計値表示になり、葉タスクを開くと数値入力欄が編集できる
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.5_
  - _Boundary: TaskDetailModal_
  - _Depends: 2.3, 4.1_

- [ ] 5.3 (P) タスク詳細ページへのインライン編集追加
  - `pages/workspaces/[workspaceId]/tasks/[taskId].vue`の項目一覧にストーリーポイント行を追加し、既存の`InlineEditableField.vue`と同じピッカー方式で編集できるようにする
  - 親タスクの行はピッカーを開かせず、「子の合計(自動計算)」の読み取り専用表示にする
  - 完了条件: 親タスクの行をクリックしても編集ピッカーが開かず、葉タスクの行はクリックで編集ピッカーが開いて保存できる
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.5_
  - _Boundary: task detail page_
  - _Depends: 2.3, 4.1_

- [ ] 6. Integration: バックエンド統合テスト
- [ ] 6.1 (P) タスクAPIの統合テスト
  - `POST/PATCH /api/tasks`でのストーリーポイント込み作成・更新、子を持つタスクへの直接入力拒否(400)、多階層(3階層以上)での祖先再計算の伝播、子が0件に戻った際に`null`へ復帰することを検証する
  - 完了条件: 上記シナリオすべてがテストスイートに追加され成功する
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_
  - _Boundary: tasks統合テスト_
  - _Depends: 2.3_

- [ ] 6.2 (P) 消化数APIの統合テスト
  - `GET /api/throughput`のワークスペーススコープ必須化(ヘッダーなしで400、他ワークスペースIDで403)、`caseId`指定時の絞り込み、他ワークスペースに属する`caseId`を指定した場合の400、葉タスクのみのポイント計上(親タスク完了時の二重計上がないこと)を検証する
  - フォーキャストが0または実績不足の場合に必要期間数・余力ポイントが`null`になること、`endDate`未設定時に3項目すべてが`null`になることを、`endDate`有無×フォーキャスト有無の全組み合わせで検証する
  - 完了条件: 上記シナリオすべてがテストスイートに追加され成功する
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  - _Boundary: throughput統合テスト_
  - _Depends: 3.5_

- [ ] 7. Validation: E2E
- [ ] 7.1 E2E: ストーリーポイント入力3画面の確認
  - タスク作成フォーム・カンバン編集モーダル・タスク詳細ページそれぞれで、葉タスクへのポイント入力と、親タスクの読み取り専用表示(子の合計)を確認する
  - 完了条件: 3画面いずれでも、葉タスクは入力・保存でき、親タスクは編集操作自体が提示されないことをE2Eテストで確認できる
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.5_
  - _Depends: 5.1, 5.2, 5.3_

- [ ] 7.2 E2E: 案件フィルタの切り替えとワークスペース全体表示の確認
  - 消化数ダッシュボードで、既定の全体表示(現在ワークスペース内、案件紐づけの有無を問わない)から案件を選択して案件スコープに絞り込み、選択解除で全体表示に戻ることを確認する
  - 実績期間が少ない状態で、全体表示・案件表示いずれでも今後の目安(完了タスク数・完了ストーリーポイント)が「実績データ不足」の案内に置き換わることを確認する
  - 完了条件: 案件選択・解除でグラフと見通しパネルの表示/非表示が切り替わり、実績不足時の案内文言が画面に表示される
  - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 6.3_
  - _Depends: 4.5_

- [ ] 7.3 E2E: 見通しパネルの算出不可分岐の確認
  - 案件終了日が未設定の案件を選択した場合と、終了日は設定済みだが実績データ不足の案件を選択した場合それぞれで、見通しパネルの該当項目が「算出不可」表示になることを確認する
  - 完了条件: 前者は残期間数・必要期間数・余力ポイントの3項目、後者は必要期間数・余力ポイントの2項目(残期間数は表示)が「算出不可」になることをE2Eテストで確認できる
  - _Requirements: 6.3, 7.4, 7.5_
  - _Depends: 4.5, 3.3_
