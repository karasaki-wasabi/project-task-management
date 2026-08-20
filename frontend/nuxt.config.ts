export default defineNuxtConfig({
  compatibilityDate: "2026-07-31",
  ssr: false,
  devtools: { enabled: true },
  modules: ["@nuxtjs/tailwindcss"],
  css: ["~/assets/css/main.css"],
  components: [{ path: "~/components", pathPrefix: false }],
  devServer: {
    host: "0.0.0.0",
    port: 3001,
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000",
    },
  },
});
