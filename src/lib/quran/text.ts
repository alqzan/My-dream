import { surahAyahToId } from "./meta";

// نصّ المصحف كامل (6236 آية، رسم عثماني) يُحمّل عند الطلب أوّل مرّة فقط
// (chunk منفصل عبر import الديناميكي) ثم يُخزَّن — فلا يُثقل الحزمة الأولى.
let cache: string[] | null = null;
let loading: Promise<string[]> | null = null;

export async function loadAyahText(): Promise<string[]> {
  if (cache) return cache;
  if (!loading) {
    loading = import("./ayahText.json").then((m) => {
      cache = (m.default ?? m) as unknown as string[];
      return cache;
    });
  }
  return loading;
}

// نصّ آية بمعرّفها العام (بعد التحميل).
export function textById(text: string[], id: number): string {
  return text[id] ?? "";
}

// نصّ آية بـ(سورة، آية).
export function textOf(text: string[], surah: number, ayah: number): string {
  return text[surahAyahToId(surah, ayah)] ?? "";
}

// نصوص مدى معرّفات [start, end] مع معرّف كل آية — لعرض صفحة/جزء/مقطع.
export function textsInRange(text: string[], start: number, end: number): { id: number; text: string }[] {
  const out: { id: number; text: string }[] = [];
  for (let id = start; id <= end; id++) out.push({ id, text: text[id] ?? "" });
  return out;
}
