# Prisma マイグレーション方針

[Purpose: 開発フェーズにおけるスキーマ変更の適用手順を固定し、追従マイグレーションの増殖と生成列の誤 DROP を防ぐ]

本番相当の永続データはまだない前提で運用する。スキーマ変更は追従マイグレーションを積み上げず、単一の初期マイグレーションへ畳み込む。

## 厳守ルール

- スキーマ変更の正本
  - `backend/src/prisma/schema.prisma`
- リポジトリに置くマイグレーション
  - `backend/src/prisma/migrations/` 配下は常に単一の init（`*_init_domain_schema`）のみとする
  - `migration_lock.toml` は残す
- 禁止
  - 列追加・改名・削除・制約変更のための追従マイグレーションディレクトリを新規追加すること
  - 生成列や一意制約を含む変更を理由に `prisma migrate dev` で差分 SQL を自動生成・適用すること
- 必須手順（スキーマを変えたとき）
  - `schema.prisma` を更新する
  - 既存の init 以外のマイグレーションディレクトリがあれば削除する
  - 空スキーマから現行 `schema.prisma` への SQL を生成する（例: `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`）
  - 生成 SQL を単一 init の `migration.sql` として置き換え、STORED GENERATED COLUMN とそれに紐づく UNIQUE を手編集で復元する
  - 開発 DB を破棄して適用する（`prisma migrate reset`）。適用手段に `prisma migrate dev` の差分追従を使わない
  - `SHOW CREATE TABLE` で生成列・UNIQUE が残っていることを確認する
- 生成列（必読）
  - `tasks.template_case_date_active_key`
  - `non_business_days.date_active_key`
  - Prisma スキーマ言語では `Unsupported` にしか書けない。自動生成 SQL には含まれない／ドリフト扱いされる。init 手編集が唯一の正本である
  - 詳細な罠は [[local-dev-pitfalls]] 項目 6

## 例外を認めないもの

- 「今回だけ小さな ALTER を足す」
- 「rename 用に 1 本だけ追加する」
- 「データ移行 SQL が必要なので追従マイグレーションにする」

開発データは捨ててよい。必要な初期値は seed、アプリ起動時、またはワークスペース作成時の投入経路へ寄せる。

## 将来（本番データがある段階）

RDS 等で破棄できないデータが載った時点で、本ファイルの方針を見直し、追従マイグレーション運用へ切り替える。その切替までは上記を厳守する。

## 関連

- 技術スタック概観: [[tech]]
- ローカルの生成列 DROP 罠: [[local-dev-pitfalls]]
