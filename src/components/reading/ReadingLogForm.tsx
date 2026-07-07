"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { Book, ReadingLog } from "@/lib/types";
import { uid, today } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface ReadingLogFormProps {
  books: Book[];
  defaultBookId?: string;
  initial?: ReadingLog; // when set, the form edits this log instead of adding
  onClose: () => void;
}

export function ReadingLogForm({ books, defaultBookId, initial, onClose }: ReadingLogFormProps) {
  const { addReadingLog, updateReadingLog, updateBook } = useAppStore();
  const activeBooks = books.filter((b) => b.status === "أقرأ");
  // When editing, allow the log's own book in the picker even if it's no
  // longer "أقرأ" (e.g. already finished), so its book can still be shown/kept.
  const selectableBooks =
    initial && !activeBooks.some((b) => b.id === initial.bookId)
      ? [...books.filter((b) => b.id === initial.bookId), ...activeBooks]
      : activeBooks;
  const [bookId, setBookId] = useState(initial?.bookId ?? defaultBookId ?? activeBooks[0]?.id ?? "");
  const [pagesRead, setPagesRead] = useState(initial ? String(initial.pagesRead) : "");
  const [minutes, setMinutes] = useState(initial?.minutesRead ? String(initial.minutesRead) : "");
  const [date, setDate] = useState(initial?.date ?? today());

  const selectedBook = books.find((b) => b.id === bookId);

  function handleSave() {
    const pages = parseInt(pagesRead);
    if (!bookId || !pages || pages <= 0) return;

    if (initial) {
      // Edit the log record only. The book's currentPage is left untouched
      // (it was already advanced when the log was first created, and stays
      // editable via the book form) — re-advancing here would double-count.
      updateReadingLog(initial.id, {
        bookId,
        date,
        pagesRead: pages,
        minutesRead: parseInt(minutes) || undefined,
      });
      onClose();
      return;
    }

    addReadingLog({ id: uid(), bookId, date, pagesRead: pages, minutesRead: parseInt(minutes) || undefined });

    if (selectedBook) {
      const newPage = Math.min(selectedBook.currentPage + pages, selectedBook.totalPages);
      const updates: Partial<Book> = { currentPage: newPage };
      if (newPage >= selectedBook.totalPages && selectedBook.totalPages > 0) {
        updates.status = "أنهيت";
        updates.finishDate = date;
      }
      updateBook(bookId, updates);
    }
    onClose();
  }

  if (!selectableBooks.length) {
    return (
      <div className="text-center py-6 text-gray-400 text-sm space-y-2">
        <p>لا توجد كتب تقرأها الآن</p>
        <p className="text-xs">أضف كتاباً وغيّر حالته إلى "أقرأه الآن"</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">الكتاب</label>
        <select
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-reading/40"
        >
          {selectableBooks.map((b) => (
            <option key={b.id} value={b.id}>{b.title}</option>
          ))}
        </select>
      </div>

      {selectedBook && selectedBook.totalPages > 0 && (
        <div className="bg-reading/5 rounded-xl p-3 text-sm text-gray-600">
          الصفحة الحالية: {selectedBook.currentPage} / {selectedBook.totalPages}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">صفحات قرأتها</label>
          <input
            type="number"
            value={pagesRead}
            onChange={(e) => setPagesRead(e.target.value)}
            placeholder="0"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-reading/40"
            inputMode="numeric"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">دقائق القراءة</label>
          <input
            type="number"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="اختياري"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-reading/40"
            inputMode="numeric"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">التاريخ</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-reading/40"
        />
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          className="flex-1"
          style={{ backgroundColor: "#e07b39" }}
        >
          {initial ? "حفظ التعديل" : "تسجيل القراءة"}
        </Button>
        <Button variant="secondary" onClick={onClose}>إلغاء</Button>
      </div>
    </div>
  );
}
