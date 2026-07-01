"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { getReadingStreak } from "@/lib/utils";
import { BookCard } from "@/components/reading/BookCard";
import { BookForm } from "@/components/reading/BookForm";
import { ReadingLogForm } from "@/components/reading/ReadingLogForm";
import { ReadingPace } from "@/components/reading/ReadingPace";
import { StreakCalendar } from "@/components/journal/StreakCalendar";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import type { Book } from "@/lib/types";
import { Plus, BookOpen, Flame } from "lucide-react";

type FilterStatus = "الكل" | "أقرأ" | "أنهيت" | "أريد_قراءة";

export default function ReadingPage() {
  const { books, readingLogs, deleteBook } = useAppStore();
  const [showBookForm, setShowBookForm] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [editBook, setEditBook] = useState<Book | undefined>();
  const [filter, setFilter] = useState<FilterStatus>("الكل");

  const streak = getReadingStreak(readingLogs);
  const logDates = readingLogs.map((l) => l.date);

  const totalPagesRead = readingLogs.reduce((s, l) => s + l.pagesRead, 0);
  const totalMinutes = readingLogs.reduce((s, l) => s + (l.minutesRead ?? 0), 0);
  const booksFinished = books.filter((b) => b.status === "أنهيت").length;
  const currentBook = books.find((b) => b.status === "أقرأ");

  const filtered =
    filter === "الكل" ? books : books.filter((b) => b.status === filter);

  const filterLabels: Record<FilterStatus, string> = {
    الكل: "الكل",
    أقرأ: "أقرأ الآن",
    أنهيت: "أنهيت",
    أريد_قراءة: "قائمة القراءة",
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">القراءة</h1>
          <div className="flex items-center gap-2 mt-1">
            <Flame size={14} className={streak > 0 ? "text-reading animate-flame" : "text-gray-300"} />
            <span className="text-sm text-gray-500">
              {streak > 0 ? `${streak} يوم متواصل` : "سجّل قراءة اليوم"}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowLogForm(true)}
            className="gap-1.5"
          >
            <BookOpen size={14} />
            سجّل
          </Button>
          <Button
            size="sm"
            onClick={() => setShowBookForm(true)}
            className="gap-1.5 bg-reading hover:bg-reading/90"
          >
            <Plus size={16} />
            كتاب
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 animate-fade-up stagger-1">
        <div className="bg-reading/5 rounded-xl p-3 text-center card-shadow">
          <div className="text-xl font-bold text-reading tabular-nums"><AnimatedNumber value={books.length} /></div>
          <div className="text-[11px] text-gray-500 mt-0.5">كتاب</div>
        </div>
        <div className="bg-green-50 rounded-xl p-3 text-center card-shadow">
          <div className="text-xl font-bold text-finance tabular-nums"><AnimatedNumber value={booksFinished} /></div>
          <div className="text-[11px] text-gray-500 mt-0.5">أنهيت</div>
        </div>
        <div className="bg-orange-50 rounded-xl p-3 text-center card-shadow">
          <div className="text-xl font-bold text-orange-500 tabular-nums"><AnimatedNumber value={totalPagesRead} /></div>
          <div className="text-[11px] text-gray-500 mt-0.5">صفحة قرأت</div>
        </div>
      </div>

      <Card className="animate-fade-up stagger-2">
        <StreakCalendar markedDates={logDates} color="#e07b39" />
      </Card>

      {currentBook && (
        <ReadingPace book={currentBook} logs={readingLogs} />
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(["الكل", "أقرأ", "أنهيت", "أريد_قراءة"] as FilterStatus[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 text-sm px-3 py-1.5 rounded-full border transition-colors ${
              filter === f
                ? "bg-reading text-white border-reading"
                : "bg-white border-gray-200 text-gray-500"
            }`}
          >
            {filterLabels[f]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          emoji="📚"
          title="لا توجد كتب"
          subtitle="أضف أول كتاب في قائمتك وابدأ رحلة القراءة"
          action={
            <Button size="sm" onClick={() => setShowBookForm(true)} className="gap-1.5 bg-reading hover:bg-reading/90">
              <Plus size={14} /> أضف كتاباً
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 animate-fade-up stagger-3">
          {filtered.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onDelete={deleteBook}
              onClick={() => setEditBook(book)}
            />
          ))}
        </div>
      )}

      <Modal
        open={showBookForm || !!editBook}
        onClose={() => { setShowBookForm(false); setEditBook(undefined); }}
        title={editBook ? "تعديل الكتاب" : "إضافة كتاب"}
      >
        <BookForm
          onClose={() => { setShowBookForm(false); setEditBook(undefined); }}
          initial={editBook}
        />
      </Modal>

      <Modal
        open={showLogForm}
        onClose={() => setShowLogForm(false)}
        title="سجّل جلسة قراءة"
      >
        <ReadingLogForm
          books={books}
          onClose={() => setShowLogForm(false)}
        />
      </Modal>
    </div>
  );
}
