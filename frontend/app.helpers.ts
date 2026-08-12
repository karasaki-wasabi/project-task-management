// App-shell navigation links. Scoped paths come from buildNavLinks(currentId)
// (workspace-url-routing task 4.1). Re-exported for app.vue and unit tests.
export type { NavLink } from "./utils/workspacePath";
export { buildNavLinks } from "./utils/workspacePath";
