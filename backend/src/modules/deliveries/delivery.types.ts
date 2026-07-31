// Delivery domain types (task 4.1, design.md "Backend/deliveries" Service
// Interface). No custom TaskError-style union here: design.md's
// DeliveriesService interface returns plain Promises and signals failure by
// throwing (same pattern as UsersService, task 2.1), not `Result<T, E>`.
export type { Delivery } from "@prisma/client";

export interface CreateDeliveryInput {
  name: string;
  dueDate: Date;
}

export interface DeliveryProgress {
  requiredTotal: number;
  requiredCompleted: number;
  requiredIncomplete: number;
  isOverdueWithIncomplete: boolean;
}
