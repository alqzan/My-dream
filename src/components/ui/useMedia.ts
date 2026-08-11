"use client";
import { useSyncExternalStore } from "react";
import { subscribeMedia, mediaCacheVersion, peekMedia, requestMedia } from "@/lib/mediaCache";
import type { MediaSource } from "@/lib/mediaSources";

// يُنادى **مرّةً في أعلى المكوّن**، فيعيد رسمه كلّما وصلت بايتاتٌ جديدة. بعده
// يجوز نداء `resolveMedia` أينما كان — داخل `.map` وداخل الشروط — لأنّه دالةٌ
// عادية لا خطّاف. هذا هو سبب فصلهما: العرض يقع في حلقاتٍ لا تحتمل الخطّافات.
export function useMediaCacheVersion(): number {
  return useSyncExternalStore(subscribeMedia, mediaCacheVersion, () => 0);
}

/** بايتات كل مصدر **بمحاذاة `sources` موضعاً بموضع**: نصٌّ إن حضرت، و`null` إن
 *  كان مرجعاً لم يُقرأ بعد (ويُطلَب هنا فيظهر في الرسم التالي). المحاذاة مهمّة
 *  حيث الموضع نفسه له معنى — «الصورة الأولى» في بطاقة المذكرة مثلاً. */
export function resolveMediaSlots(sources: MediaSource[]): (string | null)[] {
  return sources.map((s) => {
    if (s.inline !== undefined) return s.inline;
    const bytes = peekMedia(s.hash);
    if (bytes) return bytes;
    requestMedia(s.hash, s.kind);
    return null;
  });
}

/** الحاضر منها فقط، بترتيبه — للمعارض والعارض حيث تُرقَّم الصور المعروضة وحدها.
 *  ما لم يصل بعدُ ليس ضائعاً: مصدره باقٍ على المذكرة ويظهر في الرسم التالي. */
export function resolveMedia(sources: MediaSource[]): string[] {
  return resolveMediaSlots(sources).filter((s): s is string => s !== null);
}
