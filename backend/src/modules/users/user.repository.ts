import type { User } from "@prisma/client";
import { db } from "../../shared/db.js";

type UserListRecord = Pick<User, "id" | "email" | "name" | "createdAt" | "updatedAt">;

export const userRepository = {
  list(): Promise<UserListRecord[]> {
    return db.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },
};
