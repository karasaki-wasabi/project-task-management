// RED→GREEN: TaskClosure single definition (task 1.3; Requirements 3.1, 3.2, 3.3)
// leafTaskFilter (velocity-dashboard task 1.2; Requirement 3.3)
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DevelopmentStageKind } from "@prisma/client";
import { db } from "../../shared/db.js";
import { createUserData } from "../../test/user.fixture.js";
import {
  closedTaskFilter,
  completedTaskFilter,
  leafTaskFilter,
  openTaskFilter,
  resolveClosureState,
  type TaskClosureState,
} from "./task.closure.js";

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(
    `DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
}

const ALL_KINDS: ReadonlyArray<DevelopmentStageKind | null> = [
  null,
  "normal",
  "completed",
  "cancelled",
];

function isOpen(state: TaskClosureState): boolean {
  return state === "open";
}

function isClosed(state: TaskClosureState): boolean {
  return state === "completed" || state === "cancelled";
}

function isCompleted(state: TaskClosureState): boolean {
  return state === "completed";
}

describe("resolveClosureState (task 1.3)", () => {
  it("maps stage kinds to closure states", () => {
    expect(resolveClosureState(null)).toBe("open");
    expect(resolveClosureState("normal")).toBe("open");
    expect(resolveClosureState("completed")).toBe("completed");
    expect(resolveClosureState("cancelled")).toBe("cancelled");
  });

  it("treats unset stage as always open (Requirement 3.3)", () => {
    const state = resolveClosureState(null);
    expect(isOpen(state)).toBe(true);
    expect(isClosed(state)).toBe(false);
    expect(isCompleted(state)).toBe(false);
  });
});

describe("open / closed / completed predicates (task 1.3)", () => {
  it("treats completed and cancelled as closed, and only completed as completed (Requirements 3.1, 3.2)", () => {
    expect(isClosed(resolveClosureState("completed"))).toBe(true);
    expect(isCompleted(resolveClosureState("completed"))).toBe(true);

    expect(isClosed(resolveClosureState("cancelled"))).toBe(true);
    expect(isCompleted(resolveClosureState("cancelled"))).toBe(false);

    expect(isClosed(resolveClosureState("normal"))).toBe(false);
    expect(isCompleted(resolveClosureState("normal"))).toBe(false);
    expect(isOpen(resolveClosureState("normal"))).toBe(true);
  });

  it("keeps open and closed as complementary sets for every kind including unset", () => {
    for (const kind of ALL_KINDS) {
      const state = resolveClosureState(kind);
      expect(isOpen(state)).toBe(!isClosed(state));
    }
  });

  it("matches unset-stage tasks only on the open side", () => {
    const openMatches = ALL_KINDS.filter((kind) =>
      isOpen(resolveClosureState(kind)),
    );
    const closedMatches = ALL_KINDS.filter((kind) =>
      isClosed(resolveClosureState(kind)),
    );

    expect(openMatches).toContain(null);
    expect(closedMatches).not.toContain(null);
  });
});

describe("Prisma filter helpers (task 1.3)", () => {
  it("defines completed filter as completed-kind stages only", () => {
    expect(completedTaskFilter).toEqual({
      developmentStage: {
        kind: "completed",
      },
    });
  });

  it("defines closed filter as completed or cancelled stages", () => {
    expect(closedTaskFilter).toEqual({
      developmentStage: {
        kind: { in: ["completed", "cancelled"] },
      },
    });
  });

  it("defines open filter as the structural complement of closed filter", () => {
    expect(openTaskFilter).toEqual({
      NOT: closedTaskFilter,
    });
  });

  it("does not classify unset stages as closed in filter structure", () => {
    // Relation filter requires a related stage; null developmentStageId never matches.
    expect(closedTaskFilter).toEqual(
      expect.objectContaining({
        developmentStage: expect.anything(),
      }),
    );
    expect(closedTaskFilter).not.toEqual(
      expect.objectContaining({
        developmentStageId: null,
      }),
    );
    expect(openTaskFilter).toEqual({ NOT: closedTaskFilter });
  });

  it("defines leaf filter as no non-deleted direct children (velocity-dashboard 1.2; Requirement 3.3)", () => {
    expect(leafTaskFilter).toEqual({
      childTasks: { none: { deletedAt: null } },
    });
  });
});

describe("leafTaskFilter behavior (velocity-dashboard 1.2; Requirement 3.3)", () => {
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    const user = await db.user.create({ data: createUserData("leaf-filter") });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: { name: `leaf-filter-${randomUUID()}`, createdByUserId: userId },
    });
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await hardDelete("workspaces", [workspaceId]);
    await hardDelete("users", [userId]);
    await db.$disconnect();
  });

  it("matches a task whose children are all soft-deleted", async () => {
    const parent = await db.task.create({
      data: {
        title: `leaf-parent-${randomUUID()}`,
        priority: "low",
        workspaceId,
      },
    });
    const activeSiblingParent = await db.task.create({
      data: {
        title: `non-leaf-parent-${randomUUID()}`,
        priority: "low",
        workspaceId,
      },
    });
    const softDeletedChild = await db.task.create({
      data: {
        title: `soft-child-${randomUUID()}`,
        priority: "low",
        workspaceId,
        parentTaskId: parent.id,
      },
    });
    const activeChild = await db.task.create({
      data: {
        title: `active-child-${randomUUID()}`,
        priority: "low",
        workspaceId,
        parentTaskId: activeSiblingParent.id,
      },
    });
    const trueLeaf = await db.task.create({
      data: {
        title: `true-leaf-${randomUUID()}`,
        priority: "low",
        workspaceId,
      },
    });

    await db.task.delete({ where: { id: softDeletedChild.id } });

    try {
      const matched = await db.task.findMany({
        where: {
          id: { in: [parent.id, activeSiblingParent.id, trueLeaf.id] },
          AND: [leafTaskFilter],
        },
        select: { id: true },
      });
      const matchedIds = matched.map((row) => row.id);

      expect(matchedIds).toContain(parent.id);
      expect(matchedIds).toContain(trueLeaf.id);
      expect(matchedIds).not.toContain(activeSiblingParent.id);
    } finally {
      await hardDelete("tasks", [
        softDeletedChild.id,
        activeChild.id,
        parent.id,
        activeSiblingParent.id,
        trueLeaf.id,
      ]);
    }
  });
});
