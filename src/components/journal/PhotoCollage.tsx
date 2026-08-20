"use client";
import { useState } from "react";
import { collageLayout } from "@/lib/photoLayout";
import type { MediaSource } from "@/lib/mediaSources";
import { useMediaCacheVersion, resolveMediaSlots } from "@/components/ui/useMedia";
import { AppImage } from "@/components/ui/AppImage";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import type { JournalPhotoEdit } from "@/lib/types";
import { photoEditKey, photoEditTransform } from "@/lib/photoEdits";
import { Images } from "lucide-react";

// ===================== كولاج صور المذكرة =====================
// بديلُ الشريط المقصوص بارتفاعٍ ثابت (h-36) الذي كان يُظهر صورةً واحدةً ويخفي
// البقية خلف عدّاد. الشبكة تتبدّل بعدد الصور (`collageLayout`)، وأيّ بلاطةٍ لم
// تصل بايتاتُها بعدُ تحجز مكانها نابضةً فلا يقفز التخطيط عند وصولها.
//
// مكوّنان لحالتين مختلفتين قصداً:
//   • `PhotoCollage` — معاينةٌ صامتة داخل بطاقة القائمة: الضغطة تمرّ إلى
//     البطاقة فتفتح المذكرة كاملة، وما زاد عن أربعٍ يُختصر بشارة «+N».
//   • `EntryPhotos` — المذكرة المفتوحة: **كلّ** الصور في كولاجاتٍ متتابعة
//     (أربعٌ في كلٍّ)، والضغطة تفتح العارض على الصورة نفسها.

interface TileGridProps {
  /** ما تُرسم بلاطاتُه (تُقصّ عند أربعٍ، والباقي شارةُ «+N»). */
  sources: MediaSource[];
  /** البايتات المحلولة بمحاذاة `sources` — يحلّها المكوّن الأب مرّةً واحدة. */
  slots: (string | null)[];
  onTile?: (indexInSources: number) => void;
  edits?: Record<string, JournalPhotoEdit>;
  rounded: string;
  className: string;
}

function TileGrid({ sources, slots, onTile, edits, rounded, className }: TileGridProps) {
  const layout = collageLayout(sources.length);
  if (!layout.tiles.length) return null;

  return (
    <div
      className={`grid gap-0.5 overflow-hidden ${rounded} ${className}`}
      style={{
        gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
        gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
        aspectRatio: layout.aspect,
      }}
    >
      {layout.tiles.map((tile) => {
        const url = slots[tile.index];
        const last = tile.index === layout.tiles.length - 1;
        return (
          <div
            key={tile.index}
            style={{
              gridColumn: `${tile.col} / span ${tile.colSpan}`,
              gridRow: `${tile.row} / span ${tile.rowSpan}`,
            }}
            className="relative overflow-hidden bg-gray-100 dark:bg-white/5"
          >
            {url ? (
              <AppImage
                src={url}
                alt=""
                className={`w-full h-full object-cover transition-transform duration-150 ${onTile ? "cursor-zoom-in" : ""}`}
                style={{ transform: photoEditTransform(edits?.[photoEditKey(sources[tile.index])]) }}
                onClick={
                  onTile
                    ? (e) => {
                        e.stopPropagation();
                        onTile(tile.index);
                      }
                    : undefined
                }
              />
            ) : (
              <div className="w-full h-full animate-pulse" aria-hidden />
            )}
            {last && layout.overflow > 0 && (
              <div
                // أيقونةٌ ورقمٌ في عنصرين منفصلين لا نصّ «+4»: علامةُ الزائد
                // كانت تنقلب في سياق RTL، ثمّ تتراكب على الرقم في وزن الخطّ
                // الأسود. والأيقونة أوضح أصلاً — «صورٌ أخرى» لا عددٌ مجرّد.
                className="absolute inset-0 flex items-center justify-center gap-1 bg-black/45 text-white pointer-events-none"
                aria-label={`و${layout.overflow} صورة أخرى`}
              >
                <Images size={16} />
                <span className="text-base font-black">{layout.overflow}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** معاينةٌ صامتة داخل بطاقة القائمة — لا تبتلع الضغطة ولا تفتح عارضاً. */
export function PhotoCollage({
  sources,
  edits,
  className = "",
  rounded = "rounded-2xl",
}: {
  sources: MediaSource[];
  edits?: Record<string, JournalPhotoEdit>;
  className?: string;
  rounded?: string;
}) {
  // اشتراكٌ واحدٌ هنا يكفي لكل بلاطاته — `resolveMediaSlots` بعده دالةٌ عادية.
  useMediaCacheVersion();
  const drawn = sources.slice(0, 4);
  return (
    <TileGrid
      sources={sources}
      slots={resolveMediaSlots(drawn)}
      edits={edits}
      rounded={rounded}
      className={className}
    />
  );
}

/** كلّ صور المذكرة المفتوحة: كولاجٌ لكل أربع، وعارضٌ واحدٌ يمرّ عليها جميعاً. */
export function EntryPhotos({ sources, edits }: { sources: MediaSource[]; edits?: Record<string, JournalPhotoEdit> }) {
  const [zoom, setZoom] = useState<number | null>(null);
  useMediaCacheVersion();
  if (!sources.length) return null;

  const slots = resolveMediaSlots(sources);
  // العارض يُرقّم **الحاضر فقط**؛ الخريطة تترجم فهرس المصدر إلى فهرسٍ داخله،
  // وإلّا فتحت بلاطةٌ صورةً أخرى حين تتأخّر بايتاتُ صورةٍ قبلها.
  const shown: string[] = [];
  const shownSources: MediaSource[] = [];
  const zoomIndexOf = new Map<number, number>();
  slots.forEach((url, i) => {
    if (url === null) return;
    zoomIndexOf.set(i, shown.length);
    shown.push(url);
    shownSources.push(sources[i]);
  });

  const chunks: { start: number; sources: MediaSource[] }[] = [];
  for (let i = 0; i < sources.length; i += 4) {
    chunks.push({ start: i, sources: sources.slice(i, i + 4) });
  }

  return (
    <div className="space-y-1.5">
      {chunks.map((chunk) => (
        <TileGrid
          key={chunk.start}
          sources={chunk.sources}
          slots={slots.slice(chunk.start, chunk.start + chunk.sources.length)}
          edits={edits}
          rounded="rounded-2xl"
          className=""
          onTile={(i) => {
            const z = zoomIndexOf.get(chunk.start + i);
            if (z !== undefined) setZoom(z);
          }}
        />
      ))}
      {zoom !== null && (
        <ImageLightbox
          images={shown}
          index={zoom}
          imageEdits={shownSources.map((source) => edits?.[photoEditKey(source)])}
          onClose={() => setZoom(null)}
        />
      )}
    </div>
  );
}
