// RED→GREEN: TaskClosure single definition (task 1.3; Requirements 3.1, 3.2, 3.3)
import { describe, expect, it } from "vitest";
import type { DevelopmentStageKind } from "@prisma/client";
import {
  closedTaskFilter,
  completedTaskFilter,
  openTaskFilter,
  resolveClosureState,
  type TaskClosureState,
} from "./task.closure.js";

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
});
