---
name: claude-design
description: >
  Cursor-only. Read Claude Design mocks via a one-shot CLI without enabling Cursor's
  claude-design MCP (avoids the broken api.anthropic.com/authorize browser loop).
  Use in Cursor when UI work references Claude Design / claude.ai/design / .dc.html /
  research.md 「ビジュアルデザイン確定」, or when a Cursor kiro design/impl subagent
  needs the adopted mock. Skip this skill entirely on Claude Code.
---

# claude-design（Cursor 専用）

## Host scope

- Cursor: このスキルに従う
- Claude Code: このスキルを使わない。標準の Claude Design MCP / `/design-login`（または公式手順）を使う

Claude Code がこのファイルを開いた場合は、ここで止め、Cursor 限定の MCP 回避・CLI 手順を実行しない。

## Role

Cursor 上で、Claude Design の確定モックを Cursor MCP をオンにせずに読む。  
kiro の design / impl サブエージェント（Cursor ホスト）から使うことを主想定とする。

## Why (Cursor only)

Cursor の `claude-design` MCP（`mcp-remote`）は認証失敗時に廃止済み
`api.anthropic.com/authorize` を開き、ブラウザが繰り返すことがある。  
本スキルは `npx github:erdnj/claude-design-mcp token` の Design トークンで
`https://api.anthropic.com/v1/design/mcp` を直接叩く。

## When to use (Cursor)

次のいずれかなら、推測せず本スキルでモックを読む。

- `research.md` に「ビジュアルデザイン確定(claude design連携)」がある
- tasks / design / requirements が `.dc.html` や `claude.ai/design/p/...` を参照する
- UI 実装タスクで見た目・レイアウト・コントロール構成がモック依存
- `/kiro-spec-design` で画面 Components / Flows をモックから落とす必要がある

## Do not (Cursor)

- Cursor の `claude-design` MCP をオンにしない（オンデマンド運用の既定はオフ）
- `api.anthropic.com/authorize?...` が開いたらすぐ止め、本 CLI に切り替える
- モック未確認のまま見た目を推測して実装 / 設計しない
- ログイン用ブラウザ承認をエージェントが代行しようとしない（人手）

## Prerequisites (human, once / when expired)

```bash
npx -y github:erdnj/claude-design-mcp status
# logged_out / expired のときだけ:
npx -y github:erdnj/claude-design-mcp login
```

認証情報: `~/.config/claude-design-mcp/credentials.json`

## CLI

リポジトリルートからの例:

```bash
SCRIPT=".claude/skills/claude-design/scripts/design-mcp.mjs"

node "$SCRIPT" status
node "$SCRIPT" projects
node "$SCRIPT" files <project-id-or-url>
node "$SCRIPT" read <project-id-or-url> <path>
node "$SCRIPT" fetch <project-id-or-url>                 # 既定: *.dc.html 全部
node "$SCRIPT" fetch <project-id-or-url> "画面.dc.html"  # 特定ファイル
node "$SCRIPT" call list_files '{"project_id":"...","depth":-1}'
```

`project-id-or-url` は UUID でも `https://claude.ai/design/p/<uuid>` でもよい。

## Agent procedure (Cursor)

1. Spec から識別情報を取る  
   - 優先: 当該 feature の `research.md`「ビジュアルデザイン確定」の URL / ファイル名  
   - 次点: tasks.md / design.md の `.dc.html` 言及  
   - 不明なら `node ... projects` で名前照合（推測で別プロジェクトを読まない）
2. `node ... status`  
   - `logged_out` / `expired` / token 失敗 → `NEEDS_CONTEXT` またはユーザーへ  
     `npx -y github:erdnj/claude-design-mcp login` を依頼して停止  
   - Cursor MCP を有効化して迂回しない
3. 読む  
   - 実装・詳細設計: `fetch <url>` または対象 `.dc.html` を `read`  
   - 大きいファイルは `--offset` / `--limit` で分割
4. 採用内容だけ使う  
   - research で不採用と書いた案は使わない  
   - モックと requirements が衝突したら requirements を正とし、差分を報告する
5. 親エージェントへ返す要約（サブエージェント向け）  
   - project URL / id  
   - 読んだファイル一覧  
   - レイアウト・主要コントロール・配色/既存 chrome との関係  
   - 実装に効く具体制約（クラス名ではなく振る舞い・構造）

## Kiro integration（Cursor / kiro-* を改変しない）

本スキルと `.kiro/steering/ui-design.md` の「Cursor 限定」節がプロジェクト側の拡張点。  
`.claude/skills/kiro-*`（cc-sdd upstream）は更新で上書きされるため改変しない。

### 発見経路（Cursor）

1. `kiro-impl` / `kiro-spec-design` が追加 steering として `ui-design.md` を読む  
2. `ui-design.md` の Cursor 限定節に従い、本スキルを使う  
3. 親がサブエージェントへ本スキルパスと Design URL を渡す

### Parent（Cursor 上の `/kiro-spec-design`, `/kiro-impl`）

画面変更を含む feature では、サブエージェントへ渡すプロンプトに次を含める。

- 本スキルパス: `.claude/skills/claude-design/SKILL.md`
- `research.md` の Claude Design URL / ファイル名（分かっているなら）
- 「見た目は CLI でモックを読んでから進む。Cursor MCP は使わない」

### Implementer / design research subagent（Cursor）

- UI タスクなら Step 1 で本スキルを実行してモックを読む
- 読めない（未ログイン）ときは実装を始めず `NEEDS_CONTEXT`（login 依頼）

### Steering

ゲートとホスト分岐の正本は `.kiro/steering/ui-design.md`。  
本スキルは Cursor での「読む」手段だけを担う。

## Failure modes (Cursor)

| 症状 | 対応 |
|------|------|
| Not logged in / token failed | ユーザーに `login` を依頼。Cursor MCP オンにしない |
| ブラウザが `api.anthropic.com/authorize` を繰り返す | Cursor の claude-design MCP が動いている。オフ＋プロセス終了 |
| project not found | URL/ID を research.md と突合。`projects` で確認 |
| ファイル巨大 | `read --offset/--limit` で分割 |

## Security

- トークンをログ・コミット・チャットに貼らない
- CLI は stdout にファイル内容のみ出す（token は出さない）
