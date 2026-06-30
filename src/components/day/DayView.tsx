"use client";
import { useAppStore } from "@/lib/store";
import { aggregateDay } from "@/lib/dayAggregator";
import { CATEGORY_LABELS, MOOD_LABELS } from "@/lib/types";
import { formatDate, formatAmount } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { BookOpen, Wallet, BookMarked, CheckCircle2 } from "lucide-react";

interface DayViewProps {
  date: string | null;
  onClose: () => void;
}

export function DayView({ date, onClose }: DayViewProps) {
  const { transactions, journalEntries, readingLogs, books, habits } = useAppStore();

  if (!date) return null;

  const day = aggregateDay(date, { transactions, journalEntries, readingLogs, books, habits });
  const mood = day.mood ? MOOD_LABELS[day.mood] : null;
  const net = day.income - day.expense;

  return (
    <Modal open={!!date} onClose={onClose} title={formatDate(date)} className="sm:max-w-xl">
      <div className="space-y-4">
        {/* Completion ring */}
        <div className="flex items-center justify-center gap-2">
          {[
            { done: !!day.journal, icon: "📓", label: "مذكرة" },
            { done: day.transactions.length > 0, icon: "💰", label: "مالي" },
            { done: day.readingLogs.length > 0, icon: "📚", label: "قراءة" },
          ].map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                item.done ? "bg-orange-100 text-orange-600" : "bg-gray-100 text-gray-400"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.done && <CheckCircle2 size={12} />}
            </div>
          ))}
          {mood && (
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-journal/10 text-journal text-xs">
              <span>{mood.icon}</span>
              <span>{mood.label}</span>
            </div>
          )}
        </div>

        {day.completionScore === 3 && (
          <div className="text-center text-sm font-bold text-orange-600 bg-orange-50 rounded-xl py-2">
            🔥 يوم مكتمل — الأقسام الثلاثة!
          </div>
        )}

        {/* Journal */}
        {day.journal ? (
          <Section icon={<BookMarked size={15} />} title="المذكرة" color="text-journal">
            {day.journal.photo && (
              <img src={day.journal.photo} alt="" className="w-full h-40 object-cover rounded-xl mb-2" />
            )}
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line line-clamp-6">
              {day.journal.content}
            </p>
            {day.journal.tags && day.journal.tags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {day.journal.tags.map((t) => (
                  <span key={t} className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            )}
          </Section>
        ) : (
          <EmptyHint text="لا توجد مذكرة لهذا اليوم" />
        )}

        {/* Finance */}
        {day.transactions.length > 0 ? (
          <Section
            icon={<Wallet size={15} />}
            title="الأموال"
            color="text-finance"
            extra={
              <span className={`text-sm font-bold ${net >= 0 ? "text-finance" : "text-red-500"}`}>
                {net >= 0 ? "+" : ""}{formatAmount(net)} ر.س
              </span>
            }
          >
            <div className="space-y-1.5">
              {day.transactions.map((tx) => {
                const info = CATEGORY_LABELS[tx.category];
                return (
                  <div key={tx.id} className="flex items-center gap-2 text-sm">
                    <span>{info.icon}</span>
                    <span className="text-gray-600 flex-1 truncate">{tx.note || info.label}</span>
                    <span className={tx.type === "دخل" ? "text-finance font-semibold" : "text-red-500 font-semibold"}>
                      {tx.type === "دخل" ? "+" : "-"}{formatAmount(tx.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        ) : (
          <EmptyHint text="لم تسجّل أي معاملة" />
        )}

        {/* Reading */}
        {day.readingLogs.length > 0 ? (
          <Section
            icon={<BookOpen size={15} />}
            title="القراءة"
            color="text-reading"
            extra={<span className="text-sm font-bold text-reading">{day.pagesRead} صفحة</span>}
          >
            <div className="space-y-1.5">
              {day.readingLogs.map(({ log, book }) => (
                <div key={log.id} className="flex items-center gap-2 text-sm">
                  <span>📖</span>
                  <span className="text-gray-600 flex-1 truncate">{book?.title ?? "كتاب"}</span>
                  <span className="text-reading font-semibold">{log.pagesRead} ص</span>
                  {log.minutesRead ? <span className="text-gray-400 text-xs">{log.minutesRead}د</span> : null}
                </div>
              ))}
            </div>
          </Section>
        ) : (
          <EmptyHint text="لم تسجّل قراءة" />
        )}

        {/* Habits */}
        {day.habitsCompleted.length > 0 && (
          <Section icon={<CheckCircle2 size={15} />} title="العادات" color="text-brand-600">
            <div className="flex gap-2 flex-wrap">
              {day.habitsCompleted.map((h) => (
                <span key={h.name} className="flex items-center gap-1 text-xs bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full">
                  <span>{h.icon}</span> {h.name}
                </span>
              ))}
            </div>
          </Section>
        )}
      </div>
    </Modal>
  );
}

function Section({
  icon, title, color, extra, children,
}: {
  icon: React.ReactNode;
  title: string;
  color: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50 rounded-2xl p-3.5">
      <div className="flex items-center justify-between mb-2">
        <div className={`flex items-center gap-1.5 text-sm font-semibold ${color}`}>
          {icon} {title}
        </div>
        {extra}
      </div>
      {children}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-xs text-gray-300 text-center py-1">{text}</p>;
}
