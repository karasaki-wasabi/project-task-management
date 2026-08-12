# Requirements Document

## Introduction

ログインユーザーは、案件・タスク等をワークスペース単位で扱っているが、画面 URL が `/tasks` や `/kanban` のようにフラットなため、どのワークスペースを見ているかが URL から分からない。現在ワークスペースはブラウザ内の記憶と API リクエスト時の文脈に依存しており、ブックマーク共有・戻る／進む・複数タブで文脈がズレやすい。

本仕様は、業務画面の URL を `/workspaces/:workspaceId/...` 形式にし、当該画面では URL 上のワークスペース識別子を現在ワークスペースの正本とする。ルート `/` は前回利用したワークスペースのダッシュボードへ進むか、それが無い場合はワークスペース一覧・追加を表示する。旧来のフラットな業務 URL、および存在しない／非所属のワークスペース識別子は、見つからない画面（404）として扱う。API のパス階層化は行わない。

## Boundary Context

- In scope
  - 業務画面 URL へのワークスペース識別子の付与と、現行→新 URL 対応の確定（本文書の URL 対応表）
  - scoped 画面における現在ワークスペースと URL の一致
  - `/` の分岐（前回利用ワークスペースへ進む／一覧・追加を表示）
  - ヘッダーからのワークスペース切替時に、同じ画面種のまま識別子だけを付け替えること
  - 旧フラット業務 URL、および存在しない／非所属のワークスペース識別子へのアクセスを見つからない画面とすること
  - ログイン後の戻り先が新 URL を保持すること、および業務上必要なクエリ（例: 案件絞り込み）の維持
  - ナビ・画面内リンク・空状態導線が新 URL 規約と矛盾しないこと
  - 見つからない画面の最低限の表示（本格的なエラーページデザインは対象外）
- Out of scope
  - API パスを `/api/workspaces/:id/...` 形式へ変更すること（既存のワークスペース文脈付き API 呼び出しを維持）
  - 消化数 API 自体のワークスペーススコープ化（後続仕様）
  - 旧フラット業務 URL からの互換リダイレクト
  - 404／500 等のエラーページ本格デザイン
  - ワークスペースの作成・所属・メンバー追加・設定変更・削除の業務ルール自体の変更（導線と URL 整合のみ）
  - 案件・タスク等の可視境界ルール自体の変更
- Adjacent expectations
  - ログイン状態の確立と未ログイン時の保護は `user-auth` が担う。本仕様は保護後の画面 URL と戻り先の保持を扱う
  - ワークスペースとメンバーシップの正本、および「非メンバーは所属ワークスペースとして扱えない」ことは `workspace-membership` が担う
  - リソースのワークスペース帰属と API 上の読み書き拒否は `workspace-resource-scope` が担う。本仕様は画面 URL と現在ワークスペース文脈の一致を扱う
  - 所属外リソース ID を API がどう拒否するか（存在秘匿の 404 等）は既存方針を前提とし、本仕様は画面 URL 上のワークスペース識別子に対する見つからない画面を規定する

## Requirements

### Requirement 1: 業務画面 URL へのワークスペース識別
**Objective:** As a ログインユーザー, I want 業務画面のアドレスにワークスペースが含まれる, so that 見ている可視境界が URL から分かり、共有や再訪ができる

#### Acceptance Criteria
1. The Workspace URL機構 shall ダッシュボード・タスク・カンバン・開発段階・案件・カレンダー・繰り返し・非営業日・消化数の各業務画面を、`/workspaces/:workspaceId/...` 形式のアドレスで提供する
2. The Workspace URL機構 shall 上記の対応を本文書「URL 対応表」のとおりとする
3. While ログインユーザーが特定ワークスペースの業務画面を表示している, the Workspace URL機構 shall 画面上のナビおよび画面内の業務リンクが、同じワークスペース識別子を含むアドレスを指すようにする
4. When タスク一覧へ案件絞り込み付きで遷移する場合、the Workspace URL機構 shall 新 URL 上でも当該絞り込みクエリを維持する

### Requirement 2: ルート画面の分岐
**Objective:** As a ログインユーザー, I want 前回のワークスペースが分かるときはすぐ業務に戻れ、無いときは一覧から選べる, so that ログイン直後や初回利用でも迷わず進める

#### Acceptance Criteria
1. When ログインユーザーが `/` を開いた、かつ前回利用したワークスペースが所属ワークスペースとして有効な場合、the Workspace URL機構 shall そのワークスペースのダッシュボードへ進める
2. If ログインユーザーが `/` を開いた、かつ前回利用したワークスペースが無い、または所属として無効な場合、the Workspace URL機構 shall ワークスペースの一覧および追加ができる表示を `/` 上で提示する
3. When ログインユーザーが有効なワークスペースの業務画面を利用した場合、the Workspace URL機構 shall そのワークスペースを以降の `/` 分岐向けに前回利用ワークスペースとして記憶する

### Requirement 3: URL を正本とする現在ワークスペース
**Objective:** As a ログインユーザー, I want アドレス欄のワークスペースと操作対象が常に一致する, so that タブや履歴を行き来しても別ワークスペースのデータを誤って扱わない

#### Acceptance Criteria
1. While ログインユーザーが `/workspaces/:workspaceId/...` 形式の業務画面を表示している, the Workspace URL機構 shall 当該 `:workspaceId` を現在ワークスペースとして扱う
2. When ログインユーザーが別ワークスペース識別子を含む業務画面アドレスを開いた場合、the Workspace URL機構 shall 表示・操作対象をそのワークスペースに切り替える
3. The Workspace URL機構 shall 業務画面の表示中に、アドレス上のワークスペースと異なるワークスペースを黙って現在ワークスペースにしない

### Requirement 4: ワークスペース切替時の画面種維持
**Objective:** As a ログインユーザー, I want ヘッダーでワークスペースを切り替えても同じ種類の画面に留まれる, so that 比較や切り替えのたびに目的画面へやり直さなくてよい

#### Acceptance Criteria
1. When ログインユーザーが業務画面の表示中にヘッダーから別の所属ワークスペースへ切り替えた場合、the Workspace URL機構 shall 同じ画面種のまま、新しいワークスペース識別子を含むアドレスへ移す
2. When 上記の切替で移行先アドレスを決める場合、the Workspace URL機構 shall 移行元で保持していたクエリのうち、画面種として意味のあるものを可能な範囲で維持する

### Requirement 5: 不正・旧アドレスを見つからない画面として扱う
**Objective:** As a ログインユーザー, I want 使えない・古いアドレスは見つからないと分かる, so that 所属外や廃止パスへ誤って入り込まない

#### Acceptance Criteria
1. If ログインユーザーが、存在しないワークスペース識別子、または自身がメンバーでないワークスペース識別子を含む業務画面アドレスを開いた場合、the Workspace URL機構 shall 見つからない画面（404）を提示する
2. If ログインユーザーが、ワークスペース識別子を含まない旧来のフラットな業務アドレス（例: `/tasks`, `/kanban`）を開いた場合、the Workspace URL機構 shall 見つからない画面（404）を提示し、自動では新アドレスへ付け替えない
3. The Workspace URL機構 shall 見つからない画面について、最低限「見つからない」ことが分かる表示を行う（見た目の作り込みは求めない）

### Requirement 6: 表示中ワークスペースが利用不可になった場合
**Objective:** As a ログインユーザー, I want 見ていたワークスペースが消えた・外れても止まらない, so that 削除やメンバー変更の直後に壊れた画面に取り残されない

#### Acceptance Criteria
1. When 表示中のワークスペースが削除された、またはログインユーザーが当該ワークスペースのメンバーでなくなった場合、the Workspace URL機構 shall そのワークスペースの業務画面を表示し続けない
2. When 上記が発生し、ログインユーザーに他の所属ワークスペースが残っている場合、the Workspace URL機構 shall 別の所属ワークスペースの同一画面種へ移す
3. When 上記が発生し、ログインユーザーの所属ワークスペースが残っていない場合、the Workspace URL機構 shall `/` のワークスペース一覧・追加表示へ移す

### Requirement 7: 認証・管理画面のアドレス据え置きとログイン戻り先
**Objective:** As a ログインユーザー, I want ログインやワークスペース管理の入口は分かりやすいまま、ログイン後は見ていた業務画面に戻れる, so that 認証と管理の導線が壊れない

#### Acceptance Criteria
1. The Workspace URL機構 shall `/login`・`/register`・ワークスペース管理画面（`/workspaces`）のアドレスを、ワークスペース識別子付き業務 URL へ変更しない
2. When 未ログインの利用者が業務画面アドレスへアクセスしてログイン画面へ誘導された場合、the Workspace URL機構 shall 元のアドレス（パスおよびクエリ）を戻り先として保持する
3. When ログインに成功し、有効な戻り先が保持されている場合、the Workspace URL機構 shall その戻り先へ進める

### Requirement 8: 所属ゼロ時の作成導線
**Objective:** As a 所属ワークスペースを持たないログインユーザー, I want 一覧からワークスペースを作れる, so that 業務画面に入れない状態でも次の行動が分かる

#### Acceptance Criteria
1. While ログインユーザーがどのワークスペースにも所属していない, when `/` を開いた場合、the Workspace URL機構 shall ワークスペースの一覧が空であることに加え、作成できる導線を提示する
2. While ログインユーザーがどのワークスペースにも所属していない, if ワークスペース識別子付きの業務画面アドレスを開いた場合、the Workspace URL機構 shall 見つからない画面（404）を提示する

## URL 対応表

`:workspaceId` は実際のワークスペース識別子に置き換わる。本表は Requirement 1 の規範とする。

| 区分 | 現行 | 新 | 備考 |
| --- | --- | --- | --- |
| 認証 | `/login` | `/login` | 変更なし。戻り先はパス＋クエリを保持 |
| 認証 | `/register` | `/register` | 変更なし |
| ランディング | `/` | `/` | 前回利用 WS があればそのダッシュボードへ。なければ一覧・追加 |
| WS 管理 | `/workspaces` | `/workspaces` | 識別子なしの管理画面 |
| ダッシュボード | `/`（選択中 WS の内容） | `/workspaces/:workspaceId` | |
| タスク | `/tasks` | `/workspaces/:workspaceId/tasks` | 案件絞り込みクエリを維持 |
| カンバン | `/kanban` | `/workspaces/:workspaceId/kanban` | |
| 開発段階 | `/kanban/stages` | `/workspaces/:workspaceId/kanban/stages` | |
| 案件 | `/cases` | `/workspaces/:workspaceId/cases` | |
| カレンダー | `/calendar` | `/workspaces/:workspaceId/calendar` | |
| 繰り返し | `/recurrence` | `/workspaces/:workspaceId/recurrence` | |
| 非営業日 | `/holidays` | `/workspaces/:workspaceId/holidays` | |
| 消化数 | `/throughput` | `/workspaces/:workspaceId/throughput` | 画面 URL のみ。API スコープ化は別仕様 |
| 廃止 | `/tasks` 等の旧フラット業務 URL | （なし・404） | 互換リダイレクトなし |
| 拒否 | `/workspaces/<非所属or不明>/...` | 404 | |

## Project Description (Input)

ログインユーザーは、タスク・カンバン等をワークスペース単位で扱っているが、画面 URL が `/tasks` や `/kanban` のようにフラットなため、どのワークスペースを見ているかが URL から分からない。現在ワークスペースは `localStorage`（`currentWorkspaceId`）と API ヘッダ `x-workspace-id` に依存しており、ブックマーク共有・戻る／進む・複数タブで文脈がズレやすい。あわせて、現行 URL の一覧と不整合の棚卸しもできていない。

データ可視境界自体は `workspace-resource-scope` で実装済みであり、API は今後もフラットな `/api/tasks` 等に `x-workspace-id` ヘッダでスコープする（API パスの階層化は本仕様の対象外）。変えたいのはブラウザ画面の URL と、それに合わせた現在ワークスペース文脈である。

業務画面を `/workspaces/:workspaceId/...` 形式にし、scoped ページでは URL の `workspaceId` を現在ワークスペースの正本とする。`/` は最後に使ったワークスペースのダッシュボードへ進むか、未選択時はワークスペース一覧・追加を表示する。ヘッダー切替は同じ画面種のまま `workspaceId` を差し替える。旧フラット業務 URL と、存在しない／非所属の `workspaceId` は 404（最低限表示）とする。現行→新 URL の一覧表を仕様成果物として残す。UI は Claude Design を待たず既存画面を参考にし、エラーページの本格デザインは対象外とする。

Discovery の詳細は同ディレクトリの `brief.md` を参照する。
