import { describe, expect, it } from "vitest";
import { isEmpty, resolveAssigneeName } from "./AssigneeFocusTray.helpers";

const users: User[] = [
  { id: "u1", name: "Alice", createdAt: "", updatedAt: "" },
  { id: "u2", name: "Bob", createdAt: "", updatedAt: "" },
];

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "task",
    status: "not_started",
    priority: "medium",
    isRequiredForCase: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("resolveAssigneeName (task 2.1, Requirement 1.2)", () => {
  it("returns the matching user's name", () => {
    expect(resolveAssigneeName(users, "u2")).toBe("Bob");
  });

  it("userId が undefined のとき、undefined を返す", () => {
    expect(resolveAssigneeName(users, undefined)).toBeUndefined();
  });

  it("userId が null のとき、undefined を返す", () => {
    expect(resolveAssigneeName(users, null)).toBeUndefined();
  });

  it("ユーザーが一致しないとき、undefined を返す", () => {
    expect(resolveAssigneeName(users, "unknown")).toBeUndefined();
  });
});

describe("isEmpty (task 2.1, Requirement 1.5)", () => {
  it("空のタスクリストの場合、true を返す", () => {
    expect(isEmpty([])).toBe(true);
  });

  it("少なくとも1つのタスクが存在する場合、false を返す", () => {
    expect(isEmpty([makeTask()])).toBe(false);
  });
});
