// Nuxt 4.x static SPA configuration (task 1.6, Requirements 10.6).
// `ssr: false` matches design.md's Technology Stack: `nuxi generate` produces
// a static build for the steering S3+CloudFront deployment plan, so no SSR
// runtime is needed either in dev or prod.
export default defineNuxtConfig({
  compatibilityDate: "2026-07-31",
  ssr: false,
  devtools: { enabled: true },
  // Bind all interfaces on the fixed container-internal port so
  // docker-compose's `${FRONTEND_PORT:-3001}:3001` mapping (see
  // docker-compose.yml) reaches the dev server from the host.
  devServer: {
    host: "0.0.0.0",
    port: 3001,
  },
  runtimeConfig: {
    public: {
      // Overridden per environment (docker-compose.yml sets it to the
      // backend service); defaults to localhost for running the frontend
      // outside Docker.
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000",
    },
  },
});
