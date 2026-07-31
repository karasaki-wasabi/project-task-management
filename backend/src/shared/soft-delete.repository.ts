// Common soft-delete Repository convention shared by every module (task 1.4,
// Requirements 9.1-9.5). A Prisma Client Extension is the right layer for this
// because it applies uniformly to every model without each Service having to
// remember to filter/redirect calls itself (design.md
// "共通監査カラムと論理削除規約").
//
// - updated_at: Prisma's own `@updatedAt` only fires on single-record update()/
//   upsert(), not updateMany() (a known Prisma limitation), so both are
//   overridden here to always stamp `updatedAt` explicitly.
// - deleted_at: delete()/deleteMany() are redirected to update()/updateMany()
//   that set `deletedAt`; no model ever receives a physical DELETE through
//   this client.
// - default filter: findMany/findFirst(OrThrow)/findUnique(OrThrow)/count
//   default their `where.deletedAt` to `null` unless the caller explicitly
//   asks for deleted rows (e.g. `deletedAt: { not: null } `).
import { Prisma, PrismaClient } from "@prisma/client";

function withDefaultActiveFilter<W extends Record<string, unknown> | undefined>(where: W): W {
  const base = (where ?? {}) as Record<string, unknown>;
  if ("deletedAt" in base) {
    return base as W;
  }
  return { ...base, deletedAt: null } as unknown as W;
}

export function withSoftDelete(prisma: PrismaClient) {
  return prisma.$extends({
    name: "soft-delete-repository",
    query: {
      $allModels: {
        async findMany({ args, query }) {
          args.where = withDefaultActiveFilter(args.where);
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = withDefaultActiveFilter(args.where);
          return query(args);
        },
        async findFirstOrThrow({ args, query }) {
          args.where = withDefaultActiveFilter(args.where);
          return query(args);
        },
        async findUnique({ args, query }) {
          args.where = withDefaultActiveFilter(args.where);
          return query(args);
        },
        async findUniqueOrThrow({ args, query }) {
          args.where = withDefaultActiveFilter(args.where);
          return query(args);
        },
        async count({ args, query }) {
          args.where = withDefaultActiveFilter(args.where);
          return query(args);
        },
        async update({ args, query }) {
          args.data = { ...args.data, updatedAt: new Date() };
          return query(args);
        },
        async updateMany({ args, query }) {
          args.data = { ...args.data, updatedAt: new Date() };
          return query(args);
        },
      },
    },
    model: {
      $allModels: {
        async delete<M>(this: M, args: Prisma.Args<M, "delete">): Promise<Prisma.Result<M, object, "update">> {
          const context = Prisma.getExtensionContext(this) as unknown as {
            update: (args: { where: unknown; data: unknown }) => Promise<unknown>;
          };
          return context.update({
            where: (args as { where: unknown }).where,
            data: { deletedAt: new Date(), updatedAt: new Date() },
          }) as Promise<Prisma.Result<M, object, "update">>;
        },
        async deleteMany<M>(
          this: M,
          args: Prisma.Args<M, "deleteMany">,
        ): Promise<Prisma.Result<M, object, "updateMany">> {
          const context = Prisma.getExtensionContext(this) as unknown as {
            updateMany: (args: { where: unknown; data: unknown }) => Promise<unknown>;
          };
          return context.updateMany({
            where: (args as { where?: unknown }).where,
            data: { deletedAt: new Date(), updatedAt: new Date() },
          }) as Promise<Prisma.Result<M, object, "updateMany">>;
        },
      },
    },
  });
}

export type SoftDeleteClient = ReturnType<typeof withSoftDelete>;
