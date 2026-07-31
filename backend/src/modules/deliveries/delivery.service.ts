// DeliveriesService (task 4.1 core + task 10.1 RecurrenceService wiring,
// design.md "Backend/deliveries", Requirements 3.1-3.7, 5.3, 5.4, 9.1-9.4).
import { Prisma } from "@prisma/client";
import { badRequest, notFound } from "../../shared/http-errors.js";
import { recurrenceService } from "../recurrence/recurrence.service.js";
import { deliveryRepository } from "./delivery.repository.js";
import type { CreateDeliveryInput, Delivery, DeliveryProgress } from "./delivery.types.js";

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

export const deliveriesService = {
  async create(input: CreateDeliveryInput): Promise<Delivery> {
    const name = input.name.trim();
    if (name.length === 0) {
      throw badRequest("name is required");
    }
    if (!isValidDate(input.dueDate)) {
      throw badRequest("dueDate is invalid");
    }
    // design.md DeliveriesService Implementation Notes: past dueDates are
    // allowed (recording deliveries that have already passed).
    const delivery = await deliveryRepository.create({ name, dueDate: input.dueDate });
    // design.md System Flow "繰り返しタスクインスタンス生成(納品連動)":
    // synchronous call, Requirement 5.3.
    await recurrenceService.onDeliveryCreated(delivery);
    return delivery;
  },

  async updateDueDate(deliveryId: string, dueDate: Date): Promise<Delivery> {
    if (!isValidDate(dueDate)) {
      throw badRequest("dueDate is invalid");
    }
    let delivery: Delivery;
    try {
      delivery = await deliveryRepository.updateDueDate(deliveryId, dueDate);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Delivery not found: ${deliveryId}`);
      }
      throw error;
    }
    // Requirement 5.4: recalculates incomplete auto-generated instances;
    // completed ones are left untouched (RecurrenceService's own guarantee).
    await recurrenceService.onDeliveryDueDateChanged(delivery);
    return delivery;
  },

  async getProgress(deliveryId: string): Promise<DeliveryProgress> {
    const delivery = await deliveryRepository.findById(deliveryId);
    if (!delivery) {
      throw notFound(`Delivery not found: ${deliveryId}`);
    }

    const [requiredTotal, requiredCompleted] = await Promise.all([
      deliveryRepository.countRequiredTasks(deliveryId),
      deliveryRepository.countRequiredCompletedTasks(deliveryId),
    ]);
    const requiredIncomplete = requiredTotal - requiredCompleted;

    return {
      requiredTotal,
      requiredCompleted,
      requiredIncomplete,
      isOverdueWithIncomplete: requiredIncomplete > 0 && delivery.dueDate.getTime() < Date.now(),
    };
  },

  async delete(deliveryId: string): Promise<void> {
    try {
      await deliveryRepository.delete(deliveryId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Delivery not found: ${deliveryId}`);
      }
      throw error;
    }
  },

  list(): Promise<Delivery[]> {
    return deliveryRepository.list();
  },
};
