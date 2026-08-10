import { userRepository } from "./user.repository.js";
import type { PublicUser } from "./user.types.js";

function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export const usersService = {
  async list(): Promise<PublicUser[]> {
    const users = await userRepository.list();
    return users.map(toPublicUser);
  },

  async search(query: string): Promise<PublicUser[]> {
    const trimmed = query.trim();
    if (trimmed === "") {
      return [];
    }
    const users = await userRepository.search(trimmed);
    return users.map(toPublicUser);
  },
};
