import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
      email: `holiday-route-${randomUUID()}@example.test`,
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

describe("holidayRoutes ワークスペーススコープ (task 6.1 + workspace-resource-scope 5.1)", () => {
  const app = buildApp(env);

  let memberId: string;
  let memberCsrf: { token: string; cookie: string };
  let workspaceA: string;
  let workspaceB: string;
  const holidayIds: string[] = [];

  beforeAll(async () => {
    const member = await registerUser(app, "休日ルートメンバー");
    memberId = member.user.id;
    memberCsrf = await csrfToken(app, member.cookie);
    workspaceA = await createWorkspace(app, memberCsrf, `holiday-route-a-${randomUUID()}`);
    workspaceB = await createWorkspace(app, memberCsrf, `holiday-route-b-${randomUUID()}`);
  });

  afterEach(async () => {
    if (holidayIds.length > 0) {
      await hardDelete("non_business_days", holidayIds.splice(0));
    }
  });

  afterAll(async () => {
    await db.$executeRawUnsafe(
      `DELETE FROM non_business_days WHERE workspace_id IN (?, ?)`,
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
    await hardDelete("users", [memberId]);
    await app.close();
    await db.$disconnect();
  });

  it("POST /api/holidays で現在のワークスペースに非営業日を登録し、201 を返す", async () => {
    const response = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/holidays", payload: { date: "2032-01-01", label: "元日" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(201);
    expect(response.json().date).toBe("2032-01-01");
    expect(response.json().workspaceId).toBe(workspaceA);
    holidayIds.push(response.json().id);
  });

  it("POST /api/holidays で同じ日付を2回登録した場合、409 を返す", async () => {
    const first = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/holidays", payload: { date: "2032-01-02" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(first.statusCode).toBe(201);
    holidayIds.push(first.json().id);

    const response = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/holidays", payload: { date: "2032-01-02" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(409);
  });

  it("POST /api/holidays で無効な日付を受け取った場合、400 を返す", async () => {
    const response = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/holidays", payload: { date: "bogus" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(400);
  });

  it("GET /api/holidays で現在のワークスペースの非営業日のみを返し、削除されたものを除外", async () => {
    const created = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/holidays", payload: { date: "2032-01-03" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    holidayIds.push(id);

    const foreign = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/holidays", payload: { date: "2032-01-04" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    expect(foreign.statusCode).toBe(201);
    holidayIds.push(foreign.json().id);

    const deleteResponse = await app.inject(
      withWorkspace(
        { method: "DELETE", url: `/api/holidays/${id}` },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(deleteResponse.statusCode).toBe(204);
    holidayIds.splice(holidayIds.indexOf(id), 1);

    const listResponse = await app.inject(
      withWorkspace({ method: "GET", url: "/api/holidays" }, memberCsrf.cookie, undefined, workspaceA),
    );
    const list = listResponse.json() as { id: string }[];
    expect(list.some((h) => h.id === id)).toBe(false);
    expect(list.some((h) => h.id === foreign.json().id)).toBe(false);
  });

  it("DELETE /api/holidays/:id で存在しない非営業日を削除した場合、404 を返す", async () => {
    const response = await app.inject(
      withWorkspace(
        { method: "DELETE", url: `/api/holidays/${randomUUID()}` },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(404);
  });

  it("DELETE /api/holidays/:id で別のワークスペースの非営業日を削除した場合、404 を返す (Requirement 3.3)", async () => {
    const foreign = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/holidays", payload: { date: "2032-01-05" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    expect(foreign.statusCode).toBe(201);
    const foreignId = foreign.json().id as string;
    holidayIds.push(foreignId);

    const response = await app.inject(
      withWorkspace(
        { method: "DELETE", url: `/api/holidays/${foreignId}` },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(404);

    const stillThere = await app.inject(
      withWorkspace({ method: "GET", url: "/api/holidays" }, memberCsrf.cookie, undefined, workspaceB),
    );
    expect(stillThere.json().some((h: { id: string }) => h.id === foreignId)).toBe(true);
  });
});

describe("holidayRoutes 外部API同期 (task 6.2 + workspace-resource-scope 5.1)", () => {
  const app = buildApp(env);

  let memberId: string;
  let memberCsrf: { token: string; cookie: string };
  let workspaceA: string;
  const holidayIds: string[] = [];

  beforeAll(async () => {
    const member = await registerUser(app, "休日同期ルートメンバー");
    memberId = member.user.id;
    memberCsrf = await csrfToken(app, member.cookie);
    workspaceA = await createWorkspace(app, memberCsrf, `holiday-sync-a-${randomUUID()}`);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await db.$executeRawUnsafe(`DELETE FROM non_business_days WHERE workspace_id = ?`, workspaceA);
    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspaceA } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspaceA]);
    await hardDelete("users", [memberId]);
    await app.close();
    await db.$disconnect();
  });

  it("POST /api/holidays/sync で外部APIから新しい非営業日を現在のワークスペースに追加", async () => {
    const date = "2033-02-11";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ [date]: "建国記念の日" }) })),
    );

    const response = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/holidays/sync" },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.skippedExisting).toBe(0);
    expect(body.added.map((h: { date: string }) => h.date)).toContain(date);
    expect(body.added.every((h: { workspaceId: string }) => h.workspaceId === workspaceA)).toBe(true);
    for (const h of body.added) holidayIds.push(h.id);
  });

  it("POST /api/holidays/sync で外部APIが失敗した場合、502 エラーを返し、既存のマスターを変更しない", async () => {
    const survivor = "2033-03-03";
    const seed = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/holidays", payload: { date: survivor } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(seed.statusCode).toBe(201);
    holidayIds.push(seed.json().id);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    );

    const response = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/holidays/sync" },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(502);

    const listResponse = await app.inject(
      withWorkspace({ method: "GET", url: "/api/holidays" }, memberCsrf.cookie, undefined, workspaceA),
    );
    expect(listResponse.json().some((h: { date: string }) => h.date === survivor)).toBe(true);
  });
});
