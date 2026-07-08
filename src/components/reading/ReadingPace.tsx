"use client";
import type { Book, ReadingLog } from "@/lib/types";

interface ReadingPaceProps {
  book: Book;
  logs: ReadingLog[];
}

export function ReadingPace({ book, logs }: ReadingPaceProps) {
  if (book.status !== "أقرأ" || !book.totalPages) return null;

  const bookLogs = logs.filter((l) => l.bookId === book.id);
  if (bookLogs.length < 2) {
    return (
      <div className="bg-reading/5 rounded-xl p-3 text-xs text-reading text-center">
        سجّل يومين متواصلين لحساب وتيرة القراءة 📖
      </div>
    );
  }

  const totalPages = bookLogs.reduce((s, l) => s + l.pagesRead, 0);
  const days = bookLogs.length;
  const avgPerDay = totalPages / days;
  const remaining = book.totalPages - book.currentPage;
  const daysLeft = avgPerDay > 0 ? Math.ceil(remaining / avgPerDay) : null;

  const finishDate = daysLeft
    ? new Date(Date.now() + daysLeft * 86400000).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="bg-reading/5 rounded-xl p-3 space-y-2">
      <p className="text-xs font-semibold text-reading">وتيرة قراءتك</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-base font-bold text-gray-800">{Math.round(avgPerDay)}</div>
          <div className="text-[10px] text-gray-500">صفحة/يوم</div>
        </div>
        <div>
          <div className="text-base font-bold text-gray-800">{remaining}</div>
          <div className="text-[10px] text-gray-500">صفحة متبقية</div>
        </div>
        <div>
          <div className="text-base font-bold text-gray-800">{daysLeft ?? "؟"}</div>
          <div className="text-[10px] text-gray-500">يوم للإنهاء</div>
        </div>
      </div>
      {finishDate && (
        <p className="text-xs text-center text-gray-500">
          ستنهي الكتاب تقريباً في <strong className="text-reading">{finishDate}</strong>
        </p>
      )}
    </div>
  );
}
