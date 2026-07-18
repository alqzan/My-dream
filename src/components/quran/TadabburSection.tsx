"use client";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { uid, today, formatDate } from "@/lib/utils";
import { QURAN_VERSES, verseOfDay, verseRef, dayOfYear, type QuranVerse } from "@/lib/quranVerses";
import { Sparkles, Plus, Trash2, Pencil, Shuffle, PenLine } from "lucide-react";

// التدبّر: «آية اليوم» (رسم عثماني موثوق، تتغيّر كل يوم) مع زرّ يفتح تأمّلاً
// مربوطاً بمرجعها، ثم قائمة تأمّلاتك. لا تُكتب الآيات من الذاكرة — كلّها من
// quranVerses.ts (مصدر موثوق).
export function TadabburSection() {
  const { quranReflections, addReflection, updateReflection, deleteReflection } = useAppStore();

  // آية اليوم تُحسب على العميل فقط (ثبات SSR). زر «آية أخرى» يقلّبها محلياً.
  const [verse, setVerse] = useState<QuranVerse | null>(null);
  useEffect(() => setVerse(verseOfDay(dayOfYear())), []);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [text, setText] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const reflections = [...quranReflections].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)
  );

  function openNew(ref?: string) {
    setEditId(null);
    setReference(ref ?? "");
    setText("");
    setShowForm(true);
  }
  function openEdit(r: { id: string; reference?: string; text: string }) {
    setEditId(r.id);
    setReference(r.reference ?? "");
    setText(r.text);
    setShowForm(true);
  }
  function save() {
    const body = text.trim();
    if (!body) return;
    const ref = reference.trim() || undefined;
    if (editId) {
      updateReflection(editId, { reference: ref, text: body });
    } else {
      addReflection({ id: uid(), date: today(), reference: ref, text: body, createdAt: today() });
    }
    setShowForm(false); setEditId(null); setReference(""); setText("");
  }

  return (
    <div className="space-y-4">
      {/* آية اليوم */}
      {verse && (
        <div className="relative overflow-hidden rounded-2xl border border-quran/25 bg-gradient-to-br from-quran/[0.10] to-quran/[0.02] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-quran">
              <Sparkles size={13} /> آية اليوم
            </div>
            <button
              onClick={() => setVerse(QURAN_VERSES[Math.floor(Math.random() * QURAN_VERSES.length)])}
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-quran press"
              aria-label="آية أخرى"
            >
              <Shuffle size={12} /> آية أخرى
            </button>
          </div>
          <p className="text-center text-[19px] leading-[2.1] font-bold text-gray-800 dark:text-gray-100 px-1">
            {verse.text}
          </p>
          <p className="text-center text-xs text-quran font-semibold mt-3">﴿ {verseRef(verse)} ﴾</p>
          <button
            onClick={() => openNew(verseRef(verse))}
            className="mt-4 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-quran/10 hover:bg-quran/20 text-quran text-sm font-semibold press"
          >
            <PenLine size={15} /> تأمّل في هذه الآية
          </button>
        </div>
      )}

      {/* رأس التأمّلات + إضافة */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PenLine size={16} className="text-quran" />
          <span className="text-sm font-semibold text-gray-700">تأمّلاتي</span>
          {quranReflections.length > 0 && (
            <span className="text-[11px] text-gray-400">({quranReflections.length})</span>
          )}
        </div>
        <button
          onClick={() => (showForm && !editId ? setShowForm(false) : openNew())}
          className="flex items-center gap-1 text-xs font-bold text-quran bg-quran/10 hover:bg-quran/20 rounded-full px-3 py-1 press"
        >
          <Plus size={14} /> تأمّل جديد
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 dark:bg-[#2c2318] rounded-xl p-3 space-y-2.5 animate-fade-up">
          {editId && <div className="text-xs font-semibold text-gray-500">تعديل التأمّل</div>}
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="مرجع الآية (اختياري) — مثل: الرعد 28"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-quran/40"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="ماذا خطر لك عند تدبّرها؟"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-quran/40"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="text-sm text-gray-400 px-3 py-1.5 press">إلغاء</button>
            <button onClick={save} disabled={!text.trim()} className="bg-quran text-white text-sm px-4 py-1.5 rounded-lg press disabled:opacity-40">
              {editId ? "حفظ" : "أضف"}
            </button>
          </div>
        </div>
      )}

      {quranReflections.length === 0 && !showForm ? (
        <p className="text-xs text-gray-400 text-center py-4 leading-relaxed">
          لا تأمّلات بعد. اقرأ آية اليوم واكتب ما فتح الله به عليك.
        </p>
      ) : (
        <div className="space-y-2.5">
          {reflections.map((r) => (
            <div key={r.id} className="rounded-xl border border-gray-100 bg-white dark:bg-[#241c12] p-3.5">
              {r.reference && (
                <p className="text-[11px] font-semibold text-quran mb-1">﴿ {r.reference} ﴾</p>
              )}
              <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-line">{r.text}</p>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50 dark:border-[#3a2e1e]">
                <span className="text-[11px] text-gray-400">{formatDate(r.date)}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(r)} className="p-1.5 text-gray-300 hover:text-quran press" aria-label="تعديل">
                    <Pencil size={14} />
                  </button>
                  {confirmDel === r.id ? (
                    <span className="flex items-center gap-1.5 text-[11px]">
                      <button onClick={() => { deleteReflection(r.id); setConfirmDel(null); }} className="text-red-500 font-semibold press">حذف</button>
                      <button onClick={() => setConfirmDel(null)} className="text-gray-400 press">إلغاء</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmDel(r.id)} className="p-1.5 text-gray-300 hover:text-red-500 press" aria-label="حذف">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
