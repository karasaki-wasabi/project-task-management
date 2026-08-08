// App-shell navigation links (task 7.2, Requirements 7.4).
// Extracted so unit tests can assert /recurrence and /holidays reachability
// without mounting the Nuxt app shell.
export interface NavLink {
  to: string;
  label: string;
}

export const navLinks: NavLink[] = [
  { to: "/", label: "ダッシュボード" },
  { to: "/tasks", label: "タスク" },
  { to: "/kanban", label: "カンバン" },
  { to: "/cases", label: "案件" },
  { to: "/calendar", label: "カレンダー" },
  { to: "/recurrence", label: "繰り返し設定" },
  { to: "/throughput", label: "消化数" },
  { to: "/users", label: "ユーザー" },
  { to: "/holidays", label: "休日マスタ" },
];
