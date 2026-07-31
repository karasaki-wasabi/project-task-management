import { describe, expect, it } from "vitest";
import { joinApiUrl } from "./useApiClient";

describe("joinApiUrl (task 1.6)", () => {
  it("joins a base URL without a trailing slash and a path without a leading slash", () => {
    expect(joinApiUrl("http://backend:3000", "api/tasks")).toBe("http://backend:3000/api/tasks");
  });

  it("normalizes a trailing slash on the base URL", () => {
    expect(joinApiUrl("http://backend:3000/", "api/tasks")).toBe("http://backend:3000/api/tasks");
  });

  it("normalizes a leading slash on the path", () => {
    expect(joinApiUrl("http://backend:3000", "/api/tasks")).toBe("http://backend:3000/api/tasks");
  });

  it("normalizes both a trailing slash and a leading slash at once", () => {
    expect(joinApiUrl("http://backend:3000/", "/api/tasks")).toBe("http://backend:3000/api/tasks");
  });
});
