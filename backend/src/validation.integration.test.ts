// Validation: 結合検証 (task 12.4-12.7). These exercise the already-approved
// service-level behaviors through the actual HTTP layer (buildApp + inject)
// rather than calling services directly, to prove the full request/response/log
// path end-to-end.
//
// Cleanup policy: every `it()` deletes its own rows (and closes its app) in
// a `finally` block. Active `recurring_task_templates` left behind are picked
// up by later case create/update apply (omit = full candidates). Soft-deleted
// tasks must also be hard-deleted so RESTRICT FKs allow case/template cleanup.
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import type { InjectOptions } from "light-my-request";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { db } from "./shared/db.js";
import { createLogger } from "./shared/logger.js";
import { setBusinessEventLoggerForTests } from "./shared/business-event-logger.js";
import { setClientErrorLoggerForTests } from "./modules/client-errors/client-error.service.js";
import { WORKSPACE_HEADER_NAME } from "./shared/workspace-scope.js";
import { createUserData } from "./test/user.fixture.js";

const WORKSPACE_SCOPED_PREFIXES = [
  "/api/cases",
  "/api/tasks",
  "/api/recurring-templates",
  "/api/holidays",
  "/api/development-stages",
] as const;

function needsWorkspaceHeader(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return WORKSPACE_SCOPED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function collectingStream() {
  const lines: Record<string, unknown>[] = [];
  let buffer = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      buffer += chunk.toString();
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) lines.push(JSON.parse(line));
      }
      callback();
    },
  });
  return { stream, lines };
}

type TestAuth = { cookie: string; csrfToken: string; userId: string; workspaceId: string };
type AppWithTestAuth = ReturnType<typeof buildApp> & {
  getTestAuth: () => Promise<TestAuth>;
};

function withAuthenticatedInject(app: ReturnType<typeof buildApp>): AppWithTestAuth {
  const originalInject = app.inject.bind(app);
  let auth: Promise<TestAuth> | undefined;

  async function authenticate() {
    auth ??= (async () => {
      const registerResponse = await originalInject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: `validation-${randomUUID()}@example.test`,
          name: "統合検証",
          password: "password-123",
        },
      });
      const setCookie = registerResponse.headers["set-cookie"];
      const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((item) => item?.startsWith("session="))?.split(";")[0];
      if (!cookie) throw new Error("session cookie was not set");

      const csrfResponse = await originalInject({
        method: "GET",
        url: "/api/auth/csrf",
        headers: { cookie },
      });
      const csrfSetCookie = csrfResponse.headers["set-cookie"];
      const csrfCookie = (Array.isArray(csrfSetCookie) ? csrfSetCookie : [csrfSetCookie]).find((item) => item?.startsWith("session="))?.split(";")[0];
      const sessionCookie = csrfCookie ?? cookie;
      const csrfToken = csrfResponse.json().token as string;

      const workspaceResponse = await originalInject({
        method: "POST",
        url: "/api/workspaces",
        headers: { cookie: sessionCookie, "csrf-token": csrfToken },
        payload: { name: `validation-ws-${randomUUID()}` },
      });
      if (workspaceResponse.statusCode !== 201) {
        throw new Error(`failed to create workspace for validation tests: ${workspaceResponse.statusCode}`);
      }

      return {
        cookie: sessionCookie,
        csrfToken,
        userId: registerResponse.json().id as string,
        workspaceId: workspaceResponse.json().id as string,
      };
    })();
    return auth;
  }

  app.inject = (async (options: InjectOptions) => {
    if (options.method === "OPTIONS" || options.url.startsWith("/api/auth/")) return originalInject(options);

    const { cookie, csrfToken, workspaceId } = await authenticate();
    const url = typeof options.url === "string" ? options.url : String(options.url);
    return originalInject({
      ...options,
      headers: {
        ...options.headers,
        cookie: options.headers?.cookie ? `${options.headers.cookie}; ${cookie}` : cookie,
        ...(options.method === "POST" || options.method === "PATCH" || options.method === "DELETE" ? { "csrf-token": csrfToken } : {}),
        ...(needsWorkspaceHeader(url) && !options.headers?.[WORKSPACE_HEADER_NAME]
          ? { [WORKSPACE_HEADER_NAME]: workspaceId }
          : {}),
      },
    });
  }) as typeof app.inject;

  app.addHook("onClose", async () => {
    const authenticated = await auth;
    if (!authenticated) return;
    await db.$executeRawUnsafe(`DELETE FROM tasks WHERE workspace_id = ?`, authenticated.workspaceId);
    await db.$executeRawUnsafe(
      `DELETE FROM recurring_task_templates WHERE workspace_id = ?`,
      authenticated.workspaceId,
    );
    await db.$executeRawUnsafe(`DELETE FROM non_business_days WHERE workspace_id = ?`, authenticated.workspaceId);
    await db.$executeRawUnsafe(`DELETE FROM development_stages WHERE workspace_id = ?`, authenticated.workspaceId);
    await db.$executeRawUnsafe(`DELETE FROM cases WHERE workspace_id = ?`, authenticated.workspaceId);
    await db.$executeRawUnsafe(`DELETE FROM workspace_members WHERE workspace_id = ?`, authenticated.workspaceId);
    await db.$executeRawUnsafe(`DELETE FROM workspaces WHERE id = ?`, authenticated.workspaceId);
    await db.$executeRawUnsafe(`DELETE FROM users WHERE id = ?`, authenticated.userId);
  });

  const authed = app as AppWithTestAuth;
  authed.getTestAuth = () => authenticate();
  return authed;
}

function buildTestApp() {
  const { stream, lines } = collectingStream();
  const logger = createLogger("debug", stream);
  setBusinessEventLoggerForTests(logger);
  setClientErrorLoggerForTests(logger);
  const app = buildApp(
    {
      DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      CORS_ORIGIN: "http://localhost:3001",
      COOKIE_SECURE: false,
      LOG_LEVEL: "debug",
      PORT: 3000,
    },
    logger,
  );
  return { app: withAuthenticatedInject(app) as AppWithTestAuth, lines };
}

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function hardDeleteTasksForCase(caseId: string): Promise<void> {
  await db.$executeRawUnsafe(`DELETE FROM tasks WHERE case_id = ?`, caseId);
}

async function hardDeleteTemplates(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(
    `DELETE FROM tasks WHERE source_template_id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  await hardDelete("recurring_task_templates", ids);
}

afterAll(async () => {
  await db.$disconnect();
});

describe("12.4: 繰り返しタスク生成の統合検証 (Requirements 5.1, 5.3, 5.5, 5.6)", () => {
  it("POST /api/cases (omit templateOperations) triggers case-relative generation end-to-end (Requirement 5.3)", async () => {
    const { app } = buildTestApp();
    const caseIds: string[] = [];
    const templateIds: string[] = [];
    try {
      const template = await app
        .inject({
          method: "POST",
          url: "/api/recurring-templates",
          payload: {
            title: "e2e case-relative",
            priority: "low",
            caseAnchor: "case_end",
            caseOffsetDays: 2,
            nonBusinessDayPolicy: "as_is",
          },
        })
        .then((r) => r.json());
      templateIds.push(template.id);

      const caseEntity = await app
        .inject({ method: "POST", url: "/api/cases", payload: { name: "e2e case", endDate: "2041-03-10" } })
        .then((r) => r.json());
      caseIds.push(caseEntity.id);

      const tasks = await app
        .inject({ method: "GET", url: `/api/tasks?caseId=${caseEntity.id}` })
        .then((r) => r.json());
      const mine = tasks.filter((t: { sourceTemplateId: string }) => t.sourceTemplateId === template.id);

      expect(mine).toHaveLength(1);
      expect(mine[0].scheduledDate.slice(0, 10)).toBe("2041-03-08");
    } finally {
      for (const id of caseIds) await hardDeleteTasksForCase(id);
      await hardDelete("cases", caseIds);
      await hardDeleteTemplates(templateIds);
      await app.close();
    }
  });

  it("PATCH /api/cases/:id endDate change with omit applies end_regenerate end-to-end (Requirements 5.2, 6.1, 6.2)", async () => {
    const { app } = buildTestApp();
    const caseIds: string[] = [];
    const templateIds: string[] = [];
    try {
      const template = await app
        .inject({
          method: "POST",
          url: "/api/recurring-templates",
          payload: {
            title: "e2e case-relative recalc",
            priority: "low",
            caseAnchor: "case_end",
            caseOffsetDays: 3,
            nonBusinessDayPolicy: "as_is",
          },
        })
        .then((r) => r.json());
      templateIds.push(template.id);

      const caseEntity = await app
        .inject({ method: "POST", url: "/api/cases", payload: { name: "e2e recalculable case", endDate: "2041-09-15" } })
        .then((r) => r.json());
      caseIds.push(caseEntity.id);

      const initialTasks = await app
        .inject({ method: "GET", url: `/api/tasks?caseId=${caseEntity.id}` })
        .then((r) => r.json());
      const initialMine = initialTasks.filter((t: { sourceTemplateId: string }) => t.sourceTemplateId === template.id);
      expect(initialMine).toHaveLength(1);
      expect(initialMine[0].scheduledDate.slice(0, 10)).toBe("2041-09-12");
      const oldId = initialMine[0].id;

      await app.inject({ method: "PATCH", url: `/api/cases/${caseEntity.id}`, payload: { endDate: "2041-09-20" } });

      const recalculatedTasks = await app
        .inject({ method: "GET", url: `/api/tasks?caseId=${caseEntity.id}` })
        .then((r) => r.json());
      const mine = recalculatedTasks.filter((t: { sourceTemplateId: string }) => t.sourceTemplateId === template.id);
      expect(mine).toHaveLength(1);
      expect(mine[0].id).not.toBe(oldId);
      expect(mine[0].scheduledDate.slice(0, 10)).toBe("2041-09-17");
    } finally {
      for (const id of caseIds) await hardDeleteTasksForCase(id);
      await hardDelete("cases", caseIds);
      await hardDeleteTemplates(templateIds);
      await app.close();
    }
  });

  it("POST /api/cases without endDate does not trigger case_end generation end-to-end (Requirements 2.4, 6.3)", async () => {
    const { app } = buildTestApp();
    const caseIds: string[] = [];
    const templateIds: string[] = [];
    try {
      const template = await app
        .inject({
          method: "POST",
          url: "/api/recurring-templates",
          payload: {
            title: "e2e case-relative no enddate",
            priority: "low",
            caseAnchor: "case_end",
            caseOffsetDays: 2,
            nonBusinessDayPolicy: "as_is",
          },
        })
        .then((r) => r.json());
      templateIds.push(template.id);

      const caseEntity = await app
        .inject({ method: "POST", url: "/api/cases", payload: { name: "e2e case without endDate" } })
        .then((r) => r.json());
      caseIds.push(caseEntity.id);
      expect(caseEntity.endDate).toBeNull();

      const tasks = await app
        .inject({ method: "GET", url: `/api/tasks?caseId=${caseEntity.id}` })
        .then((r) => r.json());
      const mine = tasks.filter((t: { sourceTemplateId: string }) => t.sourceTemplateId === template.id);

      expect(mine).toHaveLength(0);
    } finally {
      for (const id of caseIds) await hardDeleteTasksForCase(id);
      await hardDelete("cases", caseIds);
      await hardDeleteTemplates(templateIds);
      await app.close();
    }
  });

  it("PATCH /api/cases/:id setting endDate for the first time triggers end_generate end-to-end (Requirements 2.4, 2.5, 5.3)", async () => {
    const { app } = buildTestApp();
    const caseIds: string[] = [];
    const templateIds: string[] = [];
    try {
      const template = await app
        .inject({
          method: "POST",
          url: "/api/recurring-templates",
          payload: {
            title: "e2e case-relative later enddate",
            priority: "low",
            caseAnchor: "case_end",
            caseOffsetDays: 4,
            nonBusinessDayPolicy: "as_is",
          },
        })
        .then((r) => r.json());
      templateIds.push(template.id);

      const caseEntity = await app
        .inject({
          method: "POST",
          url: "/api/cases",
          payload: { name: "e2e case later endDate", templateOperations: [] },
        })
        .then((r) => r.json());
      caseIds.push(caseEntity.id);

      const beforeTasks = await app
        .inject({ method: "GET", url: `/api/tasks?caseId=${caseEntity.id}` })
        .then((r) => r.json());
      expect(beforeTasks.filter((t: { sourceTemplateId: string }) => t.sourceTemplateId === template.id)).toHaveLength(0);

      await app.inject({ method: "PATCH", url: `/api/cases/${caseEntity.id}`, payload: { endDate: "2041-11-20" } });

      const afterTasks = await app
        .inject({ method: "GET", url: `/api/tasks?caseId=${caseEntity.id}` })
        .then((r) => r.json());
      const mine = afterTasks.filter((t: { sourceTemplateId: string }) => t.sourceTemplateId === template.id);

      expect(mine).toHaveLength(1);
      expect(mine[0].scheduledDate.slice(0, 10)).toBe("2041-11-16");
    } finally {
      for (const id of caseIds) await hardDeleteTasksForCase(id);
      await hardDelete("cases", caseIds);
      await hardDeleteTemplates(templateIds);
      await app.close();
    }
  });

  it("DELETE /api/cases/:id detaches linked Task caseId to null end-to-end (Requirements 8.1, 8.2)", async () => {
    const { app } = buildTestApp();
    const taskIds: string[] = [];
    const caseIds: string[] = [];
    try {
      const caseEntity = await app
        .inject({
          method: "POST",
          url: "/api/cases",
          payload: { name: "e2e detach case", endDate: "2041-10-10", templateOperations: [] },
        })
        .then((r) => r.json());
      caseIds.push(caseEntity.id);

      const task = await app
        .inject({
          method: "POST",
          url: "/api/tasks",
          payload: { title: "e2e detach task", priority: "low", caseId: caseEntity.id },
        })
        .then((r) => r.json());
      taskIds.push(task.id);

      const deleteResponse = await app.inject({ method: "DELETE", url: `/api/cases/${caseEntity.id}` });
      expect(deleteResponse.statusCode).toBe(204);

      const fetchedTask = await app.inject({ method: "GET", url: `/api/tasks/${task.id}` }).then((r) => r.json());
      expect(fetchedTask.caseId).toBeNull();
    } finally {
      await hardDelete("tasks", taskIds);
      await hardDelete("cases", caseIds);
      await app.close();
    }
  });

  it("regenerate soft-delete then recreate same scheduled date succeeds via apply path (Requirements 5.2, 5.5)", async () => {
    const { app } = buildTestApp();
    const caseIds: string[] = [];
    const templateIds: string[] = [];
    try {
      const template = await app
        .inject({
          method: "POST",
          url: "/api/recurring-templates",
          payload: {
            title: "e2e regenerate same day",
            priority: "low",
            caseAnchor: "case_end",
            caseOffsetDays: 0,
            nonBusinessDayPolicy: "as_is",
          },
        })
        .then((r) => r.json());
      templateIds.push(template.id);

      const caseEntity = await app
        .inject({
          method: "POST",
          url: "/api/cases",
          payload: { name: "e2e regen case", endDate: "2041-04-10", templateOperations: ["end_generate"] },
        })
        .then((r) => r.json());
      caseIds.push(caseEntity.id);

      const first = await app
        .inject({ method: "GET", url: `/api/tasks?caseId=${caseEntity.id}` })
        .then((r) => r.json());
      const firstMine = first.filter((t: { sourceTemplateId: string }) => t.sourceTemplateId === template.id);
      expect(firstMine).toHaveLength(1);
      const oldId = firstMine[0].id;
      expect(firstMine[0].scheduledDate.slice(0, 10)).toBe("2041-04-10");

      // Soft-delete the active instance, then regenerate onto the same day.
      await app.inject({ method: "DELETE", url: `/api/tasks/${oldId}` });
      await app.inject({
        method: "PATCH",
        url: `/api/cases/${caseEntity.id}`,
        payload: { endDate: "2041-04-11", templateOperations: ["end_regenerate"] },
      });
      await app.inject({
        method: "PATCH",
        url: `/api/cases/${caseEntity.id}`,
        payload: { endDate: "2041-04-10", templateOperations: ["end_regenerate"] },
      });

      const after = await app
        .inject({ method: "GET", url: `/api/tasks?caseId=${caseEntity.id}` })
        .then((r) => r.json());
      const mine = after.filter((t: { sourceTemplateId: string }) => t.sourceTemplateId === template.id);
      expect(mine).toHaveLength(1);
      expect(mine[0].id).not.toBe(oldId);
      expect(mine[0].scheduledDate.slice(0, 10)).toBe("2041-04-10");
    } finally {
      for (const id of caseIds) await hardDeleteTasksForCase(id);
      await hardDelete("cases", caseIds);
      await hardDeleteTemplates(templateIds);
      await app.close();
    }
  });
});

describe("12.5: 非営業日ポリシー4パターンの統合検証 (Requirements 8.4-8.7)", () => {
  const scenarios: Array<{
    policy: "as_is" | "skip" | "next_business_day" | "previous_business_day";
    holidayDate: string;
    expectedScheduledDate: string | null;
  }> = [
    { policy: "as_is", holidayDate: "2041-05-01", expectedScheduledDate: "2041-05-01" },
    { policy: "skip", holidayDate: "2041-05-02", expectedScheduledDate: null },
    { policy: "next_business_day", holidayDate: "2041-05-03", expectedScheduledDate: "2041-05-04" },
    { policy: "previous_business_day", holidayDate: "2041-05-04", expectedScheduledDate: "2041-05-03" },
  ];

  for (const scenario of scenarios) {
    it(`policy=${scenario.policy}: generation result matches the spec via case apply`, async () => {
      const { app } = buildTestApp();
      const templateIds: string[] = [];
      const holidayIds: string[] = [];
      const caseIds: string[] = [];
      try {
        const holiday = await app
          .inject({ method: "POST", url: "/api/holidays", payload: { date: scenario.holidayDate } })
          .then((r) => r.json());
        holidayIds.push(holiday.id);
        const template = await app
          .inject({
            method: "POST",
            url: "/api/recurring-templates",
            payload: {
              title: `e2e policy ${scenario.policy}`,
              priority: "low",
              caseAnchor: "case_end",
              caseOffsetDays: 0,
              nonBusinessDayPolicy: scenario.policy,
            },
          })
          .then((r) => r.json());
        templateIds.push(template.id);

        const caseEntity = await app
          .inject({
            method: "POST",
            url: "/api/cases",
            payload: {
              name: `e2e policy case ${scenario.policy}`,
              endDate: scenario.holidayDate,
              templateOperations: ["end_generate"],
            },
          })
          .then((r) => r.json());
        caseIds.push(caseEntity.id);

        const tasks = await app
          .inject({ method: "GET", url: `/api/tasks?caseId=${caseEntity.id}` })
          .then((r) => r.json());
        const mine = tasks.filter((t: { sourceTemplateId: string }) => t.sourceTemplateId === template.id);

        if (scenario.expectedScheduledDate === null) {
          expect(mine).toHaveLength(0);
        } else {
          expect(mine).toHaveLength(1);
          expect(mine[0].scheduledDate.slice(0, 10)).toBe(scenario.expectedScheduledDate);
        }
      } finally {
        for (const id of caseIds) await hardDeleteTasksForCase(id);
        await hardDelete("cases", caseIds);
        await hardDeleteTemplates(templateIds);
        await hardDelete("non_business_days", holidayIds);
        await app.close();
      }
    });
  }
});

describe("12.6: 論理削除の一覧除外と消化数実績不変の統合検証 (Requirements 9.4, 9.5)", () => {
  it("a deleted task disappears from GET /api/tasks but still counts in its historical throughput period", async () => {
    const { app } = buildTestApp();
    const taskIds: string[] = [];
    try {
      const { workspaceId } = await app.getTestAuth();
      const completedAt = new Date("2041-06-04T09:00:00.000Z"); // Wednesday
      const task = await db.task.create({
        data: {
          title: `e2e-throughput-${randomUUID()}`,
          priority: "low",
          status: "done",
          completedAt,
          workspaceId,
        },
      });
      taskIds.push(task.id);

      const before = await app
        .inject({ method: "GET", url: "/api/throughput?periodType=week&rangeCount=1" })
        .then((r) => r.json());

      const deleteResponse = await app.inject({ method: "DELETE", url: `/api/tasks/${task.id}` });
      expect(deleteResponse.statusCode).toBe(204);

      const listResponse = await app.inject({ method: "GET", url: "/api/tasks" });
      expect(listResponse.json().some((t: { id: string }) => t.id === task.id)).toBe(false);

      const after = await app
        .inject({ method: "GET", url: "/api/throughput?periodType=week&rangeCount=1" })
        .then((r) => r.json());
      expect(after.periods[0].completedCount).toBe(before.periods[0].completedCount);
    } finally {
      await hardDelete("tasks", taskIds);
      await app.close();
    }
  });
});

describe("12.7: ログ相関とフロントエンドエラー記録の統合検証 (Requirements 10.3, 10.4, 10.5)", () => {
  it("a server-side exception logs the stack trace + requestId, correlated with the access log (Requirement 10.3, 10.5)", async () => {
    const { app, lines } = buildTestApp();
    try {
      const response = await app.inject({ method: "DELETE", url: `/api/cases/${randomUUID()}` });

      expect(response.statusCode).toBe(404);
      const errorLine = lines.find((l) => l.err !== undefined);
      const accessLine = lines.find((l) => l.path?.toString().startsWith("/api/cases/") && l.statusCode === 404);
      expect(errorLine).toBeTruthy();
      expect((errorLine?.err as Record<string, unknown>).stack).toEqual(expect.any(String));
      expect(errorLine?.requestId).toBe(accessLine?.requestId);
    } finally {
      await app.close();
    }
  });

  it("POST /api/client-errors records a frontend-reported error in the same log format as a server error (Requirement 10.4)", async () => {
    const { app, lines } = buildTestApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/client-errors",
        payload: {
          message: "e2e client error",
          stack: "Error: e2e client error\n  at Component.vue:1:1",
          pageUrl: "https://app.example.com/tasks",
          occurredAt: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(204);
      const errorLine = lines.find((l) => (l.err as Record<string, unknown> | undefined)?.message === "e2e client error");
      expect(errorLine).toBeTruthy();
      expect((errorLine?.err as Record<string, unknown>).stack).toContain("Component.vue:1:1");
      expect(errorLine?.pageUrl).toBe("https://app.example.com/tasks");
    } finally {
      await app.close();
    }
  });
});

describe("18.1: 開発段階マスタ削除時のタスク参照解除の統合検証 (Requirement 12.5)", () => {
  it("deleting a development stage via the real HTTP path resets referencing tasks' developmentStageId to null", async () => {
    const { app } = buildTestApp();
    const taskIds: string[] = [];
    const stageIds: string[] = [];
    try {
      const stage = await app
        .inject({ method: "POST", url: "/api/development-stages", payload: { name: `e2e stage ${randomUUID()}` } })
        .then((r) => r.json());
      stageIds.push(stage.id);
      const task = await app
        .inject({ method: "POST", url: "/api/tasks", payload: { title: "e2e stage task", priority: "low" } })
        .then((r) => r.json());
      taskIds.push(task.id);
      await app.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}/development-stage`,
        payload: { developmentStageId: stage.id },
      });

      const deleteResponse = await app.inject({ method: "DELETE", url: `/api/development-stages/${stage.id}` });
      expect(deleteResponse.statusCode).toBe(204);

      const tasksResponse = await app.inject({ method: "GET", url: "/api/tasks" });
      const updatedTask = tasksResponse.json().find((t: { id: string }) => t.id === task.id);
      expect(updatedTask.developmentStageId).toBeNull();

      const stagesResponse = await app.inject({ method: "GET", url: "/api/development-stages" });
      expect(stagesResponse.json().some((s: { id: string }) => s.id === stage.id)).toBe(false);
    } finally {
      await hardDelete("tasks", taskIds);
      await hardDelete("development_stages", stageIds);
      await app.close();
    }
  });
});

describe("18.2: 開発段階更新時の担当者自動設定ルールの統合検証 (Requirements 12.6, 12.7, 12.8)", () => {
  it("sets the assignee together with the development stage when the task is unassigned", async () => {
    const { app } = buildTestApp();
    const taskIds: string[] = [];
    const stageIds: string[] = [];
    const userIds: string[] = [];
    try {
      const { workspaceId } = await app.getTestAuth();
      const user = await db.user.create({ data: createUserData(`e2e user ${randomUUID()}`) });
      userIds.push(user.id);
      await db.workspaceMember.create({ data: { workspaceId, userId: user.id } });
      const stage = await app
        .inject({ method: "POST", url: "/api/development-stages", payload: { name: `e2e stage ${randomUUID()}` } })
        .then((r) => r.json());
      stageIds.push(stage.id);
      const task = await app
        .inject({ method: "POST", url: "/api/tasks", payload: { title: "e2e unassigned task", priority: "low" } })
        .then((r) => r.json());
      taskIds.push(task.id);

      const response = await app.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}/development-stage`,
        payload: { developmentStageId: stage.id, assigneeUserId: user.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().developmentStageId).toBe(stage.id);
      expect(response.json().assigneeUserId).toBe(user.id);
    } finally {
      await hardDelete("tasks", taskIds);
      await hardDelete("development_stages", stageIds);
      if (userIds.length > 0) {
        await db.$executeRawUnsafe(
          `DELETE FROM workspace_members WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
          ...userIds,
        );
      }
      await hardDelete("users", userIds);
      await app.close();
    }
  });

  it("does not overwrite an already-assigned task's assignee when only the development stage is moved", async () => {
    const { app } = buildTestApp();
    const taskIds: string[] = [];
    const stageIds: string[] = [];
    const userIds: string[] = [];
    try {
      const { workspaceId } = await app.getTestAuth();
      const originalAssignee = await db.user.create({ data: createUserData(`e2e original ${randomUUID()}`) });
      userIds.push(originalAssignee.id);
      const otherUser = await db.user.create({ data: createUserData(`e2e other ${randomUUID()}`) });
      userIds.push(otherUser.id);
      await db.workspaceMember.create({ data: { workspaceId, userId: originalAssignee.id } });
      await db.workspaceMember.create({ data: { workspaceId, userId: otherUser.id } });
      const stage = await app
        .inject({ method: "POST", url: "/api/development-stages", payload: { name: `e2e stage ${randomUUID()}` } })
        .then((r) => r.json());
      stageIds.push(stage.id);
      const task = await app
        .inject({
          method: "POST",
          url: "/api/tasks",
          payload: { title: "e2e already assigned task", priority: "low", assigneeUserId: originalAssignee.id },
        })
        .then((r) => r.json());
      taskIds.push(task.id);

      const response = await app.inject({
        method: "PATCH",
        url: `/api/tasks/${task.id}/development-stage`,
        payload: { developmentStageId: stage.id, assigneeUserId: otherUser.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().developmentStageId).toBe(stage.id);
      expect(response.json().assigneeUserId).toBe(originalAssignee.id);
    } finally {
      await hardDelete("tasks", taskIds);
      await hardDelete("development_stages", stageIds);
      if (userIds.length > 0) {
        await db.$executeRawUnsafe(
          `DELETE FROM workspace_members WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
          ...userIds,
        );
      }
      await hardDelete("users", userIds);
      await app.close();
    }
  });
});
