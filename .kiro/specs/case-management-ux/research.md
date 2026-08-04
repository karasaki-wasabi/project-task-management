# Gap Analysis: case-management-ux

## 1. 現状調査(Current State)

### バックエンド `deliveries` モジュール
- `backend/src/modules/deliveries/{delivery.types,delivery.repository,delivery.service,delivery.routes}.ts`(+テスト)
- Prisma `Delivery`モデル(`@@map("deliveries")`): `id / name / dueDate(due_date) / createdAt / updatedAt / deletedAt`。**開始日・終了日・完了フラグは現状存在しない**
- ルート: `POST /api/deliveries`(name, dueDate) / `PATCH /api/deliveries/:id`(**dueDateのみ**、汎用フィールド更新APIは存在しない) / `GET /:id/progress` / `DELETE /:id` / `GET /`
- 削除時の既存挙動: `delivery.repository.ts`の`delete()`はトランザクションで紐づく`Task`/`Event`の`deliveryId`を`null`にdetachしてから`Delivery`をハード削除する(カスケード削除ではない)。**この既存挙動は本スペックのRequirement 8(削除)で変更を要求されていないため、そのまま維持が前提になる**
- 進捗算出: `countRequiredTasks` / `countRequiredCompletedTasks`(`isRequiredForDelivery: true`のタスクのみ集計)。Requirement 7で「既存通りこの必須フラグを使う」と確認済み — **変更不要、再利用**

### タスク側の関連付け(重要な既存資産)
- Prisma `Task.deliveryId`(nullable FK)・`Task.isRequiredForDelivery`(既定false)
- **`PATCH /api/tasks/:id`(汎用更新、`task.routes.ts`/`task.service.ts`)は`deliveryId`(nullable)と`isRequiredForDelivery`の更新を既に完全にサポートしている。**
  - ビジネスルールも実装済み: `deliveryId`をnullにすると`isRequiredForDelivery`は強制的にfalseになる。`deliveryId`がnullの状態で`isRequiredForDelivery: true`を単独指定するとvalidationエラーを返す(`task.service.ts` update関数)。
  - → **Requirement 4(タスク詳細ポップアップからの案件関連付け・必須設定)はバックエンドAPIの変更が不要**。フロントエンドの`TaskDetailModal.vue`にフォーム項目を追加し、既存の`api.updateTask()`を呼ぶだけで実現できる。
- **欠けている資産**: 「いずれの案件にも割り当てられていないタスク」を取得するクエリ/フィルタが存在しない。`TaskListFilter.deliveryId`は`string`型のみ(特定案件への絞り込み用)で、`null`(未割当)を指定する経路がない。Zodスキーマ(`task.routes.ts`)も`deliveryId: z.string().optional()`で`.nullable()`ではない。Requirement 3(登録時の未割当タスク選択)向けに新規追加が必要。

### フロントエンド
- `frontend/pages/deliveries/index.vue`: 単一ページ、登録はインラインフォーム(name + dueDate)。ポップアップ化・開始日/完了フラグ入力・タスク選択は全て新規追加。
- `frontend/composables/useApiClient.ts`: `Delivery`/`DeliveryProgress`型、`listDeliveries/createDelivery/updateDeliveryDueDate/getDeliveryProgress/deleteDelivery`。**汎用更新(`updateDelivery`相当)は無く、`updateDeliveryDueDate`のみ** — Requirement 5(名称・開始日・終了日・完了状態の編集)向けに汎用更新APIが必要。
- `frontend/pages/index.vue`(ダッシュボード): 期限超過パネルが`listDeliveries`/`getDeliveryProgress`を再利用。表示文言・判定基準(dueDate→endDate)の追従が必要。
- カンバン画面の再利用可能資産: `frontend/components/shared/Modal.vue`(汎用ダイアログシェル)、`TaskDetailModal.vue`の view/edit モード切り替えパターン、`TaskCard.vue`のカードスタイル、`UnassignedBacklogPanel.vue`の「折りたたみ+検索/ソート+一覧」パターン(未割当タスク選択UIのテンプレートとして直接参考にできる)。

### 用語変更(納品→案件)の影響範囲
- バックエンド: `deliveries`モジュール一式(約250箇所/6ファイル)+ 他モジュール16ファイル(`tasks`, `events`, `recurrence`, `development-stages`repository, テスト類)+ 共有インフラ(`business-event-logger.ts`のイベント名`delivery.created`/`delivery.deleted`、`app.ts`等)。Prismaスキーマ上は**テーブル名`deliveries`・カラム名`delivery_id`/`is_required_for_delivery`のリネームを伴う**。
- **マイグレーション前例なし**: 既存マイグレーションは2件(`20260731051829_init_domain_schema`, `20260731141826_add_development_stages`)のみで、いずれも追加のみ。テーブル/カラムのRENAME実績が無いため、`prisma migrate dev`が素朴にDROP+ADDを生成しデータ消失を招くリスクがある(既存データが少ない開発環境のみなら実害は小さいが、design.mdで明示的な方針決定が必要)。
- フロントエンド: `deliveries/index.vue`(~37)、`pages/index.vue`ダッシュボード(~37)、`pages/tasks/index.vue`(~16)、`pages/recurrence/index.vue`(~9)、`useApiClient.ts`(~32)。
- recurrence連携: `recurrence.service.ts`の`onDeliveryCreated`/`onDeliveryDueDateChanged`は`delivery.dueDate`を直接参照して生成日を計算している。dueDate→endDateへの置き換えに追従が必要(Adjacent expectationsで明記済み)。
- E2E: `dashboard.spec.ts`、`kanban-tray-reassign.spec.ts`に納品関連の少数の言及。
- 他スペックドキュメント: `task-delivery-management`(~280箇所、実装済みスペックであり編集対象ではないが用語の食い違いが生じる)、`kanban-ux-redesign`(~13箇所、軽微)。

## 2. Requirements Feasibility Analysis(要件→資産マップ)

| Requirement | 必要な技術要素 | 現状資産 | ギャップ種別 |
|---|---|---|---|
| 1. 呼称の統一 | 全レイヤーでの表示文言/識別子変更 | なし(全て「納品」) | **Missing**(範囲が広い。UI表示のみか内部識別子も含むかはdesignで判断) |
| 2. 案件の登録(ポップアップ、name/startDate/endDate) | ポップアップUI、Prismaへのフィールド追加、作成API拡張 | Modal.vue(再利用可)、`POST /api/deliveries`(name/dueDateのみ) | **Missing**(startDate列、ポップアップUI、バリデーション) |
| 3. 登録時の未割当タスク選択+必須指定 | 未割当タスク取得API、選択UI、作成時の一括関連付け | `UnassignedBacklogPanel`パターン(参考のみ)、`isRequiredForDelivery`(既存) | **Missing**(未割当フィルタAPI、複数タスク一括関連付けの作成時トランザクション) |
| 4. タスク詳細ポップアップからの案件関連付け・必須設定 | フロントの選択UIのみ | **バックエンドAPI(`PATCH /api/tasks/:id`)は完全に対応済み** | **Frontendのみのギャップ**(低リスク) |
| 5. 案件情報の編集(name/startDate/endDate/完了フラグ) | 汎用更新API、完了フラグ列、編集UI(ポップアップ) | `updateDueDate`のみ(汎用更新なし)、完了フラグ列なし | **Missing** |
| 6. 期限超過判定(終了日+完了フラグ) | 判定ロジックの置き換え | `isOverdueWithIncomplete`(dueDate基準、既存) | **Constraint**(既存ロジックを終了日+完了フラグ基準に置き換え。ロジック自体は小さい変更) |
| 7. 案件一覧・進捗表示 | 一覧UI拡張、既存進捗ロジック再利用 | ほぼ既存のまま(進捗ロジック変更不要、確認済み) | **Constraint**(表示項目追加のみ、ロジックは維持) |
| 8. 案件の削除 | 既存削除挙動の維持 | 既存の detach-then-delete ロジック | ギャップなし(維持のみ) |
| 9. デザイン統一感 | カンバンのビジュアル/操作パターンの適用 | Modal.vue、TaskDetailModal的view/edit切り替え、TaskCard的カードスタイル | **Constraint**(新規コンポーネントだが既存パターンに強く従う) |

**Research Needed(design phaseへ持ち越し)**:
- 「呼称の統一」がPrismaスキーマ・API識別子・イベント名にまで及ぶか、UI表示文言のみに留めるかの範囲決定(コスト差が非常に大きい)
- テーブル/カラムリネームをPrisma migrateでどう安全に行うか(素朴なmigrate devでのデータ消失リスクの回避策)
- 完了フラグの列名・型、終了日移行に伴う既存`dueDate`データの扱い(そのまま`endDate`に転記するマイグレーションが必要)
- 未割当タスク取得のAPI形状(`deliveryId=null`をクエリパラメータでどう表現するか)
- 案件登録ポップアップでの「複数タスク選択+必須フラグ+新規案件作成」を1リクエストで行うか、作成後に複数回`updateTask`を呼ぶ設計にするか(トランザクション整合性 vs 実装の単純さ)

## 3. 実装アプローチの選択肢

### Option A: 既存`deliveries`モジュールを全面的に改称・拡張(Extend)
- `backend/src/modules/deliveries/` → `cases/`へリネームし、フィールド追加(startDate/endDate/isCompleted)、汎用更新API・未割当フィルタを同モジュール内に追加。Prismaスキーマの`Delivery`→`Case`、テーブル/カラムをRENAME。
- ✅ 既存の進捗算出・削除ロジックをそのまま引き継げる、モジュール境界(1ドメイン1ディレクトリ)という`structure.md`の方針に合致
- ❌ 改称の影響が全レイヤーに波及するため変更量が大きい、DBマイグレーションのリスクを直接抱える

### Option B: 新規`cases`モジュールを追加し`deliveries`は非推奨化(New + Deprecate)
- 新しいテーブル/モジュールとして`cases`を作り、既存`deliveries`データを移行。旧エンドポイントは一定期間残す。
- ✅ 移行を段階的に行える、ロールバックしやすい
- ❌ 本プロジェクトは個人開発・単一環境で後方互換を維持する実益が薄く、`structure.md`/`error-handling.md`にも見られる「シンプルさ優先」の方針に反する。二重管理の複雑さが増す
- 全体として本プロジェクトの規模・方針には過剰

### Option C: ハイブリッド(呼称統一はUI表示のみ即時、内部識別子は段階的に追従)
- フェーズ1: UI表示文言のみ「案件」に変更(バックエンドの`Delivery`/`deliveryId`等はコード上は維持)。フィールド追加・ポップアップ化・タスク関連付けは新規実装。
- フェーズ2(将来、任意): 内部識別子(テーブル名・変数名・API名)のリネームは別途検討。
- ✅ DBマイグレーションのリスクを今回のスコープから外せる、変更量を抑えられる
- ❌ ユーザーの要望「全体的に案件に直してください」が指す範囲(コードも含むか)を明確にしないと、フェーズ1だけでは要望を満たさない可能性がある。内部と表示の不一致(コードは`Delivery`、UIは「案件」)が将来の保守性を下げる

## 4. Effort & Risk

| Requirement群 | Effort | Risk | 理由 |
|---|---|---|---|
| 呼称の統一(全体、DB含む) | **L**(1–2週間) | **Medium** | 変更箇所は広いが機械的な作業が中心。リスクはPrismaのRENAME migrationの安全性確保 |
| フィールド追加(startDate/endDate/isCompleted)+汎用更新API | **S–M** | **Low** | 既存モジュールへの素直な拡張、確立されたZod+Prismaパターンを踏襲するだけ |
| 登録ポップアップ+未割当タスク選択+必須指定 | **M** | **Low–Medium** | UIは新規だが`Modal.vue`/`UnassignedBacklogPanel`パターンを転用できる。未割当フィルタAPIの新設とマルチタスク関連付けのAPI呼び出し設計にやや検討要 |
| タスク詳細ポップアップの案件関連付け・必須設定 | **S**(1–3日) | **Low** | バックエンドAPIは完成済み、フロントのフォーム項目追加のみ |
| 期限超過判定の見直し | **S** | **Low** | 既存ロジックの基準列変更+完了フラグの条件追加のみ |
| デザイン統一感 | **M** | **Low** | 既存パターンの再利用が中心だが、対話的なデザイン検討(claude design)自体に時間を要する |

**総合**: 呼称の完全な内部リネーム(Option A)を選ぶ場合は全体で**L(1–2週間)**、UI表示のみに留める場合(Option Cフェーズ1)は**M(3–7日)**程度に短縮できる。

## 5. Design phaseへの推奨事項

- **推奨アプローチ**: Option A(全面改称)を基本としつつ、Prismaのテーブル/カラムRENAMEは`prisma migrate dev`の自動生成に任せず、生成されたマイグレーションSQLを`RENAME TABLE`/`RENAME COLUMN`(またはPrismaの`@map`一時保持→データ移行→旧カラム削除の2段階)に手動で書き換える方針をdesign.mdに明記する。
- **鍵となる決定事項**（design.mdで確定すべき事項）:
  1. 呼称統一の範囲: UI表示文言だけでなく、Prismaモデル名・API識別子・変数名・イベント名(`delivery.created`等)まで含めるか
  2. `dueDate`→`endDate`のデータ移行方法(既存データがある場合の列名変更 or 値コピー)
  3. 未割当タスク取得APIの形状(例: `GET /api/tasks?caseId=null` の表現方法、または専用エンドポイント)
  4. 案件登録時の複数タスク関連付けを単一トランザクションにするか、作成後に`updateTask`を複数回呼ぶか
  5. `recurrence`モジュールの`onDeliveryCreated`/`onDeliveryDueDateChanged`のリネームとendDate参照への追従
- **持ち越すResearch項目**: 上記「Research Needed」の5点。

---

## 6. ビジュアルデザイン確定(claude design連携)

claude.ai/designプロジェクト「案件管理画面のUI拡張案」(`案件管理UI.dc.html`)を取り込み、以下を確定した:

- **案件登録ポップアップのレイアウト**: 案A(カード型リスト、タスク名を主役に必須指定を各行に配置)を採用。案B(テーブル形式)は不採用。
- **必須タスク指定のコントロール**: トグルスイッチを採用(チェックボックスは不採用)。
- **案件一覧のステータス絞り込みチップ**(すべて/進行中/完了/期限超過、件数付き): 要件には無かった追加要素だが、Requirement 7(絞り込み検索)を補う追加UIとして設計に含めることを確定。名称検索と併用する。

モックアップの構成(1a〜1g)がそのままdesign.mdのComponents/File Structure Plan/System Flowsに反映される。特に1g(カンバンのタスク詳細ポップアップ拡張)は、既存フォームへの1ブロック追加(案件セレクト+必須トグル、案件未選択時はトグルをグレーアウト)という設計を確定し、これがRequirement 4の実装方針になる。

## 7. Design Synthesis(設計統合)

### Generalization(一般化)
- 「登録時にタスクを選ぶ」(Requirement 3)と「タスク詳細ポップアップから選ぶ」(Requirement 4)は、どちらも同じ土台(`PATCH /api/tasks/:id`の`caseId`/`isRequiredForCase`)の上に成り立つ同一操作の異なる入口である。バックエンドAPIは1つのまま(汎用更新)とし、フロントエンドの入口だけを2つ用意する設計とする(新規の専用エンドポイントは作らない)。
- 「未割当タスクの取得」は案件登録ポップアップ専用ではなく、`GET /api/tasks`の汎用フィルタ拡張(`unassignedCase`)として実装し、将来他画面が必要になっても再利用できる形にする。

### Build vs. Adopt(構築 vs 採用)
- ポップアップの構造(オーバーレイ・アニメーション・フォーカストラップ・閲覧⇄編集の切り替え)は既存の`shared/Modal.vue`と`TaskDetailModal.vue`のパターンをそのまま採用する。新規のモーダル基盤は構築しない。
- 案件登録時の複数タスク関連付けは、専用の一括関連付けAPI(トランザクション)を新設せず、既存の`updateTask`を選択タスク数分呼び出すクライアント側オーケストレーションを採用する(Simplification参照)。

### Simplification(簡素化)
- 案件登録ポップアップでの複数タスク一括関連付けについて、単一トランザクションAPIの新設は「今回の運用規模(チーム10名程度、必須タスクも数件程度)では過剰」と判断し不採用。既存の`updateTask`を逐次呼び出す方式にする(部分失敗時は成功分を保持し、エラー表示して再試行を促す。既存の`TaskDetailModal`の2段階保存(汎用更新+開発段階更新)と同様の非トランザクション的パターンを踏襲)。
- Prismaのテーブル/カラムリネームについて、当初は手動`RENAME`文への書き換えを検討したが、**個人開発・本番未運用というプロジェクトの前提を踏まえたユーザー判断により、既存マイグレーション一式とDBデータを削除し、単一の初期マイグレーションを作り直す方針に変更した**(不要なマイグレーションファイルの蓄積を避けるため)。この方針は今後のスキーマ変更でも、別途指示がない限り継続する(design.md Physical Data Model参照)。
