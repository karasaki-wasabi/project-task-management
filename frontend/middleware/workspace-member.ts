export default defineNuxtRouteMiddleware(async (to) => {
  const { refresh, workspaces, syncFromRoute } = useCurrentWorkspace();
  await refresh();

  const rawId = to.params.workspaceId;
  const workspaceId = Array.isArray(rawId) ? rawId[0] : rawId;

  if (
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    !workspaces.value.some((workspace) => workspace.id === workspaceId)
  ) {
    throw createError({ statusCode: 404 });
  }

  syncFromRoute(workspaceId);
});
