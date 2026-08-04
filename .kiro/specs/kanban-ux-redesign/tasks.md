# Implementation Plan

- [x] 1. TaskCardコンポーネントを実装する
  - タスクの状態(未着手/進行中/完了/保留)を、配置される開発段階(列)とは独立した表示要素として常に表示する
  - 優先度を色分けされた帯状の装飾要素を使わず、テキストまたはアイコンのラベルのみで表示する
  - 進捗情報(子タスク完了数/全体数)が渡された場合のみ進捗表示を行い、渡されない場合は表示しない
  - `draggable`指定に応じて、既存の`data-task-id`属性とドラッグ開始イベントを持つ要素として振る舞えるようにする
  - 観測可能な完了状態: Storybook等を使わずとも、`draggable=true`/`false`・進捗あり/なし・優先度高/中/低・状態4種を変えた表示確認とユニットテストにより、色付きアクセントバーが一切描画されないことと進捗表示の有無が正しく切り替わることを確認できる
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1_

- [ ] 2. 担当者フォーカス・チーム負荷・バックログ表示コンポーネントを実装する
- [x] 2.1 (P) AssigneeFocusTrayコンポーネントを実装する
  - 渡された担当者の未完了タスク一覧をTaskCardで表示する
  - 表示領域の高さを固定し、件数が収まらない場合は領域内スクロールのみで全件を確認できるようにする
  - タスクが1件もない場合は0件である旨を表示する
  - 観測可能な完了状態: タスク配列を4〜5件渡すとスクロールなしで全件が表示され、20件程度渡すと領域の高さは変わらず内部スクロールで全件へアクセスできることをユニットテストまたは手動確認で確認できる
  - _Requirements: 1.2, 1.3, 1.4, 1.5_
  - _Boundary: AssigneeFocusTray_
  - _Depends: 1_

- [x] 2.2 (P) TeamWorkloadSummaryコンポーネントを実装する
  - 担当者ごとの件数チップを、渡された順序(呼び出し側で降順ソート済み)のまま表示する
  - 表示可能件数を超える担当者がいる場合、上位N名のみを表示し、残りを「+N名」としてまとめる
  - 「+N名」から残りの担当者を個別に(名前と件数付きで)確認できる手段を提供する
  - 観測可能な完了状態: 10名分のダミーデータを渡すと上位N名のチップと「+N名」表示に切り替わり、その操作で残り全員の名前・件数を確認できることをユニットテストで確認できる
  - _Requirements: 2.2, 2.4, 2.5_
  - _Boundary: TeamWorkloadSummary_

- [x] 2.3 (P) UnassignedBacklogPanelコンポーネントを実装する
  - 折りたたみ状態では開発段階未設定タスクの件数バッジのみを表示し、カード/行を一切描画しない
  - 展開操作で、タイトル検索・優先度/作成日時ソートが可能なリスト表示に切り替える
  - 展開後の各行をTaskCard(`draggable=true`)として描画し、開発段階別ボードへのドラッグ移動を可能にする
  - タスクが1件もない場合は0件を表示する
  - 観測可能な完了状態: 折りたたみ状態でタスクを渡してもカードが描画されず件数のみ表示され、展開後はタイトルの部分一致検索と優先度/作成日時ソートで表示順・表示件数が変わることをユニットテストで確認できる
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  - _Boundary: UnassignedBacklogPanel_
  - _Depends: 1_

- [x] 3. (P) 開発段階マスタ管理を独立画面に分離する
  - 既存の`/kanban`ページに実装済みの開発段階マスタ管理UIとロジック(追加・名称変更・並び替え・削除)を、新規の`/kanban/stages`ページへ複製する形で実装する(このタスクでは`/kanban`ページ側の既存UIには触れない。`/kanban`ページからの削除・導線追加はタスク4.2の責務)
  - 観測可能な完了状態: `/kanban/stages`にアクセスすると、開発段階の追加・名称変更・並び替え・削除がすべて既存と同じ挙動で操作できる
  - _Requirements: 7.1, 7.3_
  - _Boundary: stages.vue, DevelopmentStageManager_

- [ ] 4. kanban/index.vueへ統合する
- [x] 4.1 担当者フィルタと派生データの計算を実装する
  - 既存の担当者フィルタパターン(単一select、デフォルト「すべて」)を導入し、選択状態を保持する
  - 選択された担当者の未完了タスク(開発段階の有無を問わない)を導出する
  - 開発段階が設定されている未完了タスクの件数を担当者ごとに集計し、件数降順で並べる
  - 開発段階が設定されていないタスクを抽出する
  - 子タスクを持つタスクについて、完了数と全体数を親子関係から算出する
  - 開発段階別ボードの表示対象を、選択された担当者のタスクに限定する(「すべて」の場合は全担当者)
  - 観測可能な完了状態: 担当者フィルタで特定の担当者を選択すると、開発段階別ボードに表示されるタスクがその担当者のものだけに絞り込まれることが確認できる
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.6, 4.1, 4.2, 4.3, 4.4, 5.4, 5.5_

- [x] 4.2 レイアウトを再構成し新コンポーネントを配置する
  - AssigneeFocusTray・TeamWorkloadSummary・UnassignedBacklogPanelをページ上部に配置し、4.1の派生データを渡す
  - 担当者フィルタが「すべて」の場合はAssigneeFocusTrayを表示しない
  - 開発段階別ボードの各カードをTaskCard(`draggable=true`)に置き換える
  - 既存の開発段階マスタ管理UI(段階の追加・名称変更・並び替え・削除フォーム)をこのページから削除する
  - `/kanban/stages`への導線(リンク)を追加する
  - 観測可能な完了状態: ブラウザで`/kanban`を開くと、フォーカストレイ・チーム負荷サマリー・折りたたまれた未割り当てバッジ・開発段階別ボードが表示され、開発段階マスタの追加/編集フォームはページ上になく、`/kanban/stages`へのリンクのみが表示される
  - _Requirements: 1.1, 1.4, 1.5, 2.4, 2.5, 3.2, 3.3, 4.1, 4.2, 4.3, 6.1, 6.2, 7.2_
  - _Depends: 4.1, 2.1, 2.2, 2.3, 3_

- [ ] 5. E2Eおよび回帰テストを整備する
- [x] 5.1 既存のカンバンE2Eテストを更新する
  - `frontend/e2e/kanban.spec.ts`の開発段階登録手順を、`/kanban/stages`ページへの遷移を含む形に書き換える
  - 開発段階別ボードでのカード移動(担当者未設定タスクの移動時に担当者選択を求める挙動を含む)が引き続き機能することを検証する
  - 観測可能な完了状態: 更新後のテストがPlaywrightで成功し、`/kanban/stages`での段階登録から`/kanban`でのカード移動までが一連のシナリオとして通ることを確認できる
  - _Requirements: 6.1, 6.2, 7.1, 7.3, 7.4_
  - _Depends: 4.2_

- [x] 5.2 (P) 担当者フォーカスとチーム負荷のE2Eテストを追加する
  - 担当者フィルタで特定の担当者を選択すると、フォーカス領域と開発段階別ボードの両方がその担当者のタスクに連動して更新されることを検証する
  - 「すべて」に戻すとフォーカス領域が非表示に戻ることを検証する
  - 観測可能な完了状態: 新規E2Eテストが追加され、担当者選択に応じたフォーカス領域とボードの連動、および「すべて」に戻したときの非表示化がPlaywrightで確認できる
  - _Requirements: 1.1, 1.2, 4.2, 4.3_
  - _Boundary: kanban e2e (新規specファイル)_
  - _Depends: 4.2_

- [x] 5.3 (P) 開発段階未設定バックログのE2Eテストを追加する

- [x] 6. タスクカードのクリック/ドラッグ操作を刷新し、担当者フォーカス欄への担当変更ドラッグを実装する
- [x] 6.1 TaskDetailModalコンポーネントを実装する(閲覧/編集モード、オーバーレイ表示)
  - `taskId`が設定されるたびに`GET /api/tasks/:id`で詳細を取得し、既定で閲覧モード(タイトル・状態・優先度・担当者・開発段階・メモを表示のみ)を表示する
  - 編集ボタンで編集モードに切り替え、タイトル・優先度・担当者・開発段階・メモを編集可能にする
  - 保存時、`PATCH /api/tasks/:id`(汎用フィールド)を呼び、開発段階が変更されていれば続けて`PATCH /api/tasks/:id/development-stage`を呼ぶ。保存後は閲覧モードへ戻り、`saved`イベントで呼び出し側に通知する
  - 削除は確認ステップを挟んで`DELETE /api/tasks/:id`を呼び、成功時に`deleted`イベントを発行する
  - `fixed inset-0`の半透明背景の上に中央寄せで表示するオーバーレイとして実装する(ページ内の通常フローにインライン表示しない、Requirement 8.9)。当初はインライン表示になっておりポップアップとして認識できないというフィードバックを受けて修正した
  - 観測可能な完了状態: カードクリックでオーバーレイポップアップが開き、閲覧→編集→保存→閲覧の一連の操作、および削除確認からの削除がブラウザで確認できる
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.8, 8.9_
  - _Boundary: TaskDetailModal.vue_

- [x] 6.2 kanban/index.vueの操作メニューを廃止し、詳細ポップアップとSortableの移動量閾値に置き換える
  - `actionMenuTaskId`等の操作メニュー関連の状態・関数・テンプレートを削除する
  - `TaskCard`の`activate`/`card-activate`を、`TaskDetailModal`を開く単一の処理に統合する
  - 開発段階別ボード・担当者フォーカス欄・未割り当てバックログの各`VueDraggable`は`delay`オプションを設定せず、Sortable既定の移動量閾値のみでクリックとドラッグを区別する(当初`delay`による長押し猶予を採用したが、実際の操作感が不自然だったため撤回。詳細はdesign.md「実装後の改訂」4.参照)
  - 担当者未設定タスクを開発段階列へドラッグ移動する際、既存の担当者選択フロー(`pendingMove`)が維持されることを確認する
  - 観測可能な完了状態: 動かさないクリックで詳細ポップアップ、意味のある距離を動かせば即座にドラッグ移動が発生し、キーボード専用の操作メニューがどこにも表示されないことを確認できる
  - 廃止した操作メニューに依存していた`e2e/kanban-action-menu-noop.spec.ts`は削除した。`e2e/drag.ts`の`dragCardTo`は`delay`オプションが存在しないため、mousedown後の待機は元の150msのまま(Sortableの「chosen」状態が安定するのを待つだけの待機で、活性化猶予ではない)
  - _Requirements: 6.1, 6.2, 8.1, 8.6, 8.7, 8.8_
  - _Boundary: kanban/index.vue, AssigneeFocusTray.vue, UnassignedBacklogPanel.vue, TaskCard.vue_
  - _Depends: 6.1_

- [x] 6.3 (P) 担当者フォーカス欄へのドラッグで担当者を上書き変更できるようにする
  - `AssigneeFocusTray`の`@assign`ハンドラを、`updateTaskDevelopmentStage`ではなく`updateTask`(汎用編集API、`assigneeUserId`のみ指定)を呼ぶように変更し、既存の担当者を問わず上書きする
  - ドロップ先の担当者が現在の担当者と同一の場合はAPI呼び出しを行わない
  - API呼び出し失敗時はエラーを画面に表示し、カード表示を変更前の状態へ戻す
  - 観測可能な完了状態: 既に担当者が設定されたタスクを担当者フォーカス欄へドラッグすると担当者が変更され、同一担当者へのドロップでは何も起きないことをブラウザで確認できる
  - 従来の拒否挙動を検証していた`e2e/kanban-tray-reject.spec.ts`は、上書き成功を検証する`e2e/kanban-tray-reassign.spec.ts`へ書き換えた
  - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - _Boundary: kanban/index.vue, AssigneeFocusTray.vue_

- [x] 7. 詳細ポップアップを共通Modalコンポーネント化し、アニメーションとクリック不具合を修正する
- [x] 7.1 共通Modalコンポーネント(frontend/components/shared/Modal.vue)を新設する
  - `open`/`ariaLabel` propと`close` emit、`title`/デフォルト/`actions`スロットを持つ汎用ダイアログシェルを実装する
  - `<Transition name="modal">`でオーバーレイ+パネルの開閉アニメーションを実装する(main.cssに`.modal-enter-*`/`.modal-leave-*`を追加)
  - 内部で`useDialogFocusTrap`を保持し、背景クリック・Escキー・右上の閉じるボタンのいずれでも`close`を発行する
  - 観測可能な完了状態: ブラウザでポップアップの表示・非表示にフェード+スケールのアニメーションが確認でき、右上のバツボタン・背景クリック・Escいずれでも閉じられる
  - _Requirements: 8.9, 8.10, 8.11_
  - _Boundary: Modal.vue_

- [x] 7.2 TaskDetailModalをModalベースに書き換える
  - 独自実装していたオーバーレイ・フォーカストラップ・閉じるボタンを撤去し、共通`Modal`の`title`/デフォルト/`actions`スロットへ委譲する
  - `title`スロットには編集フォームのローカル`title` refを渡し、編集中の入力がヘッダーにも反映されるようにする
  - 観測可能な完了状態: 既存の閲覧/編集/削除の一連の操作がすべて変わらず動作することをブラウザで確認できる
  - _Requirements: 8.1-8.8_
  - _Boundary: TaskDetailModal.vue_
  - _Depends: 7.1_

- [x] 7.3 タスクカードの直後クリックが空振りする不具合を修正する
  - `TaskCard`の`activate`発火をネイティブ`click`イベントから`pointerdown`/`pointerup`の座標差分判定(`clickMoveThreshold`、6px)へ変更する
  - `main.css`の`.task-card-ghost`/`.task-card-drag-clone`に`pointer-events: none`を追加する(ドラッグ完了直後に残存する要素がクリックを奪う可能性への対策)
  - 観測可能な完了状態: タスクカードを少し動かしてから離した直後にクリックしても、詳細ポップアップが確実に開くことを繰り返し確認できる
  - _Requirements: 8.1, 8.12_
  - _Boundary: TaskCard.vue_

## Implementation Notes
- The shared local dev DB accumulated ~63 development stages / ~114 tasks from repeated e2e runs across this feature's tasks, wide enough to break Playwright's `locator.dragTo()` (real cursor simulation requires both elements to fit in one viewport). `kanban-backlog.spec.ts` works around this by dispatching `dragstart`/`dragover`/`drop` DOM events directly, which exercises the same production handlers (confirmed: `onDropOnStage` reads the dragged task id from a `draggedTaskId` ref set via the `@dragstart` emit, not from `dataTransfer` contents or cursor position). If this recurs, clean up `e2e-*`-prefixed dev-DB rows before running drag-based specs.
  - 折りたたみ表示の展開、タイトル検索、優先度/作成日時ソートを検証する
  - 展開済み一覧の行を開発段階別ボードの列へドラッグ&ドロップし、担当者未設定の場合は担当者選択が求められ、選択後に移動が完了することを検証する
  - 観測可能な完了状態: 新規E2Eテストが追加され、展開・検索・ソート、および展開済み一覧からのドラッグ移動(担当者選択フローを含む)がPlaywrightで確認できる
  - _Requirements: 3.2, 3.3, 3.4, 3.5_
  - _Boundary: kanban e2e (新規specファイル)_
  - _Depends: 4.2_
