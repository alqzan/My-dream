"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { Card } from "@/components/ui/Card";
import { today, formatDate } from "@/lib/utils";
import { visibleEvents, sortEvents, daysUntil, describeDays } from "@/lib/countdown";
import type { CountdownEvent } from "@/lib/types";
import { CalendarClock, Plus, Trash2, Pencil, X, Check } from "lucide-react";

// إدارة الأحداث المهمّة (العدّ التنازلي). العرض في الرئيسية عبر
// `CountdownCard`؛ هنا الإضافة والتعديل والحذف. القائمة تُظهر **كلّ** حدث بما
// فيه ما مضى وأُخفي من الرئيسية — وإلّا صار حدثٌ محفوظٌ لا سبيل إلى حذفه.
const EMOJI_CHOICES = ["📌", "📘", "👶", "✈️", "🎓", "💍", "🏥", "🏠", "💼", "🎉"];

export function EventsCard() {
  const events = useAppStore((s) => s.countdownEvents);
  const addEvent = useAppStore((s) => s.addCountdownEvent);
  const updateEvent = useAppStore((s) => s.updateCountdownEvent);
  const deleteEvent = useAppStore((s) => s.deleteCountdownEvent);

  const [editing, setEditing] = useState<CountdownEvent | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const todayStr = today();

  const all = sortEvents(events ?? [], todayStr);
  const shownOnHome = new Set(visibleEvents(events, todayStr).map((e) => e.id));

  function save(draft: { title: string; date: string; emoji: string; countUpAfter: boolean }) {
    const title = draft.title.trim();
    if (!title || !draft.date) return;
    if (editing && editing !== "new") {
      updateEvent(editing.id, {
        title, date: draft.date, emoji: draft.emoji, countUpAfter: draft.countUpAfter,
      });
    } else {
      addEvent({
        id: crypto.randomUUID(),
        title, date: draft.date, emoji: draft.emoji,
        countUpAfter: draft.countUpAfter,
      });
    }
    setEditing(null);
  }

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock size={16} className="text-brand-600" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">الأحداث المهمّة</span>
          </div>
          {editing === null && (
            <button
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-brand-600 rounded-lg px-2.5 py-1.5 press"
            >
              <Plus size={13} /> حدث
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          موعدٌ واحد لكلّ حدث (اختبار، ولادة، سفر) وتظهر أيامه المتبقّية في الرئيسية. الحدث يختفي
          تلقائياً بعد يومٍ من مروره — إلّا إن اخترتَ «يُعدّ بعد مروره» فيبقى يعدّ الأيام منه.
        </p>

        {editing !== null && (
          <EventForm
            initial={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onSave={save}
          />
        )}

        {all.length === 0 && editing === null ? (
          <p className="text-xs text-gray-400 text-center py-4">لا أحداث بعد — أضِف أوّل موعد.</p>
        ) : (
          <div className="space-y-1.5">
            {all.map((e) => {
              const d = daysUntil(e.date, todayStr);
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-2.5 bg-gray-50 dark:bg-white/[0.04] rounded-xl p-2.5"
                >
                  <span aria-hidden className="text-base shrink-0">{e.emoji || "📌"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{e.title}</div>
                    <div className="text-[10px] text-gray-400">
                      {formatDate(e.date)} · {describeDays(d)}
                      {!shownOnHome.has(e.id) && " · لا يظهر في الرئيسية"}
                    </div>
                  </div>
                  {confirmDelete === e.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => { deleteEvent(e.id); setConfirmDelete(null); }}
                        className="text-[11px] font-bold text-white bg-red-500 rounded-lg px-2 py-1 press"
                      >
                        احذف
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="p-1 text-gray-400 press"
                        aria-label="إلغاء"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => setEditing(e)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 press"
                        aria-label={`تعديل ${e.title}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(e.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 press"
                        aria-label={`حذف ${e.title}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

function EventForm({
  initial, onCancel, onSave,
}: {
  initial: CountdownEvent | null;
  onCancel: () => void;
  onSave: (d: { title: string; date: string; emoji: string; countUpAfter: boolean }) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "📌");
  const [countUpAfter, setCountUpAfter] = useState(initial?.countUpAfter ?? false);
  const valid = title.trim().length > 0 && !!date;

  return (
    <div className="space-y-2.5 border border-brand-600/20 bg-brand-600/[0.04] rounded-xl p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="اسم الحدث (مثل: اختبار CFA)"
        aria-label="اسم الحدث"
        className="w-full text-sm border border-gray-200 dark:border-transparent rounded-lg px-3 py-2 bg-white dark:bg-[#241c12] focus:outline-none focus:ring-2 focus:ring-brand-600/40"
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        aria-label="تاريخ الحدث"
        className="w-full text-sm border border-gray-200 dark:border-transparent rounded-lg px-3 py-2 bg-white dark:bg-[#241c12] focus:outline-none focus:ring-2 focus:ring-brand-600/40"
      />
      <div className="flex flex-wrap gap-1">
        {EMOJI_CHOICES.map((c) => (
          <button
            key={c}
            onClick={() => setEmoji(c)}
            aria-pressed={emoji === c}
            className={`w-8 h-8 rounded-lg text-base press flex items-center justify-center ${
              emoji === c ? "bg-brand-600/20 ring-2 ring-brand-600/40" : "bg-white dark:bg-[#241c12]"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        <input
          type="checkbox"
          checked={countUpAfter}
          onChange={(e) => setCountUpAfter(e.target.checked)}
          className="accent-brand-600"
        />
        يبقى بعد مروره ويعدّ الأيام منه (كالميلاد)
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSave({ title, date, emoji, countUpAfter })}
          disabled={!valid}
          className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-bold text-white bg-brand-600 rounded-lg py-2 press disabled:opacity-40"
        >
          <Check size={14} /> {initial ? "حفظ" : "أضِف"}
        </button>
        <button
          onClick={onCancel}
          className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-white/10 rounded-lg px-4 py-2 press"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}
