"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { parseDayOneJson } from "@/lib/dayOneParser";
import { Upload, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ImportStats {
  files: number;
  added: number;
  duplicates: number;
  skippedEmpty: number;
}

export function DayOneImport({ onClose }: { onClose: () => void }) {
  const { importDayOneEntries } = useAppStore();
  const [status, setStatus] = useState<"idle" | "working" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(files: File[]) {
    const jsonFiles = files.filter((f) => f.name.endsWith(".json") || f.type === "application/json");
    if (!jsonFiles.length) {
      setStatus("error");
      setMessage("اختر ملف JSON (تصدير Day One).");
      return;
    }
    setStatus("working");
    const total: ImportStats = { files: 0, added: 0, duplicates: 0, skippedEmpty: 0 };
    try {
      for (const file of jsonFiles) {
        const text = await file.text();
        const result = parseDayOneJson(text);
        const added = importDayOneEntries(result.entries);
        total.files++;
        total.added += added;
        total.duplicates += result.entries.length - added;
        total.skippedEmpty += result.skippedEmpty;
      }
      setStats(total);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "خطأ في قراءة الملف");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles([...e.dataTransfer.files]);
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-500 bg-blue-50 rounded-xl p-3 leading-relaxed">
        <strong className="text-blue-700">كيفية التصدير من Day One:</strong>
        <br />
        افتح Day One ← File ← Export ← JSON ← فك ضغط الملف وارفع JSON هنا.
        <br />
        <span className="text-xs opacity-80">
          نستخرج العنوان والوقت تلقائياً، وننظف النص، ولا نكرر المذكرات المستوردة سابقاً — ارفع أكثر من ملف دفعة واحدة إن أردت.
        </span>
      </div>

      {status === "idle" && (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`block border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
            dragging ? "border-journal bg-journal/5" : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <Upload size={28} className="mx-auto text-gray-400 mb-3" />
          <p className="text-sm font-medium text-gray-700">اسحب ملفات JSON هنا</p>
          <p className="text-xs text-gray-400 mt-1">أو اضغط للاختيار — يمكن اختيار عدة ملفات</p>
          <input
            type="file"
            accept=".json,application/json"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) handleFiles([...e.target.files]); }}
          />
        </label>
      )}

      {status === "working" && (
        <div className="flex items-center justify-center gap-3 py-8 text-gray-500">
          <Loader2 size={20} className="animate-spin" />
          <p className="text-sm">جارٍ الاستيراد والتنظيف...</p>
        </div>
      )}

      {status === "success" && stats && (
        <div className="bg-green-50 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle size={20} />
            <p className="text-sm font-bold">تم استيراد {stats.added} مذكرة بنجاح ✨</p>
          </div>
          <div className="text-xs text-green-700/80 space-y-0.5 pr-7">
            {stats.files > 1 && <p>• من {stats.files} ملفات</p>}
            {stats.duplicates > 0 && <p>• تخطينا {stats.duplicates} مذكرة مستوردة سابقاً (بلا تكرار)</p>}
            {stats.skippedEmpty > 0 && <p>• تجاهلنا {stats.skippedEmpty} مدخلة فارغة (صور/وسائط فقط)</p>}
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-3 bg-red-50 text-red-700 rounded-xl p-4">
          <AlertCircle size={20} />
          <p className="text-sm">{message}</p>
        </div>
      )}

      <div className="flex gap-2">
        {(status === "success" || status === "error") && (
          <Button variant="secondary" onClick={() => { setStatus("idle"); setStats(null); }} className="flex-1">
            استيراد مرة أخرى
          </Button>
        )}
        <Button
          variant={status === "success" ? "primary" : "secondary"}
          onClick={onClose}
          className="flex-1"
        >
          {status === "success" ? "تم ✓" : "إغلاق"}
        </Button>
      </div>
    </div>
  );
}
