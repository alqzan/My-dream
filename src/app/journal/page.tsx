"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAppStore } from "@/lib/store";
import { getJournalStreak, formatDate, hijriDate, today, parseDate, toDateStr, arabicMonthName, normalizeArabic, uid, entriesCount, daysCount, displayTime } from "@/lib/utils";
import { entryPhotoSources, entryAudioSources } from "@/lib/mediaSources";
import { useMediaCacheVersion, resolveMedia } from "@/components/ui/useMedia";
import { MOODS } from "@/lib/types";
import { renderMarkdown, stripMarkdown, plainTitle } from "@/lib/markdown";
import { dailyQuestion } from "@/lib/questions";
import { duplicateDays } from "@/lib/mergeDay";
import { JournalTimeline } from "@/components/journal/JournalTimeline";
import { EntryPhotos } from "@/components/journal/PhotoCollage";
import { JournalAttachments } from "@/components/journal/JournalAttachments";
import { MemoryStrip } from "@/components/journal/MemoryStrip";
import { MergeBadge } from "@/components/journal/MergeBadge";
import { MergeDaysSheet } from "@/components/journal/MergeDaysSheet";
import { PhotoWall, type WallPhoto } from "@/components/journal/PhotoWall";
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
import { DayView } from "@/components/day/DayView";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionSignet } from "@/components/layout/SectionSignet";
import { MdrButton, TabBar, SectionHead } from "@/components/madar/primitives";
import { MemoryDome } from "@/components/madar/journal/MemoryDome";
import { MoonQuestion, MonthGrid, PastDays } from "@/components/madar/journal/JournalParts";
import type { JournalEntry } from "@/lib/types";
import { Plus, Upload, Search, Flame, Clock, PenLine, ChevronRight, ChevronLeft, Star, Zap, BarChart3, Combine } from "lucide-react";
import { showUndo } from "@/components/ui/UndoToast";
import { SECTION_DEEP } from "@/lib/palette";

const JOURNAL_TABS = ["السماء", "الشهر", "الصور", "الرسائل"] as const;
type JournalTab = (typeof JOURNAL_TABS)[number];

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
  // «سطر سريع» — التقاطُ خاطرةٍ في سطرٍ واحد دون فتح المحرّر الكامل.
  const [quickLine, setQuickLine] = useState("");
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
  // لوحة الدمج: `""` تعني «كل الأيام المكرّرة»، وتاريخٌ يعني يوماً بعينه.
  const [mergeDay, setMergeDay] = useState<string | null>(null);
  // تبويباتُ التصميم الأربعة. «الصور» تقود عرضَ المعرض القائم بدل مبدّلٍ ثانٍ
  // أسفل الصفحة — مبدّلان لشيءٍ واحد يربكان.
  const [topTab, setTopTab] = useState<JournalTab>("السماء");
  const [skyPick, setSkyPick] = useState<string | null>(null);
  const [calYear, setCalYear] = useState(() => Number(today().slice(0, 4)));
  const [calMonth, setCalMonth] = useState(() => Number(today().slice(5, 7)));
  const view: "list" | "gallery" = topTab === "الصور" ? "gallery" : "list";
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

  // بوصلة مدار → «ارجع لها»: تفتح البوصلة الصفحة بـ ?memory=<id> لتُعرض تلك
  // الذكرى مباشرةً بدل تركِ المستخدم يبحث عنها. ننتظر ترطيب المذكرات من
  // IndexedDB ثم نفتحها مرّةً واحدة ونُسقط الوسيط حتى لا يعاود الفتح عند التحديث.
  const memoryOpened = useRef(false);
  useEffect(() => {
    if (memoryOpened.current) return;
    const id = new URLSearchParams(window.location.search).get("memory");
    if (!id) return;
    const entry = journalEntries.find((e) => e.id === id);
    if (!entry) return; // لم تُرطَّب المذكرات بعد — ننتظر تحديث journalEntries
    memoryOpened.current = true;
    openViewer(entry);
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalEntries]);

  const todayStr = today();

  // «سطر سريع» — يُنشئ مذكرةً قصيرةً لليوم فوراً (مع إتاحة التراجع).
  function addQuickLine() {
    const t = quickLine.trim();
    if (!t) return;
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const id = uid();
    addJournalEntry({ id, date: todayStr, content: t, time, source: "manual" });
    setQuickLine("");
    showUndo("أُضيف سطرٌ سريع", () => deleteJournalEntry(id));
  }

  // «حصيلة الشهر» — ملخّصٌ لطيفٌ لمذكرات الشهر الحالي (عدد، أيام، مشاعر، وسوم).
  const monthSummary = useMemo(() => {
    const prefix = todayStr.slice(0, 7);
    const month = journalEntries.filter((e) => e.date.startsWith(prefix));
    const days = new Set(month.map((e) => e.date)).size;
    const moods: Record<number, number> = {};
    for (const e of month) if (e.mood) moods[e.mood] = (moods[e.mood] || 0) + 1;
    const tagCounts = new Map<string, number>();
    for (const e of month) for (const t of e.tags ?? []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
    const moodCount = Object.values(moods).reduce((s, n) => s + n, 0);
    return { count: month.length, days, moods, topTags, moodCount };
  }, [journalEntries, todayStr]);

  // كم يوماً في الأرشيف كلّه فيه أكثر من مذكرة — مدخلُ الدمج الشامل.
  const mergeableDays = useMemo(() => duplicateDays(journalEntries).length, [journalEntries]);

  // النجمةُ المختارة من القبّة — بطاقةُ معاينةٍ قبل فتح المذكرة كاملة.
  const skyPickEntry = useMemo(
    () => (skyPick ? journalEntries.find((e) => e.id === skyPick) : undefined),
    [skyPick, journalEntries]
  );

  /**
   * جوابُك على **سؤال اليوم نفسِه** قبل سنة. الأسئلةُ دوريّةٌ بيوم السنة
   * (`dailyQuestion`)، فمذكرةُ اليوم نفسِه من السنة الماضية جوابٌ للسؤال ذاته —
   * وهذه المقابلةُ هي أنفعُ ما في «سؤال القمر»: ترى كيف تغيّرتَ في سنة.
   */
  const lastYearAnswer = useMemo(() => {
    const [y, ...rest] = todayStr.split("-");
    const lastYear = `${Number(y) - 1}-${rest.join("-")}`;
    const entry = journalEntries.find((e) => e.date === lastYear && (e.question || e.content));
    if (!entry) return undefined;
    const text = (entry.content || "").replace(/<[^>]+>/g, " ").trim();
    return text ? text.slice(0, 180) : undefined;
  }, [journalEntries, todayStr]);

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
        (e.tags ?? []).some((t) => normalizeArabic(t).includes(q)) ||
        (e.attachmentRefs ?? []).some((a) => normalizeArabic(a.filename ?? "").includes(q))
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
  // بايتات وسائط المذكرة المفتوحة تُقرأ من مخزن الهاش عند العرض. الاشتراك
  // هنا (مرّةً في أعلى الصفحة) يُعيد الرسم لحظة وصول أيّ منها — للعارض
  // وللمعرض معاً، فلا حاجة لخطّافٍ داخل الحلقات.
  useMediaCacheVersion();
  const viewPhotoSources = viewEntry ? entryPhotoSources(viewEntry) : [];
  const viewAudios = viewEntry ? resolveMedia(entryAudioSources(viewEntry)) : [];
  const viewMood = viewEntry?.mood ? MOODS.find((m) => m.value === viewEntry.mood) : undefined;
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

  // تبويب المعرض — كل صور المذكرات المطابقة للفلاتر الحالية، أحدث أولاً.
  const galleryPhotos = useMemo(() => {
    const items: WallPhoto[] = [];
    for (const entry of filtered) {
      for (const source of entryPhotoSources(entry)) items.push({ entry, source });
    }
    return items;
  }, [filtered]);
  // **الشريحة المعروضة وحدها** تُمرَّر للجدار فتُقرأ بايتاتُها. بناء القائمة
  // أعلاه من المصادر لا يلمس بايتةً واحدة — ولولا ذلك لطلب معرضُ ألفَي صورةٍ
  // المكتبةَ كلّها دفعةً واحدة.
  const visibleGallery = useMemo(
    () => galleryPhotos.slice(0, galleryCount),
    [galleryPhotos, galleryCount]
  );
  const hasMoreGallery = galleryPhotos.length > visibleGallery.length;

  return (
    // `mdr` على الغلاف كلِّه: أرضيةُ الورق تسري تحت الأرشيف والبحث أيضاً،
    // فلا ينقسم الشعورُ بين نصفٍ منقولٍ ونصفٍ قديم. البطاقاتُ الداخلية تبقى
    // على Tailwind كما هي حتى يأتي دورُها.
    <div className="page-shell mdr">
      {/* ═══ رأسُ الشاشة — منقولٌ من تصميم مدار ═══ */}
      <div className="mdr" style={{ padding: "0 20px 24px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, padding: "16px 0 0" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 25, fontWeight: 900, lineHeight: 1.25 }}>المذكرات</p>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink72)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>{entriesCount(journalEntries.length)}</span>
              <span className="mdr-diamond" style={{ width: 5, height: 5 }} />
              <span style={{ color: "var(--ink52)" }}>
                {streak > 0 ? `${streak} يوم متواصل` : "ابدأ سلسلتك اليوم"}
              </span>
            </p>
          </div>
          <span className="mdr-star" style={{ width: 24, height: 24 }} />
        </div>

        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            display: "block", width: "100%", minHeight: 50, margin: "14px 0 0",
            background: "var(--ink)", color: "var(--paper)", border: "none",
            borderRadius: 16, fontSize: 14, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {hasToday ? "أضِف إلى مذكرة اليوم" : "اكتب مذكرة اليوم"}
        </button>

        {/* أدواتٌ ثانوية — الاستيرادُ والذكرى العشوائية باقيان، لا يسقط شيء */}
        <div style={{ display: "flex", gap: 8, margin: "8px 0 0", flexWrap: "wrap" }}>
          <MdrButton kind="ghost" onClick={() => setShowImport(true)} style={{ fontSize: 12.5 }}>
            استيراد Day One
          </MdrButton>
          {journalEntries.length > 0 && (
            <MdrButton kind="ghost" onClick={openRandomMemory} style={{ fontSize: 12.5 }}>
              ذكرى عشوائية
            </MdrButton>
          )}
          {mergeableDays > 0 && (
            <MdrButton kind="gold" onClick={() => setMergeDay("")} style={{ fontSize: 12.5 }}>
              دمجُ الأيام المكرّرة
            </MdrButton>
          )}
        </div>

        {/* سطرٌ سريع — التقاطٌ فوريّ دون فتح المحرّر */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, margin: "12px 0 0",
            border: "1px solid var(--line)", borderRadius: 18,
            background: "var(--paper2)", padding: "6px 12px",
          }}
        >
          <input
            value={quickLine}
            onChange={(e) => setQuickLine(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQuickLine(); } }}
            placeholder="سطرٌ سريع… خاطرة، امتنان، أو ملاحظة"
            aria-label="سطر سريع"
            dir="auto"
            style={{
              flex: 1, minWidth: 0, background: "transparent", border: "none",
              outline: "none", fontSize: 13.5, minHeight: 40, fontFamily: "inherit", color: "var(--ink)",
            }}
          />
          <MdrButton kind="ink" onClick={addQuickLine} disabled={!quickLine.trim()} minHeight={40} style={{ fontSize: 12.5, padding: "0 13px" }}>
            أضِف
          </MdrButton>
        </div>

        <MoonQuestion
          question={question}
          todayStr={todayStr}
          answered={hasToday}
          lastYearAnswer={lastYearAnswer}
          onWrite={() => setShowForm(true)}
        />

        <TabBar tabs={JOURNAL_TABS} active={topTab} onPick={(t) => setTopTab(t as JournalTab)} marginTop={14} />

        {topTab === "السماء" && (
          <>
            {memories.length > 0 && (
              <div style={{ margin: "16px 0 0" }}>
                <MemoryStrip memories={memories} todayStr={todayStr} onOpen={openViewer} />
              </div>
            )}
            <MemoryDome
              entries={filtered}
              todayStr={todayStr}
              selectedId={skyPick}
              onPick={setSkyPick}
            />
            {skyPickEntry && (
              <div style={{ margin: "16px 0 0", border: "1px solid var(--gline)", borderRadius: 20, background: "var(--paper2)", padding: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 10.5, color: "var(--ink34)" }}>{formatDate(skyPickEntry.date)}</span>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 900, marginTop: 3 }}>{skyPickEntry.title || "بلا عنوان"}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--ink52)", lineHeight: 1.8, marginTop: 4 }}>
                      {(skyPickEntry.content || "").replace(/<[^>]+>/g, " ").slice(0, 90)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSkyPick(null)}
                    aria-label="أغلق"
                    style={{ width: 34, height: 34, flex: "none", background: "transparent", border: "none", color: "var(--ink34)", fontSize: 17, cursor: "pointer" }}
                  >
                    ×
                  </button>
                </div>
                <MdrButton kind="ink" onClick={() => { openViewer(skyPickEntry); setSkyPick(null); }} minHeight={46} style={{ marginTop: 12, padding: "0 18px" }}>
                  افتح المذكرة
                </MdrButton>
              </div>
            )}
            <PastDays
              entries={journalEntries}
              todayStr={todayStr}
              onOpen={openViewer}
              onWrite={() => setShowForm(true)}
            />
          </>
        )}

        {topTab === "الشهر" && (
          <>
            {/* تقويمٌ واحدٌ لا اثنان: الشبكةُ المنقولة تحمل تنقّلَ الأشهر
                واليومَ الهجريّ اللذين كانا يميّزان `StreakCalendar` هنا. */}
            <MonthGrid
              entries={journalEntries}
              todayStr={todayStr}
              year={calYear}
              month={calMonth}
              onNavigate={(y, m) => { setCalYear(y); setCalMonth(m); }}
              onDayClick={setSelectedDay}
            />
            {monthSummary.count > 0 && (
              <div style={{ margin: "18px 0 0" }}>
                <SectionHead title={`حصيلةُ ${arabicMonthName(parseDate(todayStr).getMonth())}`} marginTop={0} marginBottom={12} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                  <div style={{ padding: "13px 12px", border: "1px solid var(--line)", borderRadius: 18, background: "var(--paper2)", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "var(--gold)" }}>{monthSummary.count}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ink52)", marginTop: 3 }}>مذكرة</div>
                  </div>
                  <div style={{ padding: "13px 12px", border: "1px solid var(--line)", borderRadius: 18, background: "var(--paper2)", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "var(--green)" }}>{monthSummary.days}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ink52)", marginTop: 3 }}>يومًا كتبتَ فيه</div>
                  </div>
                </div>
                {monthSummary.topTags.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 12 }}>
                    <span style={{ fontSize: 11, color: "var(--ink34)" }}>أبرزُ الوسوم:</span>
                    {monthSummary.topTags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => selectTag(t)}
                        style={{
                          minHeight: 32, padding: "0 11px", fontSize: 11.5, fontWeight: 700,
                          background: "var(--goldw)", color: "var(--gold)", border: "1px solid var(--gline)",
                          borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {topTab === "الرسائل" && (
          <div style={{ margin: "16px 0 0" }}>
            <FutureLetters />
          </div>
        )}
      </div>


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

      {view === "list" ? (
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
          {/* أيامٌ فيها أكثر من مذكرة — عرضٌ واحدٌ لدمجها كلّها بمعاينة */}
          {mergeableDays > 0 && (
            <button
              onClick={() => setMergeDay("")}
              className="w-full flex items-center gap-2.5 rounded-2xl border border-journal/25 bg-journal/[0.06] px-3.5 py-2.5 text-start press"
            >
              <Combine size={16} className="text-journal shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] font-bold text-gray-800">
                  عندك {daysCount(mergeableDays)} فيها أكثر من مذكرة
                </span>
                <span className="block text-[11px] text-gray-500">
                  ادمج كل يومٍ في مذكرةٍ واحدة — بمعاينةٍ أولاً وبلا فقد
                </span>
              </span>
              <ChevronLeft size={16} className="text-journal/60 shrink-0" />
            </button>
          )}

          <JournalTimeline
            entries={visible}
            onOpen={openViewer}
            onDelete={handleDelete}
            onToggleStar={handleToggleStar}
            onOpenDay={setSelectedDay}
            onMergeDay={setMergeDay}
          />

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
              <PhotoWall photos={visibleGallery} onOpenEntry={openViewer} />
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
            {plainTitle(viewEntry.title) && (
              <h2 className="text-2xl font-black text-gray-900 leading-snug">{plainTitle(viewEntry.title)}</h2>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
              <span className="font-medium">{formatDate(viewEntry.date)}</span>
              <span className="text-gray-300">·</span>
              <span>{hijriDate(viewEntry.date)}</span>
              {displayTime(viewEntry.time) && (
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {displayTime(viewEntry.time)}
                </span>
              )}
              {viewEntry.mood && (
                <span className="flex items-center gap-1" title={viewMood?.label}>
                  <span className="text-sm leading-none">{viewMood?.emoji}</span>
                  <span>{viewMood?.label}</span>
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
            {(viewEntry.mergedFrom?.length ?? 0) > 0 && (
              <MergeBadge sources={viewEntry.mergedFrom!} />
            )}
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
            {/* كلّ الصور في كولاجاتٍ متتابعة — والضغطة تفتح العارض عليها */}
            <EntryPhotos sources={viewPhotoSources} />
            <JournalAttachments attachments={viewEntry.attachmentRefs} />
            {viewAudios.map((a, i) => (
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

      <MergeDaysSheet
        open={mergeDay !== null}
        onClose={() => setMergeDay(null)}
        only={mergeDay || undefined}
      />

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
