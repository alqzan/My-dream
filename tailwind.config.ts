import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        arabic: ["var(--font-thamaniah)", "Tajawal", "sans-serif"],
      },
      colors: {
        // Warm Andalusian gold/amber as the primary brand accent
        brand: {
          50: "#fbf4e6",
          100: "#f6e6c6",
          200: "#eece95",
          300: "#e5b45f",
          400: "#dc9f3c",
          500: "#c9852a",
          600: "#a96c20",
          700: "#87551d",
          800: "#6d451c",
          900: "#5b3a1b",
        },
        journal: { DEFAULT: "#8a6fb0", light: "#efe9f6" },
        finance: { DEFAULT: "#3d9640", light: "#dcf0dc" },
        reading: { DEFAULT: "#c1663f", light: "#f7e7dd" },
      },
    },
  },
  plugins: [],
};

export default config;
