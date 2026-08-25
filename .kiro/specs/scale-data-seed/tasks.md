# Implementation Plan

- [x] 1. 規模シードの定数・型・純関数と単体テスト
- [x] 1.1 SCALE 固定識別子・既定件数・認証情報定数と入出力型を定義する
  - SEED_* と衝突しない SCALE_* のユーザー／WS／段階 ID、既定タスク件数 6000、チャンクサイズ、計測用メール／パスワードを定数化する
  - ScaleSeedOptions / ScaleSeedResult など投入・掃除の入出力型を定義する
  - 定数と型がデモ seed の clearAllTables 経路と分離して参照できる
  - _Requirements: 2.1, 2.2, 3.2, 3.4, 6.1_
  - _Boundary: scale-data.constants, scale-data.types_

- [x] 1.2 件数パース・日付割当・チャンク分割の純関数と単体テスト
  - SCALE_TASK_COUNT 未設定は既定件数、不正値は失敗にする parse を実装する
  - 指定件数と約 80% 比率から scheduledEndDate 割当を再現可能にする
  - createMany 用チャンク分割を実装する
  - 上記3系統の単体テストがパスする
  - _Requirements: 3.2, 3.4, 4.2_
  - _Boundary: scale-data helpers_
  - _Depends: 1.1_

- [x] 2. 規模データの投入本体
- [x] 2.1 計測ユーザー／WS／端末段階の ensure と再投入用部分削除
  - 生 PrismaClient で計測ユーザー・専用 WS・メンバー・完了/中止段階を ensure する（全表消去しない）
  - 再投入時は user/WS/member/端末段階を残し、task id 経由で activity_logs/comments → tasks のみ物理削除する（案件は投入しないため cases 削除も通常不要）
  - soft-delete 拡張 Client や clearAllTables / seedManualConfirmationData を呼び出さない
  - 同一 WS で ensure+部分削除後に端末段階が残りタスクが 0 になる状態を後続で検証できる
  - _Requirements: 1.2, 2.1, 2.2, 2.4, 3.3, 4.4, 5.2_
  - _Boundary: scale-data core_
  - _Depends: 1.1, 1.2_

- [x] 2.2 指定件数のタスク投入と件数・サマリ検証
  - 指定件数の active タスクをチャンク createMany で投入し deletedAt を付けない
  - 案件は一覧・カレンダー負荷再現に不要なため作成しない（関連データが必要になった場合のみ専用 WS 内に限る、という境界を守る）
  - 約 80% に終了予定日を付与し、投入後の active 件数が指定と一致しなければ規模 WS スコープの部分削除を試みたうえで失敗終了する
  - ScaleSeedResult（workspaceId, userId, userEmail, taskCount, scheduledEndDateCount）を返し、オペレータが WS 識別子と計測アカウント利用に必要な情報を確認できる
  - _Requirements: 2.3, 3.1, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 6.1, 6.2_
  - _Boundary: scale-data core_
  - _Depends: 2.1_

- [x] 3. WS スコープ掃除本体を実装する
  - task 経由で activity_logs/comments を消し、tasks →（存在すれば）templates/holidays → development_stages → cases → workspace_members → workspaces を当該 WS に限定して物理削除する（ユーザーは残す）
  - clearAllTables は呼ばない
  - 掃除後は当該 WS が存在せずタスク 0 になる
  - _Requirements: 5.1, 5.2, 5.3_
  - _Boundary: scale-data core_
  - _Depends: 2.1_

- [x] 4. db:seed-scale / db:cleanup-scale 入口を追加する
  - seed-scale / cleanup-scale が env を読み core を呼び、成功時は人間可読サマリ（WS ID・件数・計測用メール等）を stdout、失敗時は非ゼロ終了する
  - package.json に両 script を追加しデモ db:seed とは別入口にする
  - Compose 経由で実行できる
  - 負荷シナリオや一覧 API 改善は実装しない
  - _Requirements: 1.1, 1.2, 2.3, 5.1, 6.1, 6.3_
  - _Boundary: seed-scale.ts, cleanup-scale.ts, package.json_
  - _Depends: 2.2, 3_

- [x] 5. 小件数の実 DB 統合テストを追加する
  - 例: 50 件投入で count・終了予定日付き・deletedAt null を確認する
  - 二度実行で件数が累積しないことを確認する
  - cleanup 後に WS 不在／タスク 0 を確認する
  - 無関係行が残る／clearAllTables 非呼び出しで全表消去しないことを確認する
  - try/finally で SCALE 固定 ID のみ掃除する
  - 統合テストがパスする
  - _Requirements: 1.2, 3.1, 3.3, 4.1, 4.2, 4.4, 5.2, 5.3_
  - _Boundary: scale-data.integration.test.ts_
  - _Depends: 2.2, 3_

- [x] 6. オペレータ手順を steering に追記する
  - local-dev-pitfalls に db:seed-scale 実行例、既定 6000、SCALE_TASK_COUNT、計測用資格情報／WS ID 参照先を書く
  - 計測完了の推奨片付けは既存 db:seed（全表消去+確認用デモ）と明記する
  - 任意の db:cleanup-scale、E2E/Vitest 同時実行禁止、本番投入禁止を書く
  - 必要なら testing.md に一行クロスリンクする
  - 負荷シナリオや一覧 API 改善は対象外と分かる
  - _Requirements: 1.3, 5.4, 6.2, 6.3, 7.1, 7.2, 7.3_
  - _Boundary: local-dev-pitfalls.md, testing.md_
  - _Depends: 4_
