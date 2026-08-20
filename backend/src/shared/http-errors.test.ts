import { describe, expect, it } from "vitest";
import { HttpError, forbidden, unauthorized } from "./http-errors.js";

describe("unauthorized", () => {
  it("401 の HttpError を返す", () => {
    const error = unauthorized("ログインが必要です。");

    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe("ログインが必要です。");
  });
});

describe("forbidden", () => {
  it("403 の HttpError を返す", () => {
    const error = forbidden("この操作を行う権限がありません。");

    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe("この操作を行う権限がありません。");
  });
});
