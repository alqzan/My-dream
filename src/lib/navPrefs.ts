// Device-local navigation customization (Phase 5 — UI simplification without
// removing functionality). Pure logic, no localStorage/window here — the
// component owns reading/writing storage, this module only resolves NAV_ITEMS
// against a saved preference and validates what gets saved. Mirrors the
// existing pattern of device-only UI prefs (insightPrefs.ts, readPrefs.ts):
// never synced, never part of AppData, absent = today's unchanged behavior.
import type { NavItem } from "./nav";

export const MAX_PRIMARY_ITEMS = 4;
export const NAV_PREFS_STORAGE_KEY = "madar-nav-prefs";

export interface ResolvedNav {
  /** Items to show directly, in the owner's chosen order. Equals every
   *  NAV_ITEMS entry, in their original order, when there is no saved
   *  preference — the default, unchanged experience for every existing
   *  device until it customizes. */
  primary: NavItem[];
  /** Everything else, original relative order preserved — nothing here is
   *  deleted or hidden from the app, only moved behind "المزيد". Empty
   *  whenever there's no active customization. */
  overflow: NavItem[];
}

/** Keeps only hrefs that exist in `items`, drops duplicates (keeping the
 *  first occurrence), and caps the result at MAX_PRIMARY_ITEMS — the
 *  invariant a saved preference must always satisfy. Used both to validate
 *  input coming out of localStorage (which could be stale after an item was
 *  renamed/removed, or hand-edited) and to validate a new selection before
 *  saving it. */
export function sanitizeNavPrefs(hrefs: string[], items: NavItem[]): string[] {
  const valid = new Set(items.map((i) => i.href));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const href of hrefs) {
    if (!valid.has(href) || seen.has(href)) continue;
    seen.add(href);
    out.push(href);
    if (out.length >= MAX_PRIMARY_ITEMS) break;
  }
  return out;
}

/** `null`/empty/all-invalid prefs → default: every item, unchanged order, no
 *  overflow. A non-empty, sanitized preference reorders `primary` to match
 *  the saved order exactly and moves every remaining item into `overflow`
 *  (original NAV_ITEMS relative order, not alphabetical or anything new). */
export function resolveNav(items: NavItem[], savedHrefs: string[] | null): ResolvedNav {
  const prefs = sanitizeNavPrefs(savedHrefs ?? [], items);
  if (!prefs.length) return { primary: items, overflow: [] };
  const byHref = new Map(items.map((i) => [i.href, i]));
  const primary = prefs.map((h) => byHref.get(h)!).filter(Boolean);
  const primarySet = new Set(primary.map((i) => i.href));
  const overflow = items.filter((i) => !primarySet.has(i.href));
  return { primary, overflow };
}

// ---- localStorage wrapper (component-only; the functions above stay pure) ----
// Mirrors insightPrefs.ts's loadPrefs/savePrefs shape. `null` return/absence
// is the documented "no customization yet" default resolveNav() expects.
export function loadNavPrefs(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(NAV_PREFS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.every((v) => typeof v === "string") ? parsed : null;
  } catch {
    return null;
  }
}

export function saveNavPrefs(hrefs: string[], items: NavItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAV_PREFS_STORAGE_KEY, JSON.stringify(sanitizeNavPrefs(hrefs, items)));
  } catch {
    /* تخزينٌ ممتلئ/محظور — التفضيل جهازيّ غير حرج، يبقى الافتراض */
  }
}

export function clearNavPrefs(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(NAV_PREFS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
