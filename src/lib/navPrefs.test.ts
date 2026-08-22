import { describe, expect, it } from "vitest";
import { DEFAULT_NAV_HREFS, resolveNav, sanitizeNavPrefs } from "./navPrefs";
import type { NavItem } from "./nav";

const ICON = (() => null) as unknown as NavItem["icon"];
const ITEMS: NavItem[] = [
  { href: "/", icon: ICON, label: "البهو", color: "c", tint: "t" },
  { href: "/prayers", icon: ICON, label: "الصلاة", color: "c", tint: "t" },
  { href: "/journal", icon: ICON, label: "المذكرات", color: "c", tint: "t" },
  { href: "/finance", icon: ICON, label: "المال", color: "c", tint: "t" },
  { href: "/reading", icon: ICON, label: "القراءة", color: "c", tint: "t" },
  { href: "/quran", icon: ICON, label: "القرآن", color: "c", tint: "t" },
  { href: "/stats", icon: ICON, label: "الإحصائيات", color: "c", tint: "t" },
];

const hrefs = (items: NavItem[]) => items.map((item) => item.href);

describe("sanitizeNavPrefs", () => {
  it("drops hrefs that do not exist in the current nav", () => {
    expect(sanitizeNavPrefs(["/", "/not-a-real-page"], ITEMS)).toEqual(["/"]);
  });

  it("drops duplicates without capping the full list", () => {
    expect(sanitizeNavPrefs(["/finance", "/finance", "/", "/quran", "/stats"], ITEMS)).toEqual([
      "/finance",
      "/",
      "/quran",
      "/stats",
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(sanitizeNavPrefs([], ITEMS)).toEqual([]);
  });
});

describe("resolveNav", () => {
  it("shows the complete list by default with the lobby first", () => {
    const { visible, hidden } = resolveNav(ITEMS, null);
    expect(hrefs(visible)).toEqual([...DEFAULT_NAV_HREFS]);
    expect(hidden).toEqual([]);
  });

  it("keeps the complete list for an old five-door preference", () => {
    const { visible, hidden } = resolveNav(ITEMS, ["/quran", "/reading", "/", "/journal", "/finance"]);
    expect(hrefs(visible)).toEqual(["/quran", "/reading", "/", "/journal", "/finance", "/prayers", "/stats"]);
    expect(hidden).toEqual([]);
  });

  it("honors a new preference as a visible order and allows hidden sections", () => {
    const { visible, hidden } = resolveNav(ITEMS, { visible: ["/", "/finance", "/quran"] });
    expect(hrefs(visible)).toEqual(["/", "/finance", "/quran"]);
    expect(hrefs(hidden)).toEqual(["/prayers", "/journal", "/reading", "/stats"]);
  });

  it("drops stale entries while preserving the chosen order", () => {
    const { visible, hidden } = resolveNav(ITEMS, { visible: ["/gone", "/finance", "/quran"] });
    expect(hrefs(visible)).toEqual(["/finance", "/quran"]);
    expect(hrefs(hidden)).toEqual(["/", "/prayers", "/journal", "/reading", "/stats"]);
  });

  it("falls back to the complete default when a saved preference is empty", () => {
    const { visible, hidden } = resolveNav(ITEMS, { visible: [] });
    expect(hrefs(visible)).toEqual([...DEFAULT_NAV_HREFS]);
    expect(hidden).toEqual([]);
  });
});
