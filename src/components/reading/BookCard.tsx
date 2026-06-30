"use client";
import type { Book } from "@/lib/types";
import { Trash2, Star } from "lucide-react";

const COLORS = [
  "#7c6fcd", "#3d9640", "#e07b39", "#4a9fbd", "#e05555",
  "#d4a017", "#6b8e6b", "#9b6fcd",
];

interface BookCardProps {
  book: Book;
  onDelete?: (id: string) => void;
  onClick?: () => void;
}

export function BookCard({ book, onDelete, onClick }: BookCardProps) {
  const progress = book.totalPages > 0 ? (book.currentPage / book.totalPages) * 100 : 0;
  const color = book.coverColor ?? COLORS[book.id.charCodeAt(0) % COLORS.length];

  const statusConfig = {
    أقرأ: { label: "أقرأ الآن", bg: "bg-blue-50 text-blue-600" },
    أنهيت: { label: "أنهيت", bg: "bg-green-50 text-green-600" },
    أريد_قراءة: { label: "قائمة القراءة", bg: "bg-gray-100 text-gray-500" },
  };

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div
        className="h-24 flex items-center justify-center relative"
        style={{ backgroundColor: color + "20" }}
      >
        <div
          className="w-14 h-20 rounded-lg shadow-md flex items-end justify-center pb-2"
          style={{ backgroundColor: color }}
        >
          <span className="text-white text-2xl">📖</span>
        </div>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(book.id); }}
            className="absolute top-2 left-2 p-1 bg-white/80 rounded-full text-gray-400 hover:text-red-400"
          >
            <Trash2 size={13} />
          </button>
        )}
        <div className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusConfig[book.status].bg}`}>
          {statusConfig[book.status].label}
        </div>
      </div>

      <div className="p-3 space-y-2">
        <div>
          <h3 className="text-sm font-bold text-gray-900 line-clamp-1">{book.title}</h3>
          <p className="text-xs text-gray-400">{book.author}</p>
        </div>

        {book.status === "أقرأ" && book.totalPages > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>صفحة {book.currentPage}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, backgroundColor: color }}
              />
            </div>
          </div>
        )}

        {book.status === "أنهيت" && book.rating && (
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={12}
                fill={i < book.rating! ? "#d4a017" : "transparent"}
                stroke={i < book.rating! ? "#d4a017" : "#d1d5db"}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
