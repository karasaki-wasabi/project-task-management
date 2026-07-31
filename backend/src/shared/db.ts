// Single shared Prisma client, wrapped by the soft-delete convention from
// task 1.4, so every module's repository talks to the same connection pool
// and gets updated_at/deleted_at handling for free.
import { PrismaClient } from "@prisma/client";
import { withSoftDelete } from "./soft-delete.repository.js";

export const db = withSoftDelete(new PrismaClient());
