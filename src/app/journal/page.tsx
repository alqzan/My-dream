"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { getJournalStreak, formatDate, hijriDate } from "@/lib/utils";
import { JournalEntryCard } from "@/components/journal/JournalEntryCard";
import { JournalForm } from "@/components/journal/JournalForm";
import { DayOneImport } from "@/components/journal/DayOneImport";
import { StreakCalendar } from "@/components/journal/StreakCalendar";
import { DayView } from "@/components/day/DayView";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { JournalEntry } from "@/lib/types";
import { Plus, Upload, Search, Flame } from "lucide-react";
import { showUndo } from "@/components/ui/UndoToast";

export default function JournalPage() {
  const { journalEntries, deleteJournalEntry, addJournalEntry } = useAppStore();

  // Instant delete + 5s undo window instead of a confirm dialog.
  function handleDelete(id: string) {
    const entry = journalEntries.find((e) => e.id === id);
    deleteJournalEntry(id);
    if (entry) showUndo("حذفت المذكرة", () => addJournalEntry(entry));
  }
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editEntry, setEditEntry] = useState<JournalEntry | undefined>();
  const [search, setSearch] = useState("");
  const [viewEntry, setViewEntry] = useState<JournalEntry | undefined>();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const streak = getJournalStreak(journalEntries);
  const markedDates = journalEntries.map((e) => e.date);

  const filtered = journalEntries.filter(
    (e) =>
      !search ||
      e.content.includes(search) ||
      e.tags?.some((t) => t.includes(search))
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المذكرات</h1>
          <div className="flex items-center gap-2 mt-1">
            <Flame size={14} className={streak > 0 ? "text-orange-500 animate-flame" : "text-gray-300"} />
            <span className="text-sm text-gray-500">
              {streak > 0 ? `${streak} يوم متواصل` : "ابدأ سلسلتك اليوم"}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowImport(true)}
            className="gap-1.5"
          >
            <Upload size={14} />
            Day One
          </Button>
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5 bg-journal hover:bg-journal/90">
            <Plus size={16} />
            مذكرة
          </Button>
        </div>
      </div>

      <Card className="animate-fade-up stagger-1">
        <StreakCalendar markedDates={markedDates} color="#7c6fcd" onDayClick={setSelectedDay} />
      </Card>

      <div className="relative animate-fade-up stagger-2">
        <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث في مذكراتك..."
          className="w-full bg-white border border-gray-200 rounded-xl pr-9 pl-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-journal/30"
        />
      </div>

      <div className="space-y-3 animate-fade-up stagger-3">
        {filtered.length === 0 && (
          <EmptyState
            emoji="📓"
            title="لا توجد مذكرات بعد"
            subtitle="ابدأ بكتابة أول مذكرة أو استورد مذكراتك من Day One"
            action={
              <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5 bg-journal hover:bg-journal/90">
                <Plus size={14} /> اكتب أول مذكرة
              </Button>
            }
          />
        )}
        {filtered.map((entry) => (
          <JournalEntryCard
            key={entry.id}
            entry={entry}
            onDelete={handleDelete}
            onClick={() => setViewEntry(entry)}
          />
        ))}
      </div>

      <Modal
        open={showForm || !!editEntry}
        onClose={() => { setShowForm(false); setEditEntry(undefined); }}
        title={editEntry ? "تعديل المذكرة" : "مذكرة جديدة"}
      >
        <JournalForm
          onClose={() => { setShowForm(false); setEditEntry(undefined); }}
          initial={editEntry}
        />
      </Modal>

      <Modal
        open={showImport}
        onClose={() => setShowImport(false)}
        title="استيراد من Day One"
      >
        <DayOneImport onClose={() => setShowImport(false)} />
      </Modal>

      <Modal
        open={!!viewEntry}
        onClose={() => setViewEntry(undefined)}
        title={viewEntry ? `${formatDate(viewEntry.date)} · ${hijriDate(viewEntry.date)}` : ""}
        className="sm:max-w-2xl"
      >
        {viewEntry && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {viewEntry.tags?.map((t) => (
                <span key={t} className="text-xs bg-journal/10 text-journal px-2 py-0.5 rounded-full">{t}</span>
              ))}
            </div>
            <p className="text-sm leading-loose whitespace-pre-line text-gray-800 min-h-[200px]">
              {viewEntry.content}
            </p>
            <div className="flex gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setEditEntry(viewEntry); setViewEntry(undefined); }}
                className="flex-1"
              >
                تعديل
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => { handleDelete(viewEntry.id); setViewEntry(undefined); }}
              >
                حذف
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <DayView date={selectedDay} onClose={() => setSelectedDay(null)} />
    </div>
  );
}
