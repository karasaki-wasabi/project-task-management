# コミットメッセージルール

[Purpose: 一貫性のある読みやすいコミット履歴を維持する]

## 形式

- 1行目（subject）
  - 日本語で変更内容を簡潔に書く
  - 50文字前後を目安にする
  - 文末に句点は付けない
- 本文（任意）
  - subject の直後に空行を1行入れる
  - 「なぜ」を1〜3文で書く
  - 箇条書きは避け、短い段落で書く

## 禁止

- Conventional Commits 形式のプレフィックス
  - 例: `feat:`, `fix:`, `test(auth):`, `refactor(api):`
- LLM がコミットしたことのメッセージを含める
  - `Co-Authored-By...` のようなコメントをコミットメッセージに含めない
- 英語だけの subject
- 意味のない subject
  - 例: `fix`, `update`, `WIP`, `misc`

## 推奨

- 上記形式に競合しないルールは、`.claude/skills/kiro-impl/SKILL.md` を参考にする
- 競合した場合は、こちらのルールを優先する

## 強制(commit-msgフック)

上記ルールは `.githooks/commit-msg` で機械的に強制される(Conventional Commitsプレフィックス・Co-Authored-By・英語のみのsubjectを検出してコミット自体を拒否)。新しくcloneした環境では一度だけ有効化が必要:

```bash
git config core.hooksPath .githooks
```

## 例

```
objectCovered を expect.objectContaining に置き換え

Jest 標準の expect.objectContaining で部分一致検証できるため、object-covered ヘルパーを削除する。
```
