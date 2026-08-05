// RED: caseRepository does not exist yet (task 3.1, design.md
// "Backend/cases" CaseRepository, Requirements 2.2, 2.5, 5.1, 8.1, 8.2).
// Integration test against real MySQL via shared/db.ts (this project's
// testing steering: no mocking of the DB layer).
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { caseRepository } from "./case.repository.js";

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

afterAll(async () => {
  await db.$disconnect();
});

describe("caseRepository (task 3.1)", () => {
  it("creates a case holding name/startDate/endDate, with isCompleted defaulting to false (Requirement 2.2, 2.5)", async () => {
    const startDate = new Date("2034-09-01");
    const endDate = new Date("2034-09-30");
    const created = await caseRepository.create({ name: `case-${randomUUID()}`, startDate, endDate });

    expect(created.startDate?.getTime()).toBe(startDate.getTime());
    expect(created.endDate.getTime()).toBe(endDate.getTime());
    expect(created.isCompleted).toBe(false);

    await hardDelete("cases", [created.id]);
  });

  it("creates a case without a startDate (Requirement 2.2)", async () => {
    const endDate = new Date("2034-10-31");
    const created = await caseRepository.create({ name: `no-start-${randomUUID()}`, endDate });

    expect(created.startDate).toBeNull();
    expect(created.endDate.getTime()).toBe(endDate.getTime());

    await hardDelete("cases", [created.id]);
  });

  it("finds a case by id", async () => {
    const created = await caseRepository.create({ name: `find-${randomUUID()}`, endDate: new Date("2034-11-01") });

    const found = await caseRepository.findById(created.id);
    expect(found?.id).toBe(created.id);

    await hardDelete("cases", [created.id]);
  });

  it("returns null for a non-existent id", async () => {
    const found = await caseRepository.findById(randomUUID());
    expect(found).toBeNull();
  });

  it("lists cases including a newly created one", async () => {
    const created = await caseRepository.create({ name: `list-${randomUUID()}`, endDate: new Date("2034-12-01") });

    const list = await caseRepository.list();
    expect(list.some((c) => c.id === created.id)).toBe(true);

    await hardDelete("cases", [created.id]);
  });

  it("updates each field of a case independently (Requirement 5.1)", async () => {
    const created = await caseRepository.create({
      name: `update-${randomUUID()}`,
      startDate: new Date("2035-01-01"),
      endDate: new Date("2035-01-31"),
    });

    const renamed = await caseRepository.update(created.id, { name: "renamed" });
    expect(renamed.name).toBe("renamed");
    expect(renamed.endDate.getTime()).toBe(created.endDate.getTime());

    const newStartDate = new Date("2035-01-10");
    const startDateChanged = await caseRepository.update(created.id, { startDate: newStartDate });
    expect(startDateChanged.startDate?.getTime()).toBe(newStartDate.getTime());

    const clearedStartDate = await caseRepository.update(created.id, { startDate: null });
    expect(clearedStartDate.startDate).toBeNull();

    const newEndDate = new Date("2035-02-15");
    const endDateChanged = await caseRepository.update(created.id, { endDate: newEndDate });
    expect(endDateChanged.endDate.getTime()).toBe(newEndDate.getTime());

    const completed = await caseRepository.update(created.id, { isCompleted: true });
    expect(completed.isCompleted).toBe(true);

    await hardDelete("cases", [created.id]);
  });

  it("deletes a case and detaches (does not cascade-delete) linked Task/Event records (Requirement 8.1, 8.2)", async () => {
    const created = await caseRepository.create({ name: `delete-${randomUUID()}`, endDate: new Date("2035-03-01") });
    const linkedTask = await db.task.create({ data: { title: "keep me", priority: "low", caseId: created.id } });
    const linkedEvent = await db.event.create({
      data: { title: "keep me too", occursAt: new Date("2035-03-02T01:00:00"), caseId: created.id },
    });

    await caseRepository.delete(created.id);

    const survivingTask = await db.task.findUnique({ where: { id: linkedTask.id } });
    expect(survivingTask).not.toBeNull();
    expect(survivingTask?.caseId).toBeNull();

    const survivingEvent = await db.event.findUnique({ where: { id: linkedEvent.id } });
    expect(survivingEvent).not.toBeNull();
    expect(survivingEvent?.caseId).toBeNull();

    const deletedCase = await db.case.findFirst({ where: { id: created.id, deletedAt: { not: null } } });
    expect(deletedCase).not.toBeNull();

    await hardDelete("tasks", [linkedTask.id]);
    await hardDelete("events", [linkedEvent.id]);
    await hardDelete("cases", [created.id]);
  });

  it("counts required tasks and required completed tasks for a case", async () => {
    const created = await caseRepository.create({ name: `progress-${randomUUID()}`, endDate: new Date("2035-04-01") });
    const [requiredDone, requiredOpen, optional] = await Promise.all([
      db.task.create({ data: { title: "required done", priority: "low", caseId: created.id, isRequiredForCase: true, status: "done" } }),
      db.task.create({ data: { title: "required open", priority: "low", caseId: created.id, isRequiredForCase: true } }),
      db.task.create({ data: { title: "optional", priority: "low", caseId: created.id, isRequiredForCase: false } }),
    ]);

    const requiredTotal = await caseRepository.countRequiredTasks(created.id);
    const requiredCompleted = await caseRepository.countRequiredCompletedTasks(created.id);

    expect(requiredTotal).toBe(2);
    expect(requiredCompleted).toBe(1);

    await hardDelete("tasks", [requiredDone.id, requiredOpen.id, optional.id]);
    await hardDelete("cases", [created.id]);
  });
});
