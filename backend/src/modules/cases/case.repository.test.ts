// caseRepository workspace scope (workspace-resource-scope task 2.1;
// Requirements 1.1, 1.2, 3.1, 3.2, 3.3). Integration tests against real MySQL.
import { randomUUID } from "node:crypto";
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

  it("deletes a case and detaches (does not cascade-delete) linked Task records (Requirement 8.1, 8.2)", async () => {
    const created = await caseRepository.create({
      name: `delete-${randomUUID()}`,
      endDate: new Date("2035-03-01"),
      workspaceId: workspaceA,
    });
    const linkedTask = await db.task.create({
      data: {
        title: "keep me",
        priority: "low",
        caseId: created.id,
        workspaceId: workspaceA,
      },
    });

    await caseRepository.delete(created.id, workspaceA);

    const survivingTask = await db.task.findUnique({ where: { id: linkedTask.id } });
    expect(survivingTask).not.toBeNull();
    expect(survivingTask?.caseId).toBeNull();

    const deletedCase = await db.case.findFirst({ where: { id: created.id, deletedAt: { not: null } } });
    expect(deletedCase).not.toBeNull();

    await hardDelete("tasks", [linkedTask.id]);
    await hardDelete("cases", [created.id]);
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

  it("counts required completed by completed stage, not status (task-status-model 3.4; Requirements 6.1, 6.3)", async () => {
    const created = await caseRepository.create({
      name: `progress-${randomUUID()}`,
      endDate: new Date("2035-04-01"),
      workspaceId: workspaceA,
    });
    const completedStage = await db.developmentStage.create({
      data: {
        name: `completed-${randomUUID()}`,
        order: 900,
        kind: "completed",
        workspaceId: workspaceA,
      },
    });
    const taskIds: string[] = [];
    const stageIds = [completedStage.id];
    try {
      const requiredDone = await db.task.create({
        data: {
          title: "required done on completed stage",
          priority: "low",
          caseId: created.id,
          isRequiredForCase: true,
          // Default status is not_started — must still count as completed (6.1).
          developmentStageId: completedStage.id,
          workspaceId: workspaceA,
        },
      });
      taskIds.push(requiredDone.id);
      const requiredOpen = await db.task.create({
        data: {
          title: "required open",
          priority: "low",
          caseId: created.id,
          isRequiredForCase: true,
          workspaceId: workspaceA,
        },
      });
      taskIds.push(requiredOpen.id);
      const optional = await db.task.create({
        data: {
          title: "optional",
          priority: "low",
          caseId: created.id,
          isRequiredForCase: false,
          developmentStageId: completedStage.id,
          workspaceId: workspaceA,
        },
      });
      taskIds.push(optional.id);

      expect(await caseRepository.countRequiredTasks(created.id, workspaceA)).toBe(2);
      // Stage-based: completed-stage task counts even with not_started status (6.1).
      expect(await caseRepository.countRequiredCompletedTasks(created.id, workspaceA)).toBe(1);

      // Status alone must not count as completed (6.3).
      const statusOnlyHandoff = await db.task.create({
        data: {
          title: "required handoff only",
          priority: "low",
          caseId: created.id,
          isRequiredForCase: true,
          status: "ready_for_handoff",
          workspaceId: workspaceA,
        },
      });
      taskIds.push(statusOnlyHandoff.id);

      expect(await caseRepository.countRequiredTasks(created.id, workspaceA)).toBe(3);
      expect(await caseRepository.countRequiredCompletedTasks(created.id, workspaceA)).toBe(1);
    } finally {
      await hardDelete("tasks", taskIds);
      await hardDelete("development_stages", stageIds);
      await hardDelete("cases", [created.id]);
    }
  });

  it("excludes cancelled required tasks from the denominator (task-status-model 3.4; Requirement 6.2)", async () => {
    const created = await caseRepository.create({
      name: `progress-cancel-${randomUUID()}`,
      endDate: new Date("2035-04-01"),
      workspaceId: workspaceA,
    });
    const [completedStage, cancelledStage] = await Promise.all([
      db.developmentStage.create({
        data: {
          name: `completed-${randomUUID()}`,
          order: 900,
          kind: "completed",
          workspaceId: workspaceA,
        },
      }),
      db.developmentStage.create({
        data: {
          name: `cancelled-${randomUUID()}`,
          order: 901,
          kind: "cancelled",
          workspaceId: workspaceA,
        },
      }),
    ]);

    // Observable: 5 required, 1 cancelled → denominator 4; 3 completed → 3/4.
    const taskIds: string[] = [];
    const stageIds = [completedStage.id, cancelledStage.id];
    try {
      for (let i = 0; i < 3; i++) {
        const task = await db.task.create({
          data: {
            title: `required completed ${i}`,
            priority: "low",
            caseId: created.id,
            isRequiredForCase: true,
            developmentStageId: completedStage.id,
            workspaceId: workspaceA,
          },
        });
        taskIds.push(task.id);
      }
      const openTask = await db.task.create({
        data: {
          title: "required open",
          priority: "low",
          caseId: created.id,
          isRequiredForCase: true,
          workspaceId: workspaceA,
        },
      });
      taskIds.push(openTask.id);
      const cancelledTask = await db.task.create({
        data: {
          title: "required cancelled",
          priority: "low",
          caseId: created.id,
          isRequiredForCase: true,
          developmentStageId: cancelledStage.id,
          workspaceId: workspaceA,
        },
      });
      taskIds.push(cancelledTask.id);

      const requiredTotal = await caseRepository.countRequiredTasks(created.id, workspaceA);
      const requiredCompleted = await caseRepository.countRequiredCompletedTasks(created.id, workspaceA);

      expect(requiredTotal).toBe(4);
      expect(requiredCompleted).toBe(3);
    } finally {
      await hardDelete("tasks", taskIds);
      await hardDelete("development_stages", stageIds);
      await hardDelete("cases", [created.id]);
    }
  });

  it("does not count required tasks that share caseId but belong to another workspace (Requirement 3.1)", async () => {
    const created = await caseRepository.create({
      name: `progress-scope-${randomUUID()}`,
      endDate: new Date("2035-04-15"),
      workspaceId: workspaceA,
    });
    const completedStage = await db.developmentStage.create({
      data: {
        name: `completed-scope-${randomUUID()}`,
        order: 900,
        kind: "completed",
        workspaceId: workspaceA,
      },
    });
    const taskIds: string[] = [];
    try {
      const sameWs = await db.task.create({
        data: {
          title: "same workspace required",
          priority: "low",
          caseId: created.id,
          isRequiredForCase: true,
          developmentStageId: completedStage.id,
          workspaceId: workspaceA,
        },
      });
      taskIds.push(sameWs.id);
      // Adversarial row: Prisma FK allows caseId + workspaceId mismatch.
      const otherWs = await db.task.create({
        data: {
          title: "cross workspace required",
          priority: "low",
          caseId: created.id,
          isRequiredForCase: true,
          developmentStageId: completedStage.id,
          workspaceId: workspaceB,
        },
      });
      taskIds.push(otherWs.id);

      const requiredTotal = await caseRepository.countRequiredTasks(created.id, workspaceA);
      const requiredCompleted = await caseRepository.countRequiredCompletedTasks(created.id, workspaceA);

      expect(requiredTotal).toBe(1);
      expect(requiredCompleted).toBe(1);
    } finally {
      await hardDelete("tasks", taskIds);
      await hardDelete("development_stages", [completedStage.id]);
      await hardDelete("cases", [created.id]);
    }
  });
});
