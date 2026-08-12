"use client";
import { useMemo, useState } from "react";
import type { JournalEntry } from "@/lib/types";
import type { MediaSource } from "@/lib/mediaSources";
import { isWallFeature } from "@/lib/photoLayout";
import { arabicMonthName, formatDate } from "@/lib/utils";
import { plainTitle } from "@/lib/markdown";
import { useMediaCacheVersion, resolveMediaSlots } from "@/components/ui/useMedia";
import { AppImage } from "@/components/ui/AppImage";
import { ImageLightbox } from "@/components/ui/ImageLightbox";

// ===================== جدار الصور =====================
// كان المعرض شبكةَ مربّعاتٍ متطابقة بلا سياق: ألف صورةٍ متساوية، والضغطة تفتح
// المذكرة فتضيع الصورة نفسها. هنا:
//   • تُجمَّع الصور بالشهر، فيُقرأ الجدار زمناً لا كومة.
//   • كلّ صورةٍ سادسة تتمدّد مربّعاً 2×2 (`isWallFeature`) فيتنفّس الإيقاع.
//   • الضغطة تفتح العارض على الصورة نفسها — بتاريخها وعنوانها وزرٍّ للمذكرة.

export interface WallPhoto {
  entry: JournalEntry;
  source: MediaSource;
}

interface MonthWall {
  key: string;
  label: string;
  /** فهارس الصور في القائمة المسطّحة — العارض يُرقّم الجدار كلّه لا الشهر. */
  indices: number[];
}

export function PhotoWall({
  photos,
  onOpenEntry,
}: {
  photos: WallPhoto[];
  onOpenEntry: (entry: JournalEntry) => void;
}) {
  const [zoom, setZoom] = useState<number | null>(null);
  // اشتراكٌ واحدٌ للجدار كلّه — البلاطات بعده رسمٌ لا خطّافات.
  useMediaCacheVersion();

  const months = useMemo(() => {
    const out: MonthWall[] = [];
    photos.forEach((p, i) => {
      const key = p.entry.date.slice(0, 7);
      let month = out[out.length - 1];
      if (!month || month.key !== key) {
        const [y, m] = key.split("-").map(Number);
        out.push((month = { key, label: `${arabicMonthName(m - 1)} ${y}`, indices: [] }));
      }
      month.indices.push(i);
    });
    return out;
  }, [photos]);

  // **البلاطات المعروضة وحدها** تُقرأ بايتاتُها؛ التقسيم بالشهر لا يلمس بايتة.
  const slots = resolveMediaSlots(photos.map((p) => p.source));
  // العارض يُرقّم الحاضر فقط — نبني له قائمته وخريطةً من فهرس الجدار إليها.
  const shown: { url: string; wallIndex: number }[] = [];
  const zoomIndexOf = new Map<number, number>();
  slots.forEach((url, i) => {
    if (url === null) return;
    zoomIndexOf.set(i, shown.length);
    shown.push({ url, wallIndex: i });
  });

  const captions = shown.map(({ wallIndex }) => {
    const e = photos[wallIndex].entry;
    const t = plainTitle(e.title);
    return t ? `${t} · ${formatDate(e.date)}` : formatDate(e.date);
  });

  return (
    <div className="space-y-5">
      {months.map((month) => (
        <section key={month.key} className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-black text-journal bg-journal/10 px-3 py-1 rounded-full">
              {month.label}
            </span>
            <div className="flex-1 h-px bg-[var(--border-subtle)]" />
            <span className="text-[10px] text-gray-400 tabular-nums">{month.indices.length} صورة</span>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {month.indices.map((wallIndex, iInMonth) => {
              const url = slots[wallIndex];
              const feature = isWallFeature(iInMonth);
              return (
                <button
                  key={`${photos[wallIndex].entry.id}-${wallIndex}`}
                  onClick={() => {
                    const z = zoomIndexOf.get(wallIndex);
                    if (z !== undefined) setZoom(z);
                  }}
                  className={`relative overflow-hidden rounded-lg press bg-gray-100 dark:bg-white/5 ${
                    feature ? "col-span-2 row-span-2" : ""
                  }`}
                  style={{ aspectRatio: "1 / 1" }}
                  aria-label="افتح الصورة"
                >
                  {url ? (
                    <AppImage src={url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 animate-pulse" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {zoom !== null && (
        <ImageLightbox
          images={shown.map((s) => s.url)}
          index={zoom}
          captions={captions}
          onOpenEntry={(i) => {
            const wallIndex = shown[i]?.wallIndex;
            if (wallIndex === undefined) return;
            setZoom(null);
            onOpenEntry(photos[wallIndex].entry);
          }}
          onClose={() => setZoom(null)}
        />
      )}
    </div>
  );
}
