import type { Workspace } from "./useApiClient";
import { parseWorkspaceRoute, workspacePath } from "../utils/workspacePath";

const STORAGE_KEY = "currentWorkspaceId";

export function useCurrentWorkspace() {
  const workspaces = useState<Workspace[]>("workspace:list", () => []);
  const currentId = useState<string | null>("workspace:currentId", () => null);

  function persist(id: string | null): void {
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, id);
  }

  function rememberLastUsed(workspaceId: string): void {
    persist(workspaceId);
  }

  async function refresh(): Promise<void> {
    const list = await useApiClient().listWorkspaces();
    workspaces.value = list;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && list.some((workspace) => workspace.id === stored)) {
      currentId.value = stored;
      return;
    }

    currentId.value = null;
  }

  function select(id: string): void {
    if (!workspaces.value.some((workspace) => workspace.id === id)) {
      return;
    }
    currentId.value = id;
    rememberLastUsed(id);
  }

  function syncFromRoute(workspaceId: string): void {
    currentId.value = workspaceId;
    rememberLastUsed(workspaceId);
  }

  /** Clear the current selection and localStorage (Requirement 7.4). */
  function clearCurrent(): void {
    currentId.value = null;
    persist(null);
  }

  /** Clear only when the deleted/stale workspace is the current selection. */
  function clearCurrentIf(id: string): void {
    if (currentId.value === id) {
      clearCurrent();
    }
  }

  /**
   * After membership list no longer includes lostId, navigate away from the
   * lost workspace: same page kind under another membership, or `/`.
   */
  function relocateAfterWorkspaceLost(lostId: string): void {
    clearCurrentIf(lostId);

    const others = workspaces.value.filter((workspace) => workspace.id !== lostId);
    if (others.length === 0) {
      void navigateTo("/");
      return;
    }

    const otherId = others[0]!.id;
    const parsed = parseWorkspaceRoute(useRoute().path);
    const target = parsed
      ? workspacePath(otherId, parsed.kind)
      : workspacePath(otherId, "");
    void navigateTo(target);
  }

  return {
    workspaces,
    currentId,
    refresh,
    select,
    syncFromRoute,
    rememberLastUsed,
    clearCurrent,
    clearCurrentIf,
    relocateAfterWorkspaceLost,
  };
}
