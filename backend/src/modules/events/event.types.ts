// Event domain types (task 5.1, design.md "Backend/events" Service
// Interface). Deliberately has no status field — Requirement 4.3 forbids
// task-like completion status on events.
export type { Event } from "@prisma/client";

export interface CreateEventInput {
  title: string;
  occursAt: Date;
  deliveryId?: string;
  assigneeUserId?: string;
}

export interface EventListFilter {
  assigneeUserId?: string;
}
