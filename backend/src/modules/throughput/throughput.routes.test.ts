// throughputRoutes (legacy task 7.1 + velocity-dashboard task 3.4).
// Registration into main app.ts / WORKSPACE_SCOPED_PATH_PREFIXES is done (task 3.5);
// this suite mounts the plugin on a throwaway Fastify and decorates
// currentWorkspaceId the way requireWorkspaceMember would.
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { createUserData } from "../../test/user.fixture.js";
import { throughputRoutes } from "./throughput.routes.js";

const createdTaskIds: string[] = [];
const createdCaseIds: string[] = [];
let ownerUserId: string;
let workspaceId: string;
let verifiedWorkspaceId: VerifiedWorkspaceId;

async function buildTestApp(currentWorkspaceId: VerifiedWorkspaceId = verifiedWorkspaceId) {
  const app = Fastify({ logger: false });
  app.decorateRequest("currentWorkspaceId", undefined);
  app.addHook("preHandler", async (request) => {
    request.currentWorkspaceId = currentWorkspaceId;
  });
  await app.register(throughputRoutes);
  return app;
}

async function cleanupCasesAndTasks(): Promise<void> {
  if (createdTaskIds.length > 0) {
    await db.$executeRawUnsafe(
      `DELETE FROM activity_logs WHERE task_id IN (${createdTaskIds.map(() => "?").join(",")})`,
      ...createdTaskIds,
    );
    await db.$executeRawUnsafe(
      `DELETE FROM tasks WHERE id IN (${createdTaskIds.map(() => "?").join(",")})`,
      ...createdTaskIds,
    );
    createdTaskIds.length = 0;
  }
  if (createdCaseIds.length > 0) {
    await db.$executeRawUnsafe(
      `DELETE FROM cases WHERE id IN (${createdCaseIds.map(() => "?").join(",")})`,
      ...createdCaseIds,
    );
    createdCaseIds.length = 0;
  }
}

beforeAll(async () => {
  const owner = await db.user.create({ data: createUserData(`throughput-route-${randomUUID()}`) });
  ownerUserId = owner.id;
  const workspace = await db.workspace.create({
    data: { name: `throughput-route-ws-${randomUUID()}`, createdByUserId: ownerUserId },
  });
  workspaceId = workspace.id;
  verifiedWorkspaceId = workspaceId as VerifiedWorkspaceId;
});

beforeEach(async () => {
  await cleanupCasesAndTasks();
});

afterAll(async () => {
  await cleanupCasesAndTasks();
  if (workspaceId) {
    await db.$executeRawUnsafe(`DELETE FROM tasks WHERE workspace_id = ?`, workspaceId);
    await db.$executeRawUnsafe(`DELETE FROM cases WHERE workspace_id = ?`, workspaceId);
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  }
  if (ownerUserId) {
    await db.user.delete({ where: { id: ownerUserId } }).catch(() => undefined);
  }
  await db.$disconnect();
});

describe("throughputRoutes (task 7.1)", () => {
  it("GET /api/throughput returns a summary for valid query params", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/throughput?periodType=week&rangeCount=2" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.periods).toHaveLength(2);
    expect(body).toHaveProperty("forecastNextPeriodCount");
    expect(body).toHaveProperty("forecastNextPeriodPoints");
    expect(body.periods[0]).toHaveProperty("completedPoints");
    expect(typeof body.periods[0].periodStart).toBe("string");
    expect(typeof body.periods[0].periodEnd).toBe("string");

    await app.close();
  });

  it("GET /api/throughput returns 400 for an invalid periodType", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/throughput?periodType=day&rangeCount=1" });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("GET /api/throughput returns 400 for rangeCount < 1", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/throughput?periodType=week&rangeCount=0" });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe("throughputRoutes caseId / caseOutlook (velocity-dashboard task 3.4)", () => {
  it("omits caseOutlook when caseId is not provided", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/throughput?periodType=week&rangeCount=1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).not.toHaveProperty("caseOutlook");
    await app.close();
  });

  it("includes caseOutlook when caseId is in the current workspace", async () => {
    const caseRow = await db.case.create({
      data: {
        name: `route-case-${randomUUID()}`,
        endDate: new Date("2030-06-01T00:00:00.000Z"),
        workspaceId,
      },
    });
    createdCaseIds.push(caseRow.id);

    const open = await db.task.create({
      data: {
        title: `open-${randomUUID()}`,
        priority: "low",
        workspaceId,
        caseId: caseRow.id,
        storyPoints: 5,
      },
    });
    createdTaskIds.push(open.id);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/throughput?periodType=week&rangeCount=1&caseId=${caseRow.id}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.caseOutlook).toEqual({
      openTaskCount: 1,
      openPoints: 5,
      requiredPeriods: null,
      remainingPeriods: expect.any(Number),
      marginPoints: null,
    });
    expect(body).toHaveProperty("forecastNextPeriodPoints");
    expect(body.periods[0]).toHaveProperty("completedPoints");

    await app.close();
  });

  it("returns 400 when caseId belongs to another workspace", async () => {
    const otherWorkspace = await db.workspace.create({
      data: { name: `throughput-route-other-${randomUUID()}`, createdByUserId: ownerUserId },
    });
    const foreignCase = await db.case.create({
      data: {
        name: `foreign-${randomUUID()}`,
        endDate: new Date("2030-01-01T00:00:00.000Z"),
        workspaceId: otherWorkspace.id,
      },
    });

    try {
      const app = await buildTestApp();
      const response = await app.inject({
        method: "GET",
        url: `/api/throughput?periodType=week&rangeCount=1&caseId=${foreignCase.id}`,
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    } finally {
      await db.$executeRawUnsafe(`DELETE FROM cases WHERE id = ?`, foreignCase.id);
      await db.workspace.delete({ where: { id: otherWorkspace.id } }).catch(() => undefined);
    }
  });
});
