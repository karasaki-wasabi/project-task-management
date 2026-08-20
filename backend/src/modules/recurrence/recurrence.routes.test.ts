import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { db } from "../../shared/db.js";
import { WORKSPACE_HEADER_NAME } from "../../shared/workspace-scope.js";
import { withCsrfToken, withSessionCookie } from "../../test/auth.fixture.js";

const env = {
  DATABASE_URL: "mysql://user:pass@localhost:3306/db",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  CORS_ORIGIN: "http://localhost:3001",
  COOKIE_SECURE: false,
  LOG_LEVEL: "error" as const,
  PORT: 3000,
};

type App = ReturnType<typeof buildApp>;

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
      email: `recurrence-route-${randomUUID()}@example.test`,
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
  if (table === "workspaces") {
    await db.$executeRawUnsafe(
      `DELETE FROM development_stages WHERE workspace_id IN (${ids.map(() => "?").join(",")})`,
      ...ids,
    );
  }
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function createWorkspace(app: App, csrf: { token: string; cookie: string }, name: string): Promise<string> {
  const response = await app.inject(
    withCsrfToken(
      withSessionCookie(
        { method: "POST", url: "/api/workspaces", payload: { name } },
        csrf.cookie,
      ),
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

const validPayload = {
  title: "route template",
  priority: "medium" as const,
  caseAnchor: "case_end" as const,
  caseOffsetDays: 2,
  defaultDetail: "default note",
  nonBusinessDayPolicy: "as_is" as const,
};

describe("recurrenceRoutes (task 2.1 + workspace-resource-scope 4.1)", () => {
  const app = buildApp(env);

  let memberId: string;
  let memberCsrf: { token: string; cookie: string };
  let workspaceA: string;
  let workspaceB: string;

  beforeAll(async () => {
    const member = await registerUser(app, "繰り返しルートメンバー");
    memberId = member.user.id;
    memberCsrf = await csrfToken(app, member.cookie);
    workspaceA = await createWorkspace(app, memberCsrf, `recurrence-route-a-${randomUUID()}`);
    workspaceB = await createWorkspace(app, memberCsrf, `recurrence-route-b-${randomUUID()}`);
  });

  afterAll(async () => {
    const members = await db.workspaceMember.findMany({
      where: { workspaceId: { in: [workspaceA, workspaceB] } },
    });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspaceA, workspaceB]);
    await hardDelete("users", [memberId]);
    await app.close();
    await db.$disconnect();
  });

  it("POST /api/recurring-templates registers a template in the current workspace and returns 201", async () => {
    const templateIds: string[] = [];
    try {
      const response = await app.inject(
        withWorkspace(
          { method: "POST", url: "/api/recurring-templates", payload: validPayload },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      if (response.statusCode === 201) templateIds.push(response.json().id);

      expect(response.statusCode).toBe(201);
      expect(response.json().title).toBe("route template");
      expect(response.json().caseAnchor).toBe("case_end");
      expect(response.json().caseOffsetDays).toBe(2);
      expect(response.json().defaultDetail).toBe("default note");
      expect(response.json()).not.toHaveProperty("defaultMemo");
      expect(response.json().workspaceId).toBe(workspaceA);
      expect(response.json()).not.toHaveProperty("kind");
    } finally {
      await hardDelete("recurring_task_templates", templateIds);
    }
  });

  it("POST /api/recurring-templates returns 400 for invalid input (negative offset / missing fields)", async () => {
    const negative = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/recurring-templates", payload: { ...validPayload, caseOffsetDays: -1 } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(negative.statusCode).toBe(400);

    const fixedIntervalShape = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/recurring-templates",
          payload: {
            title: "legacy",
            priority: "low",
            kind: "fixed_interval",
            intervalUnit: "day",
            intervalValue: 1,
            nonBusinessDayPolicy: "as_is",
          },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(fixedIntervalShape.statusCode).toBe(400);
  });

  it("POST stop/resume and GET list are scoped to the current workspace", async () => {
    const templateIds: string[] = [];
    try {
      const created = await app.inject(
        withWorkspace(
          { method: "POST", url: "/api/recurring-templates", payload: { ...validPayload, title: "stoppable" } },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      expect(created.statusCode).toBe(201);
      const { id } = created.json();
      templateIds.push(id);

      const foreign = await app.inject(
        withWorkspace(
          { method: "POST", url: "/api/recurring-templates", payload: { ...validPayload, title: "foreign" } },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceB,
        ),
      );
      expect(foreign.statusCode).toBe(201);
      templateIds.push(foreign.json().id);

      const stopResponse = await app.inject(
        withWorkspace(
          { method: "POST", url: `/api/recurring-templates/${id}/stop` },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      expect(stopResponse.statusCode).toBe(204);

      const resumeResponse = await app.inject(
        withWorkspace(
          { method: "POST", url: `/api/recurring-templates/${id}/resume` },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      expect(resumeResponse.statusCode).toBe(204);

      const listResponse = await app.inject(
        withWorkspace(
          { method: "GET", url: "/api/recurring-templates" },
          memberCsrf.cookie,
          undefined,
          workspaceA,
        ),
      );
      const list = listResponse.json() as { id: string; isActive: boolean }[];
      expect(list.some((t) => t.id === id)).toBe(true);
      expect(list.some((t) => t.id === foreign.json().id)).toBe(false);
      expect(list.find((t) => t.id === id)?.isActive).toBe(true);

      const crossStop = await app.inject(
        withWorkspace(
          { method: "POST", url: `/api/recurring-templates/${foreign.json().id}/stop` },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      expect(crossStop.statusCode).toBe(404);

      const missingStop = await app.inject(
        withWorkspace(
          { method: "POST", url: `/api/recurring-templates/${randomUUID()}/stop` },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      expect(missingStop.statusCode).toBe(404);
    } finally {
      await hardDelete("recurring_task_templates", templateIds);
    }
  });

  it("GET /api/recurring-templates excludes deleted templates in the current workspace", async () => {
    const templateIds: string[] = [];
    try {
      const created = await app.inject(
        withWorkspace(
          {
            method: "POST",
            url: "/api/recurring-templates",
            payload: { ...validPayload, title: "listable", nonBusinessDayPolicy: "skip" },
          },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      expect(created.statusCode).toBe(201);
      const { id } = created.json();
      templateIds.push(id);

      const deleteResponse = await app.inject(
        withWorkspace(
          { method: "DELETE", url: `/api/recurring-templates/${id}` },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      );
      expect(deleteResponse.statusCode).toBe(204);

      const listResponse = await app.inject(
        withWorkspace(
          { method: "GET", url: "/api/recurring-templates" },
          memberCsrf.cookie,
          undefined,
          workspaceA,
        ),
      );
      expect(listResponse.json().some((t: { id: string }) => t.id === id)).toBe(false);
    } finally {
      await hardDelete("recurring_task_templates", templateIds);
    }
  });

  it("DELETE /api/recurring-templates/:id returns 404 for a non-existent template", async () => {
    const response = await app.inject(
      withWorkspace(
        { method: "DELETE", url: `/api/recurring-templates/${randomUUID()}` },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(response.statusCode).toBe(404);
  });

  it("POST /api/recurring-templates/generate-due is removed (Requirement 1.2)", async () => {
    const response = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/recurring-templates/generate-due",
          payload: { asOf: "2035-01-03T00:00:00.000Z" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(response.statusCode).toBe(404);
  });
});
