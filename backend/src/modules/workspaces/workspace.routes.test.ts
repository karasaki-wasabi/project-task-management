import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { db } from "../../shared/db.js";
import { withCsrfToken, withSessionCookie } from "../../test/auth.fixture.js";
import { createUserData } from "../../test/user.fixture.js";
import { workspaceRepository } from "./workspace.repository.js";
import { WORKSPACE_COLORS } from "./workspace.types.js";

const env = {
  DATABASE_URL: "mysql://user:pass@localhost:3306/db",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  CORS_ORIGIN: "http://localhost:3001",
  COOKIE_SECURE: false,
  LOG_LEVEL: "error" as const,
  PORT: 3000,
};

function sessionCookie(response: { headers: Record<string, string | string[] | undefined> }): string {
  const setCookie = response.headers["set-cookie"];
  const session = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((cookie) =>
    cookie?.startsWith("session="),
  );
  if (!session) throw new Error("session cookie was not set");
  return session.split(";")[0];
}

async function registerUser(app: ReturnType<typeof buildApp>, name = "WSルート利用者") {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: `ws-route-${randomUUID()}@example.test`,
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

async function csrfToken(
  app: ReturnType<typeof buildApp>,
  cookie: string,
): Promise<{ token: string; cookie: string }> {
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

async function cleanupWorkspace(workspaceId: string, userIds: string[]): Promise<void> {
  const members = await db.workspaceMember.findMany({ where: { workspaceId } });
  await hardDelete(
    "workspace_members",
    members.map((m) => m.id),
  );
  await hardDelete("workspaces", [workspaceId]);
  await hardDelete("users", userIds);
}

afterAll(async () => {
  await db.$disconnect();
});

describe("workspaceRoutes CRUD (task 4.1)", () => {
  it("workspaceRoutes.create で current user の workspace を作成し、201 を返す", async () => {
    const app = buildApp(env);
    const { user, cookie } = await registerUser(app);
    const csrf = await csrfToken(app, cookie);
    const name = `route-ws-${randomUUID()}`;

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
    const body = response.json();
    expect(body).toMatchObject({
      id: expect.any(String),
      name,
      color: WORKSPACE_COLORS[0],
      createdByUserId: user.id,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
    expect(await workspaceRepository.isMember(body.id, user.id)).toBe(true);

    await cleanupWorkspace(body.id, [user.id]);
    await app.close();
  });

  it("workspaceRoutes.create で blank name を拒否し、400 エラーを返す", async () => {
    const app = buildApp(env);
    const { user, cookie } = await registerUser(app);
    const csrf = await csrfToken(app, cookie);

    const response = await app.inject(
      withCsrfToken(
        withSessionCookie(
          { method: "POST", url: "/api/workspaces", payload: { name: "   " } },
          csrf.cookie,
        ),
        csrf.token,
      ),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty("error");

    await hardDelete("users", [user.id]);
    await app.close();
  });

  it("workspaceRoutes.create で name が body にない場合、400 エラーを返す", async () => {
    const app = buildApp(env);
    const { user, cookie } = await registerUser(app);
    const csrf = await csrfToken(app, cookie);

    const response = await app.inject(
      withCsrfToken(
        withSessionCookie({ method: "POST", url: "/api/workspaces", payload: {} }, csrf.cookie),
        csrf.token,
      ),
    );

    expect(response.statusCode).toBe(400);

    await hardDelete("users", [user.id]);
    await app.close();
  });

  it("workspaceRoutes.list で current user が所属する workspace のみを返す", async () => {
    const app = buildApp(env);
    const { user, cookie } = await registerUser(app, "一覧本人");
    const outsider = await db.user.create({ data: createUserData(`ws-route-list-out-${randomUUID()}`) });
    const csrf = await csrfToken(app, cookie);

    const mineResponse = await app.inject(
      withCsrfToken(
        withSessionCookie(
          { method: "POST", url: "/api/workspaces", payload: { name: `mine-${randomUUID()}` } },
          csrf.cookie,
        ),
        csrf.token,
      ),
    );
    expect(mineResponse.statusCode).toBe(201);
    const mine = mineResponse.json();

    const other = await workspaceRepository.createWorkspace({
      name: `other-${randomUUID()}`,
      createdByUserId: outsider.id,
    });
    await workspaceRepository.createMember({ workspaceId: other.id, userId: outsider.id });

    const listResponse = await app.inject(
      withSessionCookie({ method: "GET", url: "/api/workspaces" }, csrf.cookie),
    );

    expect(listResponse.statusCode).toBe(200);
    const ids = listResponse.json().map((ws: { id: string }) => ws.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(other.id);
    expect(listResponse.json().find((ws: { id: string }) => ws.id === mine.id)).toMatchObject({
      name: mine.name,
      createdByUserId: user.id,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const otherMembers = await db.workspaceMember.findMany({ where: { workspaceId: other.id } });
    await hardDelete(
      "workspace_members",
      otherMembers.map((m) => m.id),
    );
    await hardDelete("workspaces", [other.id]);
    await cleanupWorkspace(mine.id, [user.id, outsider.id]);
    await app.close();
  });

  it("workspaceRoutes.update で member の name と color を更新", async () => {
    const app = buildApp(env);
    const { user, cookie } = await registerUser(app);
    const csrf = await csrfToken(app, cookie);
    const created = await app.inject(
      withCsrfToken(
        withSessionCookie(
          { method: "POST", url: "/api/workspaces", payload: { name: `patch-${randomUUID()}` } },
          csrf.cookie,
        ),
        csrf.token,
      ),
    );
    const { id } = created.json();
    const color = WORKSPACE_COLORS[2];

    const response = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "PATCH",
            url: `/api/workspaces/${id}`,
            payload: { name: "  patched-name  ", color },
          },
          csrf.cookie,
        ),
        csrf.token,
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id,
      name: "patched-name",
      color,
      createdByUserId: user.id,
    });

    await cleanupWorkspace(id, [user.id]);
    await app.close();
  });

  it("workspaceRoutes.update で blank name または invalid color を拒否し、400 エラーを返す", async () => {
    const app = buildApp(env);
    const { user, cookie } = await registerUser(app);
    const csrf = await csrfToken(app, cookie);
    const created = await app.inject(
      withCsrfToken(
        withSessionCookie(
          { method: "POST", url: "/api/workspaces", payload: { name: `patch-bad-${randomUUID()}` } },
          csrf.cookie,
        ),
        csrf.token,
      ),
    );
    const { id } = created.json();

    const blankName = await app.inject(
      withCsrfToken(
        withSessionCookie(
          { method: "PATCH", url: `/api/workspaces/${id}`, payload: { name: " \t " } },
          csrf.cookie,
        ),
        csrf.token,
      ),
    );
    expect(blankName.statusCode).toBe(400);

    const badColor = await app.inject(
      withCsrfToken(
        withSessionCookie(
          { method: "PATCH", url: `/api/workspaces/${id}`, payload: { color: "#ffffff" } },
          csrf.cookie,
        ),
        csrf.token,
      ),
    );
    expect(badColor.statusCode).toBe(400);

    await cleanupWorkspace(id, [user.id]);
    await app.close();
  });

  it("workspaceRoutes.update で non-member を拒否し、403 エラーを返す、unknown id を拒否し、404 エラーを返す", async () => {
    const app = buildApp(env);
    const { user: owner, cookie: ownerCookie } = await registerUser(app, "設定オーナー");
    const { user: outsider, cookie: outsiderCookie } = await registerUser(app, "設定部外者");
    const ownerCsrf = await csrfToken(app, ownerCookie);
    const outsiderCsrf = await csrfToken(app, outsiderCookie);

    const created = await app.inject(
      withCsrfToken(
        withSessionCookie(
          { method: "POST", url: "/api/workspaces", payload: { name: `patch-auth-${randomUUID()}` } },
          ownerCsrf.cookie,
        ),
        ownerCsrf.token,
      ),
    );
    const { id } = created.json();

    const forbidden = await app.inject(
      withCsrfToken(
        withSessionCookie(
          { method: "PATCH", url: `/api/workspaces/${id}`, payload: { name: "hijack" } },
          outsiderCsrf.cookie,
        ),
        outsiderCsrf.token,
      ),
    );
    expect(forbidden.statusCode).toBe(403);

    const missing = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "PATCH",
            url: `/api/workspaces/${randomUUID()}`,
            payload: { name: "ghost" },
          },
          ownerCsrf.cookie,
        ),
        ownerCsrf.token,
      ),
    );
    expect(missing.statusCode).toBe(404);

    await cleanupWorkspace(id, [owner.id, outsider.id]);
    await app.close();
  });

  it("workspaceRoutes.delete で creator が workspace を削除できる、204 を返す", async () => {
    const app = buildApp(env);
    const { user, cookie } = await registerUser(app);
    const csrf = await csrfToken(app, cookie);
    const created = await app.inject(
      withCsrfToken(
        withSessionCookie(
          { method: "POST", url: "/api/workspaces", payload: { name: `del-${randomUUID()}` } },
          csrf.cookie,
        ),
        csrf.token,
      ),
    );
    const { id } = created.json();

    const response = await app.inject(
      withCsrfToken(
        withSessionCookie({ method: "DELETE", url: `/api/workspaces/${id}` }, csrf.cookie),
        csrf.token,
      ),
    );

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(await workspaceRepository.findById(id)).toBeNull();

    const softDeletedMembers = await db.workspaceMember.findMany({
      where: { workspaceId: id, deletedAt: { not: null } },
    });
    await hardDelete(
      "workspace_members",
      softDeletedMembers.map((m) => m.id),
    );
    await hardDelete("workspaces", [id]);
    await hardDelete("users", [user.id]);
    await app.close();
  });

  it("workspaceRoutes.delete で non-creator member を拒否し、403 エラーを返す、non-member/unknown を拒否し、404 エラーを返す", async () => {
    const app = buildApp(env);
    const { user: creator, cookie: creatorCookie } = await registerUser(app, "削除作成者");
    const { user: member, cookie: memberCookie } = await registerUser(app, "削除メンバー");
    const { user: outsider, cookie: outsiderCookie } = await registerUser(app, "削除部外者");
    const creatorCsrf = await csrfToken(app, creatorCookie);
    const memberCsrf = await csrfToken(app, memberCookie);
    const outsiderCsrf = await csrfToken(app, outsiderCookie);

    const created = await app.inject(
      withCsrfToken(
        withSessionCookie(
          { method: "POST", url: "/api/workspaces", payload: { name: `del-auth-${randomUUID()}` } },
          creatorCsrf.cookie,
        ),
        creatorCsrf.token,
      ),
    );
    const { id } = created.json();
    await workspaceRepository.createMember({ workspaceId: id, userId: member.id });

    const forbidden = await app.inject(
      withCsrfToken(
        withSessionCookie({ method: "DELETE", url: `/api/workspaces/${id}` }, memberCsrf.cookie),
        memberCsrf.token,
      ),
    );
    expect(forbidden.statusCode).toBe(403);

    const nonMember = await app.inject(
      withCsrfToken(
        withSessionCookie({ method: "DELETE", url: `/api/workspaces/${id}` }, outsiderCsrf.cookie),
        outsiderCsrf.token,
      ),
    );
    expect(nonMember.statusCode).toBe(404);

    const missing = await app.inject(
      withCsrfToken(
        withSessionCookie(
          { method: "DELETE", url: `/api/workspaces/${randomUUID()}` },
          creatorCsrf.cookie,
        ),
        creatorCsrf.token,
      ),
    );
    expect(missing.statusCode).toBe(404);

    await cleanupWorkspace(id, [creator.id, member.id, outsider.id]);
    await app.close();
  });
});

describe("workspaceRoutes members (task 4.2)", () => {
  it("workspaceRoutes.listMembers で member のサマリーを返す", async () => {
    const app = buildApp(env);
    const { user: owner, cookie: ownerCookie } = await registerUser(app, "メンバ一覧オーナー");
    const peer = await db.user.create({ data: createUserData(`ws-route-mem-peer-${randomUUID()}`) });
    const ownerCsrf = await csrfToken(app, ownerCookie);

    const created = await app.inject(
      withCsrfToken(
        withSessionCookie(
          { method: "POST", url: "/api/workspaces", payload: { name: `members-${randomUUID()}` } },
          ownerCsrf.cookie,
        ),
        ownerCsrf.token,
      ),
    );
    const { id } = created.json();
    await workspaceRepository.createMember({ workspaceId: id, userId: peer.id });

    const response = await app.inject(
      withSessionCookie({ method: "GET", url: `/api/workspaces/${id}/members` }, ownerCsrf.cookie),
    );

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ userId: string; name: string; email: string }>;
    expect(body).toEqual(
      expect.arrayContaining([
        { userId: owner.id, name: owner.name, email: owner.email },
        { userId: peer.id, name: peer.name, email: peer.email },
      ]),
    );
    expect(body).toHaveLength(2);

    await cleanupWorkspace(id, [owner.id, peer.id]);
    await app.close();
  });

  it("workspaceRoutes.listMembers で non-member を拒斥し、403 エラーを返す、unknown id を拒斥し、404 エラーを返す", async () => {
    const app = buildApp(env);
    const { user: owner, cookie: ownerCookie } = await registerUser(app, "メンバ一覧拒否オーナー");
    const { user: outsider, cookie: outsiderCookie } = await registerUser(app, "メンバ一覧部外者");
    const ownerCsrf = await csrfToken(app, ownerCookie);
    const outsiderCsrf = await csrfToken(app, outsiderCookie);

    const created = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "POST",
            url: "/api/workspaces",
            payload: { name: `members-auth-${randomUUID()}` },
          },
          ownerCsrf.cookie,
        ),
        ownerCsrf.token,
      ),
    );
    const { id } = created.json();

    const forbidden = await app.inject(
      withSessionCookie(
        { method: "GET", url: `/api/workspaces/${id}/members` },
        outsiderCsrf.cookie,
      ),
    );
    expect(forbidden.statusCode).toBe(403);

    const missing = await app.inject(
      withSessionCookie(
        { method: "GET", url: `/api/workspaces/${randomUUID()}/members` },
        ownerCsrf.cookie,
      ),
    );
    expect(missing.statusCode).toBe(404);

    await cleanupWorkspace(id, [owner.id, outsider.id]);
    await app.close();
  });

  it("workspaceRoutes.searchAddableUsers で existing members を除外し、matches を返す", async () => {
    const app = buildApp(env);
    const marker = randomUUID().slice(0, 8);
    const { user: owner, cookie: ownerCookie } = await registerUser(app, `検索オーナー${marker}`);
    const member = await db.user.create({
      data: createUserData(`既存メンバ${marker}`),
    });
    const addable = await db.user.create({
      data: createUserData(`追加候補${marker}`),
    });
    const ownerCsrf = await csrfToken(app, ownerCookie);

    const created = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "POST",
            url: "/api/workspaces",
            payload: { name: `search-${randomUUID()}` },
          },
          ownerCsrf.cookie,
        ),
        ownerCsrf.token,
      ),
    );
    const { id } = created.json();
    await workspaceRepository.createMember({ workspaceId: id, userId: member.id });

    const response = await app.inject(
      withSessionCookie(
        { method: "GET", url: `/api/workspaces/${id}/searchable-users?q=${encodeURIComponent(marker)}` },
        ownerCsrf.cookie,
      ),
    );

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ userId: string; name: string; email: string }>;
    const ids = body.map((u) => u.userId);
    expect(ids).toContain(addable.id);
    expect(ids).not.toContain(owner.id);
    expect(ids).not.toContain(member.id);
    expect(body.find((u) => u.userId === addable.id)).toEqual({
      userId: addable.id,
      name: addable.name,
      email: addable.email,
    });

    await cleanupWorkspace(id, [owner.id, member.id, addable.id]);
    await app.close();
  });

  it("workspaceRoutes.searchAddableUsers で q が empty または omitted の場合、空配列を返す", async () => {
    const app = buildApp(env);
    const { user, cookie } = await registerUser(app);
    const csrf = await csrfToken(app, cookie);
    const created = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "POST",
            url: "/api/workspaces",
            payload: { name: `search-empty-${randomUUID()}` },
          },
          csrf.cookie,
        ),
        csrf.token,
      ),
    );
    const { id } = created.json();

    const omitted = await app.inject(
      withSessionCookie(
        { method: "GET", url: `/api/workspaces/${id}/searchable-users` },
        csrf.cookie,
      ),
    );
    expect(omitted.statusCode).toBe(200);
    expect(omitted.json()).toEqual([]);

    const blank = await app.inject(
      withSessionCookie(
        { method: "GET", url: `/api/workspaces/${id}/searchable-users?q=` },
        csrf.cookie,
      ),
    );
    expect(blank.statusCode).toBe(200);
    expect(blank.json()).toEqual([]);

    await cleanupWorkspace(id, [user.id]);
    await app.close();
  });

  it("workspaceRoutes.searchAddableUsers で non-member を拒斥し、403 エラーを返す、unknown id を拒斥し、404 エラーを返す", async () => {
    const app = buildApp(env);
    const { user: owner, cookie: ownerCookie } = await registerUser(app, "検索拒否オーナー");
    const { user: outsider, cookie: outsiderCookie } = await registerUser(app, "検索部外者");
    const ownerCsrf = await csrfToken(app, ownerCookie);
    const outsiderCsrf = await csrfToken(app, outsiderCookie);

    const created = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "POST",
            url: "/api/workspaces",
            payload: { name: `search-auth-${randomUUID()}` },
          },
          ownerCsrf.cookie,
        ),
        ownerCsrf.token,
      ),
    );
    const { id } = created.json();

    const forbidden = await app.inject(
      withSessionCookie(
        { method: "GET", url: `/api/workspaces/${id}/searchable-users?q=x` },
        outsiderCsrf.cookie,
      ),
    );
    expect(forbidden.statusCode).toBe(403);

    const missing = await app.inject(
      withSessionCookie(
        {
          method: "GET",
          url: `/api/workspaces/${randomUUID()}/searchable-users?q=x`,
        },
        ownerCsrf.cookie,
      ),
    );
    expect(missing.statusCode).toBe(404);

    await cleanupWorkspace(id, [owner.id, outsider.id]);
    await app.close();
  });

  it("workspaceRoutes.addMember で user を追加し、201 を返す", async () => {
    const app = buildApp(env);
    const { user: owner, cookie: ownerCookie } = await registerUser(app, "追加オーナー");
    const target = await db.user.create({ data: createUserData(`ws-route-add-t-${randomUUID()}`) });
    const ownerCsrf = await csrfToken(app, ownerCookie);

    const created = await app.inject(
      withCsrfToken(
        withSessionCookie(
          { method: "POST", url: "/api/workspaces", payload: { name: `add-${randomUUID()}` } },
          ownerCsrf.cookie,
        ),
        ownerCsrf.token,
      ),
    );
    const { id } = created.json();

    const response = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "POST",
            url: `/api/workspaces/${id}/members`,
            payload: { userId: target.id },
          },
          ownerCsrf.cookie,
        ),
        ownerCsrf.token,
      ),
    );

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      userId: target.id,
      name: target.name,
      email: target.email,
    });
    expect(await workspaceRepository.isMember(id, target.id)).toBe(true);

    await cleanupWorkspace(id, [owner.id, target.id]);
    await app.close();
  });

  it("workspaceRoutes.addMember で missing userId または duplicate membership を拒斥し、400 エラーを返す", async () => {
    const app = buildApp(env);
    const { user: owner, cookie: ownerCookie } = await registerUser(app, "追加400オーナー");
    const target = await db.user.create({ data: createUserData(`ws-route-add-bad-${randomUUID()}`) });
    const ownerCsrf = await csrfToken(app, ownerCookie);

    const created = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "POST",
            url: "/api/workspaces",
            payload: { name: `add-bad-${randomUUID()}` },
          },
          ownerCsrf.cookie,
        ),
        ownerCsrf.token,
      ),
    );
    const { id } = created.json();

    const missingBody = await app.inject(
      withCsrfToken(
        withSessionCookie(
          { method: "POST", url: `/api/workspaces/${id}/members`, payload: {} },
          ownerCsrf.cookie,
        ),
        ownerCsrf.token,
      ),
    );
    expect(missingBody.statusCode).toBe(400);

    const firstAdd = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "POST",
            url: `/api/workspaces/${id}/members`,
            payload: { userId: target.id },
          },
          ownerCsrf.cookie,
        ),
        ownerCsrf.token,
      ),
    );
    expect(firstAdd.statusCode).toBe(201);

    const duplicate = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "POST",
            url: `/api/workspaces/${id}/members`,
            payload: { userId: target.id },
          },
          ownerCsrf.cookie,
        ),
        ownerCsrf.token,
      ),
    );
    expect(duplicate.statusCode).toBe(400);

    await cleanupWorkspace(id, [owner.id, target.id]);
    await app.close();
  });

  it("workspaceRoutes.addMember で non-member を拒斥し、403 エラーを返す、unknown workspace または user を拒斥し、404 エラーを返す", async () => {
    const app = buildApp(env);
    const { user: owner, cookie: ownerCookie } = await registerUser(app, "追加拒否オーナー");
    const { user: outsider, cookie: outsiderCookie } = await registerUser(app, "追加部外者");
    const target = await db.user.create({ data: createUserData(`ws-route-add-auth-t-${randomUUID()}`) });
    const ownerCsrf = await csrfToken(app, ownerCookie);
    const outsiderCsrf = await csrfToken(app, outsiderCookie);

    const created = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "POST",
            url: "/api/workspaces",
            payload: { name: `add-auth-${randomUUID()}` },
          },
          ownerCsrf.cookie,
        ),
        ownerCsrf.token,
      ),
    );
    const { id } = created.json();

    const forbidden = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "POST",
            url: `/api/workspaces/${id}/members`,
            payload: { userId: target.id },
          },
          outsiderCsrf.cookie,
        ),
        outsiderCsrf.token,
      ),
    );
    expect(forbidden.statusCode).toBe(403);

    const missingWorkspace = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "POST",
            url: `/api/workspaces/${randomUUID()}/members`,
            payload: { userId: target.id },
          },
          ownerCsrf.cookie,
        ),
        ownerCsrf.token,
      ),
    );
    expect(missingWorkspace.statusCode).toBe(404);

    const missingUser = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "POST",
            url: `/api/workspaces/${id}/members`,
            payload: { userId: randomUUID() },
          },
          ownerCsrf.cookie,
        ),
        ownerCsrf.token,
      ),
    );
    expect(missingUser.statusCode).toBe(404);

    await cleanupWorkspace(id, [owner.id, outsider.id, target.id]);
    await app.close();
  });
});
