"use client";
import { useMemo, useState } from "react";
import type { JournalEntry } from "@/lib/types";
import { duplicateDays, type DuplicateDay } from "@/lib/mergeDay";
import { formatDate, entriesCount, daysCount, displayTime } from "@/lib/utils";
import { stripMarkdown, plainTitle } from "@/lib/markdown";
import { entryPhotoSources, entryAudioSources } from "@/lib/mediaSources";
import { useAppStore } from "@/lib/store";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { showUndo } from "@/components/ui/UndoToast";
import { Combine, Images, Mic } from "lucide-react";

// ===================== لوحةُ دمج الأيام المكرّرة =====================
// **لا دمج قبل معاينة.** اللوحة تعرض كلّ يومٍ فيه أكثر من مذكرة، ومذكراتِه
// بأوقاتها وعناوينها وأطوالها ووسائطها، ثمّ تدمج بأمرٍ صريح — ليومٍ واحد أو
// للأيام كلّها. وكلّ دمجٍ قابلٌ للتراجع فوراً (`restoreJournalEntries`).

function DayRow({
  day,
  onMerge,
}: {
  day: DuplicateDay;
  onMerge: (day: DuplicateDay) => void;
}) {
  return (
    <li className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[12px] font-bold text-gray-800">{formatDate(day.date)}</span>
        <span className="text-[11px] text-gray-400 tabular-nums">{entriesCount(day.entries.length)}</span>
        <Button size="sm" variant="secondary" onClick={() => onMerge(day)} className="gap-1 !py-1">
          <Combine size={13} />
          ادمج
        </Button>
      </div>
      <ul className="space-y-1">
        {day.entries.map((e) => {
          const photos = entryPhotoSources(e).length;
          const audios = entryAudioSources(e).length;
          const text = stripMarkdown(e.content);
          return (
            <li key={e.id} className="flex items-center gap-2 text-[11px] text-gray-500">
              <span className="font-bold text-journal tabular-nums shrink-0">{displayTime(e.time) ?? "—"}</span>
              <span className="flex-1 min-w-0 truncate">{plainTitle(e.title) || text || "بلا نصّ"}</span>
              {photos > 0 && (
                <span className="flex items-center gap-0.5 text-gray-400 shrink-0 tabular-nums">
                  <Images size={11} />
                  {photos}
                </span>
              )}
              {audios > 0 && (
                <span className="flex items-center gap-0.5 text-gray-400 shrink-0 tabular-nums">
                  <Mic size={11} />
                  {audios}
                </span>
              )}
              <span className="text-gray-400 shrink-0 tabular-nums">{text.length} حرفاً</span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

export function MergeDaysSheet({
  open,
  onClose,
  /** يومٌ بعينه (من رأس اليوم في الخطّ الزمني)، أو كل الأيام المكرّرة حين يغيب. */
  only,
}: {
  open: boolean;
  onClose: () => void;
  only?: string;
}) {
  const journalEntries = useAppStore((s) => s.journalEntries);
  const mergeJournalDay = useAppStore((s) => s.mergeJournalDay);
  const restoreJournalEntries = useAppStore((s) => s.restoreJournalEntries);
  // عرضُ حدٍّ أعلى: أرشيفٌ فيه مئاتُ الأيام المكرّرة لا يُركَّب كلُّه في DOM.
  const PAGE = 30;
  const [shown, setShown] = useState(PAGE);

  const days = useMemo(() => {
    const all = duplicateDays(journalEntries);
    return only ? all.filter((d) => d.date === only) : all;
  }, [journalEntries, only]);

  const visible = days.slice(0, shown);
  const totalEntries = days.reduce((s, d) => s + d.entries.length, 0);

  function mergeDay(day: DuplicateDay) {
    const originals = mergeJournalDay(day.entries.map((e) => e.id));
    if (!originals) return;
    showUndo(`دُمجت مذكرات ${formatDate(day.date)}`, () => restoreJournalEntries(originals));
    if (only) onClose();
  }

  function mergeAll() {
    const restored: JournalEntry[] = [];
    let merged = 0;
    for (const day of days) {
      const originals = mergeJournalDay(day.entries.map((e) => e.id));
      if (!originals) continue;
      restored.push(...originals);
      merged++;
    }
    if (!merged) return;
    showUndo(`دُمج ${daysCount(merged)}`, () => restoreJournalEntries(restored));
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={only ? "دمج مذكرات اليوم" : "دمج الأيام المكرّرة"}>
      {days.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          لا يومَ فيه أكثر من مذكرة. لا شيء يُدمج.
        </p>
      ) : (
        <div className="space-y-3">
          {/* ما الذي سيحدث بالضبط — قبل أيّ زر */}
          <div className="rounded-xl bg-journal/[0.06] border border-journal/20 px-3 py-2.5 space-y-1">
            <p className="text-[12px] font-bold text-journal">الدمج لا يحذف شيئاً</p>
            <ul className="text-[11px] text-gray-600 leading-relaxed space-y-0.5 list-disc pe-4">
              <li>نصُّ كلّ مذكرةٍ يبقى كما كُتب، تحت عنوانٍ يحمل وقتها بالترتيب.</li>
              <li>الصور والأصوات والوسوم والروابط تُضمّ كلّها بلا تكرار.</li>
              <li>
                تُسجَّل بصمةُ كلّ مصدر (وقتُه وعنوانه وطول نصّه وعدد وسائطه)، وتظهر
                في المذكرة بشارة «مدموجة» — فتعرف دائماً أنّها مركّبة ومِمَّ.
              </li>
              <li>يمكن التراجع فوراً بعد الدمج.</li>
            </ul>
          </div>

          {!only && (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[12px] text-gray-500 tabular-nums">
                {daysCount(days.length)} · {entriesCount(totalEntries)} تصير {entriesCount(days.length)}
              </span>
              <Button size="sm" onClick={mergeAll} className="gap-1.5 bg-journal hover:bg-journal/90">
                <Combine size={14} />
                ادمج الكل
              </Button>
            </div>
          )}

          <ul className="space-y-2 max-h-[55vh] overflow-y-auto">
            {visible.map((day) => (
              <DayRow key={day.date} day={day} onMerge={mergeDay} />
            ))}
          </ul>

          {days.length > visible.length && (
            <button
              onClick={() => setShown((c) => c + PAGE)}
              className="w-full py-2.5 text-sm font-bold text-journal bg-journal/10 hover:bg-journal/20 rounded-xl press"
            >
              عرض المزيد ({days.length - visible.length})
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
