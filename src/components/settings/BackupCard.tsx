"use client";
import { useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { today } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Download, Upload, ShieldCheck } from "lucide-react";
import { showUndo } from "@/components/ui/UndoToast";

// Manual JSON backup: everything (including photos) leaves as one file,
// and a file can be restored on any device — peace of mind independent of
// the cloud sync.
export function BackupCard() {
  const snapshot = useAppStore((s) => s.snapshot);
  const hydrate = useAppStore((s) => s.hydrate);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  function exportJson() {
    const data = snapshot();
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `madar-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File) {
    setError("");
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.transactions)) {
        throw new Error("bad shape");
      }
      const before = snapshot();
      hydrate(parsed);
      showUndo("استعدت النسخة الاحتياطية", () => hydrate(before));
    } catch {
      setError("الملف غير صالح — تأكد أنه نسخة مدار الاحتياطية");
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={16} className="text-prayer" />
        <span className="text-sm font-semibold text-gray-700">النسخ الاحتياطي</span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed mb-3">
        صدّر كل بياناتك (بما فيها صور المذكرات) كملف واحد تحفظه وين تبي، وتستعيده على أي جهاز.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={exportJson}
          className="flex items-center justify-center gap-2 text-sm font-medium text-prayer bg-prayer/10 rounded-xl py-2.5 press"
        >
          <Download size={15} /> تصدير
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center justify-center gap-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl py-2.5 press"
        >
          <Upload size={15} /> استعادة
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importJson(f);
          e.target.value = "";
        }}
      />
      {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}
    </Card>
  );
}
