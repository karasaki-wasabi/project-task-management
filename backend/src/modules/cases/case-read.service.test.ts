// caseReadService (module-boundary-cleanup task 2.1; design.md Backend/cases
// caseReadService; Requirements 1.1, 1.4, 2.1, 2.2, 3.2).
// Integration tests: workspace scope, TX client visibility, requireById notFound.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { createUserData } from "../../test/user.fixture.js";
import { caseReadService } from "./case-read.service.js";
import { caseRepository } from "./case.repository.js";

function asVerified(id: string): VerifiedWorkspaceId {
  return id as VerifiedWorkspaceId;
}

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

let workspaceA: VerifiedWorkspaceId;
let workspaceB: VerifiedWorkspaceId;
let userId: string;

beforeAll(async () => {
  const user = await db.user.create({ data: createUserData("case-read-ws") });
  userId = user.id;
  const [a, b] = await Promise.all([
    db.workspace.create({ data: { name: `case-read-a-${randomUUID()}`, createdByUserId: userId } }),
    db.workspace.create({ data: { name: `case-read-b-${randomUUID()}`, createdByUserId: userId } }),
  ]);
  workspaceA = asVerified(a.id);
  workspaceB = asVerified(b.id);
});

afterAll(async () => {
  await hardDelete("workspaces", [workspaceA, workspaceB]);
  await hardDelete("users", [userId]);
  await db.$disconnect();
});

describe("caseReadService (module-boundary-cleanup 2.1)", () => {
  it("findInWorkspace returns the case when id is in the workspace", async () => {
    const created = await caseRepository.create({
      name: `read-ok-${randomUUID()}`,
      endDate: new Date("2036-01-15"),
      workspaceId: workspaceA,
    });

    const found = await caseReadService.findInWorkspace(created.id, workspaceA);
    expect(found?.id).toBe(created.id);
    expect(found?.workspaceId).toBe(workspaceA);

    await hardDelete("cases", [created.id]);
  });

  it("findInWorkspace returns null for a non-existent id", async () => {
    const found = await caseReadService.findInWorkspace(randomUUID(), workspaceA);
    expect(found).toBeNull();
  });

  it("findInWorkspace returns null when the case belongs to another workspace (Requirement 1.1, 2.2)", async () => {
    const created = await caseRepository.create({
      name: `other-ws-${randomUUID()}`,
      endDate: new Date("2036-02-01"),
      workspaceId: workspaceB,
    });

    const found = await caseReadService.findInWorkspace(created.id, workspaceA);
    expect(found).toBeNull();

    await hardDelete("cases", [created.id]);
  });

  it("findInWorkspace sees uncommitted rows via the TX client (Requirement 3.2)", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const created = await caseRepository.create(
          {
            name: `tx-find-${randomUUID()}`,
            endDate: new Date("2036-03-01"),
            workspaceId: workspaceA,
          },
          tx,
        );

        const inside = await caseReadService.findInWorkspace(created.id, workspaceA, tx);
        expect(inside?.id).toBe(created.id);

        const outside = await caseReadService.findInWorkspace(created.id, workspaceA);
        expect(outside).toBeNull();

        throw new Error("rollback-findInWorkspace-tx-proof");
      }),
    ).rejects.toThrow("rollback-findInWorkspace-tx-proof");
  });

  it("requireById returns the case by id without workspace filter", async () => {
    const created = await caseRepository.create({
      name: `req-ok-${randomUUID()}`,
      endDate: new Date("2036-04-01"),
      workspaceId: workspaceB,
    });

    const found = await caseReadService.requireById(created.id);
    expect(found.id).toBe(created.id);
    expect(found.workspaceId).toBe(workspaceB);

    await hardDelete("cases", [created.id]);
  });

  it("requireById throws notFound when missing (same message as recurrence)", async () => {
    const missingId = randomUUID();
    await expect(caseReadService.requireById(missingId)).rejects.toMatchObject({
      statusCode: 404,
      message: `Case not found: ${missingId}`,
    });
  });

  it("requireById sees uncommitted rows via the TX client (Requirement 3.2)", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const created = await caseRepository.create(
          {
            name: `tx-req-${randomUUID()}`,
            endDate: new Date("2036-05-01"),
            workspaceId: workspaceA,
          },
          tx,
        );

        const inside = await caseReadService.requireById(created.id, tx);
        expect(inside.id).toBe(created.id);

        await expect(caseReadService.requireById(created.id)).rejects.toMatchObject({
          statusCode: 404,
          message: `Case not found: ${created.id}`,
        });

        throw new Error("rollback-requireById-tx-proof");
      }),
    ).rejects.toThrow("rollback-requireById-tx-proof");
  });
});
