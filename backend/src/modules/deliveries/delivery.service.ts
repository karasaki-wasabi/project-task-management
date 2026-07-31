// DeliveriesService (task 4.1, design.md "Backend/deliveries", Requirements
// 3.1-3.7, 9.1-9.4). RecurrenceService is not notified from here yet — that
// wiring is task 10.1's job (design.md "この時点ではRecurrenceServiceへの
// 通知は行わない" per tasks.md).
import { Prisma } from "@prisma/client";
import { badRequest, notFound } from "../../shared/http-errors.js";
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
    return deliveryRepository.create({ name, dueDate: input.dueDate });
  },

  async updateDueDate(deliveryId: string, dueDate: Date): Promise<Delivery> {
    if (!isValidDate(dueDate)) {
      throw badRequest("dueDate is invalid");
    }
    try {
      return await deliveryRepository.updateDueDate(deliveryId, dueDate);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Delivery not found: ${deliveryId}`);
      }
      throw error;
    }
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
