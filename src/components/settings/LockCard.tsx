"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { hasPin, setPin, clearPin, PIN_LENGTH } from "@/lib/lock";
import { Lock, ShieldCheck, Trash2 } from "lucide-react";
import { showToast } from "@/components/ui/UndoToast";

type Step = "idle" | "enter" | "confirm";

// Settings card to turn the device PIN lock on/off. On enable, the PIN is
// entered twice to confirm; on disable it's removed outright (you're already
// past the lock to reach here).
export function LockCard() {
  const [enabled, setEnabled] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [first, setFirst] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setEnabled(hasPin());
  }, []);

  function onlyDigits(s: string) {
    return s.replace(/\D/g, "").slice(0, PIN_LENGTH);
  }

  async function next() {
    setError("");
    if (value.length !== PIN_LENGTH) {
      setError(`الرمز ${PIN_LENGTH} أرقام`);
      return;
    }
    if (step === "enter") {
      setFirst(value);
      setValue("");
      setStep("confirm");
      return;
    }
    // confirm
    if (value !== first) {
      setError("الرمزان غير متطابقين");
      setValue("");
      setFirst("");
      setStep("enter");
      return;
    }
    await setPin(value);
    setEnabled(true);
    setStep("idle");
    setFirst("");
    setValue("");
    showToast("فُعّل قفل الرمز 🔒", "success");
  }

  function disable() {
    clearPin();
    setEnabled(false);
    setStep("idle");
    setFirst("");
    setValue("");
    showToast("أُلغي قفل الرمز");
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Lock size={16} className="text-brand-600" />
        <span className="text-sm font-semibold text-gray-700">قفل الخصوصية</span>
      </div>

      {step === "idle" ? (
        <>
          <p className="text-xs text-gray-400 leading-relaxed mb-2">
            {enabled
              ? "التطبيق مقفل برمز يُطلب عند كل فتح. الرمز على جهازك فقط ولا يُزامَن."
              : `اقفل مذكراتك وبياناتك برمز من ${PIN_LENGTH} أرقام يُطلب عند فتح التطبيق.`}
          </p>
          <p className="text-[11px] text-gray-400/90 bg-gray-50 rounded-lg px-2.5 py-2 leading-relaxed mb-3">
            🛡️ القفل يخفي الشاشة فقط ولا يشفّر بياناتك — فحتى لو نسيت الرمز لا تضيع
            بياناتك: تعود من المزامنة السحابية أو من نسختك الاحتياطية.
          </p>
          {enabled ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-finance">
                <ShieldCheck size={14} /> القفل مفعّل
              </span>
              <button
                onClick={disable}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 mr-auto press"
              >
                <Trash2 size={13} /> إلغاء القفل
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setStep("enter"); setValue(""); setFirst(""); }}
              className="text-sm font-medium text-brand-600 bg-brand-50 rounded-xl px-4 py-2 press"
            >
              تفعيل القفل
            </button>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <label className="block text-xs font-medium text-gray-500">
            {step === "enter" ? "أدخل رمزاً جديداً" : "أعد إدخال الرمز للتأكيد"}
          </label>
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(onlyDigits(e.target.value))}
            onKeyDown={(e) => { if (e.key === "Enter") next(); }}
            placeholder={"•".repeat(PIN_LENGTH)}
            className="w-full text-center tracking-[0.6em] text-lg font-bold border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          {error && <p className="text-[11px] text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={next}
              disabled={value.length !== PIN_LENGTH}
              className="flex-1 text-sm font-medium text-white bg-brand-600 rounded-xl py-2 press disabled:opacity-40"
            >
              {step === "enter" ? "التالي" : "تأكيد"}
            </button>
            <button
              onClick={() => { setStep("idle"); setValue(""); setFirst(""); setError(""); }}
              className="text-sm text-gray-400 px-3 press"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
