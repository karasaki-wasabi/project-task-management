// Tailwind CSS configuration. Operate-register app (`.kiro/steering`
// product/tech): Noto Sans JP as the primary sans family (user preference,
// loaded via assets/css/main.css), with the previous system-ui stack kept
// as a fallback chain; Restrained color strategy (neutrals + one blue
// accent), light theme only for now.
import type { Config } from "tailwindcss";

export default <Partial<Config>>{
  darkMode: false,
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Noto Sans JP",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Hiragino Kaku Gothic ProN",
          "Hiragino Sans",
          "Yu Gothic",
          "Meiryo",
          "sans-serif",
        ],
      },
      colors: {
        primary: {
          50: "#eef2ff",
          100: "#e0e7ff",
          500: "#2f5fdb",
          600: "#1d4ed8",
          700: "#1e40af",
        },
      },
    },
  },
};
