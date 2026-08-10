import type { User } from "@prisma/client";
import { db } from "../../shared/db.js";

type UserListRecord = Pick<User, "id" | "email" | "name" | "createdAt" | "updatedAt">;

const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const userRepository = {
  list(): Promise<UserListRecord[]> {
    return db.user.findMany({
      orderBy: { createdAt: "asc" },
      select: publicUserSelect,
    });
  },

  // MySQL utf8mb4_unicode_ci makes contains case-insensitive via collation;
  // Prisma mode: 'insensitive' is not used (PostgreSQL-oriented).
  search(query: string): Promise<UserListRecord[]> {
    return db.user.findMany({
      where: {
        OR: [{ name: { contains: query } }, { email: { contains: query } }],
      },
      orderBy: { createdAt: "asc" },
      select: publicUserSelect,
    });
  },
};
