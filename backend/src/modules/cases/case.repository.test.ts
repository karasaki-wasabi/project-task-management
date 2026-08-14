// caseRepository workspace scope (workspace-resource-scope task 2.1;
// Requirements 1.1, 1.2, 3.1, 3.2, 3.3). Integration tests against real MySQL.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { createUserData } from "../../test/user.fixture.js";
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
  const user = await db.user.create({ data: createUserData("case-repo-ws") });
  userId = user.id;
  const [a, b] = await Promise.all([
    db.workspace.create({ data: { name: `case-repo-a-${randomUUID()}`, createdByUserId: userId } }),
    db.workspace.create({ data: { name: `case-repo-b-${randomUUID()}`, createdByUserId: userId } }),
  ]);
  workspaceA = asVerified(a.id);
  workspaceB = asVerified(b.id);
});

afterAll(async () => {
  await hardDelete("workspaces", [workspaceA, workspaceB]);
  await hardDelete("users", [userId]);
  await db.$disconnect();
});

describe("caseRepository (task 3.1 + workspace-resource-scope 2.1)", () => {
  it("creates a case holding name/startDate/endDate/workspaceId, with isCompleted defaulting to false (Requirement 1.1, 2.2, 2.5)", async () => {
    const startDate = new Date("2034-09-01");
    const endDate = new Date("2034-09-30");
    const created = await caseRepository.create({
      name: `case-${randomUUID()}`,
      startDate,
      endDate,
      workspaceId: workspaceA,
    });

    expect(created.startDate?.getTime()).toBe(startDate.getTime());
    expect(created.endDate.getTime()).toBe(endDate.getTime());
    expect(created.isCompleted).toBe(false);
    expect(created.workspaceId).toBe(workspaceA);

    await hardDelete("cases", [created.id]);
  });

  it("creates a case without a startDate (Requirement 2.2)", async () => {
    const endDate = new Date("2034-10-31");
    const created = await caseRepository.create({
      name: `no-start-${randomUUID()}`,
      endDate,
      workspaceId: workspaceA,
    });

    expect(created.startDate).toBeNull();
    expect(created.endDate.getTime()).toBe(endDate.getTime());

    await hardDelete("cases", [created.id]);
  });

  it("finds a case by id within the same workspace", async () => {
    const created = await caseRepository.create({
      name: `find-${randomUUID()}`,
      endDate: new Date("2034-11-01"),
      workspaceId: workspaceA,
    });

    const found = await caseRepository.findById(created.id, workspaceA);
    expect(found?.id).toBe(created.id);

    await hardDelete("cases", [created.id]);
  });

  it("returns null for a non-existent id", async () => {
    const found = await caseRepository.findById(randomUUID(), workspaceA);
    expect(found).toBeNull();
  });

  it("returns null when the case belongs to another workspace (Requirement 3.3)", async () => {
    const created = await caseRepository.create({
      name: `other-ws-${randomUUID()}`,
      endDate: new Date("2034-11-15"),
      workspaceId: workspaceB,
    });

    const found = await caseRepository.findById(created.id, workspaceA);
    expect(found).toBeNull();

    await hardDelete("cases", [created.id]);
  });

  it("lists only cases in the requested workspace (Requirement 3.1)", async () => {
    const inA = await caseRepository.create({
      name: `list-a-${randomUUID()}`,
      endDate: new Date("2034-12-01"),
      workspaceId: workspaceA,
    });
    const inB = await caseRepository.create({
      name: `list-b-${randomUUID()}`,
      endDate: new Date("2034-12-01"),
      workspaceId: workspaceB,
    });

    const listA = await caseRepository.list(workspaceA);
    expect(listA.some((c) => c.id === inA.id)).toBe(true);
    expect(listA.some((c) => c.id === inB.id)).toBe(false);

    await hardDelete("cases", [inA.id, inB.id]);
  });

  it("list uses the provided client instead of always hitting the default db (task 2.1 fix)", async () => {
    // Create only inside the TX so an uncommitted row is invisible to the
    // default `db` connection. If list() ignored `client` and always used
    // `db`, the in-TX list would also miss the row.
    await expect(
      db.$transaction(async (tx) => {
        const created = await caseRepository.create(
          {
            name: `tx-list-${randomUUID()}`,
            endDate: new Date("2034-12-15"),
            workspaceId: workspaceA,
          },
          tx,
        );

        const insideTx = await caseRepository.list(workspaceA, tx);
        expect(insideTx.some((c) => c.id === created.id)).toBe(true);

        const outsideTx = await caseRepository.list(workspaceA);
        expect(outsideTx.some((c) => c.id === created.id)).toBe(false);

        throw new Error("rollback-list-client-proof");
      }),
    ).rejects.toThrow("rollback-list-client-proof");
  });

  it("updates each field of a case independently within workspace (Requirement 5.1)", async () => {
    const created = await caseRepository.create({
      name: `update-${randomUUID()}`,
      startDate: new Date("2035-01-01"),
      endDate: new Date("2035-01-31"),
      workspaceId: workspaceA,
    });

    const renamed = await caseRepository.update(created.id, workspaceA, { name: "renamed" });
    expect(renamed.name).toBe("renamed");
    expect(renamed.endDate.getTime()).toBe(created.endDate.getTime());

    const newStartDate = new Date("2035-01-10");
    const startDateChanged = await caseRepository.update(created.id, workspaceA, { startDate: newStartDate });
    expect(startDateChanged.startDate?.getTime()).toBe(newStartDate.getTime());

    const clearedStartDate = await caseRepository.update(created.id, workspaceA, { startDate: null });
    expect(clearedStartDate.startDate).toBeNull();

    const newEndDate = new Date("2035-02-15");
    const endDateChanged = await caseRepository.update(created.id, workspaceA, { endDate: newEndDate });
    expect(endDateChanged.endDate.getTime()).toBe(newEndDate.getTime());

    const completed = await caseRepository.update(created.id, workspaceA, { isCompleted: true });
    expect(completed.isCompleted).toBe(true);

    await hardDelete("cases", [created.id]);
  });

  it("update fails when the case belongs to another workspace (Requirement 3.3)", async () => {
    const created = await caseRepository.create({
      name: `update-other-${randomUUID()}`,
      endDate: new Date("2035-02-01"),
      workspaceId: workspaceB,
    });

    await expect(caseRepository.update(created.id, workspaceA, { name: "nope" })).rejects.toMatchObject({
      code: "P2025",
    });

    await hardDelete("cases", [created.id]);
  });

  it("deletes a case row within workspace (Requirement 4.1 detach is on the integrity surface)", async () => {
    const created = await caseRepository.create({
      name: `delete-${randomUUID()}`,
      endDate: new Date("2035-03-01"),
      workspaceId: workspaceA,
    });

    await caseRepository.delete(created.id, workspaceA);

    const deletedCase = await db.case.findFirst({ where: { id: created.id, deletedAt: { not: null } } });
    expect(deletedCase).not.toBeNull();

    await hardDelete("cases", [created.id]);
  });

  it("delete uses the provided client instead of always hitting the default db", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const created = await caseRepository.create(
          {
            name: `tx-delete-${randomUUID()}`,
            endDate: new Date("2035-03-08"),
            workspaceId: workspaceA,
          },
          tx,
        );

        await caseRepository.delete(created.id, workspaceA, tx);

        const insideTx = await caseRepository.findById(created.id, workspaceA, tx);
        expect(insideTx).toBeNull();

        throw new Error("rollback-delete-client-proof");
      }),
    ).rejects.toThrow("rollback-delete-client-proof");
  });

  it("delete fails when the case belongs to another workspace (Requirement 3.3)", async () => {
    const created = await caseRepository.create({
      name: `delete-other-${randomUUID()}`,
      endDate: new Date("2035-03-15"),
      workspaceId: workspaceB,
    });

    await expect(caseRepository.delete(created.id, workspaceA)).rejects.toMatchObject({
      code: "P2025",
    });

    await hardDelete("cases", [created.id]);
  });
});

describe("caseRepository module boundary (module-boundary-cleanup task 4.1)", () => {
  it("does not import task.closure or touch task persistence (Requirements 1.1, 1.3, 1.4, 4.6)", () => {
    const sourcePath = join(dirname(fileURLToPath(import.meta.url)), "case.repository.ts");
    const source = readFileSync(sourcePath, "utf8");
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    const codeWithoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(importLines).not.toMatch(/task\.closure/);
    expect(importLines).not.toMatch(/from ["']\.\.\/tasks\//);
    expect(codeWithoutComments).not.toMatch(/\b(?:db|tx|client)\.task\b/);
    expect(codeWithoutComments).not.toMatch(/\bopenTaskFilter\b/);
    expect(codeWithoutComments).not.toMatch(/\bcompletedTaskFilter\b/);
  });
});
