"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useAppStore } from "@/lib/store";
import { getJournalStreak, formatDate, hijriDate, today, parseDate, toDateStr, arabicMonthName, entryPhotos, entryAudios, normalizeArabic } from "@/lib/utils";
import { renderMarkdown, stripMarkdown } from "@/lib/markdown";
import { dailyQuestion } from "@/lib/questions";
import { JournalEntryCard } from "@/components/journal/JournalEntryCard";
import { JournalForm } from "@/components/journal/JournalForm";
// Day One import pulls in the ZIP decoder (fflate) — load it only when the
// import sheet is actually opened, keeping it out of the journal page bundle.
const DayOneImport = dynamic(
  () => import("@/components/journal/DayOneImport").then((m) => m.DayOneImport),
  { ssr: false, loading: () => <div className="py-10 text-center text-sm text-gray-400">…جارٍ التحميل</div> }
);
import { FutureLetters } from "@/components/journal/FutureLetters";
import { QuestionMoon } from "@/components/journal/QuestionMoon";
import { StreakCalendar } from "@/components/journal/StreakCalendar";
import { MemorySky } from "@/components/journal/MemorySky";
import { DayView } from "@/components/day/DayView";
import { Photo } from "@/components/ui/Photo";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionSignet } from "@/components/layout/SectionSignet";
import type { JournalEntry } from "@/lib/types";
import { Plus, Upload, Search, Flame, Clock, CalendarHeart, PenLine, ChevronRight, ChevronLeft, Star } from "lucide-react";
import { showUndo } from "@/components/ui/UndoToast";

export default function JournalPage() {
  const { journalEntries, deleteJournalEntry, addJournalEntry, updateJournalEntry } = useAppStore();

  // Instant delete + 5s undo window instead of a confirm dialog.
  function handleDelete(id: string) {
    const entry = journalEntries.find((e) => e.id === id);
    deleteJournalEntry(id);
    if (entry) showUndo("حذفت المذكرة", () => addJournalEntry(entry));
  }
  function handleToggleStar(id: string) {
    const entry = journalEntries.find((e) => e.id === id);
    if (entry) updateJournalEntry(id, { starred: !entry.starred });
  }
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editEntry, setEditEntry] = useState<JournalEntry | undefined>();
  const [search, setSearch] = useState("");
  const [selectedYear, setSelectedYear] = useState("الكل");
  const [onlyStarred, setOnlyStarred] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  // Viewing an entry from the filtered list keeps its index so the viewer can
  // step to the prev/next one; viewing one from outside it (memories, random
  // memory) that the current filters happen to exclude falls back to a plain
  // one-off view with no prev/next.
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [adhocEntry, setAdhocEntry] = useState<JournalEntry | undefined>();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "gallery" | "sky">("list");
  // Render the newest page of entries first; "عرض المزيد" reveals more. Keeps
  // a big archive (e.g. after a Day One import) from mounting hundreds of
  // cards — and their images — all at once. A search shows all its matches.
  const PAGE = 40;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const GALLERY_PAGE = 60;
  const [galleryCount, setGalleryCount] = useState(GALLERY_PAGE);

  // PWA shortcut: "مذكرة جديدة" launches with ?new=1 — open the composer
  // immediately and drop the param so a later reload doesn't reopen it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setShowForm(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

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

  // كل السنوات الموجودة في الأرشيف — لشريط رقائق السنوات فوق القائمة.
  const years = useMemo(() => {
    const set = new Set(journalEntries.map((e) => e.date.slice(0, 4)));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [journalEntries]);

  // كل الوسوم المستخدمة، مرتّبة حسب التكرار (الأكثر استخداماً أولاً).
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of journalEntries) {
      for (const t of e.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [journalEntries]);

  const filtered = useMemo(() => {
    const q = normalizeArabic(search.trim());
    const list = journalEntries.filter((e) => {
      if (selectedYear !== "الكل" && !e.date.startsWith(selectedYear)) return false;
      if (onlyStarred && !e.starred) return false;
      if (selectedTag && !(e.tags ?? []).includes(selectedTag)) return false;
      if (!q) return true;
      return (
        normalizeArabic(e.content).includes(q) ||
        normalizeArabic(e.title ?? "").includes(q) ||
        normalizeArabic(e.question ?? "").includes(q) ||
        (e.tags ?? []).some((t) => normalizeArabic(t).includes(q))
      );
    });
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [journalEntries, search, selectedYear, onlyStarred, selectedTag]);

  function selectYear(y: string) {
    setSelectedYear(y);
    setVisibleCount(PAGE);
  }
  function toggleStarredFilter() {
    setOnlyStarred((v) => !v);
    setVisibleCount(PAGE);
  }
  function selectTag(t: string) {
    setSelectedTag((cur) => (cur === t ? null : t));
    setVisibleCount(PAGE);
  }

  // Open the viewer at this entry's position in the current filtered list (so
  // prev/next can step through it); if the entry isn't in it (e.g. opened from
  // "في مثل هذا اليوم" while a search/filter hides it), fall back to a plain
  // one-off view with no prev/next.
  function openViewer(entry: JournalEntry) {
    const idx = filtered.findIndex((e) => e.id === entry.id);
    if (idx >= 0) {
      setViewIndex(idx);
      setAdhocEntry(undefined);
    } else {
      setViewIndex(null);
      setAdhocEntry(entry);
    }
  }
  function closeViewer() {
    setViewIndex(null);
    setAdhocEntry(undefined);
  }
  const viewEntry = viewIndex !== null ? filtered[viewIndex] : adhocEntry;
  function stepViewer(delta: number) {
    if (viewIndex === null) return;
    const next = viewIndex + delta;
    if (next < 0 || next >= filtered.length) return;
    setViewIndex(next);
  }

  useEffect(() => {
    if (viewIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") stepViewer(1);
      else if (e.key === "ArrowLeft") stepViewer(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewIndex, filtered.length]);

  // 🎲 ذكرى عشوائية — مذكرة عمرها أكثر من ٣٠ يوماً، أو أي مذكرة إن كان الأرشيف صغيراً.
  function openRandomMemory() {
    if (!journalEntries.length) return;
    const cutoffDate = parseDate(todayStr);
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const cutoff = toDateStr(cutoffDate);
    const pool = journalEntries.filter((e) => e.date < cutoff);
    const list = pool.length > 0 ? pool : journalEntries;
    openViewer(list[Math.floor(Math.random() * list.length)]);
  }

  // Browsing is paged; an active search shows all its matches.
  const searching = search.trim().length > 0;
  const visible = useMemo(
    () => (searching ? filtered : filtered.slice(0, visibleCount)),
    [filtered, searching, visibleCount]
  );
  const hasMore = !searching && filtered.length > visible.length;

  // تجميع حسب الشهر — عرض أجمل للمذكرات القديمة والرجوع لها
  const grouped = useMemo(() => {
    const groups: { key: string; label: string; entries: JournalEntry[] }[] = [];
    for (const entry of visible) {
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
  }, [visible]);

  // تبويب المعرض — كل صور المذكرات المطابقة للفلاتر الحالية، أحدث أولاً.
  const galleryPhotos = useMemo(() => {
    const items: { entry: JournalEntry; url: string }[] = [];
    for (const entry of filtered) {
      for (const url of entryPhotos(entry)) items.push({ entry, url });
    }
    return items;
  }, [filtered]);
  const visibleGallery = galleryPhotos.slice(0, galleryCount);
  const hasMoreGallery = galleryPhotos.length > visibleGallery.length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <div className="flex items-center gap-2.5">
            <SectionSignet href="/journal" />
            <h1 className="text-2xl font-bold text-gray-900">المذكرات</h1>
            {journalEntries.length > 0 && (
              <button
                onClick={openRandomMemory}
                className="text-xs font-bold text-journal bg-journal/10 hover:bg-journal/20 rounded-full px-2.5 py-1 press"
              >
                🎲 ذكرى عشوائية
              </button>
            )}
          </div>
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
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
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
          <QuestionMoon />
        </div>
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
              const yearsAgo = parseInt(todayStr) - parseInt(m.date);
              return (
                <button
                  key={m.id}
                  onClick={() => openViewer(m)}
                  className="w-full text-right bg-white/70 dark:bg-white/5 rounded-xl px-3 py-2.5 hover:bg-white transition-colors press"
                >
                  <p className="text-[11px] font-bold text-brand-600 mb-0.5">
                    قبل {yearsAgo === 1 ? "سنة" : yearsAgo === 2 ? "سنتين" : `${yearsAgo} سنوات`} — {formatDate(m.date)}
                  </p>
                  {m.title && <p className="text-sm font-bold text-gray-800 mb-0.5">{m.title}</p>}
                  <p className="text-xs text-gray-500 line-clamp-1">{stripMarkdown(m.content)}</p>
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
          type="search"
          aria-label="ابحث في المذكرات"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث في العناوين والنصوص والأسئلة..."
          className="w-full bg-white border border-gray-200 rounded-xl pr-9 pl-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-journal/30"
        />
      </div>

      {/* شريط السنوات + فلتر المفضلة */}
      <div className="flex gap-2 overflow-x-auto pb-1 animate-fade-up stagger-3">
        <button
          onClick={() => selectYear("الكل")}
          className={`shrink-0 text-sm px-3 py-1.5 rounded-full border transition-colors ${
            selectedYear === "الكل" ? "bg-journal text-white border-journal" : "bg-white border-gray-200 text-gray-500"
          }`}
        >
          الكل
        </button>
        {years.map((y) => (
          <button
            key={y}
            onClick={() => selectYear(y)}
            className={`shrink-0 text-sm px-3 py-1.5 rounded-full border transition-colors ${
              selectedYear === y ? "bg-journal text-white border-journal" : "bg-white border-gray-200 text-gray-500"
            }`}
          >
            {y}
          </button>
        ))}
        <button
          onClick={toggleStarredFilter}
          className={`shrink-0 text-sm px-3 py-1.5 rounded-full border transition-colors ${
            onlyStarred ? "bg-amber-400 text-white border-amber-400" : "bg-white border-gray-200 text-gray-500"
          }`}
        >
          ⭐ المفضلة
        </button>
      </div>

      {/* شريط الوسوم — فلترة بضغطة */}
      {allTags.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 animate-fade-up stagger-3">
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => selectTag(t)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                selectedTag === t ? "bg-journal text-white border-journal" : "bg-white border-gray-200 text-gray-500"
              }`}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {/* تبديل قائمة/معرض/سماء */}
      <div className="flex bg-gray-100 dark:bg-[#2c2318] rounded-xl p-1 animate-fade-up stagger-4">
        <button
          onClick={() => setView("list")}
          className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-all ${
            view === "list" ? "bg-white dark:bg-[#241c12] text-journal shadow-sm" : "text-gray-400"
          }`}
        >
          المذكرات
        </button>
        <button
          onClick={() => setView("gallery")}
          className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-all ${
            view === "gallery" ? "bg-white dark:bg-[#241c12] text-journal shadow-sm" : "text-gray-400"
          }`}
        >
          معرض 🖼️
        </button>
        <button
          onClick={() => setView("sky")}
          className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-all ${
            view === "sky" ? "bg-white dark:bg-[#241c12] text-journal shadow-sm" : "text-gray-400"
          }`}
        >
          السماء ✦
        </button>
      </div>

      {view === "sky" ? (
        <div className="animate-fade-up stagger-4">
          <MemorySky entries={filtered} memories={memories} onOpen={openViewer} />
        </div>
      ) : view === "list" ? (
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
                  onToggleStar={handleToggleStar}
                  onClick={() => openViewer(entry)}
                />
              ))}
            </div>
          ))}
          {hasMore && (
            <button
              onClick={() => setVisibleCount((c) => c + PAGE)}
              className="w-full py-3 text-sm font-bold text-journal bg-journal/10 hover:bg-journal/20 rounded-2xl transition-colors press"
            >
              عرض المزيد ({filtered.length - visible.length})
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3 animate-fade-up stagger-4">
          {galleryPhotos.length === 0 ? (
            <EmptyState emoji="🖼️" title="لا صور بعد" subtitle="الصور المرفقة بمذكراتك تظهر هنا" />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1">
                {visibleGallery.map((item, i) => (
                  <button
                    key={`${item.entry.id}-${i}`}
                    onClick={() => openViewer(item.entry)}
                    className="aspect-square overflow-hidden rounded-lg press"
                  >
                    <img
                      src={item.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
              {hasMoreGallery && (
                <button
                  onClick={() => setGalleryCount((c) => c + GALLERY_PAGE)}
                  className="w-full py-3 text-sm font-bold text-journal bg-journal/10 hover:bg-journal/20 rounded-2xl transition-colors press"
                >
                  عرض المزيد ({galleryPhotos.length - visibleGallery.length})
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* محرّر المذكرة بملء الشاشة (يدير رقعته الكاملة بنفسه، لا نافذة) */}
      {(showForm || editEntry) && (
        <JournalForm
          onClose={() => { setShowForm(false); setEditEntry(undefined); }}
          initial={editEntry}
        />
      )}

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
        onClose={closeViewer}
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
              <button
                onClick={() => handleToggleStar(viewEntry.id)}
                aria-label={viewEntry.starred ? "إزالة من المفضلة" : "إضافة للمفضلة"}
                className={`p-1 rounded-lg press ${viewEntry.starred ? "text-amber-400" : "text-gray-300 hover:text-amber-400"}`}
              >
                <Star size={16} fill={viewEntry.starred ? "currentColor" : "none"} />
              </button>
            </div>
            {viewEntry.question && (
              <p className="text-xs text-journal bg-journal/10 rounded-xl px-3 py-2 leading-relaxed">
                💭 {viewEntry.question}
              </p>
            )}
            {(viewEntry.tags?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {viewEntry.tags!.map((t) => (
                  <button
                    key={t}
                    onClick={() => { selectTag(t); closeViewer(); }}
                    className="text-[11px] font-medium bg-journal/10 text-journal px-2.5 py-1 rounded-full hover:bg-journal/20 press"
                  >
                    #{t}
                  </button>
                ))}
              </div>
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
            {entryAudios(viewEntry).map((a, i) => (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio key={i} controls src={a} className="w-full h-10" />
            ))}
            <div
              className="prose-journal text-[15px] leading-loose text-gray-800 min-h-[160px]"
              dir="auto"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(viewEntry.content) }}
            />
            {viewIndex !== null && filtered.length > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                <button
                  onClick={() => stepViewer(1)}
                  disabled={viewIndex >= filtered.length - 1}
                  aria-label="التالي"
                  className="flex items-center gap-1 text-xs font-bold text-gray-500 disabled:opacity-30 press"
                >
                  <ChevronRight size={16} /> التالي
                </button>
                <span className="text-[11px] text-gray-400">{viewIndex + 1} / {filtered.length}</span>
                <button
                  onClick={() => stepViewer(-1)}
                  disabled={viewIndex <= 0}
                  aria-label="السابق"
                  className="flex items-center gap-1 text-xs font-bold text-gray-500 disabled:opacity-30 press"
                >
                  السابق <ChevronLeft size={16} />
                </button>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setEditEntry(viewEntry); closeViewer(); }}
                className="flex-1"
              >
                تعديل
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => { handleDelete(viewEntry.id); closeViewer(); }}
              >
                حذف
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <DayView date={selectedDay} onClose={() => setSelectedDay(null)} />

      {/* زر عائم لكتابة مذكرة سريعة — مثل زر المصروف السريع في الرئيسية */}
      <button
        onClick={() => setShowForm(true)}
        className="fab p-4 rounded-full bg-journal text-white shadow-lg shadow-journal/30 press"
        aria-label="اكتب مذكرة جديدة"
      >
        <Plus size={22} />
      </button>
    </div>
  );
}
