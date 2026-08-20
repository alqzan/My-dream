"use client";

import { useState } from "react";
import { CalendarRange, Copy, Download, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { showToast } from "@/components/ui/UndoToast";
import { useAppStore } from "@/lib/store";
import {
  AI_EXPORT_SECTIONS,
  aiExportJson,
  aiExportMarkdown,
  buildAiExport,
  type AiExportPeriod,
  type AiExportSection,
} from "@/lib/aiExport";
import { today } from "@/lib/utils";
import type { AppData } from "@/lib/types";

const SECTION_LABELS: Record<AiExportSection, string> = {
  journal: "المذكرات",
  finance: "المال",
  prayer: "الصلاة",
  quran: "القرآن",
};

const SECTION_HINTS: Record<AiExportSection, string> = {
  journal: "النصوص والوسائط بوصفها فقط",
  finance: "المعاملات والميزانيات والخطط",
  prayer: "سجل الصلوات والسنن والقيام",
  quran: "التدبر والوِرد والحفظ والختمة",
};

function downloadText(text: string, filename: string, type: string) {
  const blob = new Blob([text], { type: type + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function AiExportCard() {
  const store = useAppStore();
  const data = store.snapshot() as AppData;
  const currentDate = today();
  const [mode, setMode] = useState<AiExportPeriod["mode"]>("month");
  const [month, setMonth] = useState(currentDate.slice(0, 7));
  const [year, setYear] = useState(currentDate.slice(0, 4));
  const [sections, setSections] = useState<AiExportSection[]>([...AI_EXPORT_SECTIONS]);
  const [redactFinance, setRedactFinance] = useState(false);
  const [includeLocations, setIncludeLocations] = useState(false);
  const [includeMediaMetadata, setIncludeMediaMetadata] = useState(true);

  const period: AiExportPeriod =
    mode === "all"
      ? { mode: "all" }
      : mode === "month"
      ? { mode: "month", value: month || currentDate.slice(0, 7) }
      : { mode: "year", value: year || currentDate.slice(0, 4) };

  const payload = buildAiExport(data, {
    period,
    sections,
    redactFinance,
    includeLocations,
    includeMediaMetadata,
  });
  const disabled = payload.sections.length === 0;
  const periodLabel =
    period.mode === "all" ? "كل البيانات" : period.mode === "month" ? "شهر " + period.value : "سنة " + period.value;

  function toggleSection(section: AiExportSection) {
    setSections((current) =>
      current.includes(section) ? current.filter((item) => item !== section) : [...current, section]
    );
  }

  async function copyForAi() {
    if (disabled) {
      showToast("اختر قسماً واحداً على الأقل", "warning");
      return;
    }
    const markdown = aiExportMarkdown(payload);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable");
      await navigator.clipboard.writeText(markdown);
      showToast("نُسخت البيانات — الصقها في أداة الذكاء الاصطناعي بنفسك", "success");
    } catch {
      downloadText(markdown, "madar-ai-" + period.mode + ".md", "text/markdown");
      showToast("تعذّر الوصول للحافظة؛ نُزّل الملف بدلاً منها", "warning");
    }
  }

  function downloadMarkdown() {
    if (disabled) return;
    downloadText(aiExportMarkdown(payload), "madar-ai-" + period.mode + ".md", "text/markdown");
    showToast("تم تنزيل نسخة Markdown", "success");
  }

  function downloadJson() {
    if (disabled) return;
    downloadText(aiExportJson(payload), "madar-ai-" + period.mode + ".json", "application/json");
    showToast("تم تنزيل نسخة JSON", "success");
  }

  return (
    <Card className="border-brand-200/70 dark:border-brand-900/50">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={17} className="text-brand-600" />
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">نسخ للذكاء الاصطناعي</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
        جهّز ملخصاً من بيانات مدار لتلصقه في أي أداة تختارها. لا رفع تلقائي، ولا تُضمّن صور أو صوت أو PDF؛
        تبقى البيانات على جهازك حتى تضغط النسخ أو التنزيل.
      </p>

      <div className="flex items-center gap-2 mb-2">
        <CalendarRange size={14} className="text-gray-500" />
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">الفترة</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 mb-3" role="tablist" aria-label="فترة التصدير">
        {([
          ["month", "شهر"],
          ["year", "سنة"],
          ["all", "الكل"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={
              "min-h-[40px] rounded-xl text-sm press " +
              (mode === value
                ? "bg-gray-900 text-white dark:bg-brand-700"
                : "bg-gray-50 text-gray-600 dark:bg-white/5 dark:text-gray-300")
            }
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "month" && (
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="w-full min-h-[42px] rounded-xl border border-gray-200 bg-[var(--surface)] px-3 text-sm text-gray-700 dark:border-white/10 dark:text-gray-200 mb-4"
          aria-label="شهر التصدير"
        />
      )}
      {mode === "year" && (
        <input
          type="number"
          min="2000"
          max="2100"
          value={year}
          onChange={(event) => setYear(event.target.value)}
          className="w-full min-h-[42px] rounded-xl border border-gray-200 bg-[var(--surface)] px-3 text-sm text-gray-700 dark:border-white/10 dark:text-gray-200 mb-4"
          aria-label="سنة التصدير"
        />
      )}

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">الأقسام</span>
        <span className="text-[11px] text-gray-400">{periodLabel}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {AI_EXPORT_SECTIONS.map((section) => {
          const selected = sections.includes(section);
          const count = payload.counts[section] ?? 0;
          return (
            <button
              key={section}
              type="button"
              onClick={() => toggleSection(section)}
              aria-pressed={selected}
              className={
                "text-start rounded-xl border px-3 py-2.5 transition-colors press " +
                (selected
                  ? "border-brand-300 bg-brand-50/70 dark:border-brand-800 dark:bg-brand-900/20"
                  : "border-gray-200 bg-transparent opacity-60 dark:border-white/10")
              }
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{SECTION_LABELS[section]}</span>
                <span className="text-xs font-mono text-brand-700 dark:text-brand-300">{count}</span>
              </span>
              <span className="block text-[10px] text-gray-400 mt-0.5">{SECTION_HINTS[section]}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2 mb-4">
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={redactFinance} onChange={(event) => setRedactFinance(event.target.checked)} />
          إخفاء مبالغ وملاحظات المال
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={includeLocations} onChange={(event) => setIncludeLocations(event.target.checked)} />
          تضمين المواقع الجغرافية للمذكرات
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={includeMediaMetadata}
            onChange={(event) => setIncludeMediaMetadata(event.target.checked)}
          />
          تضمين وصف المرفقات فقط (بدون ملفات)
        </label>
      </div>

      <div className="rounded-xl bg-gray-50 dark:bg-white/5 px-3 py-2.5 mb-3 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
        {disabled
          ? "اختر قسماً واحداً على الأقل."
          : "المعاينة: " + Object.values(payload.counts).reduce((sum, count) => sum + (count ?? 0), 0) + " سجل — "
            + "النسخ يضع نصاً قابلاً للقراءة في الحافظة فقط."}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={copyForAi}
          disabled={disabled}
          className="col-span-2 min-h-[46px] rounded-xl bg-gray-900 text-white flex items-center justify-center gap-2 text-sm font-semibold press disabled:opacity-40 dark:bg-brand-700"
        >
          <Copy size={16} /> نسخ للذكاء الاصطناعي
        </button>
        <button
          type="button"
          onClick={downloadMarkdown}
          disabled={disabled}
          className="min-h-[42px] rounded-xl border border-brand-200 text-brand-700 flex items-center justify-center gap-1.5 text-xs press disabled:opacity-40 dark:border-brand-800 dark:text-brand-300"
        >
          <Download size={14} /> تنزيل Markdown
        </button>
        <button
          type="button"
          onClick={downloadJson}
          disabled={disabled}
          className="min-h-[42px] rounded-xl border border-gray-200 text-gray-600 flex items-center justify-center gap-1.5 text-xs press disabled:opacity-40 dark:border-white/10 dark:text-gray-300"
        >
          <Download size={14} /> تنزيل JSON
        </button>
      </div>
    </Card>
  );
}

