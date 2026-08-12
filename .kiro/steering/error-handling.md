# エラーハンドリング

[Purpose: バックエンドのエラー分類・形式・ログ相関と、フロントエンドでのエラー表示の一貫した扱い方をまとめる]

## バックエンド: throwベースの`HttpError`パターン

`backend/src/shared/http-errors.ts` の `HttpError`(`statusCode`を持つ`Error`のサブクラス)を、サービス層が業務ルール違反時に直接throwする。ヘルパー関数(`badRequest(message)`, `notFound(message)`など)を使い、文字列や裸のstatusCodeを直接扱わない。

```typescript
// 例: 未クローズの子がある親を完了段階へ移すとき（実際の TasksService は Result で incomplete_children を返し、
// ルート層が 409 + "Task has incomplete children: <taskId>" に変換する）
if (incompleteChildren > 0) {
  throw new HttpError(409, "Task has incomplete children");
}
```

`app.ts`の`setErrorHandler`がFastifyの`error.statusCode`を尊重して一括変換するため、ルートハンドラ側で個別のtry/catchは基本的に不要(Fastifyが自動的にハンドラへ伝播させる)。

**例外**: `TasksService`のみ、分割・階層操作の一部で`Result<T, E>`パターンを使う(呼び出し側に成功/失敗を明示的に分岐させたい箇所)。新規モジュールは基本的にthrowベースの`HttpError`を使い、`Result`型は既存のTasksServiceの踏襲が必要な場合のみ検討する。

## ログとの相関

すべてのエラーは `shared/logger.ts` の `AppLogger.logError(error, { requestId, ...context })` を通して記録する。`requestId`はFastifyの`request.id`を明示的に渡す(バインド済みchild loggerに頼らない設計 — ルートハンドラからもサービス層からも同じ形でログが出せるようにするため)。アクセスログ・業務イベントログ・エラーログは同じ`AppLogger`インターフェースの3メソッド(`logAccess`/`logBusinessEvent`/`logError`)経由でのみ出力し、モジュールごとに別形式のロガーを実装しない。

ロギングは失敗しても業務処理に影響してはならない(`logError`内部で自身の例外を握りつぶす)。

### モジュール単位のロガー差し替え(テスト用シーム)
`business-event-logger.ts`や`client-error.service.ts`のように、モジュールが自分専用のロガーシングルトンを持つ場合、以下のパターンでテストから差し替え可能にする(ESMのlive binding特性を利用):

```typescript
export let someLogger: AppLogger = createLogger(loadEnv().LOG_LEVEL);
export function setXForTests(logger: AppLogger): void {
  someLogger = logger;
}
```

新しいモジュールにロガーシングルトンを追加する場合、実HTTP経路のテストからログ出力を観測する必要があるなら同じパターンを踏襲する。

## フロントエンド: エラーを画面に必ず表示する

Nuxtページでバックエンドが返しうるエラー(特に409のような業務ルール違反)は、**必ず`try/catch`で捕まえて画面に表示する**。キャッチせずに投げっぱなしにすると、ブラウザのunhandled promise rejectionとしてコンソールにのみ残り、ユーザーには何も見えない(実際に`onStatusChange`でこの不備が発生し、要件違反としてレビューで指摘された)。

```typescript
const error = ref<string | null>(null);

async function onStatusChange(id: string, status: TaskStatus) {
  error.value = null;
  try {
    await api.updateTaskStatus(id, status);
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    await load(); // サーバー側の実際の状態に画面を追従させる
  }
}
```

```html
<p v-if="error" role="alert" style="color: red">{{ error }}</p>
```

新しく状態変更・作成・削除のAPI呼び出しをページに追加する際は、このパターン(エラーref + try/catch + `role="alert"`表示)を必ず踏襲する。

## フロントエンド: 未捕捉エラーの自動通報

`frontend/plugins/error-reporter.client.ts` が Vueのグローバルエラーハンドラ・`window.onerror`・`unhandledrejection`を購読し、`POST /api/client-errors`へ自動送信する。同一エラーの連続送信は `useErrorReportRateLimit.ts` の純粋関数(時間窓ベース)で抑制する。この通報自体が失敗しても`.catch(() => {})`で握りつぶし、エラー通報の失敗がアプリの動作に影響しないようにする。個別ページで独自のグローバルエラーキャッチを実装しない — このプラグインに一元化する。
