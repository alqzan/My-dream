"use client";
import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ, type HifzRating, type HifzSession, type HifzReviewLog } from "@/lib/types";
import { describeRange } from "@/lib/quran/meta";
import { formatDate } from "@/lib/utils";
import { History, ChevronDown, ChevronUp, Trash2, Undo2, Sprout, RefreshCw } from "lucide-react";

type Row =
  | { kind: "session"; id: string; date: string; fromId: number; toId: number; rating?: HifzRating }
  | { kind: "review"; id: string; date: string; fromId: number; toId: number; rating?: HifzRating };

const RATINGS: { r: HifzRating; label: string; cls: string }[] = [
  { r: 3, label: "متقن", cls: "bg-quran text-white" },
  { r: 2, label: "جيّد", cls: "bg-amber-500 text-white" },
  { r: 1, label: "يحتاج", cls: "bg-red-500 text-white" },
];

// سجل الحفظ والمراجعة: التاريخ، المدى، النوع، والتقييم — مع تعديل التقييم، وحذفٍ
// قابلٍ للتراجع (Undo). حذف/تعديل جلسةٍ يعيد المتجرُ حساب الجبهة من الجلسات
// فيبقى الرسمُ والسجلّ متّسقَين. مطويّ افتراضياً ومحدود العرض (أداء).
export function HifzLog() {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(20);
  const [undo, setUndo] = useState<{ kind: "session"; item: HifzSession } | { kind: "review"; item: HifzReviewLog } | null>(null);

  const rows = useMemo<Row[]>(() => {
    const s: Row[] = (h.sessions ?? []).map((x) => ({ kind: "session", id: x.id, date: x.date, fromId: x.fromId, toId: x.toId, rating: x.rating }));
    const r: Row[] = (h.reviews ?? []).map((x) => ({ kind: "review", id: x.id, date: x.date, fromId: x.fromId, toId: x.toId, rating: x.rating }));
    return [...s, ...r].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [h.sessions, h.reviews]);

  if (rows.length === 0) return null;
  const shown = open ? rows.slice(0, limit) : [];

  const setRating = (row: Row, rating: HifzRating) => {
    const next = row.rating === rating ? undefined : rating;
    if (row.kind === "session") store.updateHifzSession(row.id, { rating: next });
    else store.updateHifzReview(row.id, { rating: next });
  };
  const del = (row: Row) => {
    if (row.kind === "session") {
      const item = (h.sessions ?? []).find((x) => x.id === row.id);
      if (item) { setUndo({ kind: "session", item }); store.deleteHifzSession(row.id); }
    } else {
      const item = (h.reviews ?? []).find((x) => x.id === row.id);
      if (item) { setUndo({ kind: "review", item }); store.deleteHifzReview(row.id); }
    }
  };
  const doUndo = () => {
    if (!undo) return;
    if (undo.kind === "session") store.restoreHifzSession(undo.item);
    else store.restoreHifzReview(undo.item);
    setUndo(null);
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white dark:bg-[#241c12] p-4 space-y-3">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 press">
        <History size={15} className="text-quran" />
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">سجل الحفظ والمراجعة</span>
        <span className="text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-[#382c1d] rounded-full px-2 py-0.5">{rows.length}</span>
        <span className="ms-auto text-gray-400">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
      </button>

      {undo && (
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-[#2c2318] rounded-lg px-3 py-2">
          <span className="text-[11px] text-gray-500 flex-1">حُذف القيد.</span>
          <button onClick={doUndo} className="inline-flex items-center gap-1 text-[11px] font-bold text-quran press"><Undo2 size={13} /> تراجع</button>
          <button onClick={() => setUndo(null)} className="text-[11px] text-gray-400 press">تجاهل</button>
        </div>
      )}

      {open && (
        <div className="space-y-1.5">
          {shown.map((row) => (
            <div key={`${row.kind}-${row.id}`} className="rounded-xl border border-gray-100 dark:border-gray-700/40 p-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 ${row.kind === "session" ? "text-quran bg-quran/10" : "text-amber-700 bg-amber-100 dark:bg-amber-900/30"}`}>
                  {row.kind === "session" ? <><Sprout size={11} /> حفظ</> : <><RefreshCw size={11} /> مراجعة</>}
                </span>
                <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-200 truncate">{describeRange(row.fromId, row.toId)}</span>
                <span className="ms-auto text-[10px] text-gray-400 shrink-0">{formatDate(row.date)}</span>
              </div>
              <div className="flex items-center gap-1">
                {RATINGS.map((it) => (
                  <button key={it.r} onClick={() => setRating(row, it.r)}
                    className={`text-[10px] font-bold rounded-md px-2 py-1 press ${row.rating === it.r ? it.cls : "bg-gray-100 dark:bg-[#382c1d] text-gray-400"}`}>
                    {it.label}
                  </button>
                ))}
                <button onClick={() => del(row)} className="ms-auto p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-500/10 press" aria-label="حذف القيد">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {open && rows.length > limit && (
            <button onClick={() => setLimit((n) => n + 30)} className="w-full text-[11px] text-gray-400 hover:text-gray-600 py-1.5 press">
              عرض المزيد ({rows.length - limit})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
