# Ideas

思いつき・未着手候補の控え。着手が固まったら `/kiro-discovery` で `roadmap.md` / `brief.md` に昇格する。

## カレンダー・案件表示

- 案件ごとにカレンダー表示のオン/オフフラグを設ける
  - 長い案件が週の上部を占有し続け、重要な案件が「他 n 件」に押し出される問題への対策
- カレンダーを無限上下スクロールにする
- 案件色の設定

## パフォーマンス

- カレンダーの `get/tasks` が約 6000 件で固まる
  - e2e テストで発覚
  - 目標: 数十万件でも 5 秒以内に取得する

## テスト基盤

- e2e 実行時に前回のテストデータが残り、他テストに影響する
  - 候補: テスト前に DB をクリアする
  - 候補: 特定の e2e の塊ごとに DB を作成し、終了後に破棄する

## ドキュメント整理

一括でやる想定。機能実装とは別枠。

- 完了スペックの親タスクチェックボックスを揃える
  - `implementation-complete` なのに親が `[ ]` のまま残っている例がある
  - 揃え方か「親は集約しない」ルールのどちらかを決める
- `.kiro/steering/roadmap.md` を整備する
  - これまで `kiro-spec-init` 単体で進めてきたため未作成
  - 完了済みスペック・着手中・ideas からの候補の依存順を可視化する
- 完了スペックの判別方針を短く明文化する
  - kiro 標準は移動せず `phase: implementation-complete` と roadmap の `[x]` で判別
  - Active / Done / brief のみ / ideas の見分け方を workflow か steering に書く
- `PRODUCT.md` と `.kiro/steering/product.md` の正本を決めて同期方針を書く
  - impeccable と kiro の両立で二重管理になっている
- `CLAUDE.md` と `docs/kiro-skills-workflow.md` の役割分担を決める
  - 詳細は CLAUDE.md 側、workflow は要約、などドリフトしにくい形にする
