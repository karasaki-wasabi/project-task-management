import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { db } from "./shared/db.js";
import { WORKSPACE_HEADER_NAME } from "./shared/workspace-scope.js";
import { withCsrfToken, withSessionCookie } from "./test/auth.fixture.js";

const env = {
  DATABASE_URL: "mysql://user:pass@localhost:3306/db",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  CORS_ORIGIN: "http://localhost:3001",
  COOKIE_SECURE: false,
  LOG_LEVEL: "error" as const,
  PORT: 3000,
};

type App = ReturnType<typeof buildApp>;

const noApply = { templateOperations: [] as const };

const SCOPED_COLLECTION_PATHS = [
  "/api/cases",
  "/api/tasks",
  "/api/recurring-templates",
  "/api/holidays",
  "/api/development-stages",
  "/api/throughput",
] as const;

function sessionCookie(response: { headers: Record<string, string | string[] | undefined> }): string {
  const setCookie = response.headers["set-cookie"];
  const session = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((cookie) =>
    cookie?.startsWith("session="),
  );
  if (!session) throw new Error("session cookie was not set");
  return session.split(";")[0];
}

async function registerUser(app: App, name: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: `ws-scope-authz-${randomUUID()}@example.test`,
      name,
      password: "password-123",
    },
  });
  expect(response.statusCode).toBe(201);
  return {
    user: response.json() as { id: string; email: string; name: string },
    cookie: sessionCookie(response),
  };
}

async function csrfToken(app: App, cookie: string): Promise<{ token: string; cookie: string }> {
  const response = await app.inject({
    method: "GET",
    url: "/api/auth/csrf",
    headers: { cookie },
  });
  expect(response.statusCode).toBe(200);
  return { token: response.json().token as string, cookie: sessionCookie(response) };
}

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  if (table === "tasks") {
    await db.$executeRawUnsafe(
      `DELETE FROM activity_logs WHERE task_id IN (${ids.map(() => "?").join(",")})`,
      ...ids,
    );
  }
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function createWorkspace(app: App, csrf: { token: string; cookie: string }, name: string): Promise<string> {
  const response = await app.inject(
    withCsrfToken(
      withSessionCookie({ method: "POST", url: "/api/workspaces", payload: { name } }, csrf.cookie),
      csrf.token,
    ),
  );
  expect(response.statusCode).toBe(201);
  return response.json().id as string;
}

function withWorkspace(
  options: Parameters<App["inject"]>[0],
  cookie: string,
  csrf: string | undefined,
  workspaceId: string,
) {
  const withSession = withSessionCookie(
    {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        [WORKSPACE_HEADER_NAME]: workspaceId,
      },
    },
    cookie,
  );
  return csrf ? withCsrfToken(withSession, csrf) : withSession;
}

describe("workspace scope 認可の横断 (task 9.1)", () => {
  const app = buildApp(env);

  let memberId: string;
  let outsiderId: string;
  let memberCsrf: { token: string; cookie: string };
  let outsiderCsrf: { token: string; cookie: string };
  let workspaceA: string;
  let workspaceB: string;

  let foreignCaseId: string;
  let foreignTaskId: string;
  let foreignTemplateId: string;
  let foreignHolidayId: string;
  let foreignStageId: string;

  beforeAll(async () => {
    const member = await registerUser(app, "スコープ横断メンバー");
    const outsider = await registerUser(app, "スコープ横断部外者");
    memberId = member.user.id;
    outsiderId = outsider.user.id;
    memberCsrf = await csrfToken(app, member.cookie);
    outsiderCsrf = await csrfToken(app, outsider.cookie);

    workspaceA = await createWorkspace(app, memberCsrf, `scope-authz-a-${randomUUID()}`);
    workspaceB = await createWorkspace(app, memberCsrf, `scope-authz-b-${randomUUID()}`);

    const caseRes = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/cases",
          payload: { name: "foreign-case", endDate: "2038-01-01T00:00:00.000Z", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    expect(caseRes.statusCode).toBe(201);
    foreignCaseId = caseRes.json().id as string;

    const taskRes = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "foreign-task", priority: "low" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    expect(taskRes.statusCode).toBe(201);
    foreignTaskId = taskRes.json().id as string;

    const templateRes = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/recurring-templates",
          payload: {
            title: "foreign-template",
            priority: "medium",
            caseAnchor: "case_end",
            caseOffsetDays: 0,
            nonBusinessDayPolicy: "as_is",
          },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    expect(templateRes.statusCode).toBe(201);
    foreignTemplateId = templateRes.json().id as string;

    const holidayRes = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/holidays",
          payload: { date: "2038-06-15", label: "foreign-holiday" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    expect(holidayRes.statusCode).toBe(201);
    foreignHolidayId = holidayRes.json().id as string;

    const stageRes = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/development-stages",
          payload: { name: "foreign-stage" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    expect(stageRes.statusCode).toBe(201);
    foreignStageId = stageRes.json().id as string;
  });

  afterAll(async () => {
    await hardDelete("tasks", [foreignTaskId]);
    await hardDelete("cases", [foreignCaseId]);
    await hardDelete("recurring_task_templates", [foreignTemplateId]);
    await hardDelete("non_business_days", [foreignHolidayId]);
    await hardDelete("development_stages", [foreignStageId]);
    await db.$executeRawUnsafe(
      `DELETE FROM activity_logs WHERE task_id IN (
        SELECT id FROM tasks WHERE workspace_id IN (?, ?)
      )`,
      workspaceA,
      workspaceB,
    );
    await db.$executeRawUnsafe(
      `DELETE FROM tasks WHERE workspace_id IN (?, ?)`,
      workspaceA,
      workspaceB,
    );
    await db.$executeRawUnsafe(
      `DELETE FROM cases WHERE workspace_id IN (?, ?)`,
      workspaceA,
      workspaceB,
    );
    await db.$executeRawUnsafe(
      `DELETE FROM recurring_task_templates WHERE workspace_id IN (?, ?)`,
      workspaceA,
      workspaceB,
    );
    await db.$executeRawUnsafe(
      `DELETE FROM non_business_days WHERE workspace_id IN (?, ?)`,
      workspaceA,
      workspaceB,
    );
    await db.$executeRawUnsafe(
      `DELETE FROM development_stages WHERE workspace_id IN (?, ?)`,
      workspaceA,
      workspaceB,
    );
    const members = await db.workspaceMember.findMany({
      where: { workspaceId: { in: [workspaceA, workspaceB] } },
    });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspaceA, workspaceB]);
    await hardDelete("users", [memberId, outsiderId]);
    await app.close();
    await db.$disconnect();
  });

  describe("X-Workspace-Id がない場合、400 を返す (Requirement 3.1 / 3.2)", () => {
    it.each(SCOPED_COLLECTION_PATHS)(
      "認証済みの GET %s が X-Workspace-Id を省略している場合、400 を返す",
      async (path) => {
        const response = await app.inject(
          withSessionCookie({ method: "GET", url: path }, memberCsrf.cookie),
        );
        expect(response.statusCode).toBe(400);
      },
    );
  });

  describe("非メンバーの X-Workspace-Id の場合、403 を返す (Requirement 3.4)", () => {
    it.each(SCOPED_COLLECTION_PATHS)(
      "認証済みの GET %s が非メンバーのワークスペースを使用している場合、403 を返す",
      async (path) => {
        const response = await app.inject(
          withSessionCookie(
            {
              method: "GET",
              url: path,
              headers: { [WORKSPACE_HEADER_NAME]: workspaceA },
            },
            outsiderCsrf.cookie,
          ),
        );
        expect(response.statusCode).toBe(403);
      },
    );
  });

  describe("他のワークスペースのリソースの GET/PATCH/DELETE は 404 を返す (Requirement 3.3)", () => {
    it("cases: workspace-B の case を workspace-A のヘッダーで GET progress / PATCH / DELETE すると 404 を返す", async () => {
      const getRes = await app.inject(
        withWorkspace(
          { method: "GET", url: `/api/cases/${foreignCaseId}/progress` },
          memberCsrf.cookie,
          undefined,
          workspaceA,
        ),
      );
      expect(getRes.statusCode).toBe(404);

      const patchRes = await app.inject(
        withWorkspace(
          {
            method: "PATCH",
            url: `/api/cases/${foreignCaseId}`,
            payload: { name: "hijack", ...noApply },
          },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      expect(patchRes.statusCode).toBe(404);

      const deleteRes = await app.inject(
        withWorkspace(
          { method: "DELETE", url: `/api/cases/${foreignCaseId}` },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      expect(deleteRes.statusCode).toBe(404);
    });

    it("tasks: workspace-B の task を workspace-A のヘッダーで GET / PATCH / DELETE すると 404 を返す", async () => {
      const getRes = await app.inject(
        withWorkspace(
          { method: "GET", url: `/api/tasks/${foreignTaskId}` },
          memberCsrf.cookie,
          undefined,
          workspaceA,
        ),
      );
      expect(getRes.statusCode).toBe(404);

      const patchRes = await app.inject(
        withWorkspace(
          {
            method: "PATCH",
            url: `/api/tasks/${foreignTaskId}`,
            payload: { title: "hijack" },
          },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      expect(patchRes.statusCode).toBe(404);

      const deleteRes = await app.inject(
        withWorkspace(
          { method: "DELETE", url: `/api/tasks/${foreignTaskId}` },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      expect(deleteRes.statusCode).toBe(404);
    });

    it("recurring-templates: workspace-B の template を workspace-A のヘッダーで stop (update) / DELETE すると 404 を返す", async () => {
      const stopRes = await app.inject(
        withWorkspace(
          { method: "POST", url: `/api/recurring-templates/${foreignTemplateId}/stop` },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      expect(stopRes.statusCode).toBe(404);

      const deleteRes = await app.inject(
        withWorkspace(
          { method: "DELETE", url: `/api/recurring-templates/${foreignTemplateId}` },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      expect(deleteRes.statusCode).toBe(404);
    });

    it("holidays: workspace-B の holiday を workspace-A のヘッダーで DELETE すると 404 を返す", async () => {
      const deleteRes = await app.inject(
        withWorkspace(
          { method: "DELETE", url: `/api/holidays/${foreignHolidayId}` },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      expect(deleteRes.statusCode).toBe(404);
    });

    it("development-stages: workspace-B の stage を workspace-A のヘッダーで PATCH / DELETE すると 404 を返す", async () => {
      const patchRes = await app.inject(
        withWorkspace(
          {
            method: "PATCH",
            url: `/api/development-stages/${foreignStageId}`,
            payload: { name: "hijack" },
          },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      expect(patchRes.statusCode).toBe(404);

      const deleteRes = await app.inject(
        withWorkspace(
          { method: "DELETE", url: `/api/development-stages/${foreignStageId}` },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      expect(deleteRes.statusCode).toBe(404);
    });
  });
});
