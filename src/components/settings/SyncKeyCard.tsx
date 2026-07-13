"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SYNC_SPACE_STORAGE_KEY } from "@/lib/firebase";
import { KeyRound, Save, Trash2 } from "lucide-react";

// The sync space id is no longer baked into the repo (see src/lib/firebase.ts)
// — each device stores its own copy here. Reloading after save/clear is the
// simplest way to make SyncProvider (and everything that reads getSyncSpace())
// pick up the change, since it's only read once per page load.
export function SyncKeyCard() {
  const [saved, setSaved] = useState<string | null>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    try {
      setSaved(localStorage.getItem(SYNC_SPACE_STORAGE_KEY));
    } catch { /* ignore */ }
  }, []);

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
        <p className="text-xs text-gray-500 mb-3">
          المفتاح المحفوظ ينتهي بـ <span className="font-mono font-semibold">{saved.slice(-4)}</span>
        </p>
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
