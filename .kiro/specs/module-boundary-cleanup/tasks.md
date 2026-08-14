# Implementation Plan

- [x] 1. 日付のみヘルパーの共有化
  - ドメイン固有でない日付の解釈・整形を共有置き場から提供する
  - 休日の永続化層と繰り返しサービスが同じ共有ヘルパーを使う
  - 他モジュールが休日 repository から日付ヘルパーを import しない
  - 観測可能: 繰り返し・休日の既存日付まわりテストが緑で、休日 repository からのヘルパー横断 import が無い
  - _Requirements: 6.1, 6.2_
  - _Boundary: date-only, holidays, recurrence_

- [x] 2. 公開面の追加（参照・整合・段階ブートストラップ）
- [x] 2.1 (P) 案件の読み取り専用公開面を追加する
  - ワークスペース内参照と、TX 内の ID 参照（無ければ notFound）を公開する
  - write 面や繰り返しサービスに依存しない
  - 同一書き込み単位の未コミット案件も読める
  - 観測可能: 読み取り専用面のテストで workspace 外は null、TX 内可視が確認できる
  - _Requirements: 1.1, 1.4, 2.1, 2.2, 3.2_
  - _Boundary: caseReadService_

- [x] 2.2 (P) 開発段階の TX 対応参照とターミナル初期投入を公開する
  - getById が任意の書き込み単位クライアントを受け取れる
  - 完了・中止段階の初期投入を公開手続きにする
  - 観測可能: getById(client) と ensureTerminal のテストが既存初期状態と同じ結果を返す
  - _Requirements: 1.4, 3.2, 4.4_
  - _Boundary: developmentStagesService_

- [x] 2.3 (P) タスク行の整合・集計専用面を追加する
  - detach／clear／必須進捗カウント／soft-delete 含む完了期間カウント／生成タスク列挙を公開する
  - detach／clear の更新条件は現行どおり ID のみ（workspace 条件を付けない）
  - アンカー型は tasks 側定義とし、recurrence 実行時依存を作らない
  - `GeneratedTaskAnchor` と既存 `CaseRelativeAnchor` の値集合が一致することをテストで固定する
  - developmentStages／case／recurrence のサービスを import しない
  - 観測可能: 整合専用面のテストが既存の detach・進捗・throughput 相当の期待と一致し、アンカー集合一致テストも緑
  - _Requirements: 1.1, 1.4, 2.1, 2.2, 3.2, 4.1, 4.2, 4.3, 4.5, 4.6_
  - _Boundary: taskIntegrityService_

- [x] 3. タスク業務サービスの検証を公開参照面へ接続する
  - 案件存在検証を案件 repository 直呼びから読み取り専用面へ切り替える
  - 開発段階存在検証を他ドメイン永続化直触りから TX 対応 getById へ切り替える
  - 観測可能: タスク作成・更新の既存検証テストが緑で、tasks 本番コードに cases repository／developmentStage 直クエリが残らない
  - _Depends: 2.1, 2.2_
  - _Boundary: tasksService_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.2_

- [ ] 4. 呼び出し側の直触り除去（公開面への寄せ）
- [x] 4.1 (P) 案件の進捗・削除を整合専用面経由にし、案件側のタスク永続化直触りをやめる
  - 進捗は整合面のカウントから組み立てる
  - 削除は同一書き込み単位で detach の後に案件削除する
  - 観測可能: 案件削除・進捗の既存テストが緑で、案件 repository に task／task.closure 参照が残らない
  - _Depends: 2.3_
  - _Boundary: caseService, caseRepository_
  - _Requirements: 1.1, 1.3, 1.4, 3.1, 3.3, 4.1, 4.2, 4.6_

- [x] 4.2 (P) 開発段階削除を整合専用面経由にし、段階側のタスク永続化直触りをやめる
  - 削除は同一書き込み単位で clear の後に段階削除する
  - tasksService は import しない
  - 観測可能: 段階削除の既存テストが緑で、段階 repository に task 更新が残らず、段階サービスが task.service を import しない
  - _Depends: 2.3_
  - _Boundary: developmentStagesService_
  - _Requirements: 1.1, 1.3, 1.4, 2.1, 3.1, 3.3, 4.3, 4.6_

- [x] 4.3 (P) 繰り返し適用の案件参照・生成タスク列挙を公開面経由にする
  - 案件取得は読み取り専用面、列挙は整合専用面、作成・削除本体は既存 tasksService
  - 観測可能: 繰り返し適用・生成削除の既存テストが緑で、recurrence に case／task の永続化直触りが残らない
  - _Depends: 2.1, 2.3_
  - _Boundary: recurrenceService_
  - _Requirements: 1.1, 1.3, 1.4, 3.1, 3.2_

- [ ] 4.4 (P) 消化数集計を整合専用面経由にする
  - soft-delete 含む完了カウントの意味を変えない
  - throughput 側の task 集計用 repository は削除する
  - 観測可能: throughput 既存テストが緑で、throughput モジュールに task 直カウント／当該 repository が残らない
  - _Depends: 2.3_
  - _Boundary: throughputService_
  - _Requirements: 1.1, 1.3, 1.4, 4.5, 4.6_

- [ ] 4.5 (P) ワークスペース作成時のターミナル段階投入を段階公開手続きへ寄せる
  - 同一書き込み単位で ensureTerminal を呼ぶ
  - 観測可能: ワークスペース作成の既存テストが緑で、workspaces サービスに developmentStage 直 createMany が残らない
  - _Depends: 2.2_
  - _Boundary: workspaceService_
  - _Requirements: 1.1, 1.4, 3.1, 3.2, 4.4, 4.6_

- [ ] 5. 検証と規約
- [ ] 5.1 モジュール境界・閉路のガードテストを追加する
  - 他モジュール repository 直 import、モジュール間の service 閉路、tasks 外からの task.closure import、stages→task.service import を検出して失敗させる
  - 閉路検査はモジュール間のみ（同一モジュール内の service 同士は対象外）
  - import 禁止の ESLint ルールは導入しない
  - 観測可能: ガードテストが緑で、要件1違反の直参照とモジュール間閉路が検出されない
  - _Depends: 3, 4.1, 4.2, 4.3, 4.4, 4.5_
  - _Boundary: module-boundary.guard_
  - _Requirements: 1.2, 1.3, 2.1, 2.3, 7.2, 7.4_

- [ ] 5.2 (P) プロジェクト規約に TX 伝播・読み取り／整合専用面を追記する
  - 通常 service に加え、読み取り専用／整合専用の公開面も「公開した手続き」として許容することを明記する
  - DbClient 伝播、task.closure 直 import 禁止、tasksService と taskIntegrityService の使い分けを参照可能にする
  - 観測可能: structure.md から循環禁止と専用面のルールを辿れる
  - _Requirements: 7.3_
  - _Boundary: structure.md_

- [ ] 5.3 既存バックエンド回帰を通し、対外契約が変わっていないことを確認する
  - 案件・タスク・段階・繰り返し・ワークスペース・throughput の既存自動テストを実行する
  - HTTP パス・公開形・フロントを本仕様で変更していないことを確認する
  - 観測可能: 本仕様起因のテスト失敗が無く、対外契約維持の要件を満たす
  - _Depends: 5.1_
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.1_

## Implementation Notes

- taskIntegrityService は Prisma 直叩きせず `taskRepository` と `task.closure` のみに依存する（2.3 レビューで差し戻し）
