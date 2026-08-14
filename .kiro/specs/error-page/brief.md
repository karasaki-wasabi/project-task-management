# Brief: error-page

## Problem
Nuxtの共通エラーページ(`error.vue`)のデザインが練られておらず、現状は未整備(ファイル自体が存在しない)。404/403/401/500などのfatalエラー発生時に、ユーザーに一貫した見た目・文言・導線を提供できていない。

## Current State
- `frontend/error.vue` は存在しない(Nuxtのデフォルト挙動に委ねている状態)
- 既存の`ErrorAlert.vue`はページ内インラインエラー表示用のコンポーネントで、Nuxtのfatalエラー(`showError()`経由)とは役割が異なる
- `frontend/plugins/error-reporter.client.ts`が未捕捉エラーを`POST /api/client-errors`へ自動送信する仕組みは既にあるが、ユーザーに見せる画面側は未整備

## Desired Outcome
`frontend/error.vue`が、既存の視覚言語(配色・primary・モーダル/フォームのchrome)を踏襲した統一デザインで、主要なエラー種別ごとに適切なメッセージ・導線を表示する。

## Approach
**ステータス帯フォールバック方式**: 404 Not Found / 403 Forbidden / 401 Unauthorized / 500 予期せぬエラーの4種は専用アイコン・文言・導線を個別定義。それ以外の4xx/5xxステータスコードは「4xx→クライアントエラー全般」「5xx→サーバーエラー全般」の汎用テンプレ(コード表示+一般文言)にフォールバックする、単一`error.vue`内でのstatusCode分岐。

比較検討した代替案:
- 全ステータス個別マップ方式: 主要な全ステータスコードを個別定義。網羅性は高いが、実際に出現しないコードまで文言を作ることになり保守負債化しやすいため不採用
- 単一汎用画面(分岐なし): 実装コスト最小だが「404/403/401/500は個別に」という要望を満たせないため不採用

## Scope
- **In**:
  - `frontend/error.vue`のデザイン(claude designでのモック確定を含む)
  - 404 / 403 / 401 / 500 の専用メッセージ・アイコン・導線
  - それ以外の4xx/5xxステータスコードに対する汎用フォールバック表示
  - ユーザー導線: 「ホームへ戻る」ボタン、(401時は)ログイン画面への誘導
  - 既存の視覚言語(配色・primary・chrome)との統一
- **Out**:
  - バックエンドのエラー分類・`HttpError`パターン自体の変更([[error-handling]]で既に確立済み、変更不要)
  - `ErrorAlert.vue`(ページ内インラインエラー表示)の改修 — 完全に別物として扱う
  - `error-reporter.client.ts`のエラー通報ロジック自体の変更(既存の自動送信の仕組みは維持)
  - 新しいエラー種別・ステータスコードのバックエンド側での追加

## Boundary Candidates
- Nuxtの`error.vue` + `showError()`/`clearError()`という標準機構への準拠(フレームワーク規約)
- ステータスコード→表示内容のマッピングロジック(専用4種 + フォールバック2種)
- 導線コンポーネント(戻るボタン・ログイン誘導リンク)

## Out of Boundary
- ページ内インラインエラー表示(`ErrorAlert.vue`)は本specの対象外
- API側のステータスコード設計・エラーメッセージ本文の変更は対象外(既存のものをそのまま表示する)

## Upstream / Downstream
- **Upstream**: Nuxt 4のerror handling機構(`ssr: false`静的SPA構成での`error.vue`挙動)、既存のUI視覚言語([[ui-design]]の原則)
- **Downstream**: 今後新しい画面・機能が追加されても、fatalエラー時の見た目はこのspecで確定した`error.vue`に自動的に従う

## Existing Spec Touchpoints
- **Extends**: なし(既存specの対象範囲に含まれない新規boundary)
- **Adjacent**: `user-auth`(401時のログイン誘導は既存`login.vue`へ接続する。未ログイン時のガードは今どおり`/login`へ誘導し、error.vueの401発生源にはしない)、`workspace-url-routing`(非所属・不明なworkspaceIdは`workspace-member.ts`が404を投げる。scoped API 403は既存の退避処理が扱い、error.vueの403発生源にはしない)

## Constraints
- Nuxt 4.x、`ssr: false`(静的SPA)構成 — SPA環境での`error.vue`/`showError()`/`clearError()`の実際の挙動は設計フェーズで確認が必要
- 既存の視覚言語(既存のカンバン・案件管理などで確立した配色・Modal・フォームのchrome)を踏襲し、画面ごとに別の見た目を作らない([[ui-design]]必須ゲート)
- 画面変更を伴うため、claude designでのモック確定が`/kiro-spec-design`着手の前提条件([[ui-design]])
