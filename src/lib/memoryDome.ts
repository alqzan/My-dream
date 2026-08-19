/**
 * **قبّةُ الذكريات** — مواضعُ النجوم في سماء المذكرات، منقولةٌ من تصميم مدار.
 *
 * القاعدة: **زاويةُ النجمة = يومُها من السنة**، فالسماءُ خريطةٌ زمنيةٌ لا
 * رصفٌ عشوائيّ — يناير عند طرفٍ وديسمبر عند الطرف الآخر، وتُقرأ كثافةُ سنتك
 * بنظرة. ونصفُ القطر من هاشِ المعرّف وحدَه، فموضعُ النجمة **ثابتٌ عبر
 * الجلسات والأجهزة**: لو كان عشوائياً لتحرّكت سماؤك كلَّ مرةٍ تفتحها.
 *
 * نقيٌّ بلا DOM ولا متجر، كبقيّة `src/lib/*.ts`.
 */
import type { JournalEntry } from "./types";
import { entryPhotos } from "./utils";

/** لوحةُ الرسم في التصميم: ١٠٠ × ٦٦. */
export const DOME_W = 100;
export const DOME_H = 66;

/** ألوانُ المزاج في السماء — أدفأ من ألوان الواجهة لأنّ خلفيتَها ليلية. */
export const MOOD_SKY: Record<number, string> = {
  1: "#e08a63", // صعب
  2: "#e0a06f", // ثقيل
  3: "#f4ead6", // عادي
  4: "#8fbcd8", // جميل
  5: "#e8c07a", // رائع
};

/** اليومُ من السنة (١..٣٦٦) من مفتاح تاريخٍ محليّ. */
export function dayOfYear(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return 1;
  const dt = new Date(y, m - 1, d);
  return Math.floor((dt.getTime() - new Date(y, 0, 0).getTime()) / 86400000);
}

/**
 * هاشٌ حتميٌّ في [٠،١) — FNV‑1a. الحتميّةُ هي المقصود: نفسُ المعرّف يعطي
 * نفسَ الموضع على كلّ جهازٍ وفي كلّ فتحة.
 */
export function hashUnit(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/** إحداثيّاتُ نقطةٍ على القبّة من زاويةٍ (بالدرجات) وبُعدٍ نسبيّ (٠..١). */
export function domePoint(angleDeg: number, factor: number): { x: number; y: number } {
  const r = (angleDeg * Math.PI) / 180;
  return {
    x: +(50 + factor * 47 * Math.cos(r)).toFixed(2),
    y: +(64 - factor * 55 * Math.sin(r)).toFixed(2),
  };
}

/** الزاويةُ الأساسية ليومٍ من السنة — من ١٢° إلى ١٦٨° عبر السنة. */
export function baseAngle(doy: number): number {
  return 12 + (doy / 366) * 156;
}

export interface SkyStar {
  id: string;
  x: number;
  y: number;
  /** نصفُ قطر النجمة. */
  r: number;
  /** نصفُ قطر الهالة — صفرٌ لمن لا هالةَ له. */
  halo: number;
  color: string;
  /** مذكرةٌ بلا نصّ تُرسم حلقةً مجوّفة: أثرٌ بلا كلمات. */
  hollow: boolean;
  opacity: number;
  starred: boolean;
}

/** نجمةٌ لكلّ مذكرة، بموضعٍ حتميّ. */
export function skyStars(entries: JournalEntry[]): SkyStar[] {
  return entries.map((e) => {
    const key = e.id || e.date;
    const doy = dayOfYear(e.date);
    // نثرٌ صغيرٌ حول زاوية اليوم حتى لا تتراكب مذكرتا اليوم الواحد تماماً.
    const ang = Math.max(8, Math.min(172, baseAngle(doy) + (hashUnit(key, 0x811c9dc5) - 0.5) * 7));
    const pt = domePoint(ang, 0.36 + hashUnit(key, 0x1000193) * 0.64);
    const hasPhoto = entryPhotos(e).length > 0;
    const starred = !!e.starred;
    const wordless = !(e.content || "").replace(/<[^>]+>/g, "").trim();
    const r = 0.5 + (hasPhoto ? 0.35 : 0) + (starred ? 0.35 : 0);
    return {
      id: e.id,
      x: pt.x,
      y: pt.y,
      r: wordless ? r + 0.35 : r,
      halo: starred || hasPhoto ? r * 3.2 : 0,
      color: MOOD_SKY[e.mood ?? 3] ?? MOOD_SKY[3],
      hollow: wordless,
      opacity: starred ? 0.98 : hasPhoto ? 0.85 : 0.62,
      starred,
    };
  });
}

/**
 * غبارُ السماء — أربعون نقطةً خافتة. مولَّدٌ ببذرةٍ ثابتة لا بـ`Math.random`:
 * غبارٌ يتحرّك مع كلّ رسمةٍ يجعل السماء تهتزّ بلا سبب.
 */
export function skyDust(count = 40): { x: number; y: number; r: number; o: number }[] {
  let sd = 0x9e3779b1;
  const rnd = () => {
    sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0;
    return sd / 0xffffffff;
  };
  return Array.from({ length: count }, () => {
    const pt = domePoint(6 + rnd() * 168, 0.15 + rnd() * 0.9);
    return { x: pt.x, y: pt.y, r: +(0.16 + rnd() * 0.22).toFixed(2), o: +(0.12 + rnd() * 0.22).toFixed(2) };
  });
}

/**
 * «في مثل هذا اليوم» — أقدمُ مذكرةٍ تشترك مع اليوم في الشهر واليوم، وإلّا
 * فأقربُ ما يشترك في رقم اليوم وحدَه. تُرسم مذنَّباً لا نجمة.
 */
export function todayInHistory(entries: JournalEntry[], todayStr: string): JournalEntry | null {
  const md = todayStr.slice(5); // MM-DD
  const dd = todayStr.slice(8); // DD
  const sameDayMonth = entries.find((e) => e.date.slice(5) === md && e.date < todayStr);
  if (sameDayMonth) return sameDayMonth;
  const sameDay = entries.find((e) => e.date.slice(8) === dd && e.date < todayStr);
  return sameDay ?? null;
}
