# Requirements Document

## Introduction

ログインユーザーは、可視境界がないため「誰とどの案件・タスクを共有するか」を表現できない。本仕様は「ワークスペース」という新しい可視境界を導入する。ログインユーザーはワークスペースを作成でき、作成者は自動的にメンバーになる。ワークスペースには、既存の登録ユーザーを表示名またはメールアドレスで検索してメンバー追加できる（メール送信・招待リンクなし）。ログインユーザーは操作対象の現在ワークスペースを選択・切り替えでき、所属ワークスペースのメンバー一覧を確認できる。追加されたメンバーは当該ワークスペースの対等な利用者になり、ロールによる権限差は持たない。メンバーはワークスペースの名前と識別色をいつでも変更できるが、削除は作成者のみに限られる。

案件・タスクなど既存リソースへの所属付与とアクセス強制は本仕様の対象外であり、後続仕様（workspace-resource-scope）が担う。本仕様が完了させる範囲は、ワークスペースとメンバーシップの所属関係、および現在ワークスペースの選択コンテキストまでとする。

## Boundary Context (Optional)

- **In scope**
  - ワークスペースの作成、および作成者による削除
  - ワークスペースの名前・識別色の変更（メンバーであれば誰でも可）
  - 現在ワークスペースの選択・切り替え
  - 所属ワークスペースのメンバー一覧閲覧
  - 登録済みユーザーの検索によるメンバー追加
- **Out of scope**
  - 案件・タスクなど既存リソースへのワークスペース紐付けとアクセス強制（workspace-resource-scope）
  - 作成者以外によるワークスペース削除、メンバーの個別削除・自己脱退
  - 招待リンク発行、メール招待、ワークスペース内ロール／RBAC
  - ワークスペース名の重複可否・命名ポリシー
  - 識別色以外のワークスペースの見た目カスタマイズ（アイコン画像等）
- **Adjacent expectations**
  - 本仕様は「ログイン済みユーザーである」ことを前提とし、ログイン状態の確立方法や現在ユーザーの取得手段そのものは規定しない（user-auth の管掌）
  - 後続の workspace-resource-scope は、本仕様が提供するメンバーシップの所属関係を判定基盤として再利用する前提を置く

## Requirements

### Requirement 1: ワークスペースの作成
**Objective:** As a ログインユーザー, I want 新しいワークスペースを作成できる, so that 自分が共有したい相手・データの可視境界を持てる

#### Acceptance Criteria
1. When ログインユーザーがワークスペース作成を名前とともに実行した場合、the Workspace Service shall 新しいワークスペースを作成し、作成者を当該ワークスペースのメンバーとして自動登録する
2. If ワークスペース名が未入力のままワークスペース作成が実行された場合、the Workspace Service shall 作成を拒否しエラーを提示する
3. When ワークスペースが作成された場合、the Workspace Service shall 作成されたワークスペースを作成者の現在ワークスペースとして選択する

### Requirement 2: 現在ワークスペースの選択
**Objective:** As a ログインユーザー, I want 操作対象のワークスペースを選択・切り替えられる, so that 意図したワークスペースのデータ・メンバーを扱える

#### Acceptance Criteria
1. While ログインユーザーが1つ以上のワークスペースに所属している, the Workspace Service shall 現在選択中のワークスペースを一貫して識別できるようにする
2. When ログインユーザーが所属ワークスペースの一覧から別のワークスペースを選択した場合、the Workspace Service shall 選択されたワークスペースを新しい現在ワークスペースへ切り替える
3. If ログインユーザーがどのワークスペースにも所属していない場合、the Workspace Service shall ワークスペース作成を促す空状態を表示する
4. If ログインユーザーが自身の所属していないワークスペースを現在ワークスペースとして指定しようとした場合、the Workspace Service shall 拒否する

### Requirement 3: メンバー一覧の閲覧
**Objective:** As a ワークスペースのメンバー, I want 所属ワークスペースのメンバー一覧を確認できる, so that 誰と当該ワークスペースを共有しているか把握できる

#### Acceptance Criteria
1. When ワークスペースのメンバーがメンバー一覧を表示した場合、the Workspace Service shall 当該ワークスペースに所属する全メンバーを表示する
2. If ワークスペースのメンバーでないログインユーザーが当該ワークスペースのメンバー一覧表示を試みた場合、the Workspace Service shall 拒否する

### Requirement 4: ユーザー検索によるメンバー追加
**Objective:** As a ワークスペースのメンバー, I want 登録済みユーザーを検索してワークスペースに追加できる, so that メール送信や招待リンクなしで対等な利用者を迎えられる

#### Acceptance Criteria
1. When ワークスペースのメンバーが表示名またはメールアドレスでユーザーを検索した場合、the Workspace Service shall 一致する登録済みユーザーを検索結果として提示する
2. While 検索結果の対象に既に当該ワークスペースのメンバーであるユーザーが含まれる, the Workspace Service shall そのユーザーを検索結果から除外する
3. When ワークスペースのメンバーが検索結果からユーザーを選択してメンバー追加を実行した場合、the Workspace Service shall 選択されたユーザーを当該ワークスペースのメンバーとして追加する
4. The Workspace Service shall メンバー追加においてメール送信・招待リンクの発行を行わない
5. If ワークスペースのメンバーでないログインユーザーが当該ワークスペースへのメンバー追加を試みた場合、the Workspace Service shall 拒否する

### Requirement 5: メンバーの対等な権限
**Objective:** As a ワークスペースに追加されたメンバー, I want 他のメンバーと同じ操作ができる, so that 細分化されたロールの学習コストなく利用できる

#### Acceptance Criteria
1. The Workspace Service shall ワークスペース内のメンバー間に役割・権限差を設けない
2. When ユーザーがワークスペースにメンバーとして追加された場合、the Workspace Service shall そのユーザーに他の既存メンバーと同一の操作権限を付与する

### Requirement 6: ワークスペース設定の更新
**Objective:** As a ワークスペースのメンバー, I want ワークスペースの名前と識別色を変更できる, so that チーム内で見分けやすい状態を保てる

#### Acceptance Criteria
1. When ワークスペースのメンバーがワークスペース名を変更して保存した場合、the Workspace Service shall 当該ワークスペースの名前を更新する
2. If ワークスペース名を空にして保存が実行された場合、the Workspace Service shall 更新を拒否しエラーを提示する
3. When ワークスペースのメンバーが用意された選択肢から識別色を選んで保存した場合、the Workspace Service shall 当該ワークスペースの識別色を更新する
4. If 用意された選択肢に含まれない値で識別色の更新が試みられた場合、the Workspace Service shall 更新を拒否する
5. If ワークスペースのメンバーでないログインユーザーが当該ワークスペースの設定変更を試みた場合、the Workspace Service shall 拒否する

### Requirement 7: ワークスペースの削除
**Objective:** As a ワークスペースの作成者, I want 不要になったワークスペースを削除できる, so that 使わなくなった可視境界を整理できる

#### Acceptance Criteria
1. When ワークスペースの作成者がワークスペース削除を実行した場合、the Workspace Service shall 当該ワークスペースおよびそのメンバーシップを削除する
2. If 作成者以外のメンバーがワークスペース削除を試みた場合、the Workspace Service shall 拒否する
3. If ログインユーザーが自身の所属していないワークスペースの削除を試みた場合、the Workspace Service shall 拒否する
4. When 操作者の現在ワークスペースが削除された場合、the Workspace Service shall 現在ワークスペースの選択を解除する
