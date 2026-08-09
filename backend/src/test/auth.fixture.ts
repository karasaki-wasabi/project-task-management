import type { InjectOptions } from "light-my-request";

export const CSRF_HEADER_NAME = "csrf-token";

export function withSessionCookie(
  options: InjectOptions,
  sessionCookie: string,
): InjectOptions {
  const existingCookie = options.headers?.cookie;
  const cookie = existingCookie ? `${existingCookie}; ${sessionCookie}` : sessionCookie;

  return {
    ...options,
    headers: {
      ...options.headers,
      cookie,
    },
  };
}

export function withCsrfToken(options: InjectOptions, token: string): InjectOptions {
  return {
    ...options,
    headers: {
      ...options.headers,
      [CSRF_HEADER_NAME]: token,
    },
  };
}
