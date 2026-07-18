"use client";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { uid, today, formatDate } from "@/lib/utils";
import { verseOfDay, verseRef, dayOfYear, QURAN_VERSES, type QuranVerse } from "@/lib/quranVerses";
import { SURAHS } from "@/lib/quran/meta";
import { loadAyahText } from "@/lib/quran/text";
import { AyahPicker, type AyahSelection } from "@/components/quran/AyahPicker";
import { Sparkles, Plus, Trash2, Pencil, Shuffle, PenLine } from "lucide-react";

// التدبّر: «آية اليوم» ثمّ تأمّلاتك — تختار بحرّية أيّ سورة ومدى آيات، فيظهر
// النصّ العثماني الحقيقي، وتكتب تأمّلك. النصّ كلّه من بيانات المصحف المحلية.
function surahNumByName(name: string): number {
  const i = SURAHS.findIndex((s) => s.name === name);
  return i >= 0 ? i + 1 : 1;
}
function refLabel(sel: AyahSelection): string {
  const name = SURAHS[sel.surah - 1]?.name ?? "";
  return sel.toAyah > sel.fromAyah ? `${name} ${sel.fromAyah}–${sel.toAyah}` : `${name} ${sel.fromAyah}`;
}

export function TadabburSection() {
  const { quranReflections, addReflection, updateReflection, deleteReflection } = useAppStore();

  const [text, setText] = useState<string[] | null>(null);
  useEffect(() => { loadAyahText().then(setText); }, []);

  const [verse, setVerse] = useState<QuranVerse | null>(null);
  useEffect(() => setVerse(verseOfDay(dayOfYear())), []);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [sel, setSel] = useState<AyahSelection>({ surah: 1, fromAyah: 1, toAyah: 1 });
  const [withRef, setWithRef] = useState(true); // هل يربط التأمّل بآية؟
  const [body, setBody] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const reflections = [...quranReflections].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)
  );

  function openNew(prefill?: AyahSelection) {
    setEditId(null);
    setSel(prefill ?? { surah: 1, fromAyah: 1, toAyah: 1 });
    setWithRef(true);
    setBody("");
    setShowForm(true);
  }
  function openEdit(r: (typeof quranReflections)[number]) {
    setEditId(r.id);
    if (r.surah) {
      setSel({ surah: r.surah, fromAyah: r.fromAyah ?? 1, toAyah: r.toAyah ?? r.fromAyah ?? 1 });
      setWithRef(true);
    } else {
      setWithRef(false);
    }
    setBody(r.text);
    setShowForm(true);
  }
  function save() {
    const t = body.trim();
    if (!t) return;
    const fields = withRef
      ? { surah: sel.surah, fromAyah: sel.fromAyah, toAyah: sel.toAyah, reference: refLabel(sel) }
      : { surah: undefined, fromAyah: undefined, toAyah: undefined, reference: undefined };
    if (editId) {
      updateReflection(editId, { ...fields, text: t });
    } else {
      addReflection({ id: uid(), date: today(), ...fields, text: t, createdAt: today() });
    }
    setShowForm(false); setEditId(null); setBody("");
  }

  // نصّ آيات مرجعٍ محفوظ (سورة + مدى) للعرض في القائمة.
  function refVerses(r: { surah?: number; fromAyah?: number; toAyah?: number }): { n: number; text: string }[] {
    if (!text || !r.surah) return [];
    const s = SURAHS[r.surah - 1];
    const from = r.fromAyah ?? 1, to = r.toAyah ?? from;
    const out: { n: number; text: string }[] = [];
    for (let a = from; a <= to && a <= s.ayat; a++) out.push({ n: a, text: text[s.first + (a - 1)] ?? "" });
    return out;
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
          <p className="font-quran text-center text-[21px] leading-[2.2] font-bold text-gray-800 dark:text-gray-100 px-1">
            {verse.text}
          </p>
          <p className="text-center text-xs text-quran font-semibold mt-3">﴿ {verseRef(verse)} ﴾</p>
          <button
            onClick={() => openNew({ surah: surahNumByName(verse.surah), fromAyah: verse.ayah, toAyah: verse.ayah })}
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
        <div className="bg-gray-50 dark:bg-[#2c2318] rounded-xl p-3 space-y-3 animate-fade-up">
          {editId && <div className="text-xs font-semibold text-gray-500">تعديل التأمّل</div>}

          {/* اختيار الربط بآية */}
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={withRef} onChange={(e) => setWithRef(e.target.checked)} className="accent-quran w-4 h-4" />
            اربط التأمّل بآية أو مقطع
          </label>

          {withRef && <AyahPicker text={text} value={sel} onChange={setSel} />}

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="ماذا خطر لك عند تدبّرها؟"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none bg-white dark:bg-[#241c12] focus:outline-none focus:ring-2 focus:ring-quran/40"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="text-sm text-gray-400 px-3 py-1.5 press">إلغاء</button>
            <button onClick={save} disabled={!body.trim()} className="bg-quran text-white text-sm px-4 py-1.5 rounded-lg press disabled:opacity-40">
              {editId ? "حفظ" : "أضف"}
            </button>
          </div>
        </div>
      )}

      {quranReflections.length === 0 && !showForm ? (
        <p className="text-xs text-gray-400 text-center py-4 leading-relaxed">
          لا تأمّلات بعد. اختر أي آية واكتب ما فتح الله به عليك.
        </p>
      ) : (
        <div className="space-y-2.5">
          {reflections.map((r) => {
            const verses = refVerses(r);
            return (
              <div key={r.id} className="rounded-xl border border-gray-100 bg-white dark:bg-[#241c12] p-3.5">
                {r.reference && (
                  <p className="text-[11px] font-semibold text-quran mb-1.5">﴿ {r.reference} ﴾</p>
                )}
                {verses.length > 0 && (
                  <p className="font-quran text-center text-[17px] leading-[2.2] font-bold text-gray-700 dark:text-gray-200 mb-2.5 pb-2.5 border-b border-gray-50 dark:border-[#3a2e1e]">
                    {verses.map((v) => (
                      <span key={v.n}>{v.text}<span className="text-quran/70 text-[11px] align-middle mx-0.5">﴿{v.n}﴾</span>{" "}</span>
                    ))}
                  </p>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
