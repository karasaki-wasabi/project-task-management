// Persistence for Users (task 2.1, design.md "Backend/users"). All soft-delete
// / audit-column behavior comes from the shared `db` client (task 1.4); this
// layer only shapes the queries.
import { db } from "../../shared/db.js";
import type { User } from "./user.types.js";

export const userRepository = {
  create(name: string, email: string, passwordHash: string): Promise<User> {
    return db.user.create({ data: { name, email, passwordHash } });
  },

  list(): Promise<User[]> {
    return db.user.findMany({ orderBy: { createdAt: "asc" } });
  },

  // Delegates to the soft-delete extension's `delete()`, which issues an
  // UPDATE setting deleted_at rather than a physical DELETE.
  delete(id: string): Promise<User> {
    return db.user.delete({ where: { id } });
  },
};
