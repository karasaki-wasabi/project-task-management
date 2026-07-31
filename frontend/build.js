// Placeholder static build script used only to validate the Docker
// multi-stage build scaffolding for task 1.1. Task 1.6 replaces this with the
// real `nuxi generate` static build, which writes to the same `dist/` output
// directory expected by the Dockerfile's `prod` stage.

import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("dist", { recursive: true });
writeFileSync(
  "dist/index.html",
  "<!doctype html><title>task-delivery-management frontend placeholder build</title>",
);

console.log(
  JSON.stringify({
    level: "info",
    msg: "frontend placeholder static build written to dist/",
  }),
);
