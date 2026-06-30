"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { parseDayOneJson } from "@/lib/dayOneParser";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function DayOneImport({ onClose }: { onClose: () => void }) {
  const { importDayOneEntries } = useAppStore();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const entries = parseDayOneJson(text);
        importDayOneEntries(entries);
        setStatus("success");
        setMessage(`تم استيراد ${entries.length} مذكرة بنجاح`);
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "خطأ في قراءة الملف");
      }
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-500 bg-blue-50 rounded-xl p-3 leading-relaxed">
        <strong className="text-blue-700">كيفية التصدير من Day One:</strong>
        <br />
        افتح Day One ← File ← Export ← JSON ← احفظ الملف وارفعه هنا
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
          <p className="text-sm font-medium text-gray-700">اسحب ملف JSON هنا</p>
          <p className="text-xs text-gray-400 mt-1">أو اضغط للاختيار</p>
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </label>
      )}

      {status === "success" && (
        <div className="flex items-center gap-3 bg-green-50 text-green-700 rounded-xl p-4">
          <CheckCircle size={20} />
          <p className="text-sm font-medium">{message}</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-3 bg-red-50 text-red-700 rounded-xl p-4">
          <AlertCircle size={20} />
          <p className="text-sm">{message}</p>
        </div>
      )}

      <div className="flex gap-2">
        {status !== "idle" && (
          <Button variant="secondary" onClick={() => setStatus("idle")} className="flex-1">
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
