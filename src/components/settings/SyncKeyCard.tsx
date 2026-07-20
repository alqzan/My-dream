"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SYNC_SPACE_STORAGE_KEY } from "@/lib/firebase";
import { showToast } from "@/components/ui/UndoToast";
import { KeyRound, Save, Trash2, Eye, EyeOff, Copy } from "lucide-react";

// The sync space id is no longer baked into the repo (see src/lib/firebase.ts)
// — each device stores its own copy here. Reloading after save/clear is the
// simplest way to make SyncProvider (and everything that reads getSyncSpace())
// pick up the change, since it's only read once per page load.
export function SyncKeyCard() {
  const [saved, setSaved] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    try {
      setSaved(localStorage.getItem(SYNC_SPACE_STORAGE_KEY));
    } catch { /* ignore */ }
  }, []);

  async function copyKey() {
    if (!saved) return;
    try {
      await navigator.clipboard.writeText(saved);
      showToast("نُسخ المفتاح — احفظه في مكان آمن", "success");
    } catch {
      showToast("تعذّر النسخ — اضغط مطوّلاً على المفتاح لتحديده ونسخه", "warning");
    }
  }

  function save() {
    const value = input.trim();
    if (!value) return;
    try {
      localStorage.setItem(SYNC_SPACE_STORAGE_KEY, value);
    } catch { /* ignore */ }
    location.reload();
  }

  function clear() {
    try {
      localStorage.removeItem(SYNC_SPACE_STORAGE_KEY);
    } catch { /* ignore */ }
    location.reload();
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <KeyRound size={16} className="text-brand-600" />
        <span className="text-sm font-semibold text-gray-700">مفتاح المزامنة</span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed mb-3">
        المزامنة السحابية بين أجهزتك تحتاج مفتاحاً سرياً واحداً تحفظه على كل جهاز — لم يعد جزءاً من الكود.
      </p>
      {saved && (
        <div className="mb-3">
          {reveal ? (
            <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-2.5">
              <p className="font-mono text-xs text-gray-700 dark:text-gray-200 break-all select-all leading-relaxed">
                {saved}
              </p>
              <div className="flex items-center gap-3 mt-2">
                <button onClick={copyKey} className="flex items-center gap-1.5 text-xs font-medium text-brand-600 press">
                  <Copy size={13} /> نسخ
                </button>
                <button onClick={() => setReveal(false)} className="flex items-center gap-1.5 text-xs text-gray-400 press">
                  <EyeOff size={13} /> إخفاء
                </button>
              </div>
              <p className="text-[11px] text-amber-600 mt-2 leading-relaxed">
                🔑 هذا مفتاحك السري — احفظه في ملاحظاتك أو مدير كلمات السر. من يعرفه يصل لبياناتك.
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                المفتاح المحفوظ ينتهي بـ <span className="font-mono font-semibold">{saved.slice(-4)}</span>
              </p>
              <button onClick={() => setReveal(true)} className="flex items-center gap-1.5 text-xs font-medium text-brand-600 press">
                <Eye size={13} /> إظهار المفتاح الكامل
              </button>
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="الصق مفتاح المزامنة"
          className="flex-1 min-w-0 text-sm rounded-xl border border-gray-200 px-3 py-2 bg-white"
        />
        <button
          onClick={save}
          disabled={!input.trim()}
          className="flex items-center gap-1.5 text-sm font-medium text-brand-600 bg-brand-50 rounded-xl px-3 press disabled:opacity-50"
        >
          <Save size={15} /> حفظ
        </button>
      </div>
      {saved && (
        <button onClick={clear} className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 mt-3 press">
          <Trash2 size={13} /> مسح المفتاح
        </button>
      )}
    </Card>
  );
}
