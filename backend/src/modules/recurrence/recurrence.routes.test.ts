// HTTP routes for RecurrenceService template management (task 2.1).
// Mounts the plugin on a throwaway Fastify instance.
//
// Cleanup policy: every `it()` deletes its own rows in a `finally` block —
// see recurrence.service.test.ts's header comment.
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { recurrenceRoutes } from "./recurrence.routes.js";

async function hardDeleteTemplates(ids: string[]): Promise<void> {
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

const validPayload = {
  title: "route template",
  priority: "medium" as const,
  caseAnchor: "case_end" as const,
  caseOffsetDays: 2,
  defaultMemo: "default note",
  nonBusinessDayPolicy: "as_is" as const,
};

afterAll(async () => {
  await db.$disconnect();
});

describe("recurrenceRoutes (task 2.1)", () => {
  it("POST /api/recurring-templates registers a case-relative template and returns 201", async () => {
    const app = await buildTestApp();
    const templateIds: string[] = [];
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/recurring-templates",
        payload: validPayload,
      });
      if (response.statusCode === 201) templateIds.push(response.json().id);

      expect(response.statusCode).toBe(201);
      expect(response.json().title).toBe("route template");
      expect(response.json().caseAnchor).toBe("case_end");
      expect(response.json().caseOffsetDays).toBe(2);
      expect(response.json().defaultMemo).toBe("default note");
      expect(response.json()).not.toHaveProperty("kind");
    } finally {
      await hardDeleteTemplates(templateIds);
      await app.close();
    }
  });

  it("POST /api/recurring-templates returns 400 for invalid input (negative offset / missing fields)", async () => {
    const app = await buildTestApp();
    try {
      const negative = await app.inject({
        method: "POST",
        url: "/api/recurring-templates",
        payload: { ...validPayload, caseOffsetDays: -1 },
      });
      expect(negative.statusCode).toBe(400);

      const fixedIntervalShape = await app.inject({
        method: "POST",
        url: "/api/recurring-templates",
        payload: {
          title: "legacy",
          priority: "low",
          kind: "fixed_interval",
          intervalUnit: "day",
          intervalValue: 1,
          nonBusinessDayPolicy: "as_is",
        },
      });
      expect(fixedIntervalShape.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("POST /api/recurring-templates/:id/stop and /resume deactivate and reactivate a template", async () => {
    const app = await buildTestApp();
    const templateIds: string[] = [];
    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/recurring-templates",
        payload: { ...validPayload, title: "stoppable" },
      });
      expect(created.statusCode).toBe(201);
      const { id } = created.json();
      templateIds.push(id);

      const stopResponse = await app.inject({ method: "POST", url: `/api/recurring-templates/${id}/stop` });
      expect(stopResponse.statusCode).toBe(204);

      const resumeResponse = await app.inject({ method: "POST", url: `/api/recurring-templates/${id}/resume` });
      expect(resumeResponse.statusCode).toBe(204);

      const listResponse = await app.inject({ method: "GET", url: "/api/recurring-templates" });
      const found = listResponse.json().find((t: { id: string; isActive: boolean }) => t.id === id);
      expect(found?.isActive).toBe(true);

      const missingStop = await app.inject({
        method: "POST",
        url: `/api/recurring-templates/${randomUUID()}/stop`,
      });
      expect(missingStop.statusCode).toBe(404);

      const missingResume = await app.inject({
        method: "POST",
        url: `/api/recurring-templates/${randomUUID()}/resume`,
      });
      expect(missingResume.statusCode).toBe(404);
    } finally {
      await hardDeleteTemplates(templateIds);
      await app.close();
    }
  });

  it("GET /api/recurring-templates lists registered templates and excludes deleted ones", async () => {
    const app = await buildTestApp();
    const templateIds: string[] = [];
    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/recurring-templates",
        payload: { ...validPayload, title: "listable", nonBusinessDayPolicy: "skip" },
      });
      expect(created.statusCode).toBe(201);
      const { id } = created.json();
      templateIds.push(id);

      const deleteResponse = await app.inject({ method: "DELETE", url: `/api/recurring-templates/${id}` });
      expect(deleteResponse.statusCode).toBe(204);

      const listResponse = await app.inject({ method: "GET", url: "/api/recurring-templates" });
      expect(listResponse.json().some((t: { id: string }) => t.id === id)).toBe(false);
    } finally {
      await hardDeleteTemplates(templateIds);
      await app.close();
    }
  });

  it("DELETE /api/recurring-templates/:id returns 404 for a non-existent template", async () => {
    const app = await buildTestApp();
    try {
      const response = await app.inject({ method: "DELETE", url: `/api/recurring-templates/${randomUUID()}` });
      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("POST /api/recurring-templates/generate-due is removed (Requirement 1.2)", async () => {
    const app = await buildTestApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/recurring-templates/generate-due",
        payload: { asOf: "2035-01-03T00:00:00.000Z" },
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
