"use client";
import type { JournalEntry } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { entryPhotoSources, entryAudioSources } from "@/lib/mediaSources";
import { useMediaCacheVersion, resolveMediaSlots } from "@/components/ui/useMedia";
import { stripMarkdown } from "@/lib/markdown";
import { AppImage } from "@/components/ui/AppImage";
import { Trash2, Clock, Images, Mic, Film, Star } from "lucide-react";

interface JournalEntryCardProps {
  entry: JournalEntry;
  onDelete?: (id: string) => void;
  onClick?: () => void;
  onToggleStar?: (id: string) => void;
}

export function JournalEntryCard({ entry, onDelete, onClick, onToggleStar }: JournalEntryCardProps) {
  const plain = stripMarkdown(entry.content);
  const preview = plain.slice(0, 180) + (plain.length > 180 ? "..." : "");
  // العدّ من **المصادر** لا من البايتات الحاضرة: مذكرةٌ صورُها في مخزن الهاش
  // ولم تُقرأ بعد لها صورٌ فعلاً، فلا تُعرض كأنها بلا صور ثم يقفز التخطيط.
  useMediaCacheVersion();
  const photoSources = entryPhotoSources(entry);
  const cover = resolveMediaSlots(photoSources)[0];
  const audioSources = entryAudioSources(entry);

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden card-shadow cursor-pointer"
      onClick={onClick}
    >
      {photoSources.length > 0 && (
        <div className="relative">
          {cover ? (
            <AppImage src={cover} alt="صورة اليوم" className="w-full h-36 object-cover" />
          ) : (
            // البايتات تُقرأ من مخزن الهاش الآن — نحجز المساحة نفسها فلا يقفز
            // التخطيط لحظة وصولها.
            <div className="w-full h-36 bg-gray-100 dark:bg-white/5 animate-pulse" aria-hidden />
          )}
          {photoSources.length > 1 && (
            <span className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/55 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              <Images size={11} />
              +{photoSources.length - 1}
            </span>
          )}
        </div>
      )}
      <div className="p-4 space-y-2">
        {/* العنوان أولاً — أكبر وأغمق */}
        {entry.title && (
          <h3 className="text-lg font-black text-gray-900 leading-snug">{entry.title}</h3>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="font-medium">{formatDate(entry.date)}</span>
            {entry.time && (
              <span className="flex items-center gap-0.5">
                <Clock size={10} />
                {entry.time}
              </span>
            )}
            {audioSources.length > 0 && (
              <span className="flex items-center gap-0.5 text-journal" aria-label="ملاحظة صوتية">
                <Mic size={12} />
                {audioSources.length > 1 && <span className="text-[10px]">{audioSources.length}</span>}
              </span>
            )}
            {entry.videoRefs && entry.videoRefs.length > 0 && (
              <span className="flex items-center gap-0.5 text-reading" aria-label="مقطع فيديو">
                <Film size={12} />
                {entry.videoRefs.length > 1 && <span className="text-[10px]">{entry.videoRefs.length}</span>}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {entry.source === "dayOne" && (
              <span className="text-[10px] bg-purple-50 text-purple-500 px-2 py-0.5 rounded-full font-medium">
                Day One
              </span>
            )}
            {onToggleStar && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleStar(entry.id); }}
                aria-label={entry.starred ? "إزالة من المفضلة" : "إضافة للمفضلة"}
                className={`p-1 rounded-lg press ${entry.starred ? "text-amber-400" : "text-gray-300 hover:text-amber-400"}`}
              >
                <Star size={14} fill={entry.starred ? "currentColor" : "none"} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
                aria-label="حذف المذكرة"
                className="p-1 text-gray-300 hover:text-red-400 rounded-lg press"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {entry.question && (
          <p className="text-[11px] text-journal bg-journal/10 rounded-lg px-2.5 py-1.5 leading-relaxed">
            💭 {entry.question}
          </p>
        )}

        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line line-clamp-3">
          {preview}
        </p>
      </div>
    </div>
  );
}
