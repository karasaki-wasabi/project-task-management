const publicPaths = new Set(["/login", "/register"]);

export default defineNuxtRouteMiddleware(async (to) => {
  const isPublicPath = publicPaths.has(to.path);

  try {
    await useAuth().refresh();
  } catch {
    if (!isPublicPath) {
      return navigateTo({
        path: "/login",
        query: { redirect: to.fullPath },
      });
    }
    return;
  }

  if (isPublicPath) {
    return navigateTo("/");
  }
});
