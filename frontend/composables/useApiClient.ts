// Backend API client scaffold (task 1.6, design.md
// "composables/useApiClient.ts — バックエンドAPIクライアント"). Concrete
// typed methods per domain (tasks/deliveries/events/...) are added as each
// backend module lands in later tasks; this only establishes the shared
// request shape and base URL wiring.
export function joinApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function useApiClient() {
  const config = useRuntimeConfig();

  function request<T>(path: string, options?: Parameters<typeof $fetch>[1]): Promise<T> {
    return $fetch<T>(joinApiUrl(config.public.apiBaseUrl, path), options);
  }

  return { request };
}
