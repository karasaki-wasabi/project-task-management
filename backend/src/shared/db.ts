import { PrismaClient } from "@prisma/client";
import { withSoftDelete } from "./soft-delete.repository.js";

export const db = withSoftDelete(new PrismaClient());
