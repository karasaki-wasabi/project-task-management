# Requirements Document

## Project Description (Input)
Nuxtの共通エラーページ(`error.vue`)のデザインが練られておらず、現状は未整備(ファイル自体が存在しない)。404/403/401/500などのfatalエラー発生時に、ユーザーに一貫した見た目・文言・導線を提供できていない。

`frontend/error.vue`を新規作成し、既存の視覚言語(配色・primary・モーダル/フォームのchrome)を踏襲した統一デザインで、主要なエラー種別ごとに適切なメッセージ・導線を表示できるようにする。

採用アプローチは「ステータス帯フォールバック方式」: 404 Not Found / 403 Forbidden / 401 Unauthorized / 500 予期せぬエラーの4種は専用アイコン・文言・導線を個別定義し、それ以外の4xx/5xxステータスコードは「4xx→クライアントエラー全般」「5xx→サーバーエラー全般」の汎用テンプレ(コード表示+一般文言)にフォールバックする、単一`error.vue`内でのstatusCode分岐とする。

対象範囲は`error.vue`のデザイン・実装のみ。バックエンドのエラー分類・`HttpError`パターン自体の変更、既存の`ErrorAlert.vue`(ページ内インラインエラー表示)の改修、`error-reporter.client.ts`のエラー通報ロジック自体の変更は対象外とする。

詳細は `.kiro/specs/error-page/brief.md` を参照。

## Boundary Context

- **In scope**: エラーページの表示内容(ステータスコード別メッセージ)、ページからのユーザー導線、既存デザイン言語との統一
- **Out of scope**: バックエンドのエラー分類・エラーレスポンス形式自体の変更、ページ内インラインエラー表示(既存の役割)の変更、未捕捉エラーの自動通報ロジックの変更
- **Adjacent expectations**: 未ログイン状態での業務画面アクセスは既存の認証ガードが事前にログイン画面へ誘導する。本エラーページの401/403表示は、当該statusCodeを受け取ったときの見た目と導線だけを規定する。401/403の新しい発生源は追加しない。scoped APIの403は既存のワークスペース退避処理が扱い、error.vueには載せない。ログイン画面への遷移導線は既存のログイン画面をそのまま利用し、ログイン画面自体の変更は行わない

## Requirements

### Requirement 1: ステータスコード別のメッセージ表示
**Objective:** As a アプリケーション利用者, I want エラーの種類に応じた分かりやすいメッセージを見る, so that 何が起きたのか、次に何をすべきかを理解できる

#### Acceptance Criteria
1. When エラーページがstatusCode 404を受け取る, the Error Page shall 対象のページやリソースが見つからない旨のメッセージを表示する
2. When エラーページがstatusCode 403を受け取る, the Error Page shall アクセス権限がない旨のメッセージを表示する
3. When エラーページがstatusCode 401を受け取る, the Error Page shall ログインが必要である旨のメッセージを表示する
4. When エラーページがstatusCode 500を受け取る, the Error Page shall 予期せぬエラーが発生した旨のメッセージを表示する
5. If エラーページが404・403・401・500以外の4xx台のstatusCodeを受け取る, then the Error Page shall クライアント側の要求に問題があった旨の汎用メッセージと受け取ったステータスコードを表示する
6. If エラーページが404・403・401・500以外の5xx台のstatusCodeを受け取る, then the Error Page shall サーバー側で問題が発生した旨の汎用メッセージと受け取ったステータスコードを表示する
7. If エラーページがstatusCodeを持たないエラーを受け取る, then the Error Page shall 予期せぬエラー扱いの汎用メッセージを表示する

### Requirement 2: エラー画面からのユーザー導線
**Objective:** As a アプリケーション利用者, I want エラー画面から次の行動に移れる, so that 操作に行き詰まらず作業を継続できる

#### Acceptance Criteria
1. The Error Page shall ホーム画面へ戻るための操作を常に表示する
2. When 利用者がホームへ戻る操作を行う, the Error Page shall アプリケーションのトップページへ遷移する
3. If エラーページがstatusCode 401を受け取る, then the Error Page shall ログイン画面へ遷移するための操作を追加で表示する
4. When 利用者がログイン画面へ遷移する操作を行う, the Error Page shall 既存のログイン画面へ遷移する

### Requirement 3: 既存デザイン言語との視覚的統一
**Objective:** As a アプリケーション利用者, I want 他の画面と統一感のあるデザインのエラー画面を見る, so that アプリケーションから切り離された違和感を覚えずに済む

#### Acceptance Criteria
1. The Error Page shall アプリケーションの他画面と共通の配色・主要操作(ボタン等)の見た目を用いて表示する
2. The Error Page shall 発生したステータスコードの種類を問わず、同一のレイアウト構造(メッセージ・アイコンまたは図・導線操作の配置)で表示する

### Requirement 4: 発生経路によらない表示の一貫性
**Objective:** As a アプリケーション利用者, I want ルーティング由来のエラーでも実行時の予期しないエラーでも同じ体裁の画面を見る, so that エラーの発生原因を意識せず一貫した体験を得られる

#### Acceptance Criteria
1. While 利用者がアプリケーション画面を操作している, when 存在しないページ・リソースへのアクセスによってfatalなエラーが発生する, the Error Page shall Requirement 1の分岐規則に従って表示される
2. While 利用者がアプリケーション画面を操作している, when 画面の実行中に予期しないfatalなエラーが発生する, the Error Page shall Requirement 1の分岐規則に従って表示される
