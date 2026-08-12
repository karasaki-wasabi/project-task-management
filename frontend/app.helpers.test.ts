import { describe, expect, it } from "vitest";
import { buildNavLinks } from "./app.helpers";

describe("buildNavLinks (workspace-url-routing task 4.1)", () => {
  it("currentId が null のときは / と /workspaces のみ", () => {
    expect(buildNavLinks(null)).toEqual([
      { to: "/", label: "ダッシュボード" },
      { to: "/workspaces", label: "メンバー" },
    ]);
  });

  it("業務リンクは同一 workspaceId を含み、メンバーは /workspaces のまま", () => {
    const links = buildNavLinks("ws-1");
    expect(links).toContainEqual({ to: "/workspaces/ws-1", label: "ダッシュボード" });
    expect(links).toContainEqual({ to: "/workspaces/ws-1/tasks", label: "タスク" });
    expect(links).toContainEqual({ to: "/workspaces/ws-1/kanban", label: "カンバン" });
    expect(links).toContainEqual({ to: "/workspaces/ws-1/cases", label: "案件" });
    expect(links).toContainEqual({ to: "/workspaces/ws-1/calendar", label: "カレンダー" });
    expect(links).toContainEqual({ to: "/workspaces/ws-1/recurrence", label: "繰り返し設定" });
    expect(links).toContainEqual({ to: "/workspaces/ws-1/throughput", label: "消化数" });
    expect(links).toContainEqual({ to: "/workspaces/ws-1/holidays", label: "休日マスタ" });
    expect(links).toContainEqual({ to: "/workspaces", label: "メンバー" });
    expect(links.map((l) => l.to)).not.toContain("/users");
  });
});
