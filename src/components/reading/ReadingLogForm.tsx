"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { Book } from "@/lib/types";
import { uid, today } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface ReadingLogFormProps {
  books: Book[];
  defaultBookId?: string;
  onClose: () => void;
}

export function ReadingLogForm({ books, defaultBookId, onClose }: ReadingLogFormProps) {
  const { addReadingLog, updateBook } = useAppStore();
  const activeBooks = books.filter((b) => b.status === "أقرأ");
  const [bookId, setBookId] = useState(defaultBookId ?? activeBooks[0]?.id ?? "");
  const [pagesRead, setPagesRead] = useState("");
  const [minutes, setMinutes] = useState("");
  const [date, setDate] = useState(today());

  const selectedBook = books.find((b) => b.id === bookId);

  function handleSave() {
    const pages = parseInt(pagesRead);
    if (!bookId || !pages || pages <= 0) return;

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

  if (!activeBooks.length) {
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
          {activeBooks.map((b) => (
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
          تسجيل القراءة
        </Button>
        <Button variant="secondary" onClick={onClose}>إلغاء</Button>
      </div>
    </div>
  );
}
