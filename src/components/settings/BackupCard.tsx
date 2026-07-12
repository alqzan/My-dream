"use client";
import { useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { today } from "@/lib/utils";
import { mergeAppData } from "@/lib/sync";
import { DEFAULT_CATEGORIES } from "@/lib/types";
import type { AppData, JournalEntry } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Download, Upload, ShieldCheck, GitMerge, Replace, Loader2 } from "lucide-react";
import { showUndo, showToast } from "@/components/ui/UndoToast";

// Journal media is either a local `data:` URL or (since the move to Cloud
// Storage) an `https://` download URL — the doc keeps only a lightweight
// reference. A backup file is meant to be self-contained peace-of-mind, so
// before export every remote URL is fetched and inlined as base64. Memoized
// by URL since several entries can share the exact same photo/audio.
async function embedIfRemote(url: string | undefined, cache: Map<string, string>): Promise<string | undefined> {
  if (!url || !/^https?:\/\//.test(url)) return url;
  const cached = cache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    cache.set(url, dataUrl);
    return dataUrl;
  } catch {
    return url; // offline/CORS — keep the reference rather than fail the export
  }
}

// Inline every remote photo/voice-note across all entries. Reports progress
// (entries processed so far) so the UI can show something during a large
// export instead of looking frozen.
async function embedAllMedia(
  data: AppData,
  onProgress: (done: number, total: number) => void
): Promise<{ data: AppData; allEmbedded: boolean }> {
  const cache = new Map<string, string>();
  let allEmbedded = true;
  const check = (v: string | undefined) => {
    if (v && /^https?:\/\//.test(v)) allEmbedded = false;
  };
  const total = data.journalEntries.length;
  let done = 0;
  const journalEntries: JournalEntry[] = [];
  for (const e of data.journalEntries) {
    const photos = e.photos ? await Promise.all(e.photos.map((p) => embedIfRemote(p, cache))) : e.photos;
    const photo = await embedIfRemote(e.photo, cache);
    const audios = e.audios ? await Promise.all(e.audios.map((a) => embedIfRemote(a, cache))) : e.audios;
    const audio = await embedIfRemote(e.audio, cache);
    (photos ?? []).forEach(check);
    check(photo);
    (audios ?? []).forEach(check);
    check(audio);
    journalEntries.push({ ...e, photos: photos as string[] | undefined, photo, audios: audios as string[] | undefined, audio });
    done++;
    onProgress(done, total);
  }
  return { data: { ...data, journalEntries }, allEmbedded };
}

// Fill any fields a legacy/partial backup is missing so it's a full AppData —
// mergeAppData walks every collection, and the store tolerates extra fields.
function normalizeBackup(d: Record<string, unknown>): AppData {
  const g = <T,>(k: string, fallback: T): T => (d[k] === undefined ? fallback : (d[k] as T));
  return {
    transactions: g("transactions", []),
    books: g("books", []),
    readingLogs: g("readingLogs", []),
    journalEntries: g("journalEntries", []),
    habits: g("habits", []),
    recurring: g("recurring", []),
    budgets: g("budgets", []),
    categories: g("categories", DEFAULT_CATEGORIES),
    reserves: g("reserves", []),
    prayerLogs: g("prayerLogs", []),
    dailyBudget: g("dailyBudget", null),
    monthlyIncome: g("monthlyIncome", null),
    futureLetters: g("futureLetters", []),
    salaryDay: g("salaryDay", 27),
    lastSalaryConfirm: g("lastSalaryConfirm", null),
    merchantRules: g("merchantRules", {}),
    lastUpdated: g("lastUpdated", new Date().toISOString()),
  };
}

// Manual JSON backup: everything (including photos) leaves as one file,
// and a file can be restored on any device — peace of mind independent of
// the cloud sync.
export function BackupCard() {
  const snapshot = useAppStore((s) => s.snapshot);
  const hydrate = useAppStore((s) => s.hydrate);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  // A validated backup waiting for the user to choose merge vs. replace.
  const [pending, setPending] = useState<AppData | null>(null);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);

  async function exportJson() {
    const raw = snapshot();
    setExporting({ done: 0, total: raw.journalEntries.length });
    const { data, allEmbedded } = await embedAllMedia(raw, (done, total) => setExporting({ done, total }));
    setExporting(null);
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `madar-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (!allEmbedded) {
      showToast("صُدّرت النسخة — بعض الصور بقيت روابط (تعذّر تنزيلها، تحقق من الاتصال)", "warning");
    }
    // تغذية تذكير النسخ الدوري في التوصيات الذكية
    try { localStorage.setItem("madar-last-backup", today()); } catch { /* ignore */ }
  }

  async function importJson(file: File) {
    setError("");
    setPending(null);
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.transactions)) {
        throw new Error("bad shape");
      }
      // Don't apply yet — let the user pick merge vs. replace first.
      setPending(normalizeBackup(parsed));
    } catch {
      setError("الملف غير صالح — تأكد أنه نسخة مدار الاحتياطية");
    }
  }

  function applyRestore(mode: "merge" | "replace") {
    if (!pending) return;
    const before = snapshot();
    hydrate(mode === "merge" ? mergeAppData(before, pending) : pending);
    setPending(null);
    showUndo(mode === "merge" ? "دمجت النسخة الاحتياطية" : "استعدت النسخة الاحتياطية", () => hydrate(before));
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
          disabled={!!exporting}
          className="flex items-center justify-center gap-2 text-sm font-medium text-prayer bg-prayer/10 rounded-xl py-2.5 press disabled:opacity-60"
        >
          {exporting ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              {exporting.total > 0 ? `${exporting.done}/${exporting.total}` : "جارٍ..."}
            </>
          ) : (
            <>
              <Download size={15} /> تصدير
            </>
          )}
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={!!exporting}
          className="flex items-center justify-center gap-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl py-2.5 press disabled:opacity-60"
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

      {pending && (
        <div className="mt-3 rounded-xl bg-gray-50 p-3 animate-fade-up">
          <p className="text-xs text-gray-600 mb-2.5">
            كيف تستعيد النسخة؟ <strong>الدمج</strong> يضيف عناصرها لبياناتك الحالية دون حذف،
            و<strong>الاستبدال</strong> يستبدل كل شيء بها.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => applyRestore("merge")}
              className="flex items-center justify-center gap-2 text-sm font-medium text-prayer bg-prayer/10 rounded-xl py-2.5 press"
            >
              <GitMerge size={15} /> دمج
            </button>
            <button
              onClick={() => applyRestore("replace")}
              className="flex items-center justify-center gap-2 text-sm font-medium text-red-500 bg-red-50 rounded-xl py-2.5 press"
            >
              <Replace size={15} /> استبدال
            </button>
          </div>
          <button
            onClick={() => setPending(null)}
            className="w-full text-[11px] text-gray-400 mt-2 press"
          >
            إلغاء
          </button>
        </div>
      )}
    </Card>
  );
}
