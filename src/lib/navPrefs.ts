import type { NavItem } from "./nav";

// تفضيلات التنقّل محلية لهذا الجهاز فقط، ولا تمسّ بيانات الأقسام أو المزامنة.
export const NAV_PREFS_STORAGE_KEY = "madar-nav-prefs";

// البهو أولاً، ثم بقية الأبواب في قائمة واحدة. يستطيع المستخدم تغييرها كاملةً.
export const DEFAULT_NAV_HREFS = ["/", "/quran", "/reading", "/journal", "/finance", "/prayers", "/stats"] as const;

export interface SavedNavPrefs {
  visible: string[];
  /** تفضيل قديم كان يعني «الأبواب الأساسية» لا الإخفاء. */
  legacy?: boolean;
}

export interface ResolvedNav {
  /** الأبواب الظاهرة مباشرةً بالترتيب الذي اختاره المستخدم. */
  visible: NavItem[];
  /** أبواب أخفاها المستخدم من التنقّل فقط، ولا تزال صفحاتها موجودة. */
  hidden: NavItem[];
}

/** ينظف روابط التفضيل من الروابط القديمة والتكرار، من دون حدّ عددي. */
export function sanitizeNavPrefs(hrefs: string[], items: NavItem[]): string[] {
  const valid = new Set(items.map((i) => i.href));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const href of hrefs) {
    if (!valid.has(href) || seen.has(href)) continue;
    seen.add(href);
    out.push(href);
  }
  return out;
}

function defaultHrefs(items: NavItem[]): string[] {
  return sanitizeNavPrefs([...DEFAULT_NAV_HREFS], items);
}

/**
 * يحلّ القائمة النهائية. التفضيل القديم (مصفوفة روابط) يُرحّل بإبقاء بقية
 * الأبواب ظاهرة بعد اختياراته؛ الإخفاء لا يبدأ إلا مع صيغة التفضيل الجديدة.
 */
export function resolveNav(items: NavItem[], saved: SavedNavPrefs | string[] | null): ResolvedNav {
  const legacy = Array.isArray(saved) || Boolean(saved?.legacy);
  const raw = Array.isArray(saved) ? saved : saved?.visible ?? [];
  const sanitized = sanitizeNavPrefs(raw, items);
  const selected = sanitized.length
    ? legacy
      ? [...sanitized, ...items.filter((item) => !sanitized.includes(item.href)).map((item) => item.href)]
      : sanitized
    : defaultHrefs(items);
  const byHref = new Map(items.map((i) => [i.href, i]));
  const visible = selected.map((href) => byHref.get(href)).filter((item): item is NavItem => Boolean(item));
  const visibleSet = new Set(visible.map((item) => item.href));
  const hidden = items.filter((item) => !visibleSet.has(item.href));
  return { visible, hidden };
}

// ---- localStorage wrapper (component-only) ----
export function loadNavPrefs(): SavedNavPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(NAV_PREFS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    // الصيغة القديمة: كانت تحدد خمسة أبواب أساسية، ولم تكن تقصد إخفاء البقية.
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return { visible: parsed, legacy: true };
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      "visible" in parsed &&
      Array.isArray(parsed.visible) &&
      parsed.visible.every((v) => typeof v === "string")
    ) {
      return { visible: parsed.visible };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveNavPrefs(hrefs: string[], items: NavItem[]): void {
  if (typeof window === "undefined") return;
  try {
    const visible = sanitizeNavPrefs(hrefs, items);
    window.localStorage.setItem(NAV_PREFS_STORAGE_KEY, JSON.stringify({ version: 2, visible }));
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
