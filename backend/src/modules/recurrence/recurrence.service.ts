// RecurrenceService: template management (task 9.1, design.md
// "Backend/recurrence", Requirements 5.6, 5.7, 8.3, 9.1-9.4). Instance
// generation (`generateDueInstances`, `onDeliveryCreated`,
// `onDeliveryDueDateChanged`) is added in task 9.2.
import { Prisma } from "@prisma/client";
import { badRequest, notFound } from "../../shared/http-errors.js";
import { recurrenceRepository } from "./recurrence.repository.js";
import type { RecurringTaskTemplate, RegisterTemplateInput } from "./recurrence.types.js";

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

// design.md RecurrenceService Preconditions.
function validateRegisterInput(input: RegisterTemplateInput): void {
  if (input.title.trim().length === 0) {
    throw badRequest("title is required");
  }
  if (input.kind === "fixed_interval") {
    if (!input.intervalUnit || input.intervalValue === undefined) {
      throw badRequest("fixed_interval templates require intervalUnit and intervalValue");
    }
    if (!Number.isInteger(input.intervalValue) || input.intervalValue < 1) {
      throw badRequest("intervalValue must be a positive integer");
    }
  } else {
    if (input.deliveryOffsetDays === undefined) {
      throw badRequest("delivery_relative templates require deliveryOffsetDays");
    }
    if (!Number.isInteger(input.deliveryOffsetDays) || input.deliveryOffsetDays < 0) {
      throw badRequest("deliveryOffsetDays must be a non-negative integer");
    }
    // design.md Logical Data Model: boundDeliveryId is only settable when
    // kind="fixed_interval"; delivery_relative is always a global setting.
    if (input.boundDeliveryId !== undefined) {
      throw badRequest("boundDeliveryId cannot be set on a delivery_relative template");
    }
  }
}

export const recurrenceService = {
  async registerTemplate(input: RegisterTemplateInput): Promise<RecurringTaskTemplate> {
    validateRegisterInput(input);
    return recurrenceRepository.create({ ...input, title: input.title.trim() });
  },

  async stopTemplate(templateId: string): Promise<void> {
    try {
      await recurrenceRepository.stop(templateId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Recurring task template not found: ${templateId}`);
      }
      throw error;
    }
  },

  async deleteTemplate(templateId: string): Promise<void> {
    try {
      await recurrenceRepository.remove(templateId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Recurring task template not found: ${templateId}`);
      }
      throw error;
    }
  },

  list(): Promise<RecurringTaskTemplate[]> {
    return recurrenceRepository.list();
  },
};
