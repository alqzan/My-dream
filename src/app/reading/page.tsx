import type React from "react";
"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { getReadingStreak, formatDateShort } from "@/lib/utils";
import { BookCard } from "@/components/reading/BookCard";
import { BookForm } from "@/components/reading/BookForm";
import { ReadingLogForm } from "@/components/reading/ReadingLogForm";
import { ReadingGoalCard } from "@/components/reading/ReadingGoalCard";
import { ReadingTimer } from "@/components/reading/ReadingTimer";
import { ReadingJourney } from "@/components/reading/ReadingJourney";
import { StreakCalendar } from "@/components/journal/StreakCalendar";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Book, ReadingLog, KnowledgeSource } from "@/lib/types";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { SECTION_DEEP } from "@/lib/palette";
import { uid, today } from "@/lib/utils";
import { pathSteps } from "@/lib/mihbara";
import { arNum } from "@/lib/madar/format";
import { TabBar, SectionHead, HeadMeta, MdrButton } from "@/components/madar/primitives";
import {
  PathArcs, BenefitCapture, SourceList, BenefitList, ShelfSeats, SOURCE_KINDS,
} from "@/components/madar/mihbara/MihbaraParts";

type FilterStatus = "الكل" | "أقرأ" | "أنهيت" | "أريد_قراءة";

const MIHBARA_TABS = ["المسار", "المصادر", "الفوائد", "الرفّ"] as const;
type MihbaraTab = (typeof MIHBARA_TABS)[number];

/** نموذجُ مصدرٍ جديد — نوعٌ واسمٌ ومؤلِّفٌ اختياريّ، وربطٌ بكتابٍ إن كان كتاباً. */
function SourceFormModal({
  open, onClose, books, onSave, todayStr,
}: {
  open: boolean;
  onClose: () => void;
  books: Book[];
  onSave: (src: KnowledgeSource) => void;
  todayStr: string;
}) {
  const [kind, setKind] = useState<KnowledgeSource["kind"]>("كتاب");
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [bookId, setBookId] = useState<string>("");

  const field: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", background: "transparent",
    border: "none", borderBottom: "1px solid var(--line)", minHeight: 44,
    fontSize: 15, padding: "8px 0", fontFamily: "inherit", color: "var(--ink)", outline: "none",
  };

  return (
    <Modal open={open} onClose={onClose} title="مصدرٌ جديد">
      <div className="mdr">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SOURCE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              style={{
                minHeight: 40, padding: "0 13px", borderRadius: 12,
                fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                background: kind === k ? "var(--ink)" : "transparent",
                color: kind === k ? "var(--paper)" : "var(--ink72)",
                border: `1px solid ${kind === k ? "var(--ink)" : "var(--line)"}`,
              }}
            >
              {k}
            </button>
          ))}
        </div>

        {kind === "كتاب" && books.length > 0 && (
          <div style={{ margin: "14px 0 0" }}>
            <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "var(--ink52)" }}>
              اربِطه بكتابٍ في الرفّ (فلا يتكرّر تقدُّمُ القراءة في مكانين)
            </p>
            <select
              value={bookId}
              onChange={(e) => {
                setBookId(e.target.value);
                const b = books.find((x) => x.id === e.target.value);
                if (b) { setName(b.title); setAuthor(b.author); }
              }}
              style={field}
            >
              <option value="">— بلا ربط —</option>
              {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </div>
        )}

        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسمُ المصدر" dir="auto" style={{ ...field, margin: "14px 0 0" }} />
        <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="المؤلِّف أو الجهة (اختياري)" dir="auto" style={{ ...field, margin: "14px 0 0" }} />

        <MdrButton
          kind="ink"
          minHeight={48}
          disabled={!name.trim()}
          style={{ margin: "18px 0 0", width: "100%" }}
          onClick={() => {
            const n = name.trim();
            if (!n) return;
            onSave({
              id: uid(), kind, name: n,
              author: author.trim() || undefined,
              bookId: kind === "كتاب" && bookId ? bookId : undefined,
              createdAt: todayStr,
            });
            setName(""); setAuthor(""); setBookId(""); setKind("كتاب");
          }}
        >
          احفظ المصدر
        </MdrButton>
      </div>
    </Modal>
  );
}

export default function ReadingPage() {
  const {
    books, readingLogs, deleteBook, deleteReadingLog,
    knowledgeSources = [], benefits = [], readingGoal,
    addKnowledgeSource, deleteKnowledgeSource, addBenefit, updateBenefit, deleteBenefit,
  } = useAppStore();
  const [showBookForm, setShowBookForm] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [editBook, setEditBook] = useState<Book | undefined>();
  const [editLog, setEditLog] = useState<ReadingLog | undefined>();
  const [filter, setFilter] = useState<FilterStatus>("الكل");
  // دقائق ممرَّرة من مؤقّت الجلسة لتعبئة نموذج التسجيل تلقائياً.
  const [timerMinutes, setTimerMinutes] = useState<number | undefined>();
  // الكتاب المستهدَف عند النقر من «قافلة القراءة» — يفتح نموذج التسجيل عليه.
  const [logBookId, setLogBookId] = useState<string | undefined>();
  const [tab, setTab] = useState<MihbaraTab>("المسار");
  const [showSourceForm, setShowSourceForm] = useState(false);
  const todayStr = today();

  function finishTimer(minutes: number) {
    setTimerMinutes(minutes);
    setShowLogForm(true);
  }

  // Most recent reading sessions, newest first — an editable/removable history.
  const recentLogs = [...readingLogs]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 15);
  const bookTitle = (id: string) => books.find((b) => b.id === id)?.title ?? "كتاب";

  const streak = getReadingStreak(readingLogs);
  const logDates = readingLogs.map((l) => l.date);

  const totalPagesRead = readingLogs.reduce((s, l) => s + l.pagesRead, 0);
  const totalMinutes = readingLogs.reduce((s, l) => s + (l.minutesRead ?? 0), 0);
  const booksFinished = books.filter((b) => b.status === "أنهيت").length;

  // «التقاطٌ سريع» أوّلُ درجات المسار — أقربُ ما يقابله في مدار مذكراتُ المالك:
  // ما قُيّد على عجلٍ قبل أن يصير فائدةً محرَّرة.
  const captures = useAppStore((st) => st.journalEntries.length);
  const steps = pathSteps(captures, knowledgeSources, benefits);

  const filtered =
    filter === "الكل" ? books : books.filter((b) => b.status === filter);

  const filterLabels: Record<FilterStatus, string> = {
    الكل: "الكل",
    أقرأ: "أقرأ الآن",
    أنهيت: "أنهيت",
    أريد_قراءة: "قائمة القراءة",
  };

  return (
    // `mdr` على الغلاف: أرضيةُ ورق التصميم تسري تحت الباب كلِّه، والبطاقاتُ
    // الداخلية (BookCard · ReadingJourney · النماذج) تبقى على Tailwind كما هي.
    <div className="page-shell mdr">
      <div style={{ padding: "0 20px 24px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, padding: "16px 0 0" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 25, fontWeight: 900, lineHeight: 1.25 }}>المحبرة</p>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink72)" }}>
              ما تعلَّمتَه: مصدرٌ وفائدةٌ وسؤال
            </p>
          </div>
          <span className="mdr-star" style={{ width: 24, height: 24 }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, margin: "14px 0 0" }}>
          {[
            { n: "كتاب", v: arNum(books.length), c: "var(--gold)" },
            { n: "خُتِم", v: arNum(booksFinished), c: "var(--green)" },
            { n: "صفحةً قرأت", v: arNum(totalPagesRead), c: "var(--blue)" },
          ].map((t) => (
            <div key={t.n} style={{ padding: "13px 10px", border: "1px solid var(--line)", borderRadius: 18, background: "var(--paper2)", textAlign: "center" }}>
              <span style={{ display: "block", fontSize: 18, fontWeight: 900, color: t.c }}>{t.v}</span>
              <span style={{ display: "block", marginTop: 4, fontSize: 10.5, color: "var(--ink52)" }}>{t.n}</span>
            </div>
          ))}
        </div>

        <TabBar tabs={MIHBARA_TABS} active={tab} onPick={(t) => setTab(t as MihbaraTab)} marginTop={14} />

        {tab === "المسار" && (
          <>
            <PathArcs steps={steps} />
            <BenefitCapture
              sources={knowledgeSources}
              books={books}
              onNewSource={() => setShowSourceForm(true)}
              onAdd={(d) => {
                addBenefit({ id: uid(), text: d.text, sourceId: d.sourceId, question: d.question, createdAt: todayStr });
                setTab("الفوائد");
              }}
            />
          </>
        )}

        {tab === "المصادر" && (
          <SourceList
            sources={knowledgeSources}
            books={books}
            benefits={benefits}
            onAdd={() => setShowSourceForm(true)}
            onDelete={deleteKnowledgeSource}
          />
        )}

        {tab === "الفوائد" && (
          <BenefitList
            benefits={benefits}
            sources={knowledgeSources}
            books={books}
            onApply={(id, applied) => updateBenefit(id, { applied })}
            onDelete={deleteBenefit}
          />
        )}

        {tab === "الرفّ" && (
          <>
            <ShelfSeats books={books} year={Number(todayStr.slice(0, 4))} goal={readingGoal ?? 12} />

            <SectionHead
              title="الكتب"
              trailing={
                <span style={{ display: "flex", gap: 6 }}>
                  <MdrButton kind="ghost" onClick={() => setShowLogForm(true)} minHeight={34} style={{ fontSize: 11.5, padding: "0 10px", minHeight: 34 }}>
                    سجّل جلسة
                  </MdrButton>
                  <MdrButton kind="gold" onClick={() => setShowBookForm(true)} minHeight={34} style={{ fontSize: 11.5, padding: "0 10px", minHeight: 34 }}>
                    أضِف كتابًا
                  </MdrButton>
                </span>
              }
              marginTop={24}
              marginBottom={12}
            />

            <div className="flex gap-2 overflow-x-auto pb-1 mdr-scroll">
              {(["الكل", "أقرأ", "أنهيت", "أريد_قراءة"] as FilterStatus[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    flex: "none", minHeight: 36, padding: "0 13px", borderRadius: 999,
                    fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    background: filter === f ? "var(--ink)" : "transparent",
                    color: filter === f ? "var(--paper)" : "var(--ink52)",
                    border: `1px solid ${filter === f ? "var(--ink)" : "var(--line)"}`,
                  }}
                >
                  {filterLabels[f]}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div style={{ marginTop: 16 }}>
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
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" style={{ marginTop: 14 }}>
                {filtered.map((book) => (
                  <BookCard key={book.id} book={book} onDelete={deleteBook} onClick={() => setEditBook(book)} />
                ))}
              </div>
            )}

            {/* أدواتُ القراءة الباقية — لم يسقط منها شيء */}
            <SectionHead title="رحلةُ القراءة" marginTop={26} marginBottom={12} />
            <ReadingJourney
              books={books}
              logs={readingLogs}
              onLogBook={(book) => { setLogBookId(book.id); setShowLogForm(true); }}
            />

            <SectionHead title="الهدفُ السنوي" marginTop={26} marginBottom={12} />
            <ReadingGoalCard />

            <SectionHead title="أدواتٌ ثانوية" marginTop={26} marginBottom={12} />
            <ReadingTimer onFinish={finishTimer} />
            <div style={{ marginTop: 14 }}>
              <StreakCalendar markedDates={logDates} color={SECTION_DEEP.reading} />
            </div>

            {recentLogs.length > 0 && (
              <>
                <SectionHead
                  title="جلساتُ القراءة"
                  trailing={<HeadMeta>{arNum(readingLogs.length)} جلسة</HeadMeta>}
                  marginTop={26}
                  marginBottom={12}
                />
                <div className="space-y-1.5">
                  {recentLogs.map((log) => (
                    <div key={log.id} className="flex items-center gap-2 text-sm py-1">
                      <span>📖</span>
                      <span className="flex-1 truncate" style={{ color: "var(--ink72)" }}>{bookTitle(log.bookId)}</span>
                      <span style={{ fontSize: 11, color: "var(--ink34)" }}>{formatDateShort(log.date)}</span>
                      <span style={{ color: "var(--gold)", fontWeight: 700 }}>{arNum(log.pagesRead)} ص</span>
                      {log.minutesRead ? <span style={{ fontSize: 11, color: "var(--ink34)" }}>{arNum(log.minutesRead)}د</span> : null}
                      <button onClick={() => setEditLog(log)} className="p-1 press" style={{ color: "var(--ink34)" }} aria-label="تعديل الجلسة">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => deleteReadingLog(log.id)} className="p-1 press" style={{ color: "var(--clay)" }} aria-label="حذف الجلسة">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

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
        open={showLogForm || !!editLog}
        onClose={() => { setShowLogForm(false); setEditLog(undefined); setTimerMinutes(undefined); setLogBookId(undefined); }}
        title={editLog ? "تعديل جلسة القراءة" : "سجّل جلسة قراءة"}
      >
        <ReadingLogForm
          key={editLog?.id ?? `new-${logBookId ?? ""}-${timerMinutes ?? ""}`}
          books={books}
          initial={editLog}
          defaultBookId={editLog ? undefined : logBookId}
          defaultMinutes={editLog ? undefined : timerMinutes}
          onClose={() => { setShowLogForm(false); setEditLog(undefined); setTimerMinutes(undefined); setLogBookId(undefined); }}
        />
      </Modal>

      <SourceFormModal
        open={showSourceForm}
        onClose={() => setShowSourceForm(false)}
        books={books}
        onSave={(src) => { addKnowledgeSource(src); setShowSourceForm(false); }}
        todayStr={todayStr}
      />
    </div>
  );
}