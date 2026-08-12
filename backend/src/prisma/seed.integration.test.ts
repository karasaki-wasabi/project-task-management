/**
 * Manual seed invariants for task-status-model task 1.2.
 *
 * Destructive: calls the real seed path (TRUNCATE + reseed). Prefer running this
 * file alone or at the end of a suite that does not rely on leftover rows.
 *
 *   docker compose run --rm backend npx vitest run --no-file-parallelism \
 *     src/prisma/seed.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  SEED_TASK_DONE_ID,
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
  });
});
