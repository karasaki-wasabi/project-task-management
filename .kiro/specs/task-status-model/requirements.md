# Requirements Document

## Introduction

タスクを運用するチームは、タスクの「ステータス」と「開発段階」に性質の異なる 2 つの軸（どの工程にいるか／その工程内での作業状態）が混在しているため、タスク全体がいつ終わったのかをシステムが判定できない。現在の完了日時はステータスが完了になったときに打刻され、それ以外では解除されるうえ、消化数はこの完了日時の期間フィルタのみで算出している。そのため「ある段階で未着手→作業中→完了、次の段階へ移して再び未着手から」という運用では、段階を進めた時点で打刻が消え、消化数の集計が成立しない。

本仕様は、完了の判定を開発段階の到達へ移す。開発段階に種別（通常・完了・中止）を持たせ、完了種別の段階へタスクが入った時刻を完了日時とし、段階から出た場合は打刻を解除する。あわせてステータスを段階内の作業状態に意味を限定し、値を「未着手・作業中・引継待ち・保留」へ再定義する。

さらに本仕様は「完了」と「クローズ」を区別する。完了は完了種別の段階に到達したもので、消化数が数える対象である。クローズは完了または中止の段階に到達し、もう作業しないもので、親子完了制約と案件進捗が見る対象である。中止を単なる未完了として放置すると、中止した子タスクが親タスクを、中止した必須タスクが案件を、それぞれ永久に閉じられなくするため、この区別が必要になる。

## Boundary Context

- **In scope**
  - 開発段階への種別（通常・完了・中止）の付与と、その一覧・管理上の扱い
  - 完了日時の打刻責務を、ステータス変更から完了種別の段階への到達へ移すこと
  - ステータスの値の再定義と、開発段階の移動に伴う扱い
  - 親子タスクの完了制約の判定基準の変更、および終端段階のタスクに未クローズの子が付く操作の禁止
  - 案件の必須タスク進捗および案件終了日超過の警告の判定基準の追従
  - 消化数集計の判定基準の追従
  - カレンダーの期限超過判定の追従
  - カンバンの子タスク進捗・担当者フォーカストレイ・チーム負荷の判定基準の追従
  - ステータス・完了を表示する既存画面の用語の追従
- **Out of scope**
  - 段階別リードタイム／サイクルタイムの分析・可視化
  - ストーリーポイントと消化ペース予測（velocity-dashboard）
  - 誰がステータスや開発段階を変更できるかの権限制御
  - 開発段階の遷移順序の強制（順序スキップの禁止など）
  - 開発段階の遷移をトリガーとする通知
  - 段階遷移の履歴を保持する専用のモデルの新設
- **Adjacent expectations**
  - 開発段階およびステータスの変更を操作ログとして記録することは task-detail の管掌であり、本仕様では規定しない。中止した日時など、本仕様が列として保持しない情報が必要になった場合は、同仕様の操作ログを辿る前提を置く
  - タスク・案件の可視範囲の判定は workspace-resource-scope の管掌であり、本仕様では規定しない
  - 本仕様は既存の開発段階データを移行対象とせず、データ削除によって新しい種別の前提を満たすことを許容する

## Requirements

### Requirement 1: 開発段階の種別
**Objective:** As a タスクを運用するメンバー, I want 開発段階が通常・完了・中止のいずれかの種別を持つ, so that タスクが終わったことをシステムが判定できる

#### Acceptance Criteria
1. The Development Stage Service shall すべての開発段階に、通常・完了・中止のいずれかの種別を保持する
2. The Development Stage Service shall 各ワークスペースにおいて、完了種別の開発段階を常に 1 つだけ存在させる
3. The Development Stage Service shall 各ワークスペースにおいて、中止種別の開発段階を常に 1 つだけ存在させる
4. When メンバーが新しい開発段階を作成した場合、the Development Stage Service shall 当該開発段階を通常種別として作成する
5. If 完了種別または中止種別の開発段階を削除する操作が試みられた場合、the Development Stage Service shall 削除を拒否する
6. If 既存の開発段階の種別を変更する操作が試みられた場合、the Development Stage Service shall 変更を拒否する
7. The Development Stage Service shall 完了種別・中止種別の開発段階について、名称の変更と並び順の変更を許可する
8. When メンバーが開発段階の一覧を表示した場合、the Development Stage Service shall 各開発段階の種別を識別できるように示す

### Requirement 2: タスクの完了判定
**Objective:** As a タスクを運用するメンバー, I want タスクが完了段階へ到達した時点で完了として記録される, so that 段階を進める運用のままで消化数を自動集計できる

#### Acceptance Criteria
1. When タスクが完了種別の開発段階へ移された場合、the Task Service shall 当該タスクの完了日時を移された時刻で記録する
2. When 完了種別の開発段階にあるタスクが他の開発段階へ移された場合、the Task Service shall 当該タスクの完了日時の記録を解除する
3. When タスクが中止種別の開発段階へ移された場合、the Task Service shall 当該タスクの完了日時を記録しない
4. The Task Service shall タスクのステータスの変更を契機として完了日時を記録または解除しない
5. The Task Service shall 開発段階が設定されていないタスクを許容し、当該タスクを完了種別または中止種別の開発段階へ直接移すことを許可する
6. The Task Service shall 完了日時を利用者が直接編集する手段を提供しない

### Requirement 3: 完了とクローズの区別
**Objective:** As a タスクを運用するメンバー, I want 中止したタスクが「もう作業しないもの」として扱われる, so that 中止したものを抱えたまま親タスクや案件を閉じられる

#### Acceptance Criteria
1. The Task Service shall 完了種別または中止種別の開発段階にあるタスクをクローズ済みとして扱う
2. The Task Service shall クローズ済みのタスクのうち、完了種別の開発段階にあるものだけを完了として扱う
3. The Task Service shall タスクがクローズ済みであるかの判定を、現在置かれている開発段階の種別に基づいて行う
4. The Task Service shall 中止した日時を独立した項目として保持・提示しない

### Requirement 4: ステータスの再定義
**Objective:** As a タスクを運用するメンバー, I want ステータスが段階内の作業状態だけを表す, so that タスク全体の完了と段階内の進捗を取り違えない

#### Acceptance Criteria
1. The Task Service shall タスクのステータスを、未着手・作業中・引継待ち・保留のいずれかとして保持する
2. The Task Service shall ステータスを、タスクが現在置かれている開発段階の中での作業状態として扱い、タスク全体の完了を表すものとして扱わない
3. The Task Service shall ステータスにタスク全体の完了を表す値を設けない
4. When タスクが別の開発段階へ移された場合、the Task Service shall 当該タスクのステータスを未着手へリセットする
5. While タスクが完了種別または中止種別の開発段階にある, the Task Service shall 当該タスクのステータスを表示および編集の対象としない

### Requirement 5: 親子タスクの完了制約
**Objective:** As a タスクを運用するメンバー, I want 子タスクが片付くまで親タスクを完了にできない, so that 積み残しに気づかないまま親を閉じてしまわない

#### Acceptance Criteria
1. If 親タスクを完了種別の開発段階へ移す操作が行われ、かつクローズ済みでない子タスクが存在する場合、the Task Service shall 当該操作を拒否する
2. While 子タスクが中止種別の開発段階にある, the Task Service shall 当該子タスクを親タスクの完了を妨げないものとして扱う
3. The Task Service shall 親タスクを中止種別の開発段階へ移す操作を、子タスクの状態にかかわらず許可する
4. The Task Service shall 親子タスクの完了制約の判定をステータスに基づいて行わない
5. If 完了種別または中止種別の開発段階にあるタスクの分割が試みられた場合、the Task Service shall 当該操作を拒否する
6. If クローズ済みでないタスクの親として、完了種別または中止種別の開発段階にあるタスクを指定する操作が行われた場合、the Task Service shall 当該操作を拒否する

### Requirement 6: 案件の必須タスク進捗
**Objective:** As a 案件を管理するメンバー, I want 中止した必須タスクが案件の進捗を塞がない, so that 中止を含む案件も正しく完了まで到達できる

#### Acceptance Criteria
1. When 案件の必須タスク進捗を算出する場合、the Case Progress shall 完了種別の開発段階にある必須タスクを完了件数として数える
2. When 案件の必須タスク進捗を算出する場合、the Case Progress shall 中止種別の開発段階にある必須タスクを集計の母数から除外する
3. The Case Progress shall 必須タスクの完了判定をステータスに基づいて行わない
4. The Case Progress shall 中止種別の開発段階にある必須タスクを、案件終了日を過ぎた際の警告の対象に含めない
5. While 案件のすべての必須タスクがクローズ済みである, the Case Progress shall 当該案件に未完了の必須タスクが残っていない状態として扱う
6. While 中止種別の開発段階にある必須タスクを除外した結果、集計の母数が 0 になる, the Case Progress shall 進捗を提示しない

### Requirement 7: 消化数の集計
**Objective:** As a タスクを運用するメンバー, I want 消化数が期間内に本当に終わったタスクを数える, so that 段階を進める運用のままで消化ペースを把握できる

#### Acceptance Criteria
1. When 消化数を集計する場合、the Throughput Service shall 完了日時が集計期間内にあるタスクを数える
2. The Throughput Service shall 中止種別の開発段階にあるタスクを消化数の集計対象に含めない
3. The Throughput Service shall 消化数の集計をステータスに基づいて行わない
4. When 完了していたタスクが完了種別の開発段階から他の開発段階へ移された場合、the Throughput Service shall 当該タスクを以後の集計対象から除外する

### Requirement 8: 既存画面の追従
**Objective:** As a タスクを運用するメンバー, I want 画面上の「完了」と期限超過の判定が新しい定義に従う, so that 段階内の進捗とタスク全体の完了を読み違えず、終わったタスクが警告され続けない

#### Acceptance Criteria
1. The Kanban Board shall 完了種別・中止種別の開発段階を、他の開発段階と同様に列として表示する
2. Where ステータスを表示または選択する画面がある, the Application shall 未着手・作業中・引継待ち・保留の語を用いる
3. The Application shall 「完了」の語を、タスク全体の完了（完了種別の開発段階への到達）を指す場合にのみ用いる
4. While タスクがクローズ済みである, the Calendar shall 当該タスクを期限超過として表示しない
5. The Calendar shall 期限超過の判定をステータスに基づいて行わない
6. When 親タスクの子タスク進捗を算出する場合、the Kanban Board shall 完了種別の開発段階にある子タスクを完了件数として数え、中止種別の開発段階にある子タスクを母数から除外する
7. The Kanban Board shall 担当者フォーカストレイおよびチーム負荷の集計から、クローズ済みのタスクを除外する
8. The Kanban Board shall 子タスク進捗・担当者フォーカストレイ・チーム負荷の判定をステータスに基づいて行わない
9. While 中止種別の開発段階にある子タスクを除外した結果、子タスク進捗の母数が 0 になる, the Kanban Board shall 当該タスクの子タスク進捗を表示しない
10. While タスクが完了種別または中止種別の開発段階にある, the Application shall 当該タスクの分割操作を提示しない
