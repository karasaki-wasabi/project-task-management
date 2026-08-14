/**
 * Manual seed invariants for task-status-model task 1.2 / velocity-dashboard.
 *
 * Destructive: calls the real seed path (TRUNCATE + reseed). Prefer running this
 * file alone or at the end of a suite that does not rely on leftover rows.
 *
 *   docker compose run --rm backend npx vitest run --no-file-parallelism \
 *     src/prisma/seed.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { throughputService } from "../modules/throughput/throughput.service.js";
import type { VerifiedWorkspaceId } from "../shared/workspace-scope.js";
import {
  SEED_CASE_ACTIVE_ID,
  SEED_TASK_CHILD_ID,
  SEED_TASK_CHILD_SIBLING_ID,
  SEED_TASK_DONE_ID,
  SEED_TASK_GRANDCHILD_ID,
  SEED_TASK_ROOT_ID,
  SEED_TASK_VELOCITY_W1A_ID,
  SEED_TASK_VELOCITY_W2A_ID,
  SEED_TASK_VELOCITY_W3A_ID,
  SEED_WORKSPACE_ID,
  seedManualConfirmationData,
} from "./seed-manual-data.js";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("manual confirmation seed (task-status-model 1.2)", () => {
  it("leaves exactly one completed and one cancelled stage for the seeded workspace", async () => {
    const { workspaceId } = await seedManualConfirmationData(prisma);
    expect(workspaceId).toBe(SEED_WORKSPACE_ID);

    const stages = await prisma.developmentStage.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { order: "asc" },
    });

    const completed = stages.filter((s) => s.kind === "completed");
    const cancelled = stages.filter((s) => s.kind === "cancelled");
    const normalNamedDone = stages.filter(
      (s) => s.kind === "normal" && s.name === "完了",
    );

    expect(completed).toHaveLength(1);
    expect(cancelled).toHaveLength(1);
    expect(normalNamedDone).toHaveLength(0);
    expect(completed[0]?.name).toBe("完了");
    expect(cancelled[0]?.name).toBe("中止");

    const doneTask = await prisma.task.findUniqueOrThrow({
      where: { id: SEED_TASK_DONE_ID },
      include: { developmentStage: true },
    });
    expect(doneTask.developmentStageId).toBe(completed[0]?.id);
    expect(doneTask.developmentStage?.kind).toBe("completed");
    expect(doneTask.status).toBe("not_started");
    expect(doneTask.completedAt).not.toBeNull();
    expect(doneTask.storyPoints).toBe(5);
  });

  it("seeds a three-level parent-child tree for task detail confirmation", async () => {
    await seedManualConfirmationData(prisma);

    const [parent, child, sibling, grandchild] = await Promise.all([
      prisma.task.findUniqueOrThrow({ where: { id: SEED_TASK_ROOT_ID } }),
      prisma.task.findUniqueOrThrow({ where: { id: SEED_TASK_CHILD_ID } }),
      prisma.task.findUniqueOrThrow({ where: { id: SEED_TASK_CHILD_SIBLING_ID } }),
      prisma.task.findUniqueOrThrow({ where: { id: SEED_TASK_GRANDCHILD_ID } }),
    ]);

    expect(parent.parentTaskId).toBeNull();
    expect(child.parentTaskId).toBe(SEED_TASK_ROOT_ID);
    expect(sibling.parentTaskId).toBe(SEED_TASK_ROOT_ID);
    expect(grandchild.parentTaskId).toBe(SEED_TASK_CHILD_ID);
    expect(sibling.storyPoints).toBe(5);
    expect(grandchild.storyPoints).toBe(3);
    expect(child.storyPoints).toBe(3);
    expect(parent.storyPoints).toBe(8);

    const logs = await prisma.activityLog.findMany({
      where: { taskId: SEED_TASK_ROOT_ID, operationType: "field_changed" },
    });
    const logDays = new Set(logs.map((log) => log.occurredAt.toISOString().slice(0, 10)));
    expect(logDays.size).toBeGreaterThanOrEqual(2);
  });

  it("seeds past-week completions so throughput summary is non-zero (velocity-dashboard)", async () => {
    await seedManualConfirmationData(prisma);

    const velocityIds = [
      SEED_TASK_VELOCITY_W1A_ID,
      SEED_TASK_VELOCITY_W2A_ID,
      SEED_TASK_VELOCITY_W3A_ID,
    ];
    const velocityTasks = await prisma.task.findMany({
      where: { id: { in: velocityIds } },
    });
    expect(velocityTasks).toHaveLength(3);
    expect(velocityTasks.every((task) => task.completedAt != null)).toBe(true);
    expect(velocityTasks.every((task) => (task.storyPoints ?? 0) > 0)).toBe(true);

    const workspaceId = SEED_WORKSPACE_ID as VerifiedWorkspaceId;
    const summary = await throughputService.getSummary("week", 4, workspaceId);
    const totalCount = summary.periods.reduce((sum, p) => sum + p.completedCount, 0);
    const totalPoints = summary.periods.reduce((sum, p) => sum + p.completedPoints, 0);
    expect(totalCount).toBeGreaterThan(0);
    expect(totalPoints).toBeGreaterThan(0);
    expect(summary.forecastNextPeriodCount).not.toBeNull();
    expect(summary.forecastNextPeriodPoints).not.toBeNull();
    expect(summary.forecastNextPeriodCount!).toBeGreaterThan(0);
    expect(summary.forecastNextPeriodPoints!).toBeGreaterThan(0);

    const caseSummary = await throughputService.getSummary(
      "week",
      4,
      workspaceId,
      SEED_CASE_ACTIVE_ID,
    );
    expect(caseSummary.caseOutlook).toBeDefined();
    expect(caseSummary.caseOutlook!.openTaskCount).toBeGreaterThan(0);
    expect(caseSummary.caseOutlook!.openPoints).toBeGreaterThan(0);
    expect(caseSummary.caseOutlook!.remainingPeriods).not.toBeNull();
  });
});
