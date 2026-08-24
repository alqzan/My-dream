export const MADAR_SECTION_KEYS = [
  "home",
  "quran",
  "reading",
  "journal",
  "finance",
  "prayers",
  "stats",
] as const;

export type MadarSectionKey = (typeof MADAR_SECTION_KEYS)[number];

export type AccentPalette = "madar" | "emerald" | "ocean" | "rose" | "indigo";
export type ThemeMode = "light" | "dark" | "auto";

export const THEME_PREFS_STORAGE_KEY = "madar-theme-preferences";

export type ThemePreferences = {
  theme?: ThemeMode;
  palette?: AccentPalette;
  sectionPalettes?: Partial<Record<MadarSectionKey, AccentPalette>>;
};

export const THEME_PALETTES: ReadonlyArray<{
  id: AccentPalette;
  label: string;
  description: string;
  swatch: string;
}> = [
  { id: "madar", label: "مدار", description: "رملي وذهبي هادئ", swatch: "#b9862f" },
  { id: "emerald", label: "زمرد", description: "كريمي وأخضر واضح", swatch: "#2c8965" },
  { id: "ocean", label: "بحر", description: "أزرق هادئ بلمسة تركواز", swatch: "#327b91" },
  { id: "rose", label: "ورد", description: "وردي ترابي دافئ", swatch: "#ad5869" },
  { id: "indigo", label: "ليل", description: "نيلي ناعم ومميز", swatch: "#7160ad" },
];

export type ThemeTokenSet = {
  pageBg: string;
  surface: string;
  borderSubtle: string;
  paper: string;
  paper2: string;
  ink: string;
  ink72: string;
  ink52: string;
  ink34: string;
  line: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  accentLine: string;
  positive: string;
  positiveSoft: string;
  clay: string;
  blue: string;
};

const PALETTE_TOKENS: Record<AccentPalette, { light: ThemeTokenSet; dark: ThemeTokenSet }> = {
  madar: {
    light: {
      pageBg: "#f5f0e7", surface: "#fffdf8", borderSubtle: "#e9e1d5",
      paper: "#fbf7ee", paper2: "#f3ecdf", ink: "#241d16",
      ink72: "rgba(36, 29, 22, .72)", ink52: "rgba(36, 29, 22, .62)", ink34: "rgba(36, 29, 22, .34)",
      line: "rgba(36, 29, 22, .13)", accent: "#87551d", accentStrong: "#87551d",
      accentSoft: "rgba(185, 134, 47, .13)", accentLine: "rgba(185, 134, 47, .34)",
      positive: "#1c6350", positiveSoft: "rgba(28, 99, 80, .13)", clay: "#c15a34", blue: "#3f6f8f",
    },
    dark: {
      pageBg: "#171009", surface: "#241c12", borderSubtle: "#3a2e1e",
      paper: "#15110d", paper2: "#1e1912", ink: "#f0e6d3",
      ink72: "rgba(240, 230, 211, .72)", ink52: "rgba(240, 230, 211, .5)", ink34: "rgba(240, 230, 211, .3)",
      line: "rgba(240, 230, 211, .14)", accent: "#d3a24d", accentStrong: "#ecc078",
      accentSoft: "rgba(223, 174, 94, .15)", accentLine: "rgba(211, 162, 77, .3)",
      positive: "#4f9c85", positiveSoft: "rgba(79, 179, 146, .16)", clay: "#dd7d55", blue: "#7ea9c7",
    },
  },
  emerald: {
    light: {
      pageBg: "#f1f6f1", surface: "#fbfefb", borderSubtle: "#dce9df",
      paper: "#f6fbf6", paper2: "#eaf3eb", ink: "#17271e",
      ink72: "rgba(23, 39, 30, .72)", ink52: "rgba(23, 39, 30, .62)", ink34: "rgba(23, 39, 30, .34)",
      line: "rgba(23, 39, 30, .14)", accent: "#267956", accentStrong: "#1f684a",
      accentSoft: "rgba(44, 137, 101, .14)", accentLine: "rgba(44, 137, 101, .34)",
      positive: "#1d6d58", positiveSoft: "rgba(29, 109, 88, .14)", clay: "#b65d43", blue: "#39758c",
    },
    dark: {
      pageBg: "#0e1713", surface: "#17241c", borderSubtle: "#294135",
      paper: "#101a15", paper2: "#17241c", ink: "#e1f0e5",
      ink72: "rgba(225, 240, 229, .72)", ink52: "rgba(225, 240, 229, .5)", ink34: "rgba(225, 240, 229, .3)",
      line: "rgba(225, 240, 229, .14)", accent: "#63c493", accentStrong: "#82d5aa",
      accentSoft: "rgba(99, 196, 147, .16)", accentLine: "rgba(99, 196, 147, .32)",
      positive: "#62b99a", positiveSoft: "rgba(98, 185, 154, .16)", clay: "#e08b6d", blue: "#82bed0",
    },
  },
  ocean: {
    light: {
      pageBg: "#eff6f7", surface: "#fbfefe", borderSubtle: "#dbe8eb",
      paper: "#f4fafb", paper2: "#e7f1f3", ink: "#17272b",
      ink72: "rgba(23, 39, 43, .72)", ink52: "rgba(23, 39, 43, .62)", ink34: "rgba(23, 39, 43, .34)",
      line: "rgba(23, 39, 43, .14)", accent: "#2f7187", accentStrong: "#275f73",
      accentSoft: "rgba(50, 123, 145, .14)", accentLine: "rgba(50, 123, 145, .32)",
      positive: "#287b73", positiveSoft: "rgba(40, 123, 115, .13)", clay: "#bd654f", blue: "#2f7187",
    },
    dark: {
      pageBg: "#0e1619", surface: "#16242a", borderSubtle: "#29404a",
      paper: "#10191d", paper2: "#17262c", ink: "#e0f0f2",
      ink72: "rgba(224, 240, 242, .72)", ink52: "rgba(224, 240, 242, .5)", ink34: "rgba(224, 240, 242, .3)",
      line: "rgba(224, 240, 242, .14)", accent: "#67c1d0", accentStrong: "#86d4df",
      accentSoft: "rgba(103, 193, 208, .16)", accentLine: "rgba(103, 193, 208, .32)",
      positive: "#5db9a7", positiveSoft: "rgba(93, 185, 167, .16)", clay: "#e58c72", blue: "#7fc5db",
    },
  },
  rose: {
    light: {
      pageBg: "#faf1ef", surface: "#fffdfc", borderSubtle: "#eededb",
      paper: "#fdf7f5", paper2: "#f6e9e6", ink: "#2d2021",
      ink72: "rgba(45, 32, 33, .72)", ink52: "rgba(45, 32, 33, .62)", ink34: "rgba(45, 32, 33, .34)",
      line: "rgba(45, 32, 33, .14)", accent: "#a84f62", accentStrong: "#913e52",
      accentSoft: "rgba(173, 88, 105, .14)", accentLine: "rgba(173, 88, 105, .32)",
      positive: "#4f8066", positiveSoft: "rgba(79, 128, 102, .13)", clay: "#b45245", blue: "#527b98",
    },
    dark: {
      pageBg: "#1a1013", surface: "#28191e", borderSubtle: "#493038",
      paper: "#1b1115", paper2: "#291a20", ink: "#f4e5e8",
      ink72: "rgba(244, 229, 232, .72)", ink52: "rgba(244, 229, 232, .5)", ink34: "rgba(244, 229, 232, .3)",
      line: "rgba(244, 229, 232, .14)", accent: "#e18a9d", accentStrong: "#f0a7b6",
      accentSoft: "rgba(225, 138, 157, .16)", accentLine: "rgba(225, 138, 157, .32)",
      positive: "#77b391", positiveSoft: "rgba(119, 179, 145, .16)", clay: "#ef9886", blue: "#91bed2",
    },
  },
  indigo: {
    light: {
      pageBg: "#f4f2fa", surface: "#fdfcff", borderSubtle: "#e4e0ef",
      paper: "#faf8ff", paper2: "#efecf7", ink: "#242033",
      ink72: "rgba(36, 32, 51, .72)", ink52: "rgba(36, 32, 51, .62)", ink34: "rgba(36, 32, 51, .34)",
      line: "rgba(36, 32, 51, .14)", accent: "#6754a0", accentStrong: "#57438f",
      accentSoft: "rgba(113, 96, 173, .14)", accentLine: "rgba(113, 96, 173, .32)",
      positive: "#397c71", positiveSoft: "rgba(57, 124, 113, .13)", clay: "#b85f53", blue: "#5a77a7",
    },
    dark: {
      pageBg: "#121016", surface: "#1f1a2b", borderSubtle: "#39324b",
      paper: "#14111b", paper2: "#211b2d", ink: "#ece7fa",
      ink72: "rgba(236, 231, 250, .72)", ink52: "rgba(236, 231, 250, .5)", ink34: "rgba(236, 231, 250, .3)",
      line: "rgba(236, 231, 250, .14)", accent: "#ad9be4", accentStrong: "#c0b1f0",
      accentSoft: "rgba(173, 155, 228, .16)", accentLine: "rgba(173, 155, 228, .32)",
      positive: "#74b7a9", positiveSoft: "rgba(116, 183, 169, .16)", clay: "#e89683", blue: "#9bb9e1",
    },
  },
};

export function isAccentPalette(value: unknown): value is AccentPalette {
  return typeof value === "string" && THEME_PALETTES.some((palette) => palette.id === value);
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "auto";
}

export function readThemePreferences(): ThemePreferences {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(THEME_PREFS_STORAGE_KEY) || "null") as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") return {};
    const rawSections = raw.sectionPalettes;
    const sectionPalettes = rawSections && typeof rawSections === "object"
      ? Object.fromEntries(
          Object.entries(rawSections as Record<string, unknown>).filter(([key, value]) =>
            MADAR_SECTION_KEYS.includes(key as MadarSectionKey) && isAccentPalette(value)
          )
        )
      : {};
    return {
      theme: isThemeMode(raw.theme) ? raw.theme : undefined,
      palette: isAccentPalette(raw.palette) ? raw.palette : undefined,
      sectionPalettes,
    };
  } catch {
    return {};
  }
}

export function saveThemePreferences(preferences: ThemePreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_PREFS_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // A private browsing context can deny local storage; the in-memory choice
    // still works for the current session.
  }
}

export function sectionFromPath(pathname: string): MadarSectionKey {
  const path = pathname.replace(/^\/My-dream/, "").replace(/^\/+|\/+$/g, "");
  if (path === "quran" || path.startsWith("quran/")) return "quran";
  if (path === "reading" || path.startsWith("reading/")) return "reading";
  if (path === "journal" || path.startsWith("journal/")) return "journal";
  if (path === "finance" || path.startsWith("finance/")) return "finance";
  if (path === "prayers" || path.startsWith("prayers/")) return "prayers";
  if (path === "stats" || path.startsWith("stats/")) return "stats";
  return "home";
}

export function tokensFor(palette: AccentPalette, dark: boolean): ThemeTokenSet {
  return PALETTE_TOKENS[palette]?.[dark ? "dark" : "light"] ?? PALETTE_TOKENS.madar[dark ? "dark" : "light"];
}
