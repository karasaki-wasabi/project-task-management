// RED: workspaceRepository does not exist yet (task 2.1, design.md
// "Backend/workspaces" workspace.repository; Requirements 1.1, 2.4, 3.1,
// 6.1, 6.3, 7.1, 7.4). Integration test against real MySQL via shared/db.ts.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { createUserData } from "../../test/user.fixture.js";
import { WORKSPACE_COLORS } from "./workspace.types.js";
import { workspaceRepository } from "./workspace.repository.js";

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

afterAll(async () => {
  await db.$disconnect();
});

describe("workspaceRepository (task 2.1)", () => {
  it("creates a workspace with name, default color, and createdByUserId (Requirement 1.1)", async () => {
    const user = await db.user.create({ data: createUserData(`ws-create-${randomUUID()}`) });
    const created = await workspaceRepository.createWorkspace({
      name: `ws-${randomUUID()}`,
      createdByUserId: user.id,
    });

    expect(created.name).toMatch(/^ws-/);
    expect(created.color).toBe(WORKSPACE_COLORS[0]);
    expect(created.createdByUserId).toBe(user.id);

    await hardDelete("workspaces", [created.id]);
    await hardDelete("users", [user.id]);
  });

  it("creates a workspace with an explicit color", async () => {
    const user = await db.user.create({ data: createUserData(`ws-color-${randomUUID()}`) });
    const created = await workspaceRepository.createWorkspace({
      name: `ws-color-${randomUUID()}`,
      color: WORKSPACE_COLORS[2],
      createdByUserId: user.id,
    });

    expect(created.color).toBe(WORKSPACE_COLORS[2]);

    await hardDelete("workspaces", [created.id]);
    await hardDelete("users", [user.id]);
  });

  it("creates a membership that make isMember return true (Requirement 1.1, 2.4)", async () => {
    const user = await db.user.create({ data: createUserData(`ws-member-${randomUUID()}`) });
    const workspace = await workspaceRepository.createWorkspace({
      name: `ws-member-${randomUUID()}`,
      createdByUserId: user.id,
    });

    expect(await workspaceRepository.isMember(workspace.id, user.id)).toBe(false);

    const member = await workspaceRepository.createMember({
      workspaceId: workspace.id,
      userId: user.id,
    });
    expect(member.workspaceId).toBe(workspace.id);
    expect(member.userId).toBe(user.id);
    expect(await workspaceRepository.isMember(workspace.id, user.id)).toBe(true);

    await hardDelete("workspace_members", [member.id]);
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [user.id]);
  });

  it("accepts an optional DbClient for createWorkspace and createMember (same-TX helper)", async () => {
    const user = await db.user.create({ data: createUserData(`ws-tx-${randomUUID()}`) });

    const { workspace, member } = await db.$transaction(async (tx) => {
      const workspace = await workspaceRepository.createWorkspace(
        { name: `ws-tx-${randomUUID()}`, createdByUserId: user.id },
        tx,
      );
      const member = await workspaceRepository.createMember(
        { workspaceId: workspace.id, userId: user.id },
        tx,
      );
      return { workspace, member };
    });

    expect(await workspaceRepository.isMember(workspace.id, user.id)).toBe(true);

    await hardDelete("workspace_members", [member.id]);
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [user.id]);
  });

  it("finds a workspace by id and returns null for a missing id", async () => {
    const user = await db.user.create({ data: createUserData(`ws-find-${randomUUID()}`) });
    const created = await workspaceRepository.createWorkspace({
      name: `ws-find-${randomUUID()}`,
      createdByUserId: user.id,
    });

    const found = await workspaceRepository.findById(created.id);
    expect(found?.id).toBe(created.id);
    expect(await workspaceRepository.findById(randomUUID())).toBeNull();

    await hardDelete("workspaces", [created.id]);
    await hardDelete("users", [user.id]);
  });

  it("updates name and color independently (Requirement 6.1, 6.3)", async () => {
    const user = await db.user.create({ data: createUserData(`ws-update-${randomUUID()}`) });
    const created = await workspaceRepository.createWorkspace({
      name: `ws-update-${randomUUID()}`,
      createdByUserId: user.id,
    });

    const renamed = await workspaceRepository.update(created.id, { name: "renamed-ws" });
    expect(renamed.name).toBe("renamed-ws");
    expect(renamed.color).toBe(created.color);

    const recolored = await workspaceRepository.update(created.id, { color: WORKSPACE_COLORS[4] });
    expect(recolored.color).toBe(WORKSPACE_COLORS[4]);
    expect(recolored.name).toBe("renamed-ws");

    await hardDelete("workspaces", [created.id]);
    await hardDelete("users", [user.id]);
  });

  it("lists only workspaces the user belongs to (Requirement 2.4)", async () => {
    const owner = await db.user.create({ data: createUserData(`ws-list-owner-${randomUUID()}`) });
    const outsider = await db.user.create({ data: createUserData(`ws-list-out-${randomUUID()}`) });

    const mine = await workspaceRepository.createWorkspace({
      name: `ws-mine-${randomUUID()}`,
      createdByUserId: owner.id,
    });
    const member = await workspaceRepository.createMember({
      workspaceId: mine.id,
      userId: owner.id,
    });

    const other = await workspaceRepository.createWorkspace({
      name: `ws-other-${randomUUID()}`,
      createdByUserId: outsider.id,
    });
    const otherMember = await workspaceRepository.createMember({
      workspaceId: other.id,
      userId: outsider.id,
    });

    const listed = await workspaceRepository.listByUserId(owner.id);
    expect(listed.some((w) => w.id === mine.id)).toBe(true);
    expect(listed.some((w) => w.id === other.id)).toBe(false);

    await hardDelete("workspace_members", [member.id, otherMember.id]);
    await hardDelete("workspaces", [mine.id, other.id]);
    await hardDelete("users", [owner.id, outsider.id]);
  });

  it("lists members with user name and email (Requirement 3.1)", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-ml-creator-${randomUUID()}`) });
    const teammate = await db.user.create({ data: createUserData(`ws-ml-mate-${randomUUID()}`) });
    const workspace = await workspaceRepository.createWorkspace({
      name: `ws-ml-${randomUUID()}`,
      createdByUserId: creator.id,
    });
    const members = await Promise.all([
      workspaceRepository.createMember({ workspaceId: workspace.id, userId: creator.id }),
      workspaceRepository.createMember({ workspaceId: workspace.id, userId: teammate.id }),
    ]);

    const listed = await workspaceRepository.listMembers(workspace.id);
    expect(listed).toHaveLength(2);
    expect(listed).toEqual(
      expect.arrayContaining([
        { userId: creator.id, name: creator.name, email: creator.email },
        { userId: teammate.id, name: teammate.name, email: teammate.email },
      ]),
    );

    await hardDelete("workspace_members", members.map((m) => m.id));
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id, teammate.id]);
  });

  it("deletes members then the workspace; lists no longer include them (Requirement 7.1, 7.4)", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-del-${randomUUID()}`) });
    const teammate = await db.user.create({ data: createUserData(`ws-del-mate-${randomUUID()}`) });
    const workspace = await workspaceRepository.createWorkspace({
      name: `ws-del-${randomUUID()}`,
      createdByUserId: creator.id,
    });
    await Promise.all([
      workspaceRepository.createMember({ workspaceId: workspace.id, userId: creator.id }),
      workspaceRepository.createMember({ workspaceId: workspace.id, userId: teammate.id }),
    ]);

    await workspaceRepository.delete(workspace.id);

    expect(await workspaceRepository.findById(workspace.id)).toBeNull();
    expect(await workspaceRepository.isMember(workspace.id, creator.id)).toBe(false);
    expect(await workspaceRepository.listByUserId(creator.id).then((rows) => rows.some((w) => w.id === workspace.id))).toBe(
      false,
    );
    expect(await workspaceRepository.listMembers(workspace.id)).toEqual([]);

    const softDeletedWorkspace = await db.workspace.findFirst({
      where: { id: workspace.id, deletedAt: { not: null } },
    });
    expect(softDeletedWorkspace).not.toBeNull();

    const softDeletedMembers = await db.workspaceMember.findMany({
      where: { workspaceId: workspace.id, deletedAt: { not: null } },
    });
    expect(softDeletedMembers).toHaveLength(2);

    await hardDelete(
      "workspace_members",
      softDeletedMembers.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id, teammate.id]);
  });
});
