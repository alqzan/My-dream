"use client";
import type { JournalEntry } from "@/lib/types";
import { MOOD_LABELS } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Tag, Trash2 } from "lucide-react";

interface JournalEntryCardProps {
  entry: JournalEntry;
  onDelete?: (id: string) => void;
  onClick?: () => void;
}

export function JournalEntryCard({ entry, onDelete, onClick }: JournalEntryCardProps) {
  const mood = entry.mood ? MOOD_LABELS[entry.mood] : null;
  const preview = entry.content.slice(0, 180) + (entry.content.length > 180 ? "..." : "");

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-sm transition-shadow cursor-pointer"
      onClick={onClick}
    >
      {entry.photo && (
        <img src={entry.photo} alt="صورة اليوم" className="w-full h-36 object-cover" />
      )}
      <div className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {mood && <span className="text-lg">{mood.icon}</span>}
          <span className="text-sm font-semibold text-gray-800">{formatDate(entry.date)}</span>
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
              className="p-1 text-gray-300 hover:text-red-400 rounded-lg"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line line-clamp-3">
        {preview}
      </p>

      {entry.tags && entry.tags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Tag size={11} className="text-gray-400" />
          {entry.tags.map((tag) => (
            <span key={tag} className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
