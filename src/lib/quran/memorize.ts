import type { MemorizationItem, MemorizationKind } from "../types";
import {
  SURAHS, juzRange, hizbRange, pageRange, surahAyahToId,
} from "./meta";

// مسوّدة نموذج الإضافة — كل الوحدات في كائنٍ واحد، ونُشتقّ منها ما يلزم الوحدة
// المختارة فقط.
export interface MemDraft {
  kind: MemorizationKind;
  surah: number;
  fromAyah: number;
  toAyah: number;
  juz: number;
  hizb: number;
  fromPage: number;
  toPage: number;
  pageRange: boolean; // مدى أوجه بدل وجهٍ واحد
  fraction: number; // 1 | 0.5 | 0.25 لوجهٍ واحد
}

export const DEFAULT_MEM_DRAFT: MemDraft = {
  kind: "surah",
  surah: 67, // الملك — بداية مألوفة للحفظ
  fromAyah: 1,
  toAyah: 1,
  juz: 30,
  hizb: 60,
  fromPage: 1,
  toPage: 1,
  pageRange: false,
  fraction: 1,
};

function rangeCount(r: { start: number; end: number }): number {
  return r.end - r.start + 1;
}

// يُشتقّ من المسوّدة الحقولُ المخزّنة + الوصف العربي + عدد الآيات (للتقدّم).
export function finalizeMem(d: MemDraft): Partial<MemorizationItem> {
  switch (d.kind) {
    case "surah": {
      const s = SURAHS[d.surah - 1];
      return { kind: "surah", surah: d.surah, label: `سورة ${s.name}`, ayatCount: s.ayat };
    }
    case "ayat": {
      const s = SURAHS[d.surah - 1];
      const from = Math.min(d.fromAyah, d.toAyah);
      const to = Math.max(d.fromAyah, d.toAyah);
      const label = to > from ? `${s.name} ${from}–${to}` : `${s.name} ${from}`;
      return { kind: "ayat", surah: d.surah, fromAyah: from, toAyah: to, label, ayatCount: to - from + 1 };
    }
    case "juz": {
      const r = juzRange(d.juz);
      return { kind: "juz", juz: d.juz, label: `الجزء ${d.juz}`, ayatCount: rangeCount(r) };
    }
    case "hizb": {
      const r = hizbRange(d.hizb);
      return { kind: "hizb", hizb: d.hizb, label: `الحزب ${d.hizb}`, ayatCount: rangeCount(r) };
    }
    case "page": {
      if (d.pageRange) {
        const from = Math.min(d.fromPage, d.toPage);
        const to = Math.max(d.fromPage, d.toPage);
        let count = 0;
        for (let p = from; p <= to; p++) count += rangeCount(pageRange(p));
        return { kind: "page", fromPage: from, toPage: to, fraction: 1, label: `الأوجه ${from}–${to}`, ayatCount: count };
      }
      const base = rangeCount(pageRange(d.fromPage));
      const f = d.fraction;
      const label = f === 0.5 ? `نصف وجه ${d.fromPage}` : f === 0.25 ? `ربع وجه ${d.fromPage}` : `وجه ${d.fromPage}`;
      return { kind: "page", fromPage: d.fromPage, fraction: f, label, ayatCount: Math.max(1, Math.round(base * f)) };
    }
  }
}

// مدى معرّفات الآيات لعرض نصّ العنصر (أو null إن كان قديماً بلا مرجع بنيوي).
export function memRange(m: MemorizationItem): { start: number; end: number } | null {
  switch (m.kind) {
    case "surah": {
      const s = SURAHS[(m.surah ?? 1) - 1];
      return { start: s.first, end: s.first + s.ayat - 1 };
    }
    case "ayat": {
      const s = m.surah ?? 1;
      return { start: surahAyahToId(s, m.fromAyah ?? 1), end: surahAyahToId(s, m.toAyah ?? m.fromAyah ?? 1) };
    }
    case "juz":
      return juzRange(m.juz ?? 1);
    case "hizb":
      return hizbRange(m.hizb ?? 1);
    case "page": {
      const from = m.fromPage ?? 1;
      const to = m.toPage ?? from;
      return { start: pageRange(from).start, end: pageRange(to).end };
    }
    default:
      // عنصر قديم بحقول fromAyah/toAyah بلا surah — لا مدى معرّفات موثوق.
      return null;
  }
}

// تقدّم الحفظ الكلّي: مجموع الآيات المحفوظة ونسبتها وتقديرٌ بالأوجه.
export function memProgress(items: MemorizationItem[]): { ayat: number; pct: number; pages: number } {
  const ayat = items.reduce((s, m) => s + (m.ayatCount ?? 0), 0);
  const TOTAL = 6236;
  const PAGES = 604;
  return {
    ayat,
    pct: Math.min(100, Math.round((ayat / TOTAL) * 100)),
    pages: Math.round((ayat / TOTAL) * PAGES),
  };
}
