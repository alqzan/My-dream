import type { Config } from "tailwindcss";

const config: Config = {
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
        brand: {
          50: "#f0f9f0",
          100: "#dcf0dc",
          200: "#bce0bc",
          300: "#8fca8f",
          400: "#5caf5c",
          500: "#3d9640",
          600: "#2d7a30",
          700: "#256128",
          800: "#1f4e22",
          900: "#1a401d",
        },
        journal: { DEFAULT: "#7c6fcd", light: "#ede9fb" },
        finance: { DEFAULT: "#3d9640", light: "#dcf0dc" },
        reading: { DEFAULT: "#e07b39", light: "#fdeee4" },
      },
    },
  },
  plugins: [],
};

export default config;
