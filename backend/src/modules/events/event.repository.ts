// Persistence for Events (task 5.1, design.md "Backend/events"). Soft-delete
// / audit-column behavior and the default `deletedAt: null` list filter come
// from the shared `db` client (task 1.4).
import { db } from "../../shared/db.js";
import type { CreateEventInput, Event, EventListFilter } from "./event.types.js";

export const eventRepository = {
  create(input: CreateEventInput): Promise<Event> {
    return db.event.create({
      data: {
        title: input.title,
        occursAt: input.occursAt,
        caseId: input.caseId,
        assigneeUserId: input.assigneeUserId,
      },
    });
  },

  delete(id: string): Promise<Event> {
    return db.event.delete({ where: { id } });
  },

  list(filter: EventListFilter): Promise<Event[]> {
    return db.event.findMany({
      where: { assigneeUserId: filter.assigneeUserId },
      orderBy: { occursAt: "asc" },
    });
  },
};
