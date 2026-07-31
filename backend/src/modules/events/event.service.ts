// EventsService (task 5.1, design.md "Backend/events", Requirements 4.1-4.3,
// 7.2, 9.1-9.4). Same throw-based error pattern as UsersService/
// DeliveriesService (design.md's EventsService interface returns plain
// Promises, not `Result<T, E>`).
import { Prisma } from "@prisma/client";
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
        throw badRequest("deliveryId or assigneeUserId does not exist");
      }
      throw error;
    }
  },

  async delete(eventId: string): Promise<void> {
    try {
      await eventRepository.delete(eventId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Event not found: ${eventId}`);
      }
      throw error;
    }
  },

  list(filter: EventListFilter): Promise<Event[]> {
    return eventRepository.list(filter);
  },
};
