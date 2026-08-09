import { describe, expect, it } from "vitest";
import { HttpError, unauthorized } from "./http-errors.js";

describe("unauthorized", () => {
  it("returns an HttpError with status 401 and the supplied message", () => {
    const error = unauthorized("ログインが必要です。");

    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe("ログインが必要です。");
  });
});
