import { describe, expect, it } from "vitest";
import { navLinks } from "./app.helpers";

describe("navLinks (task 7.2, Requirement 7.4)", () => {
  it("includes both /recurrence and /holidays so each screen is reachable from nav", () => {
    const targets = navLinks.map((link) => link.to);
    expect(targets).toContain("/recurrence");
    expect(targets).toContain("/holidays");
  });

  it("廃止した /users をナビゲーションに含めない", () => {
    expect(navLinks.map((link) => link.to)).not.toContain("/users");
  });

  it("keeps 繰り返し設定 labeled and pointed at /recurrence", () => {
    expect(navLinks).toContainEqual({ to: "/recurrence", label: "繰り返し設定" });
  });
});
