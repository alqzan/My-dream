// تفضيلات التوصيات محليّة بالجهاز فقط (لا تُزامَن — سلوكٌ يخصّ هذا الجهاز):
// تأجيلٌ (اليوم/الغد/الأسبوع) وإخفاءٌ لكلّ توصية بمفتاحها الثابت (dedupeKey).
// دوالٌّ نقيّة قابلة للاختبار + غلافٌ خفيف على localStorage.
import type { Insight, SnoozeOption } from "./insights";
import { today, toDateStr, parseDate } from "./utils";

export interface InsightPref {
  snoozedUntil?: string; // YYYY-MM-DD — مخفيّة حتى هذا اليوم (حصراً)
  dismissed?: boolean; // مخفيّة نهائياً
}
export type InsightPrefs = Record<string, InsightPref>;

const KEY = "madar-insight-prefs";

// اليوم المستحقّ لظهور التوصية ثانيةً بعد تأجيلٍ بخيار.
export function snoozeUntilDate(opt: SnoozeOption, todayStr: string): string {
  const d = parseDate(todayStr);
  const add = opt === "today" ? 1 : opt === "tomorrow" ? 2 : 8; // تظهر بعد انقضاء المدة
  d.setDate(d.getDate() + add);
  return toDateStr(d);
}

// تصفية التوصيات: تُسقط ما تجاوز صلاحيته، وما أُخفي، وما لا يزال مؤجّلاً.
export function filterInsights(list: Insight[], prefs: InsightPrefs, todayStr: string): Insight[] {
  return list.filter((ins) => {
    if (ins.validUntil && ins.validUntil < todayStr) return false;
    const p = prefs[ins.dedupeKey];
    if (!p) return true;
    if (p.dismissed) return false;
    if (p.snoozedUntil && p.snoozedUntil > todayStr) return false;
    return true;
  });
}

// ---- غلاف localStorage (يُستدعى من المكوّن فقط؛ الدوال أعلاه نقيّة) ----
export function loadPrefs(): InsightPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as InsightPrefs) : {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs: InsightPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* تخزينٌ ممتلئ/محظور — التفضيل جهازيّ غير حرج */
  }
}

export function snoozeInsight(key: string, opt: SnoozeOption): InsightPrefs {
  const prefs = loadPrefs();
  prefs[key] = { ...prefs[key], snoozedUntil: snoozeUntilDate(opt, today()) };
  savePrefs(prefs);
  return prefs;
}

export function dismissInsight(key: string): InsightPrefs {
  const prefs = loadPrefs();
  prefs[key] = { ...prefs[key], dismissed: true };
  savePrefs(prefs);
  return prefs;
}
