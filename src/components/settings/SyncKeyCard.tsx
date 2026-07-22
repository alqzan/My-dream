"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SYNC_SPACE_STORAGE_KEY } from "@/lib/firebase";
import { showToast } from "@/components/ui/UndoToast";
import { KeyRound, Save, Trash2, Eye, EyeOff, Copy, Dices } from "lucide-react";

// A strong, random sync key: 160 bits (20 bytes) as hex. This is the ONLY thing
// protecting the data (login-free model), so it must not be a human passphrase
// that can be guessed — it's generated from the CSPRNG, not typed.
function generateStrongKey(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// A key is weak if it's short, holds a space (a human phrase), or draws from a
// single character class — all easy to guess/brute-force. We nudge (not block)
// on save so the owner is never locked out of entering their real key.
function isWeakKey(v: string): boolean {
  if (v.length < 16 || /\s/.test(v)) return true;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(v)).length;
  return classes < 2;
}

// The sync space id is no longer baked into the repo (see src/lib/firebase.ts)
// — each device stores its own copy here. Reloading after save/clear is the
// simplest way to make SyncProvider (and everything that reads getSyncSpace())
// pick up the change, since it's only read once per page load.
export function SyncKeyCard() {
  const [saved, setSaved] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [reveal, setReveal] = useState(false);
  const [revealInput, setRevealInput] = useState(false);

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
    // Nudge on a weak key, but let the owner proceed — they may be re-entering
    // an existing key on a second device, which must never be blocked.
    if (
      isWeakKey(value) &&
      !window.confirm(
        "هذا المفتاح قصير أو يسهل تخمينه — من يعرفه يصل إلى بياناتك. الأفضل زر «توليد مفتاح قوي». أتريد استخدام هذا رغم ذلك؟"
      )
    ) {
      return;
    }
    try {
      localStorage.setItem(SYNC_SPACE_STORAGE_KEY, value);
    } catch { /* ignore */ }
    location.reload();
  }

  function generate() {
    setInput(generateStrongKey());
    setRevealInput(true); // show it so the owner can copy it before saving
    showToast("وُلّد مفتاح قوي — انسخه واحفظه، ثم اضغط حفظ", "success");
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
        <div className="relative flex-1 min-w-0">
          <input
            type={revealInput ? "text" : "password"}
            aria-label="مفتاح المزامنة"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="الصق مفتاح المزامنة"
            className="w-full text-sm rounded-xl border border-gray-200 px-3 py-2 pe-9 bg-white font-mono"
          />
          {input && (
            <button
              type="button"
              onClick={() => setRevealInput((v) => !v)}
              aria-label={revealInput ? "إخفاء المفتاح" : "إظهار المفتاح"}
              className="absolute inset-y-0 end-2 flex items-center text-gray-400 press"
            >
              {revealInput ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          )}
        </div>
        <button
          onClick={save}
          disabled={!input.trim()}
          className="flex items-center gap-1.5 text-sm font-medium text-brand-600 bg-brand-50 rounded-xl px-3 press disabled:opacity-50"
        >
          <Save size={15} /> حفظ
        </button>
      </div>
      <button
        onClick={generate}
        className="flex items-center gap-1.5 text-xs font-medium text-brand-600 mt-2 press"
      >
        <Dices size={14} /> توليد مفتاح قوي
      </button>
      {saved && (
        <button onClick={clear} className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 mt-3 press">
          <Trash2 size={13} /> مسح المفتاح
        </button>
      )}
    </Card>
  );
}
