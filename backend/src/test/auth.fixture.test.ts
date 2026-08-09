import { describe, expect, it } from "vitest";
import { CSRF_HEADER_NAME, withCsrfToken, withSessionCookie } from "./auth.fixture.js";

describe("auth inject helpers", () => {
  it("adds a secure-session cookie without discarding existing cookies", () => {
    const options = withSessionCookie(
      { method: "GET", url: "/api/tasks", headers: { cookie: "theme=dark" } },
      "session=encrypted-session-value",
    );

    expect(options.headers?.cookie).toBe("theme=dark; session=encrypted-session-value");
  });

  it("adds the CSRF token using the configured header convention", () => {
    const options = withCsrfToken(
      { method: "POST", url: "/api/tasks", headers: { cookie: "session=encrypted-session-value" } },
      "csrf-token-value",
    );

    expect(CSRF_HEADER_NAME).toBe("csrf-token");
    expect(options.headers?.[CSRF_HEADER_NAME]).toBe("csrf-token-value");
    expect(options.headers?.cookie).toBe("session=encrypted-session-value");
  });
});
