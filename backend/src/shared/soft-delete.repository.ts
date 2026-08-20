import { Prisma, PrismaClient } from "@prisma/client";

const softDeleteModels = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === "deletedAt"))
    .map((model) => model.name),
);

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
        async findMany({ model, args, query }) {
          if (!softDeleteModels.has(model)) return query(args);
          args.where = withDefaultActiveFilter(args.where);
          return query(args);
        },
        async findFirst({ model, args, query }) {
          if (!softDeleteModels.has(model)) return query(args);
          args.where = withDefaultActiveFilter(args.where);
          return query(args);
        },
        async findFirstOrThrow({ model, args, query }) {
          if (!softDeleteModels.has(model)) return query(args);
          args.where = withDefaultActiveFilter(args.where);
          return query(args);
        },
        async findUnique({ model, args, query }) {
          if (!softDeleteModels.has(model)) return query(args);
          args.where = withDefaultActiveFilter(args.where);
          return query(args);
        },
        async findUniqueOrThrow({ model, args, query }) {
          if (!softDeleteModels.has(model)) return query(args);
          args.where = withDefaultActiveFilter(args.where);
          return query(args);
        },
        async count({ model, args, query }) {
          if (!softDeleteModels.has(model)) return query(args);
          args.where = withDefaultActiveFilter(args.where);
          return query(args);
        },
        async update({ model, args, query }) {
          if (!softDeleteModels.has(model)) return query(args);
          args.data = { ...args.data, updatedAt: new Date() };
          return query(args);
        },
        async updateMany({ model, args, query }) {
          if (!softDeleteModels.has(model)) return query(args);
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
export type SoftDeleteTx = Parameters<Parameters<SoftDeleteClient["$transaction"]>[0]>[0];
export type DbClient = SoftDeleteClient | SoftDeleteTx;
