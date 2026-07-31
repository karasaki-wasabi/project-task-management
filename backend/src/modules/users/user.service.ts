// UsersService (task 2.1, design.md "Backend/users", Requirements 7.1, 7.3,
// 9.1-9.4). No authentication: this only supports selecting from a list of
// pre-registered users (Requirement 7.3 / Non-Goal: no login).
import { Prisma } from "@prisma/client";
import { badRequest, notFound } from "../../shared/http-errors.js";
import { userRepository } from "./user.repository.js";
import type { User } from "./user.types.js";

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export const usersService = {
  async create(name: string): Promise<User> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw badRequest("name is required");
    }
    return userRepository.create(trimmed);
  },

  list(): Promise<User[]> {
    return userRepository.list();
  },

  async delete(userId: string): Promise<void> {
    try {
      await userRepository.delete(userId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`User not found: ${userId}`);
      }
      throw error;
    }
  },
};
