import { db } from "../../shared/db.js";
import type { AuthUser } from "./auth.types.js";

export const authRepository = {
  create(data: { email: string; name: string; passwordHash: string }): Promise<AuthUser> {
    return db.user.create({ data });
  },

  findByEmail(email: string): Promise<AuthUser | null> {
    return db.user.findUnique({ where: { email } });
  },

  findById(id: string): Promise<AuthUser | null> {
    return db.user.findUnique({ where: { id } });
  },
};
