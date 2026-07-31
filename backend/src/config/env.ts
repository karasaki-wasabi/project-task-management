// Reads and validates the process environment variables the backend needs
// at startup (Requirements: 10.6 — LOG_LEVEL must be switchable via config).
// Kept intentionally small for task 1.2: only the variables already wired up
// by docker-compose.yml (DATABASE_URL, LOG_LEVEL, PORT) are validated here.
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
