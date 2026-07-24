// ===================== شدّة التمرين — الإعداد الوحيد =====================
// كان قسم الحفظ يطلب من المستخدم ضبط أربعة أرقام متفرّقة (عدد التكرار · حجم
// نافذة المراجعة القريبة · هدف الأوجه اليومي · وضمناً سلّم المباعدة). صار
// الجميع مشتقّاً من اختيارٍ واحد: خفيف / متوازن / مكثّف — تختاره مرّةً وتنساه.
//
// القيم ليست عشوائية: «متوازن» هو ما كان يعمل به التطبيق افتراضياً (تكرار 5،
// نافذة 5 أوجه، سقف 7 أوجه، سلّم 7/14/30/60)، فمن لم يغيّر شيئاً لا يتبدّل
// عنده سلوك. «خفيف» يُباعد أكثر ويُقلّل الحمل اليومي، و«مكثّف» يضغط المدد
// ويرفع السقف لمن يريد إتقاناً أسرع.

import type { HifzIntensity, HifzPlan } from "../types";

export interface IntensityPreset {
  reps: number; // كم مرّة تُكرَّر الآية في الحفظ الموجّه
  recentPages: number; // «المراجعة القريبة»: آخر كم وجهاً محفوظاً
  dailyReviewPages: number; // سقف الأوجه المستحقّة المعروضة في اليوم
  ladder: readonly number[]; // سلّم الإتقان بالأيام عند التقييم «متقن»
  goodDays: number; // «جيّد» → بعد كم يوماً
  needsDays: number; // «يحتاج إتقاناً» → بعد كم يوماً
  drillsPerDay: number; // كم موضع خطأ يُختبَر عليه في جلسة اليوم
}

export const INTENSITY: Record<HifzIntensity, IntensityPreset> = {
  light: {
    reps: 3, recentPages: 3, dailyReviewPages: 4,
    ladder: [10, 21, 45, 90], goodDays: 5, needsDays: 2, drillsPerDay: 3,
  },
  balanced: {
    reps: 5, recentPages: 5, dailyReviewPages: 7,
    ladder: [7, 14, 30, 60], goodDays: 3, needsDays: 1, drillsPerDay: 5,
  },
  intense: {
    reps: 7, recentPages: 8, dailyReviewPages: 12,
    ladder: [5, 10, 21, 45], goodDays: 2, needsDays: 1, drillsPerDay: 8,
  },
};

export const DEFAULT_INTENSITY: HifzIntensity = "balanced";

export const INTENSITY_LABEL: Record<HifzIntensity, { name: string; hint: string }> = {
  light: { name: "خفيف", hint: "مراجعةٌ أوسع مباعدةً وحملٌ يوميّ أقل — للأيام المزدحمة." },
  balanced: { name: "متوازن", hint: "الإيقاع المعتاد: تكرارٌ خمس مرّات ومراجعةٌ متدرّجة." },
  intense: { name: "مكثّف", hint: "مددٌ أقصر وسقفٌ أعلى — إتقانٌ أسرع بجهدٍ أكبر." },
};

export function intensityOf(plan: HifzPlan | null | undefined): HifzIntensity {
  const v = plan?.intensity;
  return v === "light" || v === "balanced" || v === "intense" ? v : DEFAULT_INTENSITY;
}

export function presetOf(plan: HifzPlan | null | undefined): IntensityPreset {
  return INTENSITY[intensityOf(plan)];
}
