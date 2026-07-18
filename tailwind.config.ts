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
        // خط الرسم العثماني — يُطبَّق على نصّ الآيات فقط عبر font-quran.
        quran: ["var(--font-amiri-quran)", "Amiri Quran", "Amiri", "serif"],
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
        prayer: { DEFAULT: "#1f7a6c", light: "#dcece6" },
        // أخضر إسلامي عميق للقرآن — مميّز عن أخضر المال العشبي وتركواز الصلاة.
        quran: { DEFAULT: "#1b6b4c", light: "#daeee3" },
      },
    },
  },
  plugins: [],
};

export default config;
