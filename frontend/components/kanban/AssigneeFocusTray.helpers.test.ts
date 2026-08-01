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
    isRequiredForDelivery: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("resolveAssigneeName (task 2.1, Requirement 1.2)", () => {
  it("returns the matching user's name", () => {
    expect(resolveAssigneeName(users, "u2")).toBe("Bob");
  });

  it("returns undefined when userId is undefined", () => {
    expect(resolveAssigneeName(users, undefined)).toBeUndefined();
  });

  it("returns undefined when userId is null", () => {
    expect(resolveAssigneeName(users, null)).toBeUndefined();
  });

  it("returns undefined when no user matches", () => {
    expect(resolveAssigneeName(users, "unknown")).toBeUndefined();
  });
});

describe("isEmpty (task 2.1, Requirement 1.5)", () => {
  it("returns true for an empty task list", () => {
    expect(isEmpty([])).toBe(true);
  });

  it("returns false when at least one task is present", () => {
    expect(isEmpty([makeTask()])).toBe(false);
  });
});
