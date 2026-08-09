import { userRepository } from "./user.repository.js";
import type { PublicUser } from "./user.types.js";

export const usersService = {
  async list(): Promise<PublicUser[]> {
    const users = await userRepository.list();
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    }));
  },
};
