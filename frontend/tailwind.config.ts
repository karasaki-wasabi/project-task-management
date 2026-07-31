// Tailwind CSS configuration (screen polish pass). Operate-register app
// (`.kiro/steering` product/tech): one system-ui sans family for
// headings/body/labels alike, no display font; Restrained color strategy
// (neutrals + one blue accent), light theme only for now.
import type { Config } from "tailwindcss";

export default <Partial<Config>>{
  darkMode: false,
  theme: {
    extend: {
      fontFamily: {
        sans: [
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
    },
  },
};
