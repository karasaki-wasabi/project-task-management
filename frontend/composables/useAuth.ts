import type { PublicUser } from "./useApiClient";

export function useAuth() {
  const user = useState<PublicUser | null>("auth:user", () => null);

  async function refresh(): Promise<PublicUser> {
    try {
      const authenticatedUser = await useApiClient().me();
      user.value = authenticatedUser;
      return authenticatedUser;
    } catch (error) {
      user.value = null;
      throw error;
    }
  }

  async function logout(): Promise<void> {
    await useApiClient().logout();
    user.value = null;
  }

  return {
    user,
    refresh,
    logout,
  };
}
