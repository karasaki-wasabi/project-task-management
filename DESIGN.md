---
name: Task Delivery Management
description: 納品物とタスクを一元管理する社内向け実用ツール
colors:
  accent: "#2563eb"
  accent-hover: "#1d4ed8"
  ink: "#0f172a"
  neutral-bg: "#f8fafc"
  surface: "#ffffff"
  border: "#e2e8f0"
  danger-bg: "#fef2f2"
  danger-text: "#b91c1c"
  warning-bg: "#fef3c7"
  warning-text: "#92400e"
  success-bg: "#dcfce7"
  success-text: "#15803d"
  info-bg: "#dbeafe"
  info-text: "#1d4ed8"
  neutral-tag-bg: "#f1f5f9"
  neutral-tag-text: "#334155"
typography:
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Hiragino Kaku Gothic ProN, Hiragino Sans, Yu Gothic, Meiryo, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Hiragino Kaku Gothic ProN, Hiragino Sans, Yu Gothic, Meiryo, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Hiragino Kaku Gothic ProN, Hiragino Sans, Yu Gothic, Meiryo, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.03em"
rounded:
  sm: "6px"
  md: "8px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  badge:
    rounded: "{rounded.full}"
    padding: "2px 8px"
---

# Design System: Task Delivery Management

## Overview

社内向けの実用ツール(Operateモード)。訪問者は「今何をすべきか」を素早く把握し、タスク・納品・イベントの状態を更新する作業をこなす。装飾より走査性(scanability)、驚きより一貫性を優先する。認証を持たない小規模チーム利用が前提のため、画面は常に「今の状態」をひと目で示すことに徹する。

**Key Characteristics:**
- 中立色(スレート系)を基調とし、アクセントの青は主要な操作(登録ボタン・リンク)にのみ使う
- ステータス・優先度・期限超過は、色分けされたバッジで意味づけを統一する(状態表現のみに色を使う。装飾には使わない)
- 1つのsans-serifファミリーを見出しから本文まで一貫して使う(display書体は使わない)
- ダークモードは現時点で未対応(ライトテーマのみ)

## Colors

Restrained戦略: 中立色(スレート系グレー)が画面の大半を占め、青のアクセントは登録・提出・確定などの主要操作にのみ使う。状態を表す色(赤・緑・黄)はバッジでのみ使用し、背景全体を覆うことはしない。

### Primary
- **アクセントブルー**(`#2563eb`、hover: `#1d4ed8`): 登録・確定・提出などの主要な操作ボタン、リンク、フォーカスリング

### Neutral
- **インク**(`#0f172a`): 本文・見出しのテキスト色
- **サーフェス**(`#ffffff`): カード・テーブル・フォームの背景
- **ニュートラル背景**(`#f8fafc`): ページ全体の背景
- **ボーダー**(`#e2e8f0`): カード・テーブルの輪郭線

### Named Rules
The Badge-Only Color Rule. 意味を持つ色(赤=危険/優先度高、黄=保留/優先度中、緑=完了段階、青=作業中、ティール=引継待ち)は、常にバッジとしてのみ使う。ステータスは塗りピル、開発段階は枠線つき角丸矩形（`StageBadge`）で形を分ける。行全体やセクション全体を状態色で塗りつぶすのは、期限超過の納品を強調する場合(`danger-bg`の淡い背景)のみの例外とする。

## Typography

**Body/Title/Label Font:** system-ui(日本語フォールバック: Hiragino Kaku Gothic ProN → Yu Gothic → Meiryo)

**Character:** 業務ツールとして、見出しも本文もラベルも同じsans-serifファミリーで統一する。display書体は使わない。フォントサイズは固定remスケール(可変フォントサイズは使わない、Operateモードの流儀)。

### Hierarchy
- **Title**(600, 20px、`tracking-tight`): 各画面の`h1`
- **Subtitle**(600, 14px、`uppercase tracking-wide`): セクション見出し(`h2`、ダッシュボードのセクションラベルなど)
- **Body**(400, 14px): フォーム・テーブル・カードの本文
- **Label**(500-600, 12px): バッジ、テーブルヘッダー(`uppercase tracking-wide text-slate-500`)

## Layout

コンテナ幅は`max-w-6xl`(約1152px)、左右パディング`px-4`〜`px-6`。ナビゲーションはページ上部に固定(`sticky top-0`)、白背景+下線区切り。フォームはカード(白背景+`ring-1 ring-slate-200`+`rounded-lg`)内に`flex flex-wrap gap-2`で要素を並べる。テーブル・カンバンの列など横幅が足りない要素は`overflow-x-auto`でスクロール可能にする(コンテナ自体を横スクロールさせない)。

## Shapes

角丸は2段階のみ: `rounded-md`(6px、ボタン・入力欄・小さいカード)と`rounded-lg`(8px、セクション・パネル・テーブルの外枠)。バッジは`rounded-full`(pill形状)。枠線は`ring-1 ring-slate-200`(box-shadowではなく1pxリング)で表現し、影は基本使わない(フラットな面の重なりで階層を表現する)。

## Components

### Buttons
- **Primary**(`rounded-md bg-blue-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-blue-700`): 登録・確定・提出などの主要操作
- **Secondary**(`rounded-md border border-slate-300 bg-white text-slate-700 px-3 py-1.5 text-sm font-medium hover:bg-slate-50`): キャンセル・削除・停止・並び替えなどの補助操作
- 状態: `disabled:opacity-50 disabled:cursor-not-allowed`、フォーカス時は`focus:ring-2 focus:ring-blue-500`

### Badges(`components/shared/Badge.vue`)
- 形状
  - ステータス・優先度: pill(`rounded-full px-2 py-0.5 text-xs font-medium`)
  - 開発段階（`StageBadge`）: 角丸 6px・枠線・接頭辞つき（塗りピルではない）
- トーン
  - `neutral`（スレート、未着手）
  - `info`（青、作業中）
  - `handoff`（ティール `#ccfbf1` / `#0f766e`、引継待ち）
  - `warning`（黄、保留・優先度中）
  - `danger`（赤、優先度高・期限超過）
  - `success`（緑）はステータスには使わず、完了種別の段階バッジに予約する
- `StatusBadge` / `PriorityBadge` はこの `Badge` の薄いラッパーで、値→トーン+日本語ラベルのマッピングのみを持つ
- ステータス語彙: 未着手 / 作業中 / 引継待ち / 保留（タスク全体の完了は開発段階の種別で表す）

### Inputs / Fields
- **Style:** `rounded-md border border-slate-300 px-2.5 py-1.5 text-sm`
- **Focus:** `focus:border-blue-500 focus:ring-2 focus:ring-blue-500`(枠線色の変化+リング)
- **Error:** バリデーションエラー自体は個別スタイルを持たず、`components/shared/ErrorAlert.vue`(赤背景のアラートボックス)で画面上部に表示する

### Cards / Containers
- **Corner Style:** `rounded-lg`
- **Background:** 白(`bg-white`)、危険強調時のみ`bg-red-50`
- **Border:** `ring-1 ring-slate-200`(影は使わない)
- **Internal Padding:** `p-4`

### Tables
- 外枠は`rounded-lg ring-1 ring-slate-200`のカードコンテナで包む
- ヘッダー行: `text-xs uppercase tracking-wide text-slate-500`、下線`border-b border-slate-200`
- データ行: `border-b border-slate-100 last:border-0`(最終行は下線なし)

### Navigation
- 白背景、`sticky top-0`、下線区切り(`border-b border-slate-200`)
- リンクは`rounded-md px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-100`、選択中は`bg-blue-50 text-blue-700`(NuxtLinkの`active-class`で制御)

### Kanban Card(signature component)
- カード: 白背景`rounded-md ring-1 ring-slate-200 p-2`、`draggable="true"`、`cursor-grab`
- 列(`.column`): `rounded-lg bg-slate-50 p-3`。未割り当てプールのみ`border-dashed border-slate-300 bg-slate-100`で他の列と視覚的に区別する(マスタ駆動の列ではないことを示すため)

## Do's and Don'ts

### Do:
- **Do** 状態(ステータス・優先度・期限超過)は必ずバッジで表現し、行の背景色や太字だけに頼らない
- **Do** フォーム・テーブル・カードはすべて`ring-1 ring-slate-200`+`rounded-lg`の白背景コンテナに収める
- **Do** バックエンドのエラーは`ErrorAlert`で画面に必ず表示する(コンソールに埋もれさせない、`.kiro/steering/error-handling.md`と一致)

### Don't:
- **Don't** side-stripe border(`border-left`等の色付きアクセント線)を強調表現に使わない。背景色の面かバッジで表現する
- Don't アクセントの青を状態表現(作業中以外)に使わない。青は「操作」と作業中ステータスに限って使う
- **Don't** 新しいコンポーネントのために新しい角丸値・枠線スタイルを追加しない。`rounded-md`/`rounded-lg`と`ring-1 ring-slate-200`の2パターンで統一する
