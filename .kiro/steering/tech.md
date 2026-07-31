# Technology Stack

## Architecture

未確定（`/kiro-spec-design` フェーズで正式決定）。

現時点の方向性
- Webアプリケーション（フロントエンド + バックエンドAPI + DB）
- 段階的にAWSへデプロイすることを前提にした構成にする

## Core Technologies

- **Language**: 未確定（候補: TypeScript / Go）
- **Framework**: 未確定（候補: Next.js + Express/Fastify、または Go製API）
- **Runtime**: 未確定（候補: Node.js 20+）

## Key Libraries

未確定。設計フェーズで決定。

## Development Standards

### Type Safety
未確定

### Code Quality
未確定（ESLint/Prettier等を想定）

### Testing
未確定

## Development Environment

### Required Tools
- Node.js 20.12.2 / npm 10.5.0（開発ホストに導入済み）
- Git（未初期化、今後リポジトリ化する）

### Common Commands
```bash
# Dev: [未確定]
# Build: [未確定]
# Test: [未確定]
```

## Key Technical Decisions

- 仕様駆動開発ツールとして cc-sdd（Kiro式 SDD）を導入し、requirements → design → tasks → implementation の順で進める
- インフラは段階導入方針
  1. S3 + CloudFront（フロント）、App Runner または Elastic Beanstalk（バックエンド）
  2. RDS導入、環境分離（dev/prod）
  3. ECS Fargate + Terraform/CDK による IaC 化、GitHub ActionsからのCD

---
_Document standards and patterns, not every dependency_
