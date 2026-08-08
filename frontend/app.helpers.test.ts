import { describe, expect, it } from "vitest";
import { navLinks } from "./app.helpers";

describe("navLinks (task 7.2, Requirement 7.4)", () => {
  it("includes both /recurrence and /holidays so each screen is reachable from nav", () => {
    const targets = navLinks.map((link) => link.to);
    expect(targets).toContain("/recurrence");
    expect(targets).toContain("/holidays");
  });

  it("places 休日マスタ after ユーザー (research.md / claude design)", () => {
    const usersIndex = navLinks.findIndex((link) => link.to === "/users");
    const holidaysIndex = navLinks.findIndex((link) => link.to === "/holidays");
    expect(usersIndex).toBeGreaterThanOrEqual(0);
    expect(holidaysIndex).toBe(usersIndex + 1);
    expect(navLinks[holidaysIndex]?.label).toBe("休日マスタ");
  });

  it("keeps 繰り返し設定 labeled and pointed at /recurrence", () => {
    expect(navLinks).toContainEqual({ to: "/recurrence", label: "繰り返し設定" });
  });
});
