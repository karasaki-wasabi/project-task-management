import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const requiredEnv = {
  DATABASE_URL: "mysql://user:pass@localhost:3306/db",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  CORS_ORIGIN: "http://localhost:3001",
  COOKIE_SECURE: "false",
};

describe("loadEnv", () => {
  it.each(["SESSION_SECRET", "CORS_ORIGIN", "COOKIE_SECURE"] as const)(
    "rejects an environment without %s",
    (missingKey) => {
      const env = { ...requiredEnv };
      delete env[missingKey];

      expect(() => loadEnv(env)).toThrow(`${missingKey} is required`);
    },
  );

  it("loads the authentication environment variables", () => {
    expect(loadEnv(requiredEnv)).toMatchObject({
      SESSION_SECRET: requiredEnv.SESSION_SECRET,
      CORS_ORIGIN: requiredEnv.CORS_ORIGIN,
      COOKIE_SECURE: false,
    });
  });

  it.each([
    [
      "a 63-character SESSION_SECRET",
      { SESSION_SECRET: requiredEnv.SESSION_SECRET.slice(0, -1) },
      "SESSION_SECRET must be a 32-byte hexadecimal value",
    ],
    [
      "an invalid CORS_ORIGIN",
      { CORS_ORIGIN: "not-a-valid-url" },
      "CORS_ORIGIN must be a valid URL",
    ],
    [
      "an invalid COOKIE_SECURE value",
      { COOKIE_SECURE: "yes" },
      "COOKIE_SECURE must be true or false",
    ],
  ])("rejects %s", (_description, overrides, message) => {
    expect(() => loadEnv({ ...requiredEnv, ...overrides })).toThrow(message);
  });
});
