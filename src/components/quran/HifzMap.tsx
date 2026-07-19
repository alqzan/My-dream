"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ, type HifzUnit } from "@/lib/types";
import { SURAHS, TOTAL_PAGES, juzRange, idToPage, idToSurahAyah } from "@/lib/quran/meta";
import { today, formatDate } from "@/lib/utils";
import {
  hifzProgress, hifzPace, hifzStreak, hifzMap, mapCounts, type Portion, type JuzState, type JuzCell,
} from "@/lib/quran/hifz";
import { NumberInput } from "@/components/ui/NumberInput";
import {
  MapPin, Gauge, Flame, Pencil, RotateCcw, Headphones, BookOpen, X, CheckCircle2, RefreshCw, TriangleAlert, Sprout,
} from "lucide-react";

const UNIT_LABEL: Record<HifzUnit, string> = { ayah: "آية", quarter: "ربع وجه", half: "نصف وجه", page: "وجه" };
const UNITS: HifzUnit[] = ["ayah", "quarter", "half", "page"];

// ألوان حالات الجزء.
const STATE: Record<JuzState, { fill: string; text: string; label: string; dot: string }> = {
  fresh:   { fill: "#1b6b4c", text: "#fff",     label: "متقن",          dot: "#1b6b4c" },
  due:     { fill: "#d99a2b", text: "#fff",     label: "محتاج مراجعة",  dot: "#d99a2b" },
  weak:    { fill: "#d9534f", text: "#fff",     label: "يحتاج إتقان",   dot: "#d9534f" },
  partial: { fill: "#59b98f", text: "#1f2937",  label: "جارٍ حفظه",     dot: "#59b98f" },
  none:    { fill: "transparent", text: "#9ca3af", label: "لم يُحفظ",   dot: "#d1d5db" },
};

// لوحة «خريطة الحفظ» — الأجزاء الثلاثون كشبكة ملوّنة بحالة كلٍّ منها (محفوظ/متقن،
// محتاج مراجعة، موطن ضعف، جارٍ، لم يُحفظ) مع إحصاءات وتفاصيل ومراجعة مباشرة.
export function HifzMap({ text, onReview }: { text: string[] | null; onReview: (p: Portion) => void }) {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const [sel, setSel] = useState<number | null>(null);
  const [editPlan, setEditPlan] = useState(false);
  const [editPos, setEditPos] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  const prog = hifzProgress(h);
  const pace = hifzPace(h);
  const streak = hifzStreak(h);
  const cells = hifzMap(h, today());
  const counts = mapCounts(cells);
  const plan = h.plan!;
  const selCell = sel ? cells[sel - 1] : null;

  return (
    <div className="rounded-2xl border border-quran/20 bg-gradient-to-b from-quran/[0.06] to-transparent p-4 space-y-3.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-800">خريطة الحفظ</span>
        <div className="flex items-center gap-2">
          {streak > 0 && <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600"><Flame size={12} /> {streak}</span>}
          <button onClick={() => setEditPlan((v) => !v)} className="p-1 text-gray-400 hover:text-quran press" aria-label="إعدادات الخطة"><Pencil size={13} /></button>
        </div>
      </div>

      {/* الموضع + الوتيرة */}
      {prog.at && (
        <div className="flex items-center gap-1.5 text-xs text-gray-600 flex-wrap">
          <MapPin size={13} className="text-quran" />
          موضعك: <span className="font-bold text-gray-800">{prog.at.surahName} {prog.at.ayah}</span>
          <span className="text-gray-300">·</span> صفحة {prog.page}/{TOTAL_PAGES}
          <span className="text-gray-300">·</span> الجزء {prog.juz}
        </div>
      )}
      {pace.text && (
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500"><Gauge size={12} className="text-quran" /> {pace.text}</div>
      )}

      {/* إحصاءات */}
      <div className="grid grid-cols-4 gap-2">
        <StatTile icon={<BookOpen size={14} />} color="#1b6b4c" value={`${prog.pct}%`} label={`${prog.spanPages} وجه`} />
        <StatTile icon={<CheckCircle2 size={14} />} color="#1b6b4c" value={String(counts.fresh)} label="متقن" />
        <StatTile icon={<RefreshCw size={14} />} color="#d99a2b" value={String(counts.due)} label="للمراجعة" />
        <StatTile icon={<TriangleAlert size={14} />} color="#d9534f" value={String(counts.weak)} label="ضعف" />
      </div>

      {/* الشبكة: 30 جزءاً */}
      <div className="grid grid-cols-6 gap-1.5">
        {cells.map((c) => {
          const st = STATE[c.state];
          const active = sel === c.juz;
          return (
            <button
              key={c.juz}
              onClick={() => setSel(active ? null : c.juz)}
              className={`relative aspect-square rounded-lg overflow-hidden border press transition-transform ${active ? "ring-2 ring-quran ring-offset-1 scale-105" : ""} ${c.state === "none" ? "border-gray-200 dark:border-[#3a2e1e]" : "border-transparent"}`}
              title={`الجزء ${c.juz} — ${st.label}`}
            >
              {c.state !== "none" && (
                <span className="absolute inset-x-0 bottom-0" style={{ height: `${Math.max(c.fill * 100, c.state === "partial" ? c.fill * 100 : 100)}%`, backgroundColor: st.fill }} />
              )}
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums" style={{ color: st.text }}>{c.juz}</span>
            </button>
          );
        })}
      </div>

      {/* مفتاح الألوان */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500">
        {(["fresh", "due", "weak", "partial", "none"] as JuzState[]).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: STATE[s].dot }} /> {STATE[s].label}
          </span>
        ))}
      </div>

      {/* تفاصيل الجزء المختار */}
      {selCell && <JuzDetail cell={selCell} text={text} onReview={onReview} onClose={() => setSel(null)} />}

      {/* إعدادات الخطة */}
      {editPlan && (
        <div className="bg-gray-50 dark:bg-[#2c2318] rounded-xl p-3 space-y-2.5">
          <div className="text-[11px] font-semibold text-gray-500">عدّل الورد اليومي</div>
          <div className="flex gap-1.5 flex-wrap">
            {UNITS.map((u) => (
              <button key={u} onClick={() => store.updateHifzPlan({ unit: u })}
                className={`text-xs font-semibold rounded-full px-3 py-1.5 press ${plan.unit === u ? "bg-quran text-white" : "bg-white dark:bg-[#241c12] text-gray-500 border border-gray-200"}`}>
                {UNIT_LABEL[u]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400">كل يوم</span>
            <NumberInput value={String(plan.amount)} onChange={(v) => store.updateHifzPlan({ amount: parseInt(v) || 1 })} inputMode="numeric"
              className="w-16 text-sm text-center border border-gray-200 rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-quran/40" />
            <span className="text-[11px] text-gray-400">{UNIT_LABEL[plan.unit]}</span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <button onClick={() => setEditPos((v) => !v)} className="text-[11px] text-gray-500 hover:text-quran press flex items-center gap-1"><MapPin size={12} /> تعديل موضعي</button>
            {confirmNew ? (
              <span className="flex items-center gap-1.5 text-[11px]">
                <button onClick={() => { store.clearHifz(); setConfirmNew(false); setEditPlan(false); }} className="text-red-500 font-semibold press">تأكيد المسح</button>
                <button onClick={() => setConfirmNew(false)} className="text-gray-400 press">إلغاء</button>
              </span>
            ) : (
              <button onClick={() => setConfirmNew(true)} className="text-[11px] text-red-500 hover:text-red-600 press flex items-center gap-1"><RotateCcw size={12} /> خطة جديدة</button>
            )}
          </div>
          {editPos && <PositionEditor current={h.frontierId} onSave={(id) => { store.setFrontier(id); setEditPos(false); }} onCancel={() => setEditPos(false)} />}
        </div>
      )}
    </div>
  );
}

function StatTile({ icon, color, value, label }: { icon: React.ReactNode; color: string; value: string; label: string }) {
  return (
    <div className="rounded-xl p-2 flex flex-col items-center gap-0.5" style={{ backgroundColor: color + "14" }}>
      <span style={{ color }}>{icon}</span>
      <span className="text-sm font-bold text-gray-800 tabular-nums leading-none">{value}</span>
      <span className="text-[9px] text-gray-500">{label}</span>
    </div>
  );
}

function JuzDetail({ cell, text, onReview, onClose }: { cell: JuzCell; text: string[] | null; onReview: (p: Portion) => void; onClose: () => void }) {
  const st = STATE[cell.state];
  const r = juzRange(cell.juz);
  const a = idToSurahAyah(r.start), b = idToSurahAyah(r.end);
  const startName = SURAHS[a.surah - 1]?.name, endName = SURAHS[b.surah - 1]?.name;
  return (
    <div className="rounded-xl border border-quran/20 bg-white dark:bg-[#241c12] p-3.5 animate-fade-up">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-800">الجزء {cell.juz}</span>
          <span className="text-[10px] font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: st.dot + "22", color: st.dot }}>{st.label}</span>
        </div>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 press" aria-label="إغلاق"><X size={15} /></button>
      </div>
      <div className="text-[11px] text-gray-500 space-y-1">
        <div>من {startName} {a.ayah} إلى {endName} {b.ayah} · الصفحات {idToPage(r.start)}–{idToPage(r.end)}</div>
        {cell.state === "none" ? (
          <div className="text-gray-400">لم تصل إليه خطتك بعد.</div>
        ) : (
          <>
            <div>محفوظ منه: {cell.memorizedAyat}/{cell.totalAyat} آية ({Math.round(cell.fill * 100)}%)</div>
            <div>آخر حفظ/مراجعة: {cell.lastDate ? `${formatDate(cell.lastDate)}${cell.daysSince != null ? ` (قبل ${cell.daysSince} يوم)` : ""}` : "—"}</div>
          </>
        )}
      </div>
      {cell.state !== "none" && cell.memEnd >= cell.memStart && (
        <button
          onClick={() => onReview({ fromId: cell.memStart, toId: cell.memEnd })}
          className="w-full mt-2.5 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-quran/10 hover:bg-quran/20 text-quran text-xs font-semibold press"
        >
          <Headphones size={14} /> راجع محفوظ هذا الجزء
        </button>
      )}
    </div>
  );
}

function PositionEditor({ current, onSave, onCancel }: { current: number; onSave: (id: number) => void; onCancel: () => void }) {
  const init = current >= 1 ? idToSurahAyah(current) : { surah: 1, ayah: 1 };
  const [surah, setSurah] = useState(init.surah);
  const [ayah, setAyah] = useState(String(init.ayah));
  const maxAyah = SURAHS[surah - 1].ayat;
  const a = Math.min(Math.max(parseInt(ayah) || 1, 1), maxAyah);
  return (
    <div className="rounded-xl bg-white dark:bg-[#241c12] border border-gray-100 p-3 space-y-2.5">
      <div className="text-[11px] font-semibold text-gray-500 flex items-center gap-1"><Sprout size={12} className="text-quran" /> حدّد آخر آية حفظتها</div>
      <div className="flex gap-2 items-center">
        <select value={surah} onChange={(e) => setSurah(Number(e.target.value))}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white dark:bg-[#241c12] focus:outline-none focus:ring-2 focus:ring-quran/40">
          {SURAHS.map((s) => <option key={s.num} value={s.num}>{s.num}. {s.name}</option>)}
        </select>
        <span className="text-[11px] text-gray-400">آية</span>
        <NumberInput value={ayah} onChange={setAyah} inputMode="numeric"
          className="w-16 text-sm text-center border border-gray-200 rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-quran/40" />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-sm text-gray-400 px-3 py-1.5 press">إلغاء</button>
        <button onClick={() => onSave(SURAHS[surah - 1].first + (a - 1))} className="bg-quran text-white text-sm px-4 py-1.5 rounded-lg press">حفظ الموضع</button>
      </div>
    </div>
  );
}
