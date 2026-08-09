// Reads and validates the process environment variables the backend needs
// at startup (Requirements: 10.6 — LOG_LEVEL must be switchable via config).
// Authentication configuration is validated here so an incomplete deployment
// fails before the server begins accepting requests.
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string({ required_error: "SESSION_SECRET is required" })
    .regex(/^[0-9a-f]{64}$/i, "SESSION_SECRET must be a 32-byte hexadecimal value"),
  CORS_ORIGIN: z
    .string({ required_error: "CORS_ORIGIN is required" })
    .url("CORS_ORIGIN must be a valid URL"),
  COOKIE_SECURE: z
    .enum(["true", "false"], {
      errorMap: (issue) => ({
        message:
          issue.code === "invalid_type" && issue.received === "undefined"
            ? "COOKIE_SECURE is required"
            : "COOKIE_SECURE must be true or false",
      }),
    })
    .transform((value) => value === "true"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
