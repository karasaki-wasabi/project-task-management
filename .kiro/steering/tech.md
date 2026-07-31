# Technology Stack

## Architecture

Webアプリケーション: Nuxt 4(Vue 3, `ssr: false`の静的SPA)フロントエンド + Fastify 5バックエンドAPI + MySQL。ローカル開発はDocker Compose(`mysql`/`backend`/`frontend`の3サービス)、本番はAWSへ段階的にデプロイする前提(下記「Key Technical Decisions」参照)。

フロントエンドはブラウザから直接バックエンドAPIへリクエストする構成のため、CORSやポートの環境変数配線が必須([[local-dev-pitfalls]]参照)。

## Core Technologies

- **Language**: TypeScript(strict mode)。バックエンド・フロントエンドとも
- **Backend Framework**: Fastify 5 + Zod(リクエストバリデーション) + Prisma(MySQL ORM)
- **Frontend Framework**: Nuxt 4.x(Vue 3) — 静的SPA、ファイルベースルーティング、コンポーネント自動インポート
- **Runtime**: Node.js 24(ESM、`"type": "module"`)

## Key Libraries

- **Prisma**: スキーマは`backend/src/prisma/schema.prisma`。共通のソフトデリート/監査カラム規約はPrisma Client Extension(`shared/soft-delete.repository.ts`)で一律適用する(各Serviceが個別に気にする必要がない設計)
- **pino** + **pino-pretty**: 構造化ログ。開発時のみpretty-print、テスト/本番はJSON行出力
- **rrule**: 繰り返しタスク生成の間隔計算。`exports`フィールドを持たないCJSパッケージのため、`import { RRule } from "rrule"`ではなくデフォルトインポート+分割代入で使う([[testing]]参照の元ネタ、tasks.md Implementation Notes task 10.3)
- **@fastify/cors**: SPAからのクロスオリジンAPI呼び出しを許可(`origin: true`で反映、認証なし内部ツールという前提での判断)
- **@playwright/test**: E2Eテスト。design.md/research.mdに指定がなく実装時に導入した判断(Nuxt/Vueでの標準的選択)

## Development Standards

### Type Safety
- `strict: true`。`any`を避け、Prismaが生成する型(`import type { Task as PrismaTask } from "@prisma/client"`)をドメイン型のベースにする
- バックエンドの各モジュールは`<name>.types.ts`にドメイン型・入力型・エラー型を集約し、`service.ts`/`repository.ts`/`routes.ts`から共有する

### Code Quality
- Fastifyルートでのリクエストボディ/クエリ/パラメータ検証はZodスキーマ + `safeParse`で行い、失敗時は`badRequest(...)`(`shared/http-errors.ts`)に変換する([[error-handling]]参照)
- モジュール間はサービスの公開インターフェース経由でのみ依存する(他モジュールのPrismaクエリやrepositoryへ直接アクセスしない)

### Testing
- Vitest(バックエンド・フロントエンドとも)。バックエンドは実MySQLに対して実行しモックしない。詳細は[[testing]]参照

## Development Environment

### Required Tools
- Docker / Docker Compose(mysql・backend・frontendの3サービス)
- Node.js 24系(ホスト側でPlaywright等を直接実行する場合に使用)

### Common Commands
```bash
# 起動: docker compose up -d mysql backend frontend
# バックエンドテスト: docker compose run --rm -T backend npx vitest run --no-file-parallelism
# バックエンドビルド: docker compose run --rm -T backend npm run build
# フロントエンドテスト: docker compose run --rm --no-deps -T frontend npm run test
# フロントエンドビルド: docker compose run --rm --no-deps -T frontend npm run generate
# フロントエンドE2E: frontend/playwright.config.ts (E2E_BASE_URL で対象URL切り替え)
```

## Key Technical Decisions

- 仕様駆動開発ツールとして cc-sdd(Kiro式 SDD)を導入し、requirements → design → tasks → implementation の順で進める
- インフラは段階導入方針
  1. S3 + CloudFront(フロント)、App Runner または Elastic Beanstalk(バックエンド)
  2. RDS導入、環境分離(dev/prod)
  3. ECS Fargate + Terraform/CDK による IaC 化、GitHub ActionsからのCD
- 認証機能は現時点でOut of Boundary。`User`は名前のみの軽量レコードで、担当者選択リストとしてのみ機能する(将来の認証導入は別スペックで扱い、その際`User`の意味が変わる点はdesign.mdのRevalidation Triggersに明記済み)
- ログはCloudWatch Logsへのstdout/stderr転送までを対象とし、専用のログ集約・可視化基盤(ELK/Datadog等)は構築しない

### デプロイ範囲: 当面はStage 1まで(2026-07時点の決定)

個人開発・自費運用のため、上記インフラ段階導入方針のうち**Stage 1(S3 + CloudFront + App Runner)を当面のゴールとする**。Stage 2(RDS)・Stage 3(ECS Fargate + IaC)は、チームでの利用が見えてきた段階(会社で借りているサーバーへの相乗りを打診するタイミング等)で再検討する。

**費用試算(2026-07調査、個人利用・低トラフィック前提)**:
- Stage 1のみ: 月$10〜20程度(主にApp Runnerのアイドル課金。S3/CloudFrontはほぼ無料枠内)
- 独自ドメインは任意(取らなければ$0。取る場合はRoute 53で年$12前後 + ホストゾーン月$0.50)
- HTTPS証明書はACMで無料、CloudWatch Logsも個人利用の量なら無料枠内
- GitHub Actions / GHCRはpublicリポジトリのため無料
- Stage 2(RDS)は新規アカウントなら最初の12ヶ月無料、その後+$15〜20/月
- Stage 3は固定費(ALB 月$16〜20、NAT Gateway 月$32)が乗るため要注意。個人規模ならNAT Gatewayを避ける構成にするだけで大きく圧縮できる

**AWS以外の無料代替(将来検討する場合の参考)**:
- 各パーツを分散: Cloudflare Pages(フロント、常時無料)+ Render(バックエンド、無料枠は15分アイドルで自動停止しコールドスタートあり)+ Aiven(MySQL、常時無料枠)
- 1台のVMに全部乗せ: Oracle Cloud "Always Free" ARM VM上で今のDocker Compose構成をほぼそのまま稼働可能(常時起動、休眠なし)。無料枠の内容は変動があるため利用直前に要確認

---
_Document standards and patterns, not every dependency_
