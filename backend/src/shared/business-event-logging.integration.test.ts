// Cross-cutting business event logging (task 10.2, Requirement 10.2 —
// "案件作成、繰り返しタスクインスタンス生成、各エンティティの削除など"
// broad-impact operations must log operation type + target entity ID).
// Updated for workspace-resource-scope: service calls require VerifiedWorkspaceId.
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setBusinessEventLoggerForTests } from "./business-event-logger.js";
import { createLogger } from "./logger.js";
import { db } from "./db.js";
import type { VerifiedWorkspaceId } from "./workspace-scope.js";
import { tasksService } from "../modules/tasks/task.service.js";
import { caseService } from "../modules/cases/case.service.js";
import { holidaysService } from "../modules/holidays/holiday.service.js";
import { recurrenceService } from "../modules/recurrence/recurrence.service.js";
import { createUserData } from "../test/user.fixture.js";

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

function asVerified(id: string): VerifiedWorkspaceId {
  return id as VerifiedWorkspaceId;
}

let lines: Record<string, unknown>[];
let workspaceId: VerifiedWorkspaceId;
let userId: string;

beforeEach(() => {
  const collected = collectingStream();
  lines = collected.lines;
  setBusinessEventLoggerForTests(createLogger("debug", collected.stream));
});

beforeAll(async () => {
  const user = await db.user.create({ data: createUserData("biz-event-log-ws") });
  userId = user.id;
  const workspace = await db.workspace.create({
    data: { name: `biz-event-log-${randomUUID()}`, createdByUserId: userId },
  });
  workspaceId = asVerified(workspace.id);
});

afterAll(async () => {
  await db.$executeRawUnsafe(`DELETE FROM workspaces WHERE id = ?`, workspaceId);
  await db.$executeRawUnsafe(`DELETE FROM users WHERE id = ?`, userId);
  await db.$disconnect();
});

function findEvent(event: string): Record<string, unknown> | undefined {
  return lines.find((l) => l.event === event);
}

describe("business event logging (task 10.2)", () => {
  it("logs case.created with the requestId and the new case's id (Requirement 10.2)", async () => {
    let caseId: string | undefined;
    try {
      const caseEntity = await caseService.create(
        {
          name: `c-${randomUUID()}`,
          endDate: new Date(),
          templateOperations: [],
          workspaceId,
        },
        "req-case-create",
      );
      caseId = caseEntity.id;

      const logged = findEvent("case.created");
      expect(logged?.entityId).toBe(caseEntity.id);
      expect(logged?.requestId).toBe("req-case-create");
    } finally {
      if (caseId) await db.$executeRawUnsafe("DELETE FROM cases WHERE id = ?", caseId);
    }
  });

  // Cleanup runs in `finally` (not just at the end of the happy path): a
  // recurring_task_templates row left `isActive=true` by a skipped cleanup
  // is picked up by later case create/update apply (omit = full candidates).
  it("logs recurring_task_instance.generated for each instance generated via applyToCase", async () => {
    let templateId: string | undefined;
    let caseId: string | undefined;
    try {
      const template = await recurrenceService.registerTemplate({
        title: "logging check",
        priority: "low",
        caseAnchor: "case_end",
        caseOffsetDays: 0,
        nonBusinessDayPolicy: "as_is",
        workspaceId,
      });
      templateId = template.id;

      // Create without apply first so the case is committed before instance
      // generation (in-TX apply cannot see the uncommitted case via the
      // default Prisma client used by TaskService related-resource checks).
      const caseEntity = await caseService.create(
        {
          name: `c-log-${randomUUID()}`,
          endDate: new Date("2037-01-01T00:00:00.000Z"),
          templateOperations: [],
          workspaceId,
        },
        "req-case-for-generate",
      );
      caseId = caseEntity.id;

      await recurrenceService.applyToCase(caseEntity.id, ["end_generate"], "req-generate");

      const tasks = await db.task.findMany({
        where: { caseId: caseEntity.id, sourceTemplateId: template.id, deletedAt: null },
      });
      expect(tasks).toHaveLength(1);

      const logged = findEvent("recurring_task_instance.generated");
      expect(logged?.entityId).toBe(tasks[0].id);
      expect(logged?.requestId).toBe("req-generate");
    } finally {
      if (caseId) await db.$executeRawUnsafe("DELETE FROM tasks WHERE case_id = ?", caseId);
      if (caseId) await db.$executeRawUnsafe("DELETE FROM cases WHERE id = ?", caseId);
      if (templateId) await db.$executeRawUnsafe("DELETE FROM recurring_task_templates WHERE id = ?", templateId);
    }
  });

  it("logs task.deleted with the deleted task's id", async () => {
    let taskId: string | undefined;
    try {
      const created = await tasksService.create({
        title: "loggable",
        priority: "low",
        workspaceId,
      });
      if (!created.ok) throw new Error("setup failed");
      taskId = created.value.id;

      await tasksService.delete(created.value.id, workspaceId, "req-task-delete");

      const logged = findEvent("task.deleted");
      expect(logged?.entityId).toBe(created.value.id);
      expect(logged?.requestId).toBe("req-task-delete");
    } finally {
      if (taskId) await db.$executeRawUnsafe("DELETE FROM tasks WHERE id = ?", taskId);
    }
  });

  it("logs case.deleted with the deleted case's id", async () => {
    let caseId: string | undefined;
    try {
      const caseEntity = await db.case.create({
        data: { name: `c-${randomUUID()}`, endDate: new Date(), workspaceId },
      });
      caseId = caseEntity.id;

      await caseService.delete(caseEntity.id, workspaceId, "req-case-delete");

      const logged = findEvent("case.deleted");
      expect(logged?.entityId).toBe(caseEntity.id);
      expect(logged?.requestId).toBe("req-case-delete");
    } finally {
      if (caseId) await db.$executeRawUnsafe("DELETE FROM cases WHERE id = ?", caseId);
    }
  });

  it("logs recurring_task_template.deleted with the deleted template's id", async () => {
    let templateId: string | undefined;
    try {
      const template = await recurrenceService.registerTemplate({
        title: "deletable logging check",
        priority: "low",
        caseAnchor: "case_start",
        caseOffsetDays: 0,
        nonBusinessDayPolicy: "as_is",
        workspaceId,
      });
      templateId = template.id;

      await recurrenceService.deleteTemplate(template.id, workspaceId, "req-template-delete");

      const logged = findEvent("recurring_task_template.deleted");
      expect(logged?.entityId).toBe(template.id);
      expect(logged?.requestId).toBe("req-template-delete");
    } finally {
      if (templateId) await db.$executeRawUnsafe("DELETE FROM recurring_task_templates WHERE id = ?", templateId);
    }
  });

  it("logs non_business_day.deleted with the deleted record's id", async () => {
    let holidayId: string | undefined;
    try {
      const holiday = await holidaysService.register({
        date: `2037-0${Math.floor(Math.random() * 8) + 1}-15`,
        workspaceId,
      });
      holidayId = holiday.id;

      await holidaysService.remove(holiday.id, workspaceId, "req-holiday-delete");

      const logged = findEvent("non_business_day.deleted");
      expect(logged?.entityId).toBe(holiday.id);
      expect(logged?.requestId).toBe("req-holiday-delete");
    } finally {
      if (holidayId) await db.$executeRawUnsafe("DELETE FROM non_business_days WHERE id = ?", holidayId);
    }
  });
});
