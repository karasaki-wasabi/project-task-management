## Design Synthesis(/kiro-spec-design)

- **Generalization**: 表示文脈(担当者バッジ/コメント投稿者/メンバー一覧/ヘッダー等)ごとに別コンポーネントを作らず、単一の`UserAvatarProps`(`userId`/`size`/`name`)で全文脈をカバーする。文脈差はサイズと`name`(a11yラベル要否)のみで、構造的な差分はない
- **Build vs Adopt**: 既存の`frontend/package.json`にはハッシュ/identicon系ライブラリがなく(gap analysis参照)、本プロジェクトは新規外部ライブラリ追加を避ける方針(`tech.md`)。かつclaude designで確定した生成仕様(N=12パレット・対称軸3種・塗りセル数ガード)は既製ライブラリの標準機能ではないため、自前実装(build)を選択。Adopt候補の追加調査は不要と判断
- **Simplification**: パレット分割数`N`や対称軸の種類を実行時propsで可変にする案は採用しない(将来必要になった時点で定数を変更すれば済み、現時点でのAPIとして不要な柔軟性のため)。`UserAvatar.helpers.ts`と`UserAvatar.vue`の2層分離のみに留め、追加の抽象化層(サービスクラス化等)は導入しない

## ビジュアルデザイン確定(claude design連携)

**状態: 確定(第4ラウンドで全論点が決着)。**
プロジェクト: https://claude.ai/design/p/bcb01d89-c947-4894-aee6-5d54f41ff182?file=User+Avatar+Identicon.dc.html
プロンプトは `claude-design-prompt.md`(第1〜第4ラウンド)。第4ラウンド確定後、比較用の
旧セクション(3案単体比較・配色方式比較・密度比較・パレット拡張比較)はスクロール負荷軽減のため
削除し、確定構成(実装文脈4つ + 採用サマリー + ガード比較 + 対称軸3種比較)のみ残している。

### 採用したアルゴリズム・不採用案

| 論点 | 採用 | 不採用/検討した代案 |
|---|---|---|
| 全体方式(第1ラウンド) | 案2: 多色対称グリッド(背景・主色・差し色の3色) | 案1: 単色対称グリッド、案3: 回転対称の幾何模様(小サイズで判別しづらい) |
| 配色の決め方(第2〜第3ラウンド) | 機械生成パレット: 色相を均等N分割(N=12、30度刻み)、S/Lは色相帯(暖色/緑〜オリーブ/青緑〜青/紫〜ピンク の4帯)ごとの代表値、差し色・背景は式で算出 | 連続ランダムHSL(近似色の衝突、差し色が主色+38度の機械的オフセットで配色が破綻しうる)。手動チューニング10色パレット(色の質はわずかに勝るが、色数拡張のたびに人力調整が必要で運用コストに見合わない)。N=16での機械生成(同一帯内の色相差22.5度が24pxで判別困難) |
| グリッド密度(第2ラウンド) | 5×5(64pxの大表示でも5×5のまま統一) | 8×8・10×10(24px相当で1マスが2.9〜3.5pxとなり模様ではなくノイズ化する) |
| 塗りセル数のガード(第4ラウンド) | 独立領域の塗りセル数が34〜74%に収まるまで、同一ハッシュ由来PRNGの続きから最大12回reroll。12回で範囲外でも最後の結果をそのまま採用(決定性は常に維持) | ガードなし(独立抽選のみ。稀に「ほぼ全空白」「ほぼ全塗り」が発生しうることを実例で確認して却下) |
| 対称軸(第1ラウンド原案→第4ラウンドで拡張) | 左右反転・上下反転・点対称(180度回転)の3種からhashで選択。点対称は中央1マスを単独抽選 | 左右反転のみ/上下反転を加えた2種のみ(点対称を加えることで模様の骨格が3系統に分かれ、色が近いユーザー同士でも識別しやすくなるため3種を採用) |

### サイズ・形状・その他の確定事項

- サイズ: 20 / 24 / 28 / 32px の4段階 + 64px(大表示用)。奇数pxは使わない
- 形状: 角丸四角(`border-radius = size × 0.1875`)。円形は角のセルが欠け識別情報が減るため不採用
- 枠線: 1pxのinsetハイライト(`rgba(15,23,42,.10)`)。レイアウトに影響しないinset shadowで実装
- 背景: パレット色と同系の淡色(S≈30% / L≈96%)
- 実装方式: `userId`のFNV-1aハッシュ→PRNG(クライアントサイド、外部ライブラリ不使用、SVGインライン出力)
- 代替テキスト: 基本は装飾扱い(`aria-hidden`)。氏名テキストが隣接しないタスクカード担当者表示のみ`title`/`aria-label`で氏名を付与
- 適用先(4文脈で確認済み): カンバンのタスクカード担当者(24px)・コメント投稿者(32px)・ワークスペースメンバー一覧(20px)・ヘッダー現在ユーザー(28px)

### 実装フェーズへの申し送り

- **色のコントラスト**: WCAG準拠の厳密な検証はしていない(装飾扱いのため必須ではない)。design.mdに「主色・差し色は背景に対して視認できる濃さを保つ」旨のガイドラインとして明記する
- **名前未解決時のフォールバック(Requirement 2.2)**: `TaskTimeline.vue`の`userLabel`等は現在、対象ユーザーが見つからない場合に生の`userId`文字列を返す。identiconは`userId`のみで生成できるため、「名前ラベルが取れなくてもアイコンは表示する」という前提をdesign.mdに明記する

---

# Gap Analysis: user-avatar

## Analysis Summary

- 生成ロジック（Requirement 1）は完全に新規。既存コードにハッシュ／パターン生成・アイコン系ライブラリは一切なし
- 表示統合（Requirement 2・3）の大半は「`userId` は既にpropsやAPIレスポンスに存在するが、名前だけをテンプレートに埋め込んでいる」状態で、差し込みは軽微。ただし`TaskCard.vue`だけは`assigneeId`をpropsで受け取っておらず、3箇所の呼び出し元（`AssigneeFocusTray.vue`・`UnassignedBacklogPanel.vue`・`kanban/index.vue`）を含めた配線追加が必要
- `frontend/components/shared/`の`Badge.vue`/`PriorityBadge.vue`が確立した「コンポーネント + 純粋関数helpers + test」の三点構成が明確な先例としてあり、新規`UserAvatar`もこれに従うのが自然
- アクセシビリティ（Requirement 4）は`TaskCard.vue`の既存イニシャル円が`:title="assigneeName"`を持っている以外に先例がなく、統一的なラベル付与方針を新規に決める必要がある
- バックエンド変更は不要（Requirement 5とも整合）。表示サイズ（表内チップ〜ヘッダーの大きさ差）への対応は新規のUI設計判断として残る

## 1. 現状調査

### 生成ロジック
- 該当なし。`frontend/package.json`にハッシュ・色計算・アイコン系ライブラリは未導入（dependencies: `@nuxtjs/tailwindcss`, `nuxt`, `vue`, `vue-draggable-plus`, `vue-router`のみ）
- 全アイコンは手書きインラインSVG（例: `TeamWorkloadSummary.vue`の人物アイコン）。identiconも同様にクライアントサイドの純粋関数＋インラインSVGで実装するのが既存パターンと整合する

### 表示コンポーネントの先例
- `frontend/components/shared/Badge.vue`: `defineProps<{ tone; label }>()` + 静的`Record`によるTailwindクラスルックアップ（JIT purge対策としてクラス文字列を動的生成しないよう明記されたコメントあり）
- `PriorityBadge.vue`/`StatusBadge.vue`/`StageBadge.vue`: 同型の薄いラッパー。それぞれ`.helpers.ts`（純粋関数）+ `.test.ts`が併設
- `UserAvatar`系コンポーネントを新設する場合、`UserAvatar.vue`（表示） + `UserAvatar.helpers.ts`（`userId`→パターン/色の純粋関数） + `UserAvatar.helpers.test.ts` + `UserAvatar.test.ts`という同型構成が自然

### 統合先ごとのデータ可用性（既存コードの実態）
| 箇所 | ファイル | userId可用性 | 現状表示 |
|---|---|---|---|
| 担当者バッジ | `components/kanban/TaskCard.vue` | **不可（要追加）**。propsは`assigneeName`のみ | `bg-primary-100`固定色イニシャル円、`:title="assigneeName"` |
| 担当者フィールド | `components/tasks/TaskFieldCard.vue` | 可（`assigneeName`解決元に`users`一覧、comboboxオプションは`{value: user.id, label: user.name}`） | プレーンテキスト |
| コメント投稿者 / 操作ログ | `components/tasks/TaskTimeline.vue` | 可（`authorUserId`、`userLabel(userId)`/`actorLabel`が`props.users`から解決） | プレーンテキスト（操作ログのアクター名は生成文章中に埋め込み） |
| チーム稼働状況 | `components/kanban/TeamWorkloadSummary.vue` | 可（`entry.user`が完全な`User`オブジェクト） | プレーンテキストのチップ |
| ワークスペースメンバー一覧 | `pages/workspaces/index.vue` | 可（`member.userId`） | プレーンテキスト |
| ワークスペース設定モーダル | `components/workspaces/WorkspaceSettingsModal.vue` | 対象外。名称・識別色の編集のみでユーザー名を表示しない（タスク計画レビューで確認） | — |
| ヘッダー現在ユーザー | `app.vue`（`useAuth()`の`user`） | 可（`PublicUser`は`id`保持） | `{{ user?.name }}`のプレーンテキスト |
| 担当者セレクタ（ネイティブselect） | `AssigneeFilter.vue`等 | 可 | out of scope（Requirement 5.4） |

### User型
```ts
export interface User { id: string; name: string; createdAt: string; updatedAt: string; deletedAt?: string | null; }
export interface PublicUser extends User { email: string; }
```
`id`は全箇所で安定して取得可能。バックエンドAPI（`GET /api/users`、タスク/コメント/操作ログ/ワークスペースメンバー各レスポンス）は現状のままでRequirementを満たせる。

## 2. Requirements実現可能性

| Requirement | 技術的ニーズ | ギャップ種別 |
|---|---|---|
| 1. 決定的生成 | `userId`文字列 → 決定的ハッシュ → パターン/色の純粋関数（新規） | **Missing**（新規実装） |
| 2. 統合表示 | 各表示箇所での`UserAvatar`差し込み。8箇所中7箇所は`userId`既存、`TaskCard.vue`のみprops追加必要 | **Missing**（コンポーネント本体）＋**Constraint**（`TaskCard.vue`は3呼び出し元の配線追加） |
| 2.2 未解決ユーザーへのフォールバック | `TaskTimeline.vue`の`userLabel`等は現在「見つからなければ生のuserId文字列を返す」実装。identicon生成自体は`userId`だけで完結するため、名前解決に失敗してもアイコン生成は可能 | **Constraint**（既存フォールバックロジックとの整合確認のみ、実装障害なし） |
| 3. TaskCard置き換え | 既存の`bg-primary-100`円・`assigneeInitial` computed の削除 | **Constraint**（削除＋置き換えの一体作業） |
| 4. アクセシビリティ | アイコン単体では意味を持たないため、`aria-label`または`title`でユーザー名を提供する統一規約が必要 | **Missing**（新規の規約決め。`TaskCard.vue`の既存`:title`が唯一の先例） |
| 5. 境界 | 追加実装なし（意図的に対象外） | 該当なし |

### 複雑度シグナル
- 生成アルゴリズム自体：軽量なアルゴリズムロジック（外部通信・非同期処理なし、純粋関数）
- 統合：単純な差し込み（CRUD的な単純作業）が8割、`TaskCard.vue`まわりのみ配線追加を伴う
- 表示サイズ：一覧の小さいチップ〜ヘッダーまで文脈によりサイズが異なるため、`size` propのようなバリエーション設計が必要（Research Needed、design.mdで扱う）

## 3. 実装アプローチの選択肢

### Option A: 各表示箇所に直接実装を埋め込む
- 生成ロジック・SVG描画を各コンポーネントに個別実装
- ✅ 新規ファイルが増えない
- ❌ 8箇所以上への重複実装となり、`Badge`系の既存コンポーネント化の慣行にも反する
- ❌ アルゴリズム未確定（claude designで3案比較中）のため、複数箇所への埋め込みは変更コストを増大させる
- 非推奨

### Option B: 単一の`UserAvatar.vue`コンポーネントに生成ロジックごと内包
- `frontend/components/shared/UserAvatar.vue`を新設し、`userId`（+ 表示名をaria-label用に）を受け取って内部で生成からSVG描画まで完結
- ✅ `Badge.vue`と同型の「単一コンポーネント + 呼び出し側から値を渡すだけ」という最も薄いパターン
- ✅ 各画面側の変更は「コンポーネントを置く＋propsを渡す」のみ
- ❌ 生成ロジック（純粋関数）とレンダリング（テンプレート）が同居し、アルゴリズム比較・単体テストがコンポーネントテスト経由になりやや重い

### Option C: 生成ロジック（helpers）とレンダリング（コンポーネント）を分離（推奨）
- `UserAvatar.helpers.ts`（`userId` → パターン記述・色などの純粋関数）+ `UserAvatar.vue`（helpersの出力をSVGとして描画するだけ）+ 各`.test.ts`
- `PriorityBadge.vue`が`Badge.vue`を薄くラップする構造と同様、生成ロジックをコンポーネントから独立させる
- ✅ `Badge`系と同じ三点構成の慣行に完全準拠
- ✅ アルゴリズム3案（単色グリッド/多色グリッド/幾何模様）の比較・差し替えが、helpers関数の単体テストのみで完結し、表示側コンポーネントへの影響を最小化できる
- ✅ 決定性（Requirement 1）の検証がheadless単体テストで容易
- ❌ ファイル数がOption Bよりわずかに多い

**推奨: Option C**。claude designでのアルゴリズム比較が未確定であること、既存の`Badge`系コンポーネントが確立した分離パターンとの整合性の両面から妥当。

## 4. 実装複雑度とリスク

- **Effort: M（3〜7日）**
  - 理由: 生成アルゴリズム自体は軽量だが、統合先が8箇所以上に及び、`TaskCard.vue`は3つの呼び出し元を含む配線追加が必要。アクセシビリティ規約の新規策定も含む
- **Risk: Low〜Medium**
  - 理由: 未知の技術要素・外部依存はなく、バックエンド変更も不要（Low寄り）。ただし生成アルゴリズムの最終案（3候補）がclaude design比較待ちであり、視覚仕様の確定タイミングが実装着手の前提条件になる点がMedium要素

## 5. Design段階への申し送り

- **Preferred approach**: Option C（`UserAvatar.helpers.ts` + `UserAvatar.vue`の分離構成、`frontend/components/shared/`配下）
- **Key decisions for design.md**:
  - `TaskCard.vue`のprops拡張（`assigneeId`追加）と3呼び出し元（`AssigneeFocusTray.vue`・`UnassignedBacklogPanel.vue`・`kanban/index.vue`）の配線
  - `UserAvatar`のサイズバリエーション（`size` prop等）と各統合先での採用サイズ
  - アクセシビリティラベル規約（`aria-label`か`title`か、表示名との重複読み上げ回避を含む）
  - `TaskTimeline.vue`の`userLabel`等が名前解決に失敗した場合でも`userId`単体でアイコン生成できることの確認（既存フォールバック文字列表示との共存方法）
- **Research Needed (design.mdで扱う)**:
  - claude designでのアルゴリズム3案（単色対称グリッド／多色グリッド／回転対称幾何模様）比較・確定（`.kiro/steering/ui-design.md`ゲート）
  - ハッシュ由来の色がAccessibility観点で十分なコントラストを持つか（背景色・パターン色の組み合わせ制約）
  - `pages/workspaces/index.vue`のメンバー一覧行での`userId`相当フィールド名の最終確認（`member.userId`か`member.id`か、実装時にコード確認）
