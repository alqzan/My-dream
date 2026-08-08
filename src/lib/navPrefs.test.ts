import { describe, expect, it } from "vitest";
import { sanitizeNavPrefs, resolveNav, MAX_PRIMARY_ITEMS } from "./navPrefs";
import type { NavItem } from "./nav";

const ICON = (() => null) as unknown as NavItem["icon"];
const ITEMS: NavItem[] = [
  { href: "/", icon: ICON, label: "الرئيسية", color: "c", tint: "t" },
  { href: "/prayers", icon: ICON, label: "الصلاة", color: "c", tint: "t" },
  { href: "/journal", icon: ICON, label: "المذكرات", color: "c", tint: "t" },
  { href: "/finance", icon: ICON, label: "الأموال", color: "c", tint: "t" },
  { href: "/reading", icon: ICON, label: "القراءة", color: "c", tint: "t" },
  { href: "/quran", icon: ICON, label: "قرآن", color: "c", tint: "t" },
  { href: "/stats", icon: ICON, label: "الإحصائيات", color: "c", tint: "t" },
];

describe("sanitizeNavPrefs", () => {
  it("drops hrefs that don't exist in the current nav", () => {
    expect(sanitizeNavPrefs(["/", "/not-a-real-page"], ITEMS)).toEqual(["/"]);
  });

  it("drops duplicates, keeping the first occurrence", () => {
    expect(sanitizeNavPrefs(["/finance", "/finance", "/"], ITEMS)).toEqual(["/finance", "/"]);
  });

  it(`caps the result at ${MAX_PRIMARY_ITEMS} items`, () => {
    const out = sanitizeNavPrefs(["/", "/prayers", "/journal", "/finance", "/reading"], ITEMS);
    expect(out).toHaveLength(MAX_PRIMARY_ITEMS);
    expect(out).toEqual(["/", "/prayers", "/journal", "/finance"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(sanitizeNavPrefs([], ITEMS)).toEqual([]);
  });
});

describe("resolveNav", () => {
  it("defaults to every item, unchanged order, no overflow, when there is no saved preference", () => {
    const { primary, overflow } = resolveNav(ITEMS, null);
    expect(primary).toEqual(ITEMS);
    expect(overflow).toEqual([]);
  });

  it("defaults the same way for an empty saved preference", () => {
    const { primary, overflow } = resolveNav(ITEMS, []);
    expect(primary).toEqual(ITEMS);
    expect(overflow).toEqual([]);
  });

  it("defaults the same way when every saved href is stale/invalid", () => {
    const { primary, overflow } = resolveNav(ITEMS, ["/gone", "/also-gone"]);
    expect(primary).toEqual(ITEMS);
    expect(overflow).toEqual([]);
  });

  it("honors a valid customization: chosen items in the saved order, the rest as overflow in original order", () => {
    const { primary, overflow } = resolveNav(ITEMS, ["/finance", "/", "/quran"]);
    expect(primary.map((i) => i.href)).toEqual(["/finance", "/", "/quran"]);
    // original relative order of NAV_ITEMS preserved for the leftovers —
    // not the save order, not alphabetical.
    expect(overflow.map((i) => i.href)).toEqual(["/prayers", "/journal", "/reading", "/stats"]);
  });

  it("never drops a section: primary + overflow together always cover every NAV_ITEMS href exactly once", () => {
    const { primary, overflow } = resolveNav(ITEMS, ["/quran", "/reading"]);
    const all = [...primary, ...overflow].map((i) => i.href).sort();
    expect(all).toEqual(ITEMS.map((i) => i.href).sort());
  });

  it("a partially-stale saved preference keeps only the valid entries, in their saved order", () => {
    const { primary, overflow } = resolveNav(ITEMS, ["/gone", "/finance", "/quran"]);
    expect(primary.map((i) => i.href)).toEqual(["/finance", "/quran"]);
    expect(overflow.map((i) => i.href)).toEqual(["/", "/prayers", "/journal", "/reading", "/stats"]);
  });
});
