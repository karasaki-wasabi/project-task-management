# Gap Analysis: error-page

## 1. 現状調査

### 既存資産
- `frontend/error.vue` は存在しない。Nuxtのデフォルト挙動(素のエラー表示)に委ねている状態
- fatalエラー発生源として確認できるもの:
  - `frontend/middleware/workspace-member.ts`の`throw createError({ statusCode: 404 })`(非所属・不明な`workspaceId`)
  - `frontend/pages/workspaces/[workspaceId]/tasks/[taskId].vue`の`showError(createError({ statusCode: 404 }))`(存在しないタスク)
- 401/403を`createError`/`showError`する経路は現時点でない。未ログインは`auth.global.ts`が`/login`へ誘導し、scoped API 403は`relocateAfterWorkspaceLost`が扱う。本仕様はこれらの経路を変えない
- 視覚言語の資産:
  - `tailwind.config.ts`: `primary`カラースケール(50/100/500/600/700、`#1d4ed8`系)、`Noto Sans JP`フォント
  - ボタンパターン(`login.vue`): `rounded-md bg-primary-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2`
  - インラインエラー表示(`components/shared/ErrorAlert.vue`): `role="alert"`、`bg-red-50 text-red-700`。本specのError Pageとは役割が異なるため踏襲するのは配色トーンのみ
  - 認証系画面(`pages/login.vue`)は`app.vue`のヘッダーを持たない専用レイアウト(`isAuthScreen`分岐)。Error Pageも同様にNuxtの仕組み上`app.vue`のレイアウト外で描画される(下記「制約」参照)
- ナビゲーション: `utils/workspacePath.ts`の`buildNavLinks`、トップページは`/`(structure.mdの定義: last-used有効ならダッシュボード、なければ一覧・追加)

### 規約・パターン
- Vueコンポーネントは`PascalCase`、ページは`index.vue`固定
- `frontend/composables/`配下は自動インポート、明示的importなし
- フロントエンドの唯一のHTTP境界は`useApiClient.ts`(Error Pageは新規のAPI呼び出しを持たない想定なので影響なし)

### 統合面(Integration Surfaces)
- **Nuxtのerror.vue契機**: (a) ルート解決前後(ミドルウェア内の`createError`)、(b) 明示的な`showError()`呼び出し、(c) Nuxtが内部的に捕捉するfatalなレンダリングエラー
- **`frontend/plugins/error-reporter.client.ts`**: `nuxtApp.vueApp.config.errorHandler`を独自ハンドラで**上書き**し、Vueのレンダリング/ライフサイクルエラーをバックエンドへ通報後に握りつぶす(rethrowしない)。`window.addEventListener('error'/'unhandledrejection', ...)`は加算的(既存リスナーを排除しない)だが、`config.errorHandler`は単一の関数参照であるため排他的

## 2. 要件の実現可能性分析

### Requirement-to-Asset Map

| 要件 | 技術的ニーズ | 現状資産 | ギャップ分類 |
|---|---|---|---|
| R1: statusCode別メッセージ(404/403/401/500+フォールバック) | `error.vue`内でのstatusCode分岐ロジック、メッセージ/アイコン定義 | なし(新規) | **Missing** |
| R2.1-2.2: ホームへ戻る導線 | トップページ(`/`)への遷移リンク | `NuxtLink`/`navigateTo`パターンは既存画面に多数あり | Constraint(パターン踏襲のみ、新規実装は軽微) |
| R2.3-2.4: 401時のログイン誘導 | `/login`への遷移リンク(`redirect`クエリの要否は設計判断) | `login.vue`の`redirectPath()`が`route.query.redirect`を読む実装は既存 | Constraint |
| R3: 視覚的統一 | `primary`カラー・ボタンスタイル・フォントの踏襲 | `tailwind.config.ts`・`login.vue`のボタンパターンで踏襲可能 | Constraint(新規CSSトークン不要) |
| R4.1: ルーティング由来のfatalエラー(404等) | ミドルウェアの`createError`がNuxtの標準error.vue契機を使う | `workspace-member.ts`で実証済みの標準経路 | 実現可能(追加実装不要、Nuxt標準機構) |
| R4.2: 実行時の予期しないfatalエラー | Vueのレンダリング/ライフサイクルエラーが`error.vue`に到達すること | **`error-reporter.client.ts`が`config.errorHandler`を排他的に上書きしており、Nuxtの既定の「エラーページへ遷移する」経路を奪っている可能性がある** | **Unknown / Research Needed**(下記参照) |

### Research Needed: `error-reporter.client.ts`とError Pageの経路競合

`error-reporter.client.ts`は`nuxtApp.vueApp.config.errorHandler`をバックエンド通報専用に上書きしており、エラーを`console`/Nuxtの既定処理に伝播させていない(`report()`は`.catch(() => {})`で握りつぶすのみで、rethrowも`showError()`呼び出しもない)。Nuxt本体もクライアント側で同じ`config.errorHandler`スロットに独自ハンドラを設定し、それが最終的に`error.vue`への遷移(`showError()`相当)をトリガーする実装になっている。同一スロットへの上書きは後勝ちのため、**現状のプラグイン実装のままではRequirement 4.2(実行時の予期しないfatalエラーでのError Page表示)が満たされない可能性が高い**。

設計フェーズで以下を確認・決定する必要がある:
- Nuxt 4(`ssr: false`)における`vue:error`フック/`config.errorHandler`とerror.vue表示の実際の関係(バージョン固有の挙動)
- `error-reporter.client.ts`側で通報後に`showError()`を呼ぶ、またはエラーをrethrowしてNuxt既定処理に委ねるなどの改修要否
- この改修が発生する場合、[[error-handling]] steeringの「個別ページで独自のグローバルエラーキャッチを実装しない — このプラグインに一元化する」という既存方針との整合(プラグイン自体の責務拡張であり新規キャッチの追加ではないため、方針とは矛盾しない見込み)

### 非機能要件
- パフォーマンス・スケーラビリティへの影響なし(静的な表示コンポーネント)
- セキュリティ: 401/403表示文言がユーザーや権限に関する内部情報を過剰に露出しないよう設計時に一般的な文言に留める(バックエンドのエラーメッセージをそのまま転記しない)

### 複雑度シグナル
- 基本的にステートレスな表示コンポーネント(UI/条件分岐のみ)。ただし上記の`error-reporter.client.ts`との経路競合が事実であれば、既存プラグインの改修という追加ワークロードが発生する

## 3. 実装アプローチの選択肢

### Option A: 新規`frontend/error.vue`単体で完結
Nuxtの規約通り`frontend/error.vue`を1ファイル追加し、`error.statusCode`に応じた表示分岐・導線をすべてこのファイル内(または小さな内部関数)に実装する。

- **対象ファイル**: `frontend/error.vue`(新規)
- **互換性**: 既存コードへの変更なし。ゼロリスク
- **複雑度**: 単一ファイルで完結する限り低い。ただしR4.2のResearch Needed項目が「実装不要」と判明した場合のみ成立

**Trade-offs**
- ✅ 変更範囲が最小、既存機能への影響ゼロ
- ✅ Nuxtの標準規約に完全準拠
- ❌ R4.2の経路競合が実際に存在した場合、このオプション単体では要件を満たせない

### Option B: `error.vue`新設 + `error-reporter.client.ts`改修(ハイブリッド)
Option Aに加えて、`error-reporter.client.ts`の`errorHandler`内で通報後に`showError(error)`を明示的に呼ぶ(またはNuxtの既定処理へ委譲する形にrethrowする)よう改修する。

- **対象ファイル**: `frontend/error.vue`(新規)、`frontend/plugins/error-reporter.client.ts`(改修)
- **互換性**: `error-reporter.client.ts`は全ページ共通のグローバルプラグインのため、改修が既存の「エラー通報が握りつぶされて業務に影響しない」という前提([[error-handling]])を壊さないよう、`showError()`呼び出しも同様に例外を出さない形にする必要がある
- **複雑度**: 中。既存プラグインの責務(通報)にError Page表示という副作用を追加するため、両者の意図が混ざらないよう設計時に責務分離を明確化する

**Trade-offs**
- ✅ R4.2を含む全要件を確実に満たせる
- ✅ 既存の「グローバルエラーキャッチはこのプラグインに一元化する」方針とも整合
- ❌ 既存プラグインへの変更が伴うため、既存の通報機能(レート制限含む)への回帰がないことをテストで確認する必要がある

### Option C: Error Page表示ロジックをコンポーザブルとして切り出す
`error.vue`本体は薄く保ち、statusCode→表示内容のマッピングロジックを`composables/useErrorPageContent.ts`のような純粋関数として切り出す。

- **対象ファイル**: `frontend/error.vue`(新規、薄いラッパー)、`frontend/composables/useErrorPageContent.ts`(新規)
- **理由**: マッピングロジックを単体テスト(Vitest)しやすくする。`useErrorReportRateLimit.ts`が同様に「純粋関数の抽出」パターンを既に採用しており、規約と整合する
- **複雑度**: Option Aとほぼ同等、ファイル数のみ増える

**Trade-offs**
- ✅ ロジックの単体テストが書きやすい(既存の`useErrorReportRateLimit.ts`パターンを踏襲)
- ✅ `error.vue`自体はテンプレート/レイアウトに集中できる
- ❌ ファイルが1つ増える(小規模機能に対してはやや過剰の可能性もある)

Option CはOption A/Bのどちらとも独立に採用可否を判断できる(表示ロジックの切り出し方の話であり、R4.2への対処とは別軸)。

## 4. 実装複雑度とリスク

- **Effort**: S(1〜3日) — 新規UIコンポーネント1〜2ファイル。ただしR4.2のResearch Needed項目が「改修必要」と判明した場合はM(3〜7日)に上振れする可能性あり(既存プラグインの回帰テストを含むため)
- **Risk**: Low〜Medium — 表示のみの新規コンポーネントはLowだが、`error-reporter.client.ts`との経路競合の実際の挙動が未検証(Unknown)であるため、その検証結果次第でMediumに変わりうる

## 5. 設計フェーズへの推奨事項

- **推奨アプローチ**: Option B(ハイブリッド) + Option C(ロジック切り出し)の組み合わせを軸に検討する。ただし、まず設計フェーズの冒頭で「Research Needed」項目(`error-reporter.client.ts`とNuxt標準のerror.vue遷移経路の実際の関係)を検証し、競合が実在しないと確認できればOption Aまで縮小してよい
- **設計フェーズで確定すべき事項**:
  1. R4.2(実行時fatalエラー)が実際に`error.vue`へ到達するかの実機検証(ローカルDocker環境でわざとVueレンダリングエラーを起こし、`error.vue`が表示されるか確認)
  2. `app.vue`のヘッダー/ナビゲーションをError Page上でも表示するか、`login.vue`同様の独立レイアウトにするか(視覚的統一の実装方針に直結)
  3. 401表示時のログイン導線が`redirect`クエリを引き継ぐか(既存の`login.vue`の`redirectPath()`実装と接続できるかの確認)
  4. アイコン/図表現の要否と、使用する場合のアセット方針(絵文字・インラインSVG・アイコンライブラリ導入の要否)

---

## 設計フェーズ追加調査: Nuxt本体のエラー経路の実装確認

### `vueApp.config.errorHandler`とerror.vue遷移の関係(確定)

- **Context**: gap analysis時点で「Research Needed」としていた、`error-reporter.client.ts`がNuxt標準のerror.vue遷移経路を奪っている可能性について、`node_modules/nuxt/dist/app/entry.js`(Nuxt 4.5.1、本プロジェクトの実インストールバージョン)を直接確認した
- **Findings**:
  - Nuxtはクライアント起動時に`vueApp.config.errorHandler = handleVueError`を設定し、その後`applyPlugins(nuxt, plugins)`でユーザー定義プラグイン(`error-reporter.client.ts`を含む)を実行する。プラグインが`vueApp.config.errorHandler`を上書きすると、以降このスロットはユーザー定義ハンドラが専有する
  - Nuxtは`app:suspense:resolve`フック(初回マウント完了時)で「`vueApp.config.errorHandler`がまだ自身の既定ハンドラ(`handleVueError`)のままなら`undefined`に戻す」処理を行う。**つまりNuxt既定のVueエラーハンドラは、初回マウントが完了した後は自動的に無効化される仕様であり、`error-reporter.client.ts`の有無にかかわらず、マウント後のVueレンダリング/ライフサイクルエラーをerror.vueへ自動遷移させる経路はNuxt本体にはそもそも存在しない**
  - `error-reporter.client.ts`は`applyPlugins`実行時にこのスロットを上書きするため、実質的に「アプリ全体のVueエラーハンドラ」を(起動時・マウント後を問わず)恒久的に専有している。現状の実装は通報後に`.catch(() => {})`で握りつぶすのみで、`showError()`を呼ばないため、Vueレンダリングエラー発生時に error.vue へ遷移する経路が実質的に存在しない
  - 一方、`frontend/middleware/workspace-member.ts`のような**ルーティング由来**のエラー(`throw createError(...)`)は、`node_modules/nuxt/dist/app/plugins/router.js`内のルーターナビゲーションガードが直接`nuxtApp.runWithContext(() => showError(error))`を呼び出しており、`vueApp.config.errorHandler`の状態とは独立した別経路。**この経路は本specの変更対象に関わらず既に機能しており、Requirement 4.1は追加実装なしで満たされる**
  - h3(`node_modules/h3/dist/index.mjs`)の`H3Error`クラスは`statusCode = 500`をデフォルト値として持つ。`createError()`にstatusCodeを明示しない場合(`window.onerror`/`unhandledrejection`由来のプレーンな`Error`など)、生成される`NuxtError`の`statusCode`は自動的に500になる。これによりRequirement 1.7(statusCode不定時のフォールバック)は実運用上ほぼ発生せず、500と同じ表示に倒して差し支えない
- **Implications**:
  - Requirement 4.2(実行時の予期しないfatalエラー)を満たすには、`error-reporter.client.ts`の3つのエラー捕捉経路(Vueの`config.errorHandler`、`window.addEventListener('error', ...)`、`window.addEventListener('unhandledrejection', ...)`)それぞれで、通報処理に加えて`nuxtApp.runWithContext(() => showError(error))`を呼ぶ改修が必須。gap analysis時点のOption B(ハイブリッド)が正しい方向性だったことが確定した
  - `showError()`は内部で`error.value ||= nuxtError`という「最初の1回だけ書き込む」実装のため、同一セッション中に複数回エラーが発生しても安全に複数回呼び出せる(追加のガード処理は不要)

## 設計決定(Design Decisions)

### Decision: `error-reporter.client.ts`の改修範囲
- **Context**: Requirement 4.2を満たすための実装方針
- **Alternatives Considered**:
  1. `error-reporter.client.ts`は変更せず、新しいグローバルエラーハンドラを別プラグインとして追加する
  2. `error-reporter.client.ts`の既存3ハンドラ内で、通報処理の後に`showError()`を呼ぶよう改修する
- **Selected Approach**: 2。既存3ハンドラ(`config.errorHandler`/`window.onerror`/`unhandledrejection`)内で、通報(`report()`)呼び出し後に`nuxtApp.runWithContext(() => showError(error))`を追加する
- **Rationale**: [[error-handling]] steeringが「個別ページで独自のグローバルエラーキャッチを実装しない — このプラグインに一元化する」と明記しており、別プラグインを追加すると同じ`window`イベントに対して二重のリスナーを持つことになり方針に反する。既存プラグインの責務(グローバルエラー捕捉の一元化)の範囲内での機能追加であり、新規キャッチの追加ではない
- **Trade-offs**: 既存プラグインへの変更が伴うため、レート制限(`useErrorReportRateLimit.ts`)を含む既存の通報機能への回帰がないことをテストで確認する必要がある。ただし`showError()`呼び出し自体はレート制限の対象外とする(通報は連続エラーを抑制すべきだが、画面表示は都度出してよい — ユーザーが同じ操作を繰り返して同じエラーに当たった場合、無反応に見えるのを避けるため)
- **Follow-up**: 実装時に、Vitestで3ハンドラそれぞれについて「`report`が呼ばれること」と「`showError`相当の処理が呼ばれること」を検証する

### Decision: statusCode→表示内容マッピングの切り出し
- **Context**: gap analysisのOption C(コンポーザブルへの切り出し)採用可否
- **Alternatives Considered**:
  1. `error.vue`内に直接分岐ロジックを書く
  2. `useErrorPageContent.ts`という純粋関数コンポーザブルに切り出す
- **Selected Approach**: 2
- **Rationale**: 既存の`useErrorReportRateLimit.ts`が同じ「純粋関数をcomposableとして切り出しVitestで単体テストする」パターンを採用しており、規約と整合する。`error.vue`はレイアウト・テンプレートに専念できる
- **Trade-offs**: ファイルが1つ増えるが、6状態の分岐(404/403/401/500/汎用4xx/汎用5xx/statusCode不定)をDOM構築なしでテストできる利点が上回る

## 設計原則の適用(Synthesis)

- **一般化**: 「404/403/401/500の専用状態」と「汎用4xx/5xxフォールバック」は、どちらも「statusCode → 表示内容」という同一の関数シグネチャに一般化できる。`useErrorPageContent(statusCode)`という単一インターフェースで両方を扱い、実装を専用4分岐+フォールバック2分岐に限定する(将来429等を専用状態に追加する場合も同じ関数内で分岐を増やすだけで済む)
- **Build vs Adopt**: アイコンは既存踏襲通りインラインSVG(heroicons-outline相当)を手書きする。この規模(6種類、変更頻度が低い)でアイコンライブラリを新規導入するコストは見合わない(既存steeringのtech.mdにもアイコンライブラリの記載なし、既存コンポーネントも全てインラインSVG)
- **簡略化**: 当初検討したstatusCode未定義時の専用ビジュアル状態は不要と判断。h3の`H3Error`が`statusCode`のデフォルト値として500を持つため、実運用でstatusCodeが`undefined`になるケースはほぼ存在せず、500と同一の表示に倒すことで防御的な分岐を1つ減らせる

---

## ビジュアルデザイン確定(claude design連携)

- **Claude Design プロジェクト**: https://claude.ai/design/p/a7af6a4c-6aea-49ae-8893-53cb685fe264?file=Error+Pages.dc.html
- **モックファイル**: `Error Pages.dc.html`(第4ラウンドまで実施、最終版)
- **プロンプト記録**: [claude-design-prompt.md](./claude-design-prompt.md)(第1〜第4ラウンドの全文)

### 採用レイアウト: B案(ヘッダーなし・全画面中央寄せ1カラム)

`login.vue`と同じ「独立レイアウト」の系譜。`app.vue`の共通ヘッダー(ナビ・ワークスペース切替・ログアウト)は表示しない。理由: `error.vue`は認証・ワークスペース情報の取得に失敗した状態でも必ず描画される必要があり、ヘッダーが依存するデータが無い前提で組める方が堅牢。401/403で「使えないナビ」を見せずに済む点も採用理由。これにより上記「設計フェーズで確定すべき事項」の2番は解決済み。

不採用: A案(共通ヘッダーを残す)。401/403時にヘッダー内のユーザー情報取得が失敗して崩れるリスクがあるため。

### アイコン/ステータスコードの統合方式: バッジ重ね方式(円アイコン + 重ねたコードバッジ)で確定

- 56〜72pxの円(背景`#f1f5f9`、`color:#475569`)にheroicons-outline相当のインラインSVGアイコン(404=虫眼鏡、403=施錠、401=ログインドア風矢印、500=警告三角、汎用4xx=はてなマーク、汎用5xx=サーバーラック)
- コードバッジは6状態すべて同一仕様: フォントサイズ14px(本文と同じ)、背景`#334155`(slate-700)固定・白文字、白2pxボーダー、アイコン円の右下に重ねる(アイコン本体には掛けない。モックの`right:-34px; bottom:-6px`相当)
- 不採用: コード主役方式(円の中にコード数字を主役として置く案)。403/401のような文言だけで区別できる状態では数字の判読に頼る分だけ識別性が弱いため
- 途中で試した「汎用4xx/5xxのバッジだけ拡大・濃色化する案」も不採用。実際に見ると6状態間で扱いが不揃いになり違和感が出たため、最終的に全状態同一仕様(14px・同一背景色)に統一

### 確定文言

「管理者」ロールや問い合わせ窓口は文言に出さない(RBAC未導入・正式窓口なし)。狭い幅モックの本文短縮は使わず、次のデスクトップ文言を正本とする。

| 状態 | title | message |
|------|-------|---------|
| 404 | お探しのページが見つかりません | URLが変更されたか、削除された可能性があります。ホームから操作をやり直してください。 |
| 403 | このページへのアクセス権限がありません | 閲覧に必要な権限が付与されていません。心当たりがない場合は、ログイン中のアカウントとワークスペースをご確認ください。 |
| 401 | ログインが必要です | セッションの有効期限が切れた可能性があります。再度ログインしてください。 |
| 500 | 予期せぬエラーが発生しました | 時間をおいて再度お試しください。 |
| 汎用4xx | エラーが発生しました | リクエストを処理できませんでした。操作をやり直してください。 |
| 汎用5xx | エラーが発生しました | サーバー側で問題が発生しています。時間をおいて再度お試しください。 |

### 主要コントロール

- 404 / 403 / 500 / 汎用4xx / 汎用5xx: 「ホームへ戻る」(Primary、`/`へ遷移)の1つのみ
- 401: 「ホームへ戻る」(Secondary) + 「ログイン画面へ」(Primary)。見た目の並びは左Secondary→右Primary。遷移先はモックが`/login`とだけ書いているが、実装は`/login?redirect=`で復帰先を渡す(login.vueの既存`redirectPath()`に接続)

### 実装時の申し送り事項

- 狭い幅: アイコン円は56px、バッジは右下重ねのまま位置を変えない、円は中央寄せ固定。見出しは18px。401の2ボタンは縦積みしPrimaryを上にする
- コードバッジの`error.statusCode`差し込みは、404/403/401/500では補助情報、汎用4xx/5xxでは状態を識別する主要情報である。見た目は6状態とも同一でよい
- `tailwind.config.ts`にトークンは足さない。モック固有のユーティリティクラスは`error.vue`内で使ってよい

---

## design review(`/kiro-validate-design`)の指摘と対応

### Critical Issue: `window.onerror`/`unhandledrejection`のノイズによるError Page誤爆

- **Context**: design.mdの初版は、`error-reporter.client.ts`の3ハンドラすべてで無条件に`showError()`を呼ぶ設計だった。`window`の`error`/`unhandledrejection`イベントはサードパーティスクリプト・ブラウザ拡張機能・中断されたfetch起因の`unhandledrejection`などアプリのバグではない事象でも発火するため、これらのノイズでもError Pageに切り替わり、ユーザーの作業状態(入力中のフォーム等)が失われるリスクが指摘された
- **Decision**: ユーザーは「今回対応する」を選択。`window`の`error`/`unhandledrejection`の2経路のみ、`event.error`/`event.reason`が実際に`Error`インスタンスである場合に限り`showError()`を呼ぶフィルタを追加する。`Error`インスタンスでない場合は従来通り`report()`のみ行う
- **Rationale**: `vueApp.config.errorHandler`はアプリ自身のコンポーネントレンダリング/ライフサイクル内のエラーに限定されるため誤爆リスクが低く、フィルタは適用しない(常に`showError()`を呼ぶ)。`window`レベルの2経路はページ全体のあらゆるスクリプトのエラーを拾うため、フィルタで実質的なノイズの多くを除去できる
- **Follow-up**: design.mdの`error-reporter.client.ts (modified)`節とTesting Strategyに反映済み。実装時、(a) `Error`インスタンスの場合は`report`と`showError`の両方が呼ばれること、(b) `Error`インスタンスでない場合は`report`のみ呼ばれること、をVitestで検証する

### 補足: 「通報用モジュールに画面遷移の責務が混ざる」ことへの懸念

- **Context**: design承認前に、`error-reporter.client.ts`(本来「エラー通報」のためのプラグイン)に画面遷移トリガー(`showError`呼び出し)を足すことで、責任のスコープが曖昧にならないかという懸念が挙がった
- **Decision**: 監視窓口(`window`/`vueApp.config.errorHandler`の購読箇所)は1つのまま増やさない([[error-handling]]の一元化方針を維持)。ファイル内部は、通報専用の`report()`とError Page表示トリガー専用の`triggerErrorPage()`という名前で責務が分かれた2つの関数に分割し、3つのハンドラはこの2関数を呼ぶだけにする
- **Rationale**: 別プラグインに分割すると同じ`window`イベントに2つ目のリスナーを追加することになり一元化方針に反する。一方、1ファイル内で関数レベルの責務分離をすることで、「捕まえる場所は1つ、反応(通報/表示)は用途ごとに独立した関数」という形に整理でき、懸念に対応できる
- **Follow-up**: design.mdの`error-reporter.client.ts (modified)`節に反映済み。タスク分解時もこの2関数構成を前提にする
