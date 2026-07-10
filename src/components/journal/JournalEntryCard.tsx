"use client";
import type { JournalEntry } from "@/lib/types";
import { MOOD_LABELS } from "@/lib/types";
import { formatDate, entryPhotos, entryAudios } from "@/lib/utils";
import { stripMarkdown } from "@/lib/markdown";
import { Trash2, Clock, Images, Mic, Film } from "lucide-react";

interface JournalEntryCardProps {
  entry: JournalEntry;
  onDelete?: (id: string) => void;
  onClick?: () => void;
}

export function JournalEntryCard({ entry, onDelete, onClick }: JournalEntryCardProps) {
  const mood = entry.mood ? MOOD_LABELS[entry.mood] : null;
  const plain = stripMarkdown(entry.content);
  const preview = plain.slice(0, 180) + (plain.length > 180 ? "..." : "");
  const photos = entryPhotos(entry);

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-sm transition-shadow cursor-pointer"
      onClick={onClick}
    >
      {photos.length > 0 && (
        <div className="relative">
          <img src={photos[0]} alt="صورة اليوم" className="w-full h-36 object-cover" />
          {photos.length > 1 && (
            <span className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/55 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              <Images size={11} />
              +{photos.length - 1}
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
            {mood && <span className="text-base">{mood.icon}</span>}
            <span className="font-medium">{formatDate(entry.date)}</span>
            {entry.time && (
              <span className="flex items-center gap-0.5">
                <Clock size={10} />
                {entry.time}
              </span>
            )}
            {entryAudios(entry).length > 0 && (
              <span className="flex items-center gap-0.5 text-journal" aria-label="ملاحظة صوتية">
                <Mic size={12} />
                {entryAudios(entry).length > 1 && <span className="text-[10px]">{entryAudios(entry).length}</span>}
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
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
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
