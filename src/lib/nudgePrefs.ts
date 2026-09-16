// ===================== تفضيلُ التذكيرات — جهازيّ لا مُزامَن =====================
// «خلّني أقدر أحذف هذه الميزة» — فالإطفاءُ شرطُ قبولها لا استثناءٌ منها.
//
// **ولماذا جهازيّ لا في `AppData`؟** لأنّه تفضيلُ عرضٍ كتفضيلات المال والثيم
// والتنقّل: من أطفأه على حاسوبه ليس بالضرورة يريده مطفأً على جوّاله، وإقحامُه
// في اللقطة يجعله سادسَ حقلٍ يجب أن يمرّ بالبوّابات الستّ بلا فائدةٍ تُذكر.
//
// وكلُّ لمسٍ للتخزين يمرّ بـ`platform/prefs` — لا `localStorage` من داخل
// `src/lib` (حارسُ `platform/seam.test.ts` يُسقط البناء عند أوّل تسرّب).
import { prefGetJSON, prefSetJSON } from "./platform/prefs";
import type { NudgeMoment } from "./nudges";

export const NUDGE_PREFS_KEY = "madar-nudges";

export interface NudgePrefs {
  /** غيابُه = مفعّلة (الافتراض إظهار). */
  on?: boolean;
  /** آخرُ تذكيرٍ أُخفي: «YYYY-MM-DD:moment». إخفاءٌ لهذه اللحظة وحدها. */
  hidden?: string;
}

/** رمزُ لحظةٍ بعينها — إخفاءُ حصادِ اليوم لا يُخفي افتتاحَ الغد. */
export function nudgeToken(dateStr: string, moment: NudgeMoment): string {
  return `${dateStr}:${moment}`;
}

/** التنقيةُ مفصولةٌ عن القراءة عمداً (كما في `readPrefsFrom` في القرآن): القيمةُ
 *  الخام تُختبر بلا تخزينٍ ولا DOM، وما لا يُفهم يُقرأ غياباً لا كسراً — تفضيلٌ
 *  كتبته نسخةٌ أقدم أو يدٌ عابثة لا يستحقّ أن يُسقط البهو. */
export function sanitizeNudgePrefs(raw: unknown): NudgePrefs {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: NudgePrefs = {};
  if (typeof r.on === "boolean") out.on = r.on;
  if (typeof r.hidden === "string") out.hidden = r.hidden;
  return out;
}

export function readNudgePrefs(): NudgePrefs {
  return sanitizeNudgePrefs(prefGetJSON<unknown>(NUDGE_PREFS_KEY));
}

export function writeNudgePrefs(prefs: NudgePrefs): void {
  prefSetJSON(NUDGE_PREFS_KEY, prefs);
}

export function nudgesEnabled(prefs: NudgePrefs): boolean {
  return prefs.on !== false;
}

export function nudgeHidden(prefs: NudgePrefs, token: string): boolean {
  return prefs.hidden === token;
}
