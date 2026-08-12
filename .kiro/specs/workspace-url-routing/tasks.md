# Implementation Plan

## Implementation Notes

- フロントエンドのみ。API パス階層化は行わず、既存の `x-workspace-id` ヘッダ連携を維持する
- Claude Design は制限のためスキップ済み。`/` の一覧・追加は既存の空状態／管理画面の見た目を踏襲する（`research.md`）
- ワークスペース消失のリアルタイム監視はしない。検知は自操作削除／次の scoped 入場／scoped API 所属拒否時。退避は他所属があれば同一画面種、なければ `/`
- `buildNavLinks(null)` は「ダッシュボード(`/`)」と「メンバー(`/workspaces`)」のみ
- 移行順: ヘルパー・文脈 → 親＋ガード → ページ移動 → 旧フラット削除 → ナビ／切替／作成 → 消失退避 → テスト。旧 URL 互換リダイレクトは置かない
- 前提: `workspace-membership` / `workspace-resource-scope` は main 済み

- [ ] 1. Foundation: パスヘルパーと現在ワークスペース文脈
- [x] 1.1 業務画面種とワークスペースIDからパスを組み立て・差し替える
  - URL 対応表の全画面種（ダッシュボード、`kanban/stages` を含む）を扱えるようにする
  - `buildNavLinks(null)` は `/` と `/workspaces` のみを返す
  - 観測可能な完了状態: ユニットテストで全画面種の path が対応表どおりになり、非対象 path の差し替えは失敗扱いになる
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 4.1, 4.2_
  - _Boundary: workspacePath_

- [x] 1.2 一覧取得の先頭自動選択をやめ、URL同期と消失時退避を追加する
  - `refresh` は last-used が所属内のときのみ `currentId` に載せ、否则 `null`（先頭自動選択しない）
  - `syncFromRoute` / `rememberLastUsed` / `relocateAfterWorkspaceLost`（他所属 → 同一画面種、なし → `/`）を用意する
  - 観測可能な完了状態: 所属があっても last-used が無い／無効なら `currentId` が `null` のままであることをユニットテストで確認できる
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 6.1, 6.2, 6.3_
  - _Boundary: useCurrentWorkspace_
  - _Depends: 1.1_

- [x] 2. 非所属・不明の workspaceId を404にし、所属時はURLを現在WSへ同期する
  - named middleware を親 `[workspaceId]` に適用し、管理画面 `/workspaces` には付けない
  - 親ルートは子ページ用の入れ物を持ち、業務子ページの中身は後続タスクで移す
  - 観測可能な完了状態: 非所属では 404 相当になり、所属では URL の workspaceId へ現在WSが同期されることを、middleware 単体（または同等）で確認できる
  - _Requirements: 3.1, 3.2, 3.3, 5.1, 5.3, 8.2_
  - _Boundary: workspace-member middleware_
  - _Depends: 1.2_

- [x] 3. Integration: 業務ページの scoped 化
- [x] 3.1 ダッシュボードを scoped 配下へ移し、`/` をランディング分岐にする
  - `/` は last-used が有効ならダッシュボード URL へ進み、無効なら一覧・追加（既存見た目の Picker）を表示する
  - ダッシュボード本体は `/workspaces/:workspaceId` で提供する
  - 観測可能な完了状態: last-used 無しで `/` を開くと一覧・追加が見え、有効ならダッシュボードの新 URL へ進む
  - _Requirements: 2.1, 2.2, 8.1_
  - _Depends: 1.1, 1.2, 2_

- [x] 3.2 残りの業務画面を scoped 配下へ移し、内部リンクをヘルパー経由にする
  - タスク・カンバン・開発段階・案件・カレンダー・繰り返し・非営業日・消化数を移す
  - 未選択時の空状態ブロックを外し、案件絞り込み付き遷移のクエリを維持する
  - 観測可能な完了状態: 各業務画面が新 URL で開き、案件からタスクへの絞り込みリンクが新 path + `caseId` になる
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1_
  - _Depends: 3.1_

- [x] 3.3 旧フラット業務ページを削除し404にする
  - 互換リダイレクトは置かない
  - 観測可能な完了状態: `/tasks` や `/kanban` などを開くと見つからない画面（404）になる
  - _Requirements: 5.2, 5.3_
  - _Depends: 3.2_

- [x] 4. Integration: ナビ・切替・作成導線
- [x] 4.1 (P) ナビを現在ワークスペース付きリンクへ切り替える
  - `buildNavLinks(currentId)` を使い、`null` のときは `/` と `/workspaces` のみにする
  - 選択中表示を scoped path に合わせる
  - 観測可能な完了状態: scoped 表示中の業務ナビリンクが、表示中と同一の workspaceId を含む
  - _Requirements: 1.3, 7.1_
  - _Boundary: App nav_
  - _Depends: 1.1, 1.2, 3.2_

- [x] 4.2 (P) ヘッダー切替で同一画面種のまま workspaceId を付け替える
  - scoped 上では path 差し替えとクエリ維持、`/` 上では選択後ダッシュボードへ、管理画面上では選択のみ
  - 観測可能な完了状態: ワークスペース A のカンバン（クエリ付き）から B へ切り替えると、B のカンバンに同じクエリで移る
  - _Requirements: 4.1, 4.2, 2.3_
  - _Boundary: WorkspaceSwitcher_
  - _Depends: 1.1, 1.2, 3.2_

- [x] 4.3 作成モーダル成功後の遷移を新URL規約に合わせる
  - scoped 上で作成した場合は同一画面種の新ワークスペースへ、それ以外は新ワークスペースのダッシュボードへ進む
  - 観測可能な完了状態: 作成直後に新しい workspaceId を含む業務 URL へ到達できる
  - _Requirements: 2.1, 2.3, 8.1_
  - _Boundary: WorkspaceCreateModal_
  - _Depends: 1.1, 1.2, 3.1_

- [x] 5. Integration: ワークスペース消失時の退避配線
- [x] 5.1 (P) 管理画面での削除成功後に退避する
  - 削除成功後に現在選択を片付け、`relocateAfterWorkspaceLost` で退避する
  - 観測可能な完了状態: 削除後、他所属があれば同一画面種へ、なければ `/` へ移り、削除した WS の画面に残らない
  - _Requirements: 6.1, 6.2, 6.3_
  - _Boundary: Manage /workspaces_
  - _Depends: 1.2, 3.2_

- [x] 5.2 (P) scoped API の所属拒否時に一覧を再取得し、失っていれば退避する
  - リアルタイム監視はしない
  - 観測可能な完了状態: 所属拒否相当の応答のあと、現在 WS が消えていれば他所属の同一画面種または `/` へ移る
  - _Requirements: 6.1, 6.2, 6.3_
  - _Boundary: useApiClient_
  - _Depends: 1.2, 3.2_

- [x] 6. Validation: 認証戻り先と E2E
- [x] 6.1 ログイン redirect が scoped fullPath を保持することを確認し、関連ユニットを更新する
  - 観測可能な完了状態: `/workspaces/:id/tasks?caseId=...` がログイン redirect 経由で復元されるテストが通る
  - _Requirements: 7.1, 7.2, 7.3_
  - _Depends: 3.2_

- [x] 6.2 fixtures と主要シナリオを新 path へ合わせる
  - 作成、旧 URL 404、非所属 404、Switcher、所属ゼロ、業務導線をカバーする
  - 観測可能な完了状態: 主要 E2E が新 URL で通り、旧フラット業務 URL は 404 になる
  - _Requirements: 1.1, 2.1, 2.2, 4.1, 5.1, 5.2, 8.1, 8.2_
  - _Depends: 3.3, 4.1, 4.2, 4.3, 5.1, 5.2, 6.1_

- [x] 6.3 残りの業務 E2E の遷移先・期待 URL を更新する
  - 観測可能な完了状態: 既存の業務 E2E スイートが新 path 前提で通過する
  - _Requirements: 1.1, 1.4_
  - _Depends: 6.2_
