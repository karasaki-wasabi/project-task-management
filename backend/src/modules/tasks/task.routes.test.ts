// RED: taskRoutes does not exist yet (task 3.1, design.md "Backend/tasks"
// API Contract). Registration into the main app.ts happens in task 10.3;
// this test mounts the plugin on a throwaway Fastify instance.
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { taskRoutes } from "./task.routes.js";

async function hardDeleteTasks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM tasks WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(taskRoutes);
  return app;
}

afterAll(async () => {
  await db.$disconnect();
});

describe("taskRoutes (task 3.1)", () => {
  it("POST /api/tasks creates a task and returns 201", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "route task", priority: "medium" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.title).toBe("route task");
    expect(body.status).toBe("not_started");

    await hardDeleteTasks([body.id]);
    await app.close();
  });

  it("POST /api/tasks returns 400 for an empty title", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "", priority: "low" },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("PATCH /api/tasks/:id/status updates status, returns 404 for unknown id", async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "patchable", priority: "high" },
    });
    const { id } = created.json();

    const okResponse = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${id}/status`,
      payload: { status: "on_hold" },
    });
    expect(okResponse.statusCode).toBe(200);
    expect(okResponse.json().status).toBe("on_hold");

    const missingResponse = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${randomUUID()}/status`,
      payload: { status: "done" },
    });
    expect(missingResponse.statusCode).toBe(404);

    await hardDeleteTasks([id]);
    await app.close();
  });

  it("GET /api/tasks lists tasks and excludes deleted ones", async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "listable", priority: "low" },
    });
    const { id } = created.json();

    const deleteResponse = await app.inject({ method: "DELETE", url: `/api/tasks/${id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await app.inject({ method: "GET", url: "/api/tasks" });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().some((t: { id: string }) => t.id === id)).toBe(false);

    await hardDeleteTasks([id]);
    await app.close();
  });

  it("DELETE /api/tasks/:id returns 404 for a non-existent task", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "DELETE", url: `/api/tasks/${randomUUID()}` });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
