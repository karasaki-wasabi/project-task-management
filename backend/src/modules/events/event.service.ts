// EventsService (task 5.1 core + task 10.2 business event logging,
// design.md "Backend/events", Requirements 4.1-4.3, 7.2, 9.1-9.4, 10.2).
// Same throw-based error pattern as UsersService/DeliveriesService
// (design.md's EventsService interface returns plain Promises, not
// `Result<T, E>`).
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { badRequest, notFound } from "../../shared/http-errors.js";
import { eventRepository } from "./event.repository.js";
import type { CreateEventInput, Event, EventListFilter } from "./event.types.js";

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

export const eventsService = {
  async create(input: CreateEventInput): Promise<Event> {
    const title = input.title.trim();
    if (title.length === 0) {
      throw badRequest("title is required");
    }
    if (Number.isNaN(input.occursAt.getTime())) {
      throw badRequest("occursAt is invalid");
    }

    try {
      return await eventRepository.create({ ...input, title });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw badRequest("caseId or assigneeUserId does not exist");
      }
      throw error;
    }
  },

  async delete(eventId: string, requestId: string = randomUUID()): Promise<void> {
    try {
      await eventRepository.delete(eventId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Event not found: ${eventId}`);
      }
      throw error;
    }
    businessEventLogger.logBusinessEvent("event.deleted", { requestId, entityId: eventId });
  },

  list(filter: EventListFilter): Promise<Event[]> {
    return eventRepository.list(filter);
  },
};
