"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { Book } from "@/lib/types";
import { uid, today } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { NumberInput } from "@/components/ui/NumberInput";
import { Star } from "lucide-react";

const COLORS = [
  "#7c6fcd", "#3d9640", "#e07b39", "#4a9fbd", "#e05555",
  "#d4a017", "#6b8e6b", "#9b6fcd", "#555", "#e0a020",
];

interface BookFormProps {
  onClose: () => void;
  initial?: Book;
}

export function BookForm({ onClose, initial }: BookFormProps) {
  const { addBook, updateBook } = useAppStore();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [author, setAuthor] = useState(initial?.author ?? "");
  const [totalPages, setTotalPages] = useState(initial?.totalPages?.toString() ?? "");
  const [currentPage, setCurrentPage] = useState(initial?.currentPage?.toString() ?? "0");
  const [status, setStatus] = useState<Book["status"]>(initial?.status ?? "أريد_قراءة");
  const [color, setColor] = useState(initial?.coverColor ?? COLORS[0]);
  const [rating, setRating] = useState<number | undefined>(initial?.rating);
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function handleSave() {
    if (!title.trim()) return;
    const book: Book = {
      id: initial?.id ?? uid(),
      title: title.trim(),
      author: author.trim(),
      totalPages: parseInt(totalPages) || 0,
      currentPage: parseInt(currentPage) || 0,
      status,
      coverColor: color,
      rating,
      notes,
      startDate: status === "أقرأ" && !initial?.startDate ? today() : initial?.startDate,
      finishDate: status === "أنهيت" && !initial?.finishDate ? today() : initial?.finishDate,
    };
    if (initial) {
      updateBook(initial.id, book);
    } else {
      addBook(book);
    }
    onClose();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">عنوان الكتاب</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="اسم الكتاب"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-reading/40"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">المؤلف</label>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="اسم المؤلف"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-reading/40"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">عدد الصفحات</label>
          <NumberInput
            value={totalPages}
            onChange={setTotalPages}
            placeholder="0"
            inputMode="numeric"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-reading/40"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">الصفحة الحالية</label>
          <NumberInput
            value={currentPage}
            onChange={setCurrentPage}
            placeholder="0"
            inputMode="numeric"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-reading/40"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">الحالة</label>
        <div className="flex gap-2">
          {(["أريد_قراءة", "أقرأ", "أنهيت"] as Book["status"][]).map((s) => {
            const labels = { أريد_قراءة: "أريد قراءته", أقرأ: "أقرأه الآن", أنهيت: "أنهيته" };
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  status === s
                    ? "bg-reading/10 border-reading text-reading"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {labels[s]}
              </button>
            );
          })}
        </div>
      </div>

      {status === "أنهيت" && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">التقييم</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(rating === n ? undefined : n)}
                aria-label={`${n} من 5 نجوم`}
                aria-pressed={!!rating && n <= rating}
              >
                <Star
                  size={24}
                  fill={rating && n <= rating ? "#d4a017" : "transparent"}
                  stroke={rating && n <= rating ? "#d4a017" : "#d1d5db"}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">لون الغلاف</label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c, i) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`لون الغلاف ${i + 1}`}
              aria-pressed={color === c}
              className={`w-7 h-7 rounded-full transition-transform ${
                color === c ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : ""
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">ملاحظات</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="أفكار أو اقتباسات..."
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-reading/40 resize-none"
        />
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          className="flex-1"
          style={{ backgroundColor: "#e07b39" }}
        >
          {initial ? "حفظ" : "إضافة"}
        </Button>
        <Button variant="secondary" onClick={onClose}>إلغاء</Button>
      </div>
    </div>
  );
}
