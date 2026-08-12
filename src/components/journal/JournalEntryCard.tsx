"use client";
import type { JournalEntry } from "@/lib/types";
import { MOODS } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { entryPhotoSources, entryAudioSources } from "@/lib/mediaSources";
import { useMediaCacheVersion } from "@/components/ui/useMedia";
import { stripMarkdown } from "@/lib/markdown";
import { PhotoCollage } from "./PhotoCollage";
import { Trash2, Clock, Mic, Film, Star, Paperclip } from "lucide-react";

interface JournalEntryCardProps {
  entry: JournalEntry;
  onDelete?: (id: string) => void;
  onClick?: () => void;
  onToggleStar?: (id: string) => void;
  /** في الخطّ الزمني يحمل رأسُ اليوم التاريخَ، فلا تكرّره البطاقة. */
  showDate?: boolean;
}

const MOOD_OF = new Map(MOODS.map((m) => [m.value, m]));

export function JournalEntryCard({
  entry,
  onDelete,
  onClick,
  onToggleStar,
  showDate = false,
}: JournalEntryCardProps) {
  const plain = stripMarkdown(entry.content);
  const preview = plain.slice(0, 220) + (plain.length > 220 ? "…" : "");
  // العدّ من **المصادر** لا من البايتات الحاضرة: مذكرةٌ صورُها في مخزن الهاش
  // ولم تُقرأ بعد لها صورٌ فعلاً، فلا تُعرض كأنها بلا صور ثم يقفز التخطيط.
  useMediaCacheVersion();
  const photoSources = entryPhotoSources(entry);
  const audioSources = entryAudioSources(entry);
  const mood = entry.mood ? MOOD_OF.get(entry.mood) : undefined;
  const tags = entry.tags ?? [];
  const attachments = entry.attachmentRefs?.length ?? 0;
  const videos = entry.videoRefs?.length ?? 0;

  return (
    <div
      className="group bg-[var(--surface)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden card-shadow cursor-pointer transition-shadow duration-300 hover:shadow-lg"
      onClick={onClick}
    >
      {photoSources.length > 0 && (
        // كلّ الصور في كولاجٍ واحد بدل غلافٍ مقصوصٍ وعدّادٍ يخفي الباقي.
        <PhotoCollage sources={photoSources} rounded="rounded-none" />
      )}

      <div className="p-3.5 space-y-2">
        {/* سطر الطابع: الوقت والشعور ورموز الوسائط — ثمّ أزرار البطاقة */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] text-gray-400 min-w-0">
            {mood && (
              <span className="text-sm leading-none" title={mood.label} aria-label={`الشعور: ${mood.label}`}>
                {mood.emoji}
              </span>
            )}
            {showDate && <span className="font-medium truncate">{formatDate(entry.date)}</span>}
            {entry.time && (
              <span className="flex items-center gap-0.5 tabular-nums">
                <Clock size={10} />
                {entry.time}
              </span>
            )}
            {audioSources.length > 0 && (
              <span className="flex items-center gap-0.5 text-journal" aria-label="ملاحظة صوتية">
                <Mic size={12} />
                {audioSources.length > 1 && <span>{audioSources.length}</span>}
              </span>
            )}
            {videos > 0 && (
              <span className="flex items-center gap-0.5 text-reading" aria-label="مقطع فيديو">
                <Film size={12} />
                {videos > 1 && <span>{videos}</span>}
              </span>
            )}
            {attachments > 0 && (
              <span className="flex items-center gap-0.5 text-gray-400" aria-label="مرفق">
                <Paperclip size={11} />
                {attachments > 1 && <span>{attachments}</span>}
              </span>
            )}
            {entry.source === "dayOne" && (
              <span className="text-[10px] bg-purple-50 text-purple-500 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                Day One
              </span>
            )}
          </div>
          {/* الأزرار تبقى ظاهرةً على اللمس (لا hover على الجوّال) وتخفت لونياً. */}
          <div className="flex items-center gap-0.5 shrink-0">
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

        {entry.title && (
          <h3 className="text-[17px] font-black text-gray-900 leading-snug">{entry.title}</h3>
        )}

        {entry.question && (
          <p className="text-[11px] text-journal bg-journal/10 rounded-lg px-2.5 py-1.5 leading-relaxed line-clamp-2">
            💭 {entry.question}
          </p>
        )}

        {preview.trim() && (
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line line-clamp-3">
            {preview}
          </p>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {tags.slice(0, 4).map((t) => (
              <span key={t} className="text-[10px] font-medium text-journal bg-journal/10 px-2 py-0.5 rounded-full">
                #{t}
              </span>
            ))}
            {tags.length > 4 && (
              <span className="text-[10px] text-gray-400 px-1 py-0.5">
                و{tags.length - 4} غيرها
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
