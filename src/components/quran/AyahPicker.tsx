"use client";
import { SURAHS } from "@/lib/quran/meta";
import { NumberInput } from "@/components/ui/NumberInput";

export interface AyahSelection {
  surah: number; // 1..114
  fromAyah: number;
  toAyah: number;
}

// منتقي مقطع: سورة + من آية → إلى آية، مع معاينة النصّ العثماني الحقيقي
// (يُمرَّر text المُحمّل). يُعيد الاختيار عبر onChange، ويضبط المدى داخل حدود
// السورة تلقائياً. مشترك بين التدبّر والحفظ (وحدة «آيات»).
export function AyahPicker({
  text, value, onChange, accent = "#1b6b4c",
}: {
  text: string[] | null;
  value: AyahSelection;
  onChange: (v: AyahSelection) => void;
  accent?: string;
}) {
  const surah = SURAHS[value.surah - 1] ?? SURAHS[0];
  const maxAyah = surah.ayat;

  function setSurah(num: number) {
    const s = SURAHS[num - 1];
    // إعادة ضبط المدى إلى الآية الأولى عند تبديل السورة.
    onChange({ surah: num, fromAyah: 1, toAyah: Math.min(value.toAyah > value.fromAyah ? 1 : 1, s.ayat) });
  }
  function setFrom(n: number) {
    const from = clamp(n, 1, maxAyah);
    onChange({ ...value, fromAyah: from, toAyah: Math.max(from, value.toAyah) });
  }
  function setTo(n: number) {
    const to = clamp(n, value.fromAyah, maxAyah);
    onChange({ ...value, toAyah: to });
  }

  const preview: { id: number; n: number; text: string }[] = [];
  if (text) {
    for (let a = value.fromAyah; a <= value.toAyah && a <= maxAyah; a++) {
      preview.push({ id: surah.first + (a - 1), n: a, text: text[surah.first + (a - 1)] ?? "" });
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex gap-2 items-center flex-wrap">
        <select
          value={value.surah}
          onChange={(e) => setSurah(Number(e.target.value))}
          className="flex-1 min-w-[130px] text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white dark:bg-[#241c12] focus:outline-none focus:ring-2"
          style={{ ["--tw-ring-color" as string]: accent + "66" }}
        >
          {SURAHS.map((s) => (
            <option key={s.num} value={s.num}>{s.num}. {s.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-gray-400">من</span>
          <NumberInput
            value={String(value.fromAyah)}
            onChange={(v) => setFrom(parseInt(v) || 1)}
            inputMode="numeric"
            className="w-14 text-sm text-center border border-gray-200 rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2"
          />
          <span className="text-[11px] text-gray-400">إلى</span>
          <NumberInput
            value={String(value.toAyah)}
            onChange={(v) => setTo(parseInt(v) || value.fromAyah)}
            inputMode="numeric"
            className="w-14 text-sm text-center border border-gray-200 rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2"
          />
        </div>
      </div>
      <p className="text-[10px] text-gray-400">
        {surah.name}: {maxAyah} آية{value.toAyah > value.fromAyah ? ` · اخترت ${value.toAyah - value.fromAyah + 1} آيات` : ""}
      </p>

      {/* معاينة النصّ العثماني */}
      <div className="rounded-xl bg-gray-50 dark:bg-[#2c2318] p-3 max-h-52 overflow-y-auto">
        {!text ? (
          <p className="text-xs text-gray-400 text-center py-3">…جارٍ تحميل المصحف</p>
        ) : (
          <p className="font-quran text-center text-[19px] leading-[2.3] font-bold text-gray-800 dark:text-gray-100">
            {preview.map((p) => (
              <span key={p.id}>
                {p.text}
                <span className="text-quran text-[12px] align-middle mx-0.5">﴿{p.n}﴾</span>{" "}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}
