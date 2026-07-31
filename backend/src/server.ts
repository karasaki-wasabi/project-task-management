// Process entrypoint: builds the Fastify app and starts listening.
// Separated from app.ts so tests can build/inject against the app without
// binding a real port.
import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
const app = buildApp(env);

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
