// Placeholder backend entrypoint used only to validate the Docker dev environment
// scaffolding for task 1.1. The real Fastify/TypeScript/Prisma application is
// built in task 1.2 and will replace this file.

console.log(
  JSON.stringify({
    level: "info",
    msg: "backend placeholder container started",
    logLevel: process.env.LOG_LEVEL ?? "not set",
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
  }),
);

// Keep the process alive so `docker compose up backend` demonstrates a
// running dev container with hot reload (node --watch) until task 1.2
// replaces this with the real Fastify server.
setInterval(() => {}, 1 << 30);
