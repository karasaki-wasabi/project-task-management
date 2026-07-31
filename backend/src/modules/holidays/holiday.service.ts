// HolidaysService manual-management core (task 6.1, design.md
// "Backend/holidays", Requirements 8.1, 8.2, 9.1-9.4). External-API sync
// (`syncFromExternalApi`, requirements 8.8/8.9) is added in task 6.2.
import { Prisma } from "@prisma/client";
import { HttpError, badRequest, notFound } from "../../shared/http-errors.js";
import { holidayRepository } from "./holiday.repository.js";
import type { NonBusinessDay, RegisterNonBusinessDayInput } from "./holiday.types.js";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function assertValidDate(date: string): void {
  if (!DATE_ONLY_PATTERN.test(date) || Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime())) {
    throw badRequest(`date must be a valid ISO 8601 date (YYYY-MM-DD): ${date}`);
  }
}

function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export const holidaysService = {
  async register(input: RegisterNonBusinessDayInput, source: "manual" | "external_api" = "manual"): Promise<NonBusinessDay> {
    assertValidDate(input.date);
    try {
      return await holidayRepository.register(input, source);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new HttpError(409, `A non-business day is already registered for ${input.date}`);
      }
      throw error;
    }
  },

  async remove(id: string): Promise<void> {
    try {
      await holidayRepository.remove(id);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Non-business day not found: ${id}`);
      }
      throw error;
    }
  },

  list(): Promise<NonBusinessDay[]> {
    return holidayRepository.list();
  },

  async isBusinessDay(date: string): Promise<boolean> {
    assertValidDate(date);
    return !(await holidayRepository.existsOnDate(date));
  },

  // design.md Postconditions: steps day-by-day, starting the day AFTER
  // `date`, until a non-holiday is found (Requirement 8.4).
  async nextBusinessDay(date: string): Promise<string> {
    assertValidDate(date);
    let candidate = addDays(date, 1);
    while (await holidayRepository.existsOnDate(candidate)) {
      candidate = addDays(candidate, 1);
    }
    return candidate;
  },

  // Mirror of nextBusinessDay, stepping backward from the day BEFORE `date`
  // (Requirement 8.5).
  async previousBusinessDay(date: string): Promise<string> {
    assertValidDate(date);
    let candidate = addDays(date, -1);
    while (await holidayRepository.existsOnDate(candidate)) {
      candidate = addDays(candidate, -1);
    }
    return candidate;
  },
};
