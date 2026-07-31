// User re-exported from the Prisma-generated type (task 2.1, design.md
// "Backend/users"). Users has no domain-specific enums/status, unlike
// tasks/recurrence, so this file only establishes the module's type entry
// point for consistency with the repository -> service -> routes pattern.
export type { User } from "@prisma/client";
