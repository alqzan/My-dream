"use client";
import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { getJournalStreak, formatDate, hijriDate, today, arabicMonthName, entryPhotos } from "@/lib/utils";
import { dailyQuestion } from "@/lib/questions";
import { JournalEntryCard } from "@/components/journal/JournalEntryCard";
import { JournalForm } from "@/components/journal/JournalForm";
import { DayOneImport } from "@/components/journal/DayOneImport";
import { FutureLetters } from "@/components/journal/FutureLetters";
import { StreakCalendar } from "@/components/journal/StreakCalendar";
import { DayView } from "@/components/day/DayView";
import { Photo } from "@/components/ui/Photo";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { JournalEntry } from "@/lib/types";
import { Plus, Upload, Search, Flame, Clock, CalendarHeart, PenLine } from "lucide-react";
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

  const todayStr = today();
  const streak = getJournalStreak(journalEntries);
  const markedDates = journalEntries.map((e) => e.date);
  const question = dailyQuestion(todayStr);
  const hasToday = journalEntries.some((e) => e.date === todayStr);

  // «في مثل هذا اليوم» — مذكرات نفس اليوم والشهر من سنوات سابقة
  const memories = useMemo(() => {
    const mmdd = todayStr.slice(5);
    return journalEntries
      .filter((e) => e.date.slice(5) === mmdd && e.date < todayStr)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [journalEntries, todayStr]);

  const filtered = useMemo(() => {
    const list = journalEntries.filter(
      (e) =>
        !search ||
        e.content.includes(search) ||
        e.title?.includes(search) ||
        e.question?.includes(search)
    );
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [journalEntries, search]);

  // تجميع حسب الشهر — عرض أجمل للمذكرات القديمة والرجوع لها
  const grouped = useMemo(() => {
    const groups: { key: string; label: string; entries: JournalEntry[] }[] = [];
    for (const entry of filtered) {
      const key = entry.date.slice(0, 7);
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) {
        const [y, m] = key.split("-").map(Number);
        group = { key, label: `${arabicMonthName(m - 1)} ${y}`, entries: [] };
        groups.push(group);
      }
      group.entries.push(entry);
    }
    return groups;
  }, [filtered]);

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
            <span className="text-xs text-gray-300">•</span>
            <span className="text-xs text-gray-400">{journalEntries.length} مذكرة</span>
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

      {/* سؤال اليوم */}
      <div className="rounded-2xl p-4 text-white bg-gradient-to-l from-[#5d4a8a] via-[#7c6fcd] to-[#9587d6] card-shadow shine animate-fade-up stagger-1">
        <p className="text-[11px] font-bold opacity-80 mb-1">سؤال اليوم 💭</p>
        <p className="text-base font-bold leading-relaxed">{question}</p>
        {!hasToday && (
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 flex items-center gap-1.5 bg-white/95 hover:bg-white text-journal text-xs font-bold px-3.5 py-2 rounded-xl transition-colors press"
          >
            <PenLine size={13} />
            اكتب عنه الآن
          </button>
        )}
      </div>

      {/* رسائل لنفسك المستقبلية */}
      <div className="animate-fade-up stagger-2">
        <FutureLetters />
      </div>

      {/* في مثل هذا اليوم */}
      {memories.length > 0 && (
        <Card className="border-brand-200/60 bg-gradient-to-br from-brand-50 to-white dark:from-transparent dark:to-transparent animate-fade-up stagger-2">
          <div className="flex items-center gap-2 mb-2.5">
            <CalendarHeart size={16} className="text-brand-600" />
            <span className="text-sm font-bold text-gray-800">في مثل هذا اليوم 🕰️</span>
          </div>
          <div className="space-y-2">
            {memories.slice(0, 3).map((m) => {
              const years = parseInt(todayStr) - parseInt(m.date);
              return (
                <button
                  key={m.id}
                  onClick={() => setViewEntry(m)}
                  className="w-full text-right bg-white/70 dark:bg-white/5 rounded-xl px-3 py-2.5 hover:bg-white transition-colors press"
                >
                  <p className="text-[11px] font-bold text-brand-600 mb-0.5">
                    قبل {years === 1 ? "سنة" : years === 2 ? "سنتين" : `${years} سنوات`} — {formatDate(m.date)}
                  </p>
                  {m.title && <p className="text-sm font-bold text-gray-800 mb-0.5">{m.title}</p>}
                  <p className="text-xs text-gray-500 line-clamp-1">{m.content}</p>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="animate-fade-up stagger-3">
        <StreakCalendar markedDates={markedDates} color="#7c6fcd" onDayClick={setSelectedDay} />
      </Card>

      <div className="relative animate-fade-up stagger-3">
        <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث في العناوين والنصوص والأسئلة..."
          className="w-full bg-white border border-gray-200 rounded-xl pr-9 pl-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-journal/30"
        />
      </div>

      <div className="space-y-4 animate-fade-up stagger-4">
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
        {grouped.map((group) => (
          <div key={group.key} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-black text-journal bg-journal/10 px-3 py-1 rounded-full">
                {group.label}
              </span>
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[10px] text-gray-300">{group.entries.length}</span>
            </div>
            {group.entries.map((entry) => (
              <JournalEntryCard
                key={entry.id}
                entry={entry}
                onDelete={handleDelete}
                onClick={() => setViewEntry(entry)}
              />
            ))}
          </div>
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

      {/* عرض المذكرة — العنوان فوق بخط أكبر وغامق */}
      <Modal
        open={!!viewEntry}
        onClose={() => setViewEntry(undefined)}
        className="sm:max-w-2xl"
      >
        {viewEntry && (
          <div className="space-y-4 pt-4">
            {viewEntry.title && (
              <h2 className="text-2xl font-black text-gray-900 leading-snug">{viewEntry.title}</h2>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
              <span className="font-medium">{formatDate(viewEntry.date)}</span>
              <span className="text-gray-300">·</span>
              <span>{hijriDate(viewEntry.date)}</span>
              {viewEntry.time && (
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {viewEntry.time}
                </span>
              )}
              {viewEntry.source === "dayOne" && (
                <span className="text-[10px] bg-purple-50 text-purple-500 px-2 py-0.5 rounded-full font-medium">
                  Day One
                </span>
              )}
            </div>
            {viewEntry.question && (
              <p className="text-xs text-journal bg-journal/10 rounded-xl px-3 py-2 leading-relaxed">
                💭 {viewEntry.question}
              </p>
            )}
            {entryPhotos(viewEntry).length > 0 && (
              <div className="space-y-2">
                {entryPhotos(viewEntry).map((p, i) => (
                  <Photo
                    key={i}
                    images={entryPhotos(viewEntry)}
                    index={i}
                    className="w-full max-h-80 object-cover rounded-2xl"
                  />
                ))}
              </div>
            )}
            {viewEntry.audio && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio controls src={viewEntry.audio} className="w-full h-10" />
            )}
            <p className="text-sm leading-loose whitespace-pre-line text-gray-800 min-h-[160px]">
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
