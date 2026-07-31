// RED: recurrenceRoutes does not exist yet (task 9.1). Registration into the
// main app.ts happens in task 10.3; this test mounts the plugin on a
// throwaway Fastify instance.
//
// Note: design.md's API Contract table for RecurrenceService lists only
// POST /api/recurring-templates, POST /:id/stop, DELETE /:id, and
// POST /generate-due — it omits a GET/list endpoint. But task 9.1 itself
// explicitly requires "登録したテンプレートが一覧から取得できることを確認
// できる状態にする" (registered templates must be retrievable from a
// list), and every other module in this codebase exposes GET <collection>.
// This is the same kind of design.md documentation gap as task 4.1's
// Postconditions/Data-Models contradiction: resolved here by adding
// GET /api/recurring-templates, consistent with the established per-module
// pattern and the task's own explicit acceptance bullet.
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { recurrenceRoutes } from "./recurrence.routes.js";

async function hardDelete(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(
    `DELETE FROM recurring_task_templates WHERE id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
}

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(recurrenceRoutes);
  return app;
}

afterAll(async () => {
  await db.$disconnect();
});

describe("recurrenceRoutes (task 9.1)", () => {
  it("POST /api/recurring-templates registers a template and returns 201", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/recurring-templates",
      payload: {
        title: "route template",
        priority: "medium",
        kind: "fixed_interval",
        intervalUnit: "week",
        intervalValue: 1,
        nonBusinessDayPolicy: "as_is",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().title).toBe("route template");

    await hardDelete([response.json().id]);
    await app.close();
  });

  it("POST /api/recurring-templates returns 400 for an invalid combination", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/recurring-templates",
      payload: { title: "bad", priority: "low", kind: "fixed_interval", nonBusinessDayPolicy: "as_is" },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("POST /api/recurring-templates/:id/stop deactivates a template, returns 404 for unknown id", async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/recurring-templates",
      payload: {
        title: "stoppable",
        priority: "low",
        kind: "fixed_interval",
        intervalUnit: "day",
        intervalValue: 1,
        nonBusinessDayPolicy: "as_is",
      },
    });
    const { id } = created.json();

    const stopResponse = await app.inject({ method: "POST", url: `/api/recurring-templates/${id}/stop` });
    expect(stopResponse.statusCode).toBe(204);

    const missingResponse = await app.inject({
      method: "POST",
      url: `/api/recurring-templates/${randomUUID()}/stop`,
    });
    expect(missingResponse.statusCode).toBe(404);

    await hardDelete([id]);
    await app.close();
  });

  it("GET /api/recurring-templates lists registered templates and excludes deleted ones", async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/recurring-templates",
      payload: {
        title: "listable",
        priority: "low",
        kind: "fixed_interval",
        intervalUnit: "month",
        intervalValue: 1,
        nonBusinessDayPolicy: "skip",
      },
    });
    const { id } = created.json();

    const deleteResponse = await app.inject({ method: "DELETE", url: `/api/recurring-templates/${id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await app.inject({ method: "GET", url: "/api/recurring-templates" });
    expect(listResponse.json().some((t: { id: string }) => t.id === id)).toBe(false);

    await hardDelete([id]);
    await app.close();
  });

  it("DELETE /api/recurring-templates/:id returns 404 for a non-existent template", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "DELETE", url: `/api/recurring-templates/${randomUUID()}` });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
