// RED: workspaceService does not exist yet (task 3.1, design.md
// "Backend/workspaces" WorkspaceService; Requirements 1.1, 1.2, 5.1, 5.2,
// 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3). Integration test against real
// MySQL via shared/db.ts.
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setBusinessEventLoggerForTests } from "../../shared/business-event-logger.js";
import { db } from "../../shared/db.js";
import { createLogger } from "../../shared/logger.js";
import { createUserData } from "../../test/user.fixture.js";
import { workspaceRepository } from "./workspace.repository.js";
import { WORKSPACE_COLORS, type WorkspaceColor } from "./workspace.types.js";
import { workspaceService } from "./workspace.service.js";

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
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
        if (line.length > 0) {
          lines.push(JSON.parse(line));
        }
      }
      callback();
    },
  });
  return { stream, lines };
}

let lines: Record<string, unknown>[];

function findEvent(event: string): Record<string, unknown> | undefined {
  return lines.find((l) => l.event === event);
}

beforeEach(() => {
  const collected = collectingStream();
  lines = collected.lines;
  setBusinessEventLoggerForTests(createLogger("debug", collected.stream));
});

afterAll(async () => {
  await db.$disconnect();
});

describe("workspaceService.create (task 3.1)", () => {
  it("creates a workspace and registers the creator as a member in the same TX (Requirement 1.1, 1.2)", async () => {
    const user = await db.user.create({ data: createUserData(`ws-svc-create-${randomUUID()}`) });
    const name = `  svc-ws-${randomUUID()}  `;

    const created = await workspaceService.create({ name, createdByUserId: user.id });

    expect(created.name).toBe(name.trim());
    expect(created.createdByUserId).toBe(user.id);
    expect(WORKSPACE_COLORS.includes(created.color)).toBe(true);
    expect(await workspaceRepository.isMember(created.id, user.id)).toBe(true);

    const members = await db.workspaceMember.findMany({
      where: { workspaceId: created.id, deletedAt: null },
    });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [created.id]);
    await hardDelete("users", [user.id]);
  });

  it("rejects a blank name (Requirement 6.2 pattern for create)", async () => {
    const user = await db.user.create({ data: createUserData(`ws-svc-blank-${randomUUID()}`) });

    await expect(
      workspaceService.create({ name: " \t ", createdByUserId: user.id }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await hardDelete("users", [user.id]);
  });

  it("logs workspace.created with requestId and entityId", async () => {
    const user = await db.user.create({ data: createUserData(`ws-svc-log-c-${randomUUID()}`) });
    const requestId = `req-ws-create-${randomUUID()}`;

    const created = await workspaceService.create(
      { name: `logged-${randomUUID()}`, createdByUserId: user.id },
      requestId,
    );

    const logged = findEvent("workspace.created");
    expect(logged?.entityId).toBe(created.id);
    expect(logged?.requestId).toBe(requestId);

    const members = await db.workspaceMember.findMany({ where: { workspaceId: created.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [created.id]);
    await hardDelete("users", [user.id]);
  });
});

describe("workspaceService.update (task 3.1)", () => {
  it("allows any member to update name and color (Requirement 5.1, 5.2, 6.1, 6.3)", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-upd-c-${randomUUID()}`) });
    const member = await db.user.create({ data: createUserData(`ws-svc-upd-m-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `upd-${randomUUID()}`,
      createdByUserId: creator.id,
    });
    await workspaceRepository.createMember({ workspaceId: workspace.id, userId: member.id });

    const updated = await workspaceService.update(
      workspace.id,
      { name: "  renamed-by-member  ", color: WORKSPACE_COLORS[3] },
      member.id,
    );

    expect(updated.name).toBe("renamed-by-member");
    expect(updated.color).toBe(WORKSPACE_COLORS[3]);

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id, member.id]);
  });

  it("rejects a blank name (Requirement 6.2)", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-upd-blank-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `upd-blank-${randomUUID()}`,
      createdByUserId: creator.id,
    });

    await expect(
      workspaceService.update(workspace.id, { name: "   " }, creator.id),
    ).rejects.toMatchObject({ statusCode: 400 });

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id]);
  });

  it("rejects a color outside WORKSPACE_COLORS (Requirement 6.4)", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-upd-color-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `upd-color-${randomUUID()}`,
      createdByUserId: creator.id,
    });

    await expect(
      workspaceService.update(
        workspace.id,
        { color: "#ffffff" as WorkspaceColor },
        creator.id,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id]);
  });

  it("rejects a non-member setting change with 403 (Requirement 6.5)", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-upd-forb-${randomUUID()}`) });
    const outsider = await db.user.create({ data: createUserData(`ws-svc-upd-out-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `upd-forb-${randomUUID()}`,
      createdByUserId: creator.id,
    });

    await expect(
      workspaceService.update(workspace.id, { name: "hijack" }, outsider.id),
    ).rejects.toMatchObject({ statusCode: 403 });

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id, outsider.id]);
  });

  it("returns 404 when the workspace does not exist", async () => {
    const user = await db.user.create({ data: createUserData(`ws-svc-upd-404-${randomUUID()}`) });

    await expect(
      workspaceService.update(randomUUID(), { name: "ghost" }, user.id),
    ).rejects.toMatchObject({ statusCode: 404 });

    await hardDelete("users", [user.id]);
  });

  it("logs workspace.updated with requestId and entityId", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-log-u-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `log-upd-${randomUUID()}`,
      createdByUserId: creator.id,
    });
    const requestId = `req-ws-update-${randomUUID()}`;

    await workspaceService.update(workspace.id, { name: "logged-name" }, creator.id, requestId);

    const logged = findEvent("workspace.updated");
    expect(logged?.entityId).toBe(workspace.id);
    expect(logged?.requestId).toBe(requestId);

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id]);
  });
});

describe("workspaceService.delete (task 3.1)", () => {
  it("allows the creator to delete the workspace and its memberships (Requirement 7.1)", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-del-c-${randomUUID()}`) });
    const teammate = await db.user.create({ data: createUserData(`ws-svc-del-m-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `del-${randomUUID()}`,
      createdByUserId: creator.id,
    });
    await workspaceRepository.createMember({ workspaceId: workspace.id, userId: teammate.id });

    await workspaceService.delete(workspace.id, creator.id);

    expect(await workspaceRepository.findById(workspace.id)).toBeNull();
    expect(await workspaceRepository.isMember(workspace.id, creator.id)).toBe(false);
    expect(await workspaceRepository.listMembers(workspace.id)).toEqual([]);

    const softDeletedMembers = await db.workspaceMember.findMany({
      where: { workspaceId: workspace.id, deletedAt: { not: null } },
    });
    await hardDelete(
      "workspace_members",
      softDeletedMembers.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id, teammate.id]);
  });

  it("rejects a non-creator member with 403 (Requirement 7.2)", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-del-nc-${randomUUID()}`) });
    const member = await db.user.create({ data: createUserData(`ws-svc-del-nm-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `del-nc-${randomUUID()}`,
      createdByUserId: creator.id,
    });
    await workspaceRepository.createMember({ workspaceId: workspace.id, userId: member.id });

    await expect(workspaceService.delete(workspace.id, member.id)).rejects.toMatchObject({
      statusCode: 403,
    });

    expect(await workspaceRepository.findById(workspace.id)).not.toBeNull();

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id, member.id]);
  });

  it("rejects a non-member with 404 (Requirement 7.3)", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-del-404-${randomUUID()}`) });
    const outsider = await db.user.create({ data: createUserData(`ws-svc-del-out-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `del-404-${randomUUID()}`,
      createdByUserId: creator.id,
    });

    await expect(workspaceService.delete(workspace.id, outsider.id)).rejects.toMatchObject({
      statusCode: 404,
    });

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id, outsider.id]);
  });

  it("rejects a missing workspace with 404", async () => {
    const user = await db.user.create({ data: createUserData(`ws-svc-del-miss-${randomUUID()}`) });

    await expect(workspaceService.delete(randomUUID(), user.id)).rejects.toMatchObject({
      statusCode: 404,
    });

    await hardDelete("users", [user.id]);
  });

  it("logs workspace.deleted with requestId and entityId", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-log-d-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `log-del-${randomUUID()}`,
      createdByUserId: creator.id,
    });
    const requestId = `req-ws-delete-${randomUUID()}`;

    await workspaceService.delete(workspace.id, creator.id, requestId);

    const logged = findEvent("workspace.deleted");
    expect(logged?.entityId).toBe(workspace.id);
    expect(logged?.requestId).toBe(requestId);

    const softDeletedMembers = await db.workspaceMember.findMany({
      where: { workspaceId: workspace.id, deletedAt: { not: null } },
    });
    await hardDelete(
      "workspace_members",
      softDeletedMembers.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id]);
  });
});

describe("workspaceService.list (task 3.1)", () => {
  it("returns only workspaces the user belongs to", async () => {
    const owner = await db.user.create({ data: createUserData(`ws-svc-list-o-${randomUUID()}`) });
    const outsider = await db.user.create({ data: createUserData(`ws-svc-list-x-${randomUUID()}`) });
    const mine = await workspaceService.create({
      name: `list-mine-${randomUUID()}`,
      createdByUserId: owner.id,
    });
    const other = await workspaceService.create({
      name: `list-other-${randomUUID()}`,
      createdByUserId: outsider.id,
    });

    const listed = await workspaceService.list(owner.id);
    expect(listed.some((w) => w.id === mine.id)).toBe(true);
    expect(listed.some((w) => w.id === other.id)).toBe(false);

    for (const workspace of [mine, other]) {
      const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
      await hardDelete(
        "workspace_members",
        members.map((m) => m.id),
      );
      await hardDelete("workspaces", [workspace.id]);
    }
    await hardDelete("users", [owner.id, outsider.id]);
  });
});

describe("workspaceService.isMember (task 3.2)", () => {
  it("returns true for members and false for non-members", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-im-c-${randomUUID()}`) });
    const outsider = await db.user.create({ data: createUserData(`ws-svc-im-x-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `im-${randomUUID()}`,
      createdByUserId: creator.id,
    });

    expect(await workspaceService.isMember(workspace.id, creator.id)).toBe(true);
    expect(await workspaceService.isMember(workspace.id, outsider.id)).toBe(false);

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id, outsider.id]);
  });
});

describe("workspaceService.listMembers (task 3.2)", () => {
  it("returns all members for a requesting member (Requirement 3.1)", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-lm-c-${randomUUID()}`) });
    const teammate = await db.user.create({ data: createUserData(`ws-svc-lm-m-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `lm-${randomUUID()}`,
      createdByUserId: creator.id,
    });
    await workspaceRepository.createMember({ workspaceId: workspace.id, userId: teammate.id });

    const listed = await workspaceService.listMembers(workspace.id, creator.id);
    expect(listed).toEqual(
      expect.arrayContaining([
        { userId: creator.id, name: creator.name, email: creator.email },
        { userId: teammate.id, name: teammate.name, email: teammate.email },
      ]),
    );
    expect(listed).toHaveLength(2);

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id, teammate.id]);
  });

  it("rejects a non-member with 403 (Requirement 3.2)", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-lm-forb-${randomUUID()}`) });
    const outsider = await db.user.create({ data: createUserData(`ws-svc-lm-out-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `lm-forb-${randomUUID()}`,
      createdByUserId: creator.id,
    });

    await expect(workspaceService.listMembers(workspace.id, outsider.id)).rejects.toMatchObject({
      statusCode: 403,
    });

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id, outsider.id]);
  });

  it("returns 404 when the workspace does not exist", async () => {
    const user = await db.user.create({ data: createUserData(`ws-svc-lm-404-${randomUUID()}`) });

    await expect(workspaceService.listMembers(randomUUID(), user.id)).rejects.toMatchObject({
      statusCode: 404,
    });

    await hardDelete("users", [user.id]);
  });
});

describe("workspaceService.searchAddableUsers (task 3.2)", () => {
  it("excludes existing members from search results (Requirement 4.2)", async () => {
    const marker = randomUUID().slice(0, 8);
    const creator = await db.user.create({
      data: createUserData(`ws-svc-search-c-${marker}`),
    });
    const member = await db.user.create({
      data: {
        ...createUserData(`ws-svc-search-m-${marker}`),
        name: `MemberAlpha-${marker}`,
        email: `member-alpha-${marker}@example.test`,
      },
    });
    const candidate = await db.user.create({
      data: {
        ...createUserData(`ws-svc-search-cand-${marker}`),
        name: `CandidateAlpha-${marker}`,
        email: `candidate-alpha-${marker}@example.test`,
      },
    });
    const workspace = await workspaceService.create({
      name: `search-${marker}`,
      createdByUserId: creator.id,
    });
    await workspaceRepository.createMember({ workspaceId: workspace.id, userId: member.id });

    const results = await workspaceService.searchAddableUsers(
      workspace.id,
      `Alpha-${marker}`,
      creator.id,
    );

    expect(results.some((u) => u.userId === member.id)).toBe(false);
    expect(results).toContainEqual({
      userId: candidate.id,
      name: candidate.name,
      email: candidate.email,
    });

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id, member.id, candidate.id]);
  });

  it("returns an empty array for empty or whitespace-only query", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-search-empty-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `search-empty-${randomUUID()}`,
      createdByUserId: creator.id,
    });

    expect(await workspaceService.searchAddableUsers(workspace.id, "", creator.id)).toEqual([]);
    expect(await workspaceService.searchAddableUsers(workspace.id, "   ", creator.id)).toEqual([]);

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id]);
  });

  it("rejects a non-member search with 403 (Requirement 4.5)", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-search-forb-${randomUUID()}`) });
    const outsider = await db.user.create({ data: createUserData(`ws-svc-search-out-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `search-forb-${randomUUID()}`,
      createdByUserId: creator.id,
    });

    await expect(
      workspaceService.searchAddableUsers(workspace.id, "anyone", outsider.id),
    ).rejects.toMatchObject({ statusCode: 403 });

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id, outsider.id]);
  });
});

describe("workspaceService.addMember (task 3.2)", () => {
  it("adds a user as a member (Requirement 4.3, 4.4)", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-add-c-${randomUUID()}`) });
    const target = await db.user.create({ data: createUserData(`ws-svc-add-t-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `add-${randomUUID()}`,
      createdByUserId: creator.id,
    });

    const added = await workspaceService.addMember(workspace.id, target.id, creator.id);

    expect(added).toEqual({
      userId: target.id,
      name: target.name,
      email: target.email,
    });
    expect(await workspaceService.isMember(workspace.id, target.id)).toBe(true);

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id, target.id]);
  });

  it("rejects duplicate membership with 400", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-add-dup-${randomUUID()}`) });
    const target = await db.user.create({ data: createUserData(`ws-svc-add-dup-t-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `add-dup-${randomUUID()}`,
      createdByUserId: creator.id,
    });
    await workspaceService.addMember(workspace.id, target.id, creator.id);

    await expect(
      workspaceService.addMember(workspace.id, target.id, creator.id),
    ).rejects.toMatchObject({ statusCode: 400 });

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id, target.id]);
  });

  it("rejects a non-member add with 403 (Requirement 4.5)", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-add-forb-${randomUUID()}`) });
    const outsider = await db.user.create({ data: createUserData(`ws-svc-add-out-${randomUUID()}`) });
    const target = await db.user.create({ data: createUserData(`ws-svc-add-tgt-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `add-forb-${randomUUID()}`,
      createdByUserId: creator.id,
    });

    await expect(
      workspaceService.addMember(workspace.id, target.id, outsider.id),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(await workspaceService.isMember(workspace.id, target.id)).toBe(false);

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id, outsider.id, target.id]);
  });

  it("logs workspace.member_added with requestId and entityId", async () => {
    const creator = await db.user.create({ data: createUserData(`ws-svc-log-add-${randomUUID()}`) });
    const target = await db.user.create({ data: createUserData(`ws-svc-log-add-t-${randomUUID()}`) });
    const workspace = await workspaceService.create({
      name: `log-add-${randomUUID()}`,
      createdByUserId: creator.id,
    });
    const requestId = `req-ws-member-add-${randomUUID()}`;

    await workspaceService.addMember(workspace.id, target.id, creator.id, requestId);

    const logged = findEvent("workspace.member_added");
    expect(logged?.entityId).toBe(workspace.id);
    expect(logged?.requestId).toBe(requestId);

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspace.id]);
    await hardDelete("users", [creator.id, target.id]);
  });
});
