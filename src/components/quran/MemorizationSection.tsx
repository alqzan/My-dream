"use client";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { uid, today, parseDate, formatDate } from "@/lib/utils";
import { REVIEW_INTERVALS, type MemorizationItem, type MemorizationKind } from "@/lib/types";
import { SURAHS, TOTAL_JUZ, TOTAL_HIZB, TOTAL_PAGES, describeRange, juzRange, hizbRange, pageRange } from "@/lib/quran/meta";
import { loadAyahText } from "@/lib/quran/text";
import { finalizeMem, memProgress, DEFAULT_MEM_DRAFT, type MemDraft } from "@/lib/quran/memorize";
import { AyahPicker } from "@/components/quran/AyahPicker";
import { NumberInput } from "@/components/ui/NumberInput";
import { Plus, Trash2, Check, RefreshCw, BookMarked, CalendarClock } from "lucide-react";

const KINDS: { key: MemorizationKind; label: string }[] = [
  { key: "surah", label: "سورة" },
  { key: "ayat", label: "آيات" },
  { key: "juz", label: "جزء" },
  { key: "hizb", label: "حزب" },
  { key: "page", label: "وجه" },
];

export function MemorizationSection() {
  const { quranMemorized, addMemorization, deleteMemorization, reviewMemorization } = useAppStore();
  const [text, setText] = useState<string[] | null>(null);
  useEffect(() => { loadAyahText().then(setText); }, []);

  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<MemDraft>(DEFAULT_MEM_DRAFT);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const todayStr = today();
  const due = quranMemorized
    .filter((m) => m.nextReview <= todayStr)
    .sort((a, b) => (a.nextReview < b.nextReview ? -1 : 1));
  const sorted = [...quranMemorized].sort((a, b) => (a.nextReview < b.nextReview ? -1 : 1));
  const prog = memProgress(quranMemorized);

  function up(patch: Partial<MemDraft>) { setDraft((d) => ({ ...d, ...patch })); }

  function save() {
    const fields = finalizeMem(draft);
    const item: MemorizationItem = {
      id: uid(),
      memorizedDate: todayStr,
      reviewStage: 0,
      nextReview: addDays(todayStr, REVIEW_INTERVALS[0]),
      label: fields.label ?? "محفوظ",
      ...fields,
    };
    addMemorization(item);
    setDraft(DEFAULT_MEM_DRAFT);
    setShowAdd(false);
  }

  function dueLabel(nextReview: string): string {
    if (nextReview < todayStr) return "متأخّرة";
    if (nextReview === todayStr) return "اليوم";
    return formatDate(nextReview);
  }

  return (
    <div className="space-y-4">
      {/* تقدّم الحفظ */}
      {quranMemorized.length > 0 && (
        <div className="rounded-2xl border border-quran/20 bg-quran/[0.05] p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-700">تقدّم الحفظ</span>
            <span className="text-[11px] text-quran font-bold tabular-nums">
              ≈ {prog.pages} من {TOTAL_PAGES} وجه · {prog.pct}%
            </span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-[#2c2318] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-l from-quran to-[#2f9c73] transition-all duration-700" style={{ width: `${prog.pct}%` }} />
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 tabular-nums">{prog.ayat} آية محفوظة من {6236}</p>
        </div>
      )}

      {/* مراجعة اليوم */}
      {due.length > 0 && (
        <div className="rounded-2xl border border-quran/25 bg-quran/[0.06] p-4">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw size={15} className="text-quran" />
            <span className="text-sm font-bold text-gray-800">مراجعة اليوم</span>
            <span className="text-[11px] font-bold text-white bg-quran rounded-full px-2 py-0.5">{due.length}</span>
          </div>
          <div className="space-y-2">
            {due.map((m) => (
              <div key={m.id} className="bg-white dark:bg-[#241c12] rounded-xl border border-quran/15 p-3">
                <div className="text-sm font-semibold text-gray-800 mb-2">{m.label}</div>
                <div className="flex gap-2">
                  <button onClick={() => reviewMemorization(m.id, true)} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-quran rounded-lg py-2 press">
                    <Check size={14} /> تذكّرتها
                  </button>
                  <button onClick={() => reviewMemorization(m.id, false)} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-quran bg-quran/10 hover:bg-quran/20 rounded-lg py-2 press">
                    <RefreshCw size={13} /> أحتاج مراجعة
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* رأس القائمة + إضافة */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookMarked size={16} className="text-quran" />
          <span className="text-sm font-semibold text-gray-700">محفوظاتي</span>
          {quranMemorized.length > 0 && <span className="text-[11px] text-gray-400">({quranMemorized.length})</span>}
        </div>
        <button onClick={() => setShowAdd((v) => !v)} className="flex items-center gap-1 text-xs font-bold text-quran bg-quran/10 hover:bg-quran/20 rounded-full px-3 py-1 press">
          <Plus size={14} /> أضف محفوظاً
        </button>
      </div>

      {showAdd && (
        <div className="bg-gray-50 dark:bg-[#2c2318] rounded-xl p-3 space-y-3 animate-fade-up">
          {/* اختيار الوحدة */}
          <div className="flex gap-1.5 flex-wrap">
            {KINDS.map((k) => (
              <button
                key={k.key}
                onClick={() => up({ kind: k.key })}
                className={`text-xs font-semibold rounded-full px-3 py-1.5 press transition-colors ${
                  draft.kind === k.key ? "bg-quran text-white" : "bg-white dark:bg-[#241c12] text-gray-500 border border-gray-200"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          <MemUnitInputs draft={draft} up={up} text={text} />

          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="text-sm text-gray-400 px-3 py-1.5 press">إلغاء</button>
            <button onClick={save} className="bg-quran text-white text-sm px-4 py-1.5 rounded-lg press">حفظ</button>
          </div>
        </div>
      )}

      {/* القائمة */}
      {quranMemorized.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4 leading-relaxed">
          لم تُضِف محفوظاً بعد. أضف سورة أو جزءاً أو أوجهاً أو آياتٍ لتبدأ متابعة مراجعتها.
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((m) => {
            const overdue = m.nextReview < todayStr;
            const dueToday = m.nextReview === todayStr;
            return (
              <div key={m.id} className="flex items-center gap-3 bg-white dark:bg-[#241c12] rounded-xl border border-gray-100 p-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{m.label}</div>
                  <div className="flex items-center gap-1 mt-0.5 text-[11px]">
                    <CalendarClock size={11} className={overdue ? "text-red-400" : dueToday ? "text-quran" : "text-gray-400"} />
                    <span className={overdue ? "text-red-500 font-medium" : dueToday ? "text-quran font-medium" : "text-gray-400"}>
                      مراجعة: {dueLabel(m.nextReview)}
                    </span>
                    <span className="text-gray-300 mx-1">·</span>
                    <span className="text-gray-400">مرتبة {m.reviewStage + 1}</span>
                  </div>
                </div>
                {confirmDel === m.id ? (
                  <span className="flex items-center gap-1.5 text-[11px] shrink-0">
                    <button onClick={() => { deleteMemorization(m.id); setConfirmDel(null); }} className="text-red-500 font-semibold press">حذف</button>
                    <button onClick={() => setConfirmDel(null)} className="text-gray-400 press">إلغاء</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDel(m.id)} className="p-1.5 text-gray-300 hover:text-red-500 press shrink-0" aria-label={`حذف ${m.label}`}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// حقول الإدخال الخاصّة بكل وحدة.
function MemUnitInputs({ draft, up, text }: { draft: MemDraft; up: (p: Partial<MemDraft>) => void; text: string[] | null }) {
  if (draft.kind === "surah") {
    return (
      <select
        value={draft.surah}
        onChange={(e) => up({ surah: Number(e.target.value) })}
        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white dark:bg-[#241c12] focus:outline-none focus:ring-2 focus:ring-quran/40"
      >
        {SURAHS.map((s) => <option key={s.num} value={s.num}>{s.num}. {s.name} ({s.ayat} آية)</option>)}
      </select>
    );
  }
  if (draft.kind === "ayat") {
    return (
      <AyahPicker
        text={text}
        value={{ surah: draft.surah, fromAyah: draft.fromAyah, toAyah: draft.toAyah }}
        onChange={(v) => up({ surah: v.surah, fromAyah: v.fromAyah, toAyah: v.toAyah })}
      />
    );
  }
  if (draft.kind === "juz") {
    const r = juzRange(draft.juz);
    return (
      <UnitNumber label="الجزء" value={draft.juz} max={TOTAL_JUZ} onChange={(n) => up({ juz: n })} hint={describeRange(r.start, r.end)} />
    );
  }
  if (draft.kind === "hizb") {
    const r = hizbRange(draft.hizb);
    return (
      <UnitNumber label="الحزب" value={draft.hizb} max={TOTAL_HIZB} onChange={(n) => up({ hizb: n })} hint={describeRange(r.start, r.end)} />
    );
  }
  // page (وجه)
  const single = pageRange(draft.fromPage);
  return (
    <div className="space-y-2.5">
      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
        <input type="checkbox" checked={draft.pageRange} onChange={(e) => up({ pageRange: e.target.checked })} className="accent-quran w-4 h-4" />
        مدى أوجه (من – إلى)
      </label>
      {draft.pageRange ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400">من وجه</span>
          <NumberInput value={String(draft.fromPage)} onChange={(v) => up({ fromPage: clampPage(v) })} inputMode="numeric" className="w-16 text-sm text-center border border-gray-200 rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-quran/40" />
          <span className="text-[11px] text-gray-400">إلى</span>
          <NumberInput value={String(draft.toPage)} onChange={(v) => up({ toPage: clampPage(v) })} inputMode="numeric" className="w-16 text-sm text-center border border-gray-200 rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-quran/40" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400">رقم الوجه (1–604)</span>
            <NumberInput value={String(draft.fromPage)} onChange={(v) => up({ fromPage: clampPage(v) })} inputMode="numeric" className="w-20 text-sm text-center border border-gray-200 rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-quran/40" />
          </div>
          <div className="flex gap-1.5">
            {[[1, "وجه كامل"], [0.5, "نصف وجه"], [0.25, "ربع وجه"]].map(([f, lbl]) => (
              <button
                key={String(f)}
                onClick={() => up({ fraction: f as number })}
                className={`text-xs font-semibold rounded-lg px-3 py-1.5 press transition-colors ${
                  draft.fraction === f ? "bg-quran text-white" : "bg-white dark:bg-[#241c12] text-gray-500 border border-gray-200"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400">الوجه {draft.fromPage}: {describeRange(single.start, single.end)}</p>
        </>
      )}
    </div>
  );
}

function UnitNumber({ label, value, max, onChange, hint }: { label: string; value: number; max: number; onChange: (n: number) => void; hint: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-400">{label} (1–{max})</span>
        <NumberInput
          value={String(value)}
          onChange={(v) => onChange(Math.min(Math.max(parseInt(v) || 1, 1), max))}
          inputMode="numeric"
          className="w-20 text-sm text-center border border-gray-200 rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-quran/40"
        />
      </div>
      <p className="text-[10px] text-gray-400">{hint}</p>
    </div>
  );
}

function clampPage(v: string): number {
  return Math.min(Math.max(parseInt(v) || 1, 1), TOTAL_PAGES);
}

function addDays(dateStr: string, n: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
