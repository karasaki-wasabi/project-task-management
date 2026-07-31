// Placeholder frontend dev server used only to validate the Docker dev
// environment scaffolding for task 1.1. Task 1.6 replaces this "dev" script
// with the real Nuxt dev server (`nuxi dev`), which provides hot reload.

import { createServer } from "node:http";

const port = process.env.PORT ?? 3001;

const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(
    "<!doctype html><title>task-delivery-management frontend placeholder</title>" +
      "<p>Frontend placeholder container is running. Real Nuxt SPA is added in task 1.6.</p>",
  );
});

server.listen(port, () => {
  console.log(
    JSON.stringify({
      level: "info",
      msg: "frontend placeholder server listening",
      port,
    }),
  );
});
