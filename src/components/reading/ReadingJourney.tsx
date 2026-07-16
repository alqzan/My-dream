"use client";
import type { Book, ReadingLog } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Route } from "lucide-react";

// قافلة القراءة: كل كتاب جارٍ مسافرٌ على خطٍّ ذهبي رفيع من البداية (يميناً) نحو
// الختام (يساراً). موضع علامته المصمتة = currentPage/totalPages، وعلامةٌ باهتة
// عند طرف الخطّ = «الوصول المتوقّع» يحمل تاريخه تقديرَ وتيرةِ القراءة. النقر على
// الكتاب يفتح تدفّق «سجّل صفحات اليوم» القائم بعينه (لا منطق تسجيل جديد).

// صيغةُ الوتيرة نفسها التي كانت في «بطاقة الوتيرة» (ReadingPace) حرفياً — دُمجت
// هنا لتصبح القافلةُ المصدرَ الوحيد لتقدّم كل كتاب: الموضع + الوصول المتوقّع +
// مُعدّل الصفحات/اليوم. لا حساب وتيرة مختلف؛ نفس المتوسط والأيام والتاريخ.
function bookPace(book: Book, logs: ReadingLog[]) {
  const bookLogs = logs.filter((l) => l.bookId === book.id);
  if (bookLogs.length < 2) return null;
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
  return { avgPerDay, remaining, daysLeft, finishDate };
}

interface ReadingJourneyProps {
  books: Book[];
  logs: ReadingLog[];
  onLogBook: (book: Book) => void;
}

export function ReadingJourney({ books, logs, onLogBook }: ReadingJourneyProps) {
  const current = books.filter((b) => b.status === "أقرأ" && b.totalPages > 0);
  if (current.length === 0) return null;

  return (
    <Card className="animate-fade-up">
      <div className="flex items-center gap-2 mb-4">
        <Route size={16} className="text-reading" />
        <span className="text-sm font-semibold text-gray-700">قافلة القراءة</span>
        <span className="text-[11px] text-gray-400 ms-auto">رحلة كتبك نحو الختام</span>
      </div>
      <div className="space-y-4">
        {current.map((book) => (
          <JourneyLane key={book.id} book={book} pace={bookPace(book, logs)} onClick={() => onLogBook(book)} />
        ))}
      </div>
    </Card>
  );
}

// —— هندسة الخطّ: بمقياسٍ منتظم كي تبقى العلامات دوائر صحيحة (لا viewBox مطّاط).
const VBW = 300;
const VBH = 22;
const CY = 11;
const X_START = 294; // البداية — يمين (0%)
const X_FIN = 6; // الختام — يسار (100%)
const SPAN = X_START - X_FIN;

function JourneyLane({
  book,
  pace,
  onClick,
}: {
  book: Book;
  pace: ReturnType<typeof bookPace>;
  onClick: () => void;
}) {
  const p = Math.max(0, Math.min(1, book.currentPage / book.totalPages));
  const curX = X_START - p * SPAN;
  const color = book.coverColor ?? "#c1663f";
  const pct = Math.round(p * 100);
  const gid = `road-${book.id}`;

  return (
    <button onClick={onClick} className="block w-full text-start group press" aria-label={`سجّل صفحات اليوم لكتاب ${book.title}`}>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold text-gray-800 truncate group-hover:text-reading transition-colors">{book.title}</span>
        </span>
        <span className="text-[11px] text-gray-400 tabular-nums shrink-0">
          صفحة {book.currentPage}/{book.totalPages}
        </span>
      </div>

      <svg viewBox={`0 0 ${VBW} ${VBH}`} className="block w-full overflow-visible" style={{ height: "auto" }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gid} x1="100%" y1="0" x2="0%" y2="0">
            <stop offset="0%" stopColor="#e8b15a" />
            <stop offset="100%" stopColor="#c1663f" />
          </linearGradient>
        </defs>
        {/* الطريق أمامك (باهت متقطّع) نحو الختام */}
        <line x1={curX} y1={CY} x2={X_FIN} y2={CY} stroke="#c1663f" strokeOpacity={0.28} strokeWidth={1.4} strokeLinecap="round" strokeDasharray="1.5 4" />
        {/* الطريق المقطوع (ذهبي→طوبيّ) */}
        <line x1={X_START} y1={CY} x2={curX} y2={CY} stroke={`url(#${gid})`} strokeWidth={2.4} strokeLinecap="round" />
        {/* نقطة الانطلاق */}
        <circle cx={X_START} cy={CY} r={2} fill="#e8b15a" />
        {/* الوصول المتوقّع — علامة باهتة عند الختام */}
        <circle cx={X_FIN} cy={CY} r={4.5} fill="none" stroke="#c1663f" strokeOpacity={0.45} strokeWidth={1.5} />
        <circle cx={X_FIN} cy={CY} r={1.5} fill="#c1663f" fillOpacity={0.45} />
        {/* موضعك الآن */}
        <circle cx={curX} cy={CY} r={5.5} fill={color} stroke="#fff" strokeWidth={1.6} />
      </svg>

      <div className="flex items-center justify-between gap-2 mt-1.5">
        <span className="text-[11px] text-reading font-medium tabular-nums">
          {pct}%
          {pace ? (
            <span className="text-gray-400 font-normal"> · ~{Math.round(pace.avgPerDay)} ص/يوم</span>
          ) : null}
        </span>
        {pace?.finishDate ? (
          <span className="text-[11px] text-gray-500">
            الوصول ≈ <strong className="text-reading">{pace.finishDate}</strong>
            {pace.daysLeft ? <span className="text-gray-400"> · بعد {pace.daysLeft} يوم</span> : null}
          </span>
        ) : (
          <span className="text-[11px] text-gray-400">سجّل يومين لتقدير الوصول</span>
        )}
      </div>
    </button>
  );
}
