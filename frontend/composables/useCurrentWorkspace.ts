import type { Workspace } from "./useApiClient";

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

  async function refresh(): Promise<void> {
    const list = await useApiClient().listWorkspaces();
    workspaces.value = list;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && list.some((workspace) => workspace.id === stored)) {
      currentId.value = stored;
      return;
    }

    if (list.length === 0) {
      currentId.value = null;
      persist(null);
      return;
    }

    const firstId = list[0]!.id;
    currentId.value = firstId;
    persist(firstId);
  }

  function select(id: string): void {
    if (!workspaces.value.some((workspace) => workspace.id === id)) {
      return;
    }
    currentId.value = id;
    persist(id);
  }

  return {
    workspaces,
    currentId,
    refresh,
    select,
  };
}
