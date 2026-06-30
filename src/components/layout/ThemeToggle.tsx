"use client";
import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { Moon, Sun } from "lucide-react";

// Applies the `dark` class on <html> based on the persisted theme.
export function ThemeApplier() {
  const theme = useAppStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);
  return null;
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  return (
    <button
      onClick={toggleTheme}
      className={
        "p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 transition-colors " +
        (className ?? "")
      }
      title={theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
      aria-label="تبديل الوضع"
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
