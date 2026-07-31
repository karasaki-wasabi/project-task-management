// Validation: 結合検証 (task 12.4-12.7). These exercise the already-approved
// service-level behaviors (tasks 9.2, 9.3, 10.1, 9.5) through the actual
// HTTP layer (buildApp + inject) rather than calling services directly, to
// prove the full request/response/log path end-to-end — the specific gap
// this validation phase is meant to close.
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { db } from "./shared/db.js";
import { createLogger } from "./shared/logger.js";
import { setBusinessEventLoggerForTests } from "./shared/business-event-logger.js";
import { setClientErrorLoggerForTests } from "./modules/client-errors/client-error.service.js";

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
        if (line.length > 0) lines.push(JSON.parse(line));
      }
      callback();
    },
  });
  return { stream, lines };
}

function buildTestApp() {
  const { stream, lines } = collectingStream();
  const logger = createLogger("debug", stream);
  setBusinessEventLoggerForTests(logger);
  setClientErrorLoggerForTests(logger);
  const app = buildApp({ DATABASE_URL: "mysql://user:pass@localhost:3306/db", LOG_LEVEL: "debug", PORT: 3000 }, logger);
  return { app, lines };
}

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

afterAll(async () => {
  await db.$disconnect();
});

describe("12.4: 繰り返しタスク生成の統合検証 (Requirements 5.1, 5.3, 5.5, 5.6)", () => {
  it("POST /api/deliveries triggers delivery_relative generation end-to-end (Requirement 5.3)", async () => {
    const { app } = buildTestApp();
    const template = await app
      .inject({
        method: "POST",
        url: "/api/recurring-templates",
        payload: {
          title: "e2e delivery-relative",
          priority: "low",
          kind: "delivery_relative",
          deliveryOffsetDays: 2,
          nonBusinessDayPolicy: "as_is",
        },
      })
      .then((r) => r.json());

    const delivery = await app
      .inject({ method: "POST", url: "/api/deliveries", payload: { name: "e2e delivery", dueDate: "2041-03-10" } })
      .then((r) => r.json());

    const tasksResponse = await app.inject({ method: "GET", url: `/api/tasks?deliveryId=${delivery.id}` });
    const tasks = tasksResponse.json();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].sourceTemplateId).toBe(template.id);
    expect(tasks[0].scheduledDate.slice(0, 10)).toBe("2041-03-08");

    await hardDelete("tasks", [tasks[0].id]);
    await hardDelete("deliveries", [delivery.id]);
    await hardDelete("recurring_task_templates", [template.id]);
    await app.close();
  });

  it("POST /api/recurring-templates/generate-due generates fixed_interval instances, idempotently on rerun (Requirements 5.1, 5.5, 5.6)", async () => {
    const { app } = buildTestApp();
    const template = await app
      .inject({
        method: "POST",
        url: "/api/recurring-templates",
        payload: {
          title: "e2e fixed-interval",
          priority: "low",
          kind: "fixed_interval",
          intervalUnit: "day",
          intervalValue: 1,
          nonBusinessDayPolicy: "as_is",
        },
      })
      .then((r) => r.json());
    await db.$executeRawUnsafe(
      "UPDATE recurring_task_templates SET created_at = ? WHERE id = ?",
      new Date("2041-04-01T00:00:00.000Z"),
      template.id,
    );
    const asOf = "2041-04-02T00:00:00.000Z";

    const firstRun = await app
      .inject({ method: "POST", url: "/api/recurring-templates/generate-due", payload: { asOf } })
      .then((r) => r.json());
    const secondRun = await app
      .inject({ method: "POST", url: "/api/recurring-templates/generate-due", payload: { asOf } })
      .then((r) => r.json());

    const mine = (list: Array<{ sourceTemplateId: string }>) => list.filter((t) => t.sourceTemplateId === template.id);
    expect(mine(firstRun)).toHaveLength(2);
    expect(mine(secondRun)).toHaveLength(0);

    const all = await db.task.findMany({ where: { sourceTemplateId: template.id } });
    expect(all).toHaveLength(2);

    await hardDelete("tasks", all.map((t) => t.id));
    await hardDelete("recurring_task_templates", [template.id]);
    await app.close();
  });
});

describe("12.5: 非営業日ポリシー4パターンの統合検証 (Requirements 8.4-8.7)", () => {
  const scenarios: Array<{
    policy: "as_is" | "skip" | "next_business_day" | "previous_business_day";
    holidayDate: string;
    expectedScheduledDate: string | null;
  }> = [
    { policy: "as_is", holidayDate: "2041-05-01", expectedScheduledDate: "2041-05-01" },
    { policy: "skip", holidayDate: "2041-05-02", expectedScheduledDate: null },
    { policy: "next_business_day", holidayDate: "2041-05-03", expectedScheduledDate: "2041-05-04" },
    { policy: "previous_business_day", holidayDate: "2041-05-04", expectedScheduledDate: "2041-05-03" },
  ];

  for (const scenario of scenarios) {
    it(`policy=${scenario.policy}: generation result matches the spec via the real API`, async () => {
      const { app } = buildTestApp();
      const holiday = await app
        .inject({ method: "POST", url: "/api/holidays", payload: { date: scenario.holidayDate } })
        .then((r) => r.json());
      const template = await app
        .inject({
          method: "POST",
          url: "/api/recurring-templates",
          payload: {
            title: `e2e policy ${scenario.policy}`,
            priority: "low",
            kind: "fixed_interval",
            intervalUnit: "day",
            intervalValue: 1,
            nonBusinessDayPolicy: scenario.policy,
          },
        })
        .then((r) => r.json());
      await db.$executeRawUnsafe(
        "UPDATE recurring_task_templates SET created_at = ? WHERE id = ?",
        new Date(`${scenario.holidayDate}T00:00:00.000Z`),
        template.id,
      );

      const created = await app
        .inject({
          method: "POST",
          url: "/api/recurring-templates/generate-due",
          payload: { asOf: `${scenario.holidayDate}T00:00:00.000Z` },
        })
        .then((r) => r.json());
      const mine = created.filter((t: { sourceTemplateId: string }) => t.sourceTemplateId === template.id);

      if (scenario.expectedScheduledDate === null) {
        expect(mine).toHaveLength(0);
      } else {
        expect(mine).toHaveLength(1);
        expect(mine[0].scheduledDate.slice(0, 10)).toBe(scenario.expectedScheduledDate);
      }

      await hardDelete("tasks", mine.map((t: { id: string }) => t.id));
      await hardDelete("recurring_task_templates", [template.id]);
      await hardDelete("non_business_days", [holiday.id]);
      await app.close();
    });
  }
});

describe("12.6: 論理削除の一覧除外と消化数実績不変の統合検証 (Requirements 9.4, 9.5)", () => {
  it("a deleted task disappears from GET /api/tasks but still counts in its historical throughput period", async () => {
    const { app } = buildTestApp();
    const completedAt = new Date("2041-06-04T09:00:00.000Z"); // Wednesday
    const task = await db.task.create({
      data: { title: `e2e-throughput-${randomUUID()}`, priority: "low", status: "done", completedAt },
    });

    const before = await app
      .inject({ method: "GET", url: "/api/throughput?periodType=week&rangeCount=1" })
      .then((r) => r.json());

    const deleteResponse = await app.inject({ method: "DELETE", url: `/api/tasks/${task.id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await app.inject({ method: "GET", url: "/api/tasks" });
    expect(listResponse.json().some((t: { id: string }) => t.id === task.id)).toBe(false);

    const after = await app
      .inject({ method: "GET", url: "/api/throughput?periodType=week&rangeCount=1" })
      .then((r) => r.json());
    expect(after.periods[0].completedCount).toBe(before.periods[0].completedCount);

    await hardDelete("tasks", [task.id]);
    await app.close();
  });
});

describe("12.7: ログ相関とフロントエンドエラー記録の統合検証 (Requirements 10.3, 10.4, 10.5)", () => {
  it("a server-side exception logs the stack trace + requestId, correlated with the access log (Requirement 10.3, 10.5)", async () => {
    const { app, lines } = buildTestApp();

    const response = await app.inject({ method: "DELETE", url: `/api/events/${randomUUID()}` });

    expect(response.statusCode).toBe(404);
    const errorLine = lines.find((l) => l.err !== undefined);
    const accessLine = lines.find((l) => l.path?.toString().startsWith("/api/events/") && l.statusCode === 404);
    expect(errorLine).toBeTruthy();
    expect((errorLine?.err as Record<string, unknown>).stack).toEqual(expect.any(String));
    expect(errorLine?.requestId).toBe(accessLine?.requestId);

    await app.close();
  });

  it("POST /api/client-errors records a frontend-reported error in the same log format as a server error (Requirement 10.4)", async () => {
    const { app, lines } = buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/client-errors",
      payload: {
        message: "e2e client error",
        stack: "Error: e2e client error\n  at Component.vue:1:1",
        pageUrl: "https://app.example.com/tasks",
        occurredAt: new Date().toISOString(),
      },
    });

    expect(response.statusCode).toBe(204);
    const errorLine = lines.find((l) => (l.err as Record<string, unknown> | undefined)?.message === "e2e client error");
    expect(errorLine).toBeTruthy();
    expect((errorLine?.err as Record<string, unknown>).stack).toContain("Component.vue:1:1");
    expect(errorLine?.pageUrl).toBe("https://app.example.com/tasks");

    await app.close();
  });
});

describe("18.1: 開発段階マスタ削除時のタスク参照解除の統合検証 (Requirement 12.5)", () => {
  it("deleting a development stage via the real HTTP path resets referencing tasks' developmentStageId to null", async () => {
    const { app } = buildTestApp();

    const stage = await app
      .inject({ method: "POST", url: "/api/development-stages", payload: { name: `e2e stage ${randomUUID()}` } })
      .then((r) => r.json());
    const task = await app
      .inject({ method: "POST", url: "/api/tasks", payload: { title: "e2e stage task", priority: "low" } })
      .then((r) => r.json());
    await app.inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}/development-stage`,
      payload: { developmentStageId: stage.id },
    });

    const deleteResponse = await app.inject({ method: "DELETE", url: `/api/development-stages/${stage.id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const tasksResponse = await app.inject({ method: "GET", url: "/api/tasks" });
    const updatedTask = tasksResponse.json().find((t: { id: string }) => t.id === task.id);
    expect(updatedTask.developmentStageId).toBeNull();

    const stagesResponse = await app.inject({ method: "GET", url: "/api/development-stages" });
    expect(stagesResponse.json().some((s: { id: string }) => s.id === stage.id)).toBe(false);

    await hardDelete("tasks", [task.id]);
    await hardDelete("development_stages", [stage.id]);
    await app.close();
  });
});

describe("18.2: 開発段階更新時の担当者自動設定ルールの統合検証 (Requirements 12.6, 12.7, 12.8)", () => {
  it("sets the assignee together with the development stage when the task is unassigned", async () => {
    const { app } = buildTestApp();

    const user = await app
      .inject({ method: "POST", url: "/api/users", payload: { name: `e2e user ${randomUUID()}` } })
      .then((r) => r.json());
    const stage = await app
      .inject({ method: "POST", url: "/api/development-stages", payload: { name: `e2e stage ${randomUUID()}` } })
      .then((r) => r.json());
    const task = await app
      .inject({ method: "POST", url: "/api/tasks", payload: { title: "e2e unassigned task", priority: "low" } })
      .then((r) => r.json());

    const response = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}/development-stage`,
      payload: { developmentStageId: stage.id, assigneeUserId: user.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().developmentStageId).toBe(stage.id);
    expect(response.json().assigneeUserId).toBe(user.id);

    await hardDelete("tasks", [task.id]);
    await hardDelete("development_stages", [stage.id]);
    await hardDelete("users", [user.id]);
    await app.close();
  });

  it("does not overwrite an already-assigned task's assignee when only the development stage is moved", async () => {
    const { app } = buildTestApp();

    const originalAssignee = await app
      .inject({ method: "POST", url: "/api/users", payload: { name: `e2e original ${randomUUID()}` } })
      .then((r) => r.json());
    const otherUser = await app
      .inject({ method: "POST", url: "/api/users", payload: { name: `e2e other ${randomUUID()}` } })
      .then((r) => r.json());
    const stage = await app
      .inject({ method: "POST", url: "/api/development-stages", payload: { name: `e2e stage ${randomUUID()}` } })
      .then((r) => r.json());
    const task = await app
      .inject({
        method: "POST",
        url: "/api/tasks",
        payload: { title: "e2e already assigned task", priority: "low", assigneeUserId: originalAssignee.id },
      })
      .then((r) => r.json());

    const response = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}/development-stage`,
      payload: { developmentStageId: stage.id, assigneeUserId: otherUser.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().developmentStageId).toBe(stage.id);
    expect(response.json().assigneeUserId).toBe(originalAssignee.id);

    await hardDelete("tasks", [task.id]);
    await hardDelete("development_stages", [stage.id]);
    await hardDelete("users", [originalAssignee.id, otherUser.id]);
    await app.close();
  });
});
