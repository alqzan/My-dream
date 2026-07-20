"use client";
import { useEffect, useState } from "react";
import { hasPin, isUnlocked, verifyPin, markUnlocked, PIN_LENGTH } from "@/lib/lock";
import { BrandMark } from "@/components/layout/BrandMark";
import { Delete, Lock } from "lucide-react";
import { buzz } from "@/lib/utils";

// Gate that hides the whole app behind a PIN screen when a lock is set and this
// session hasn't unlocked yet. Once unlocked, it renders children untouched.
export function PrivacyLock({ children }: { children: React.ReactNode }) {
  // Start locked (synchronously, in the lazy initializer) whenever a PIN exists
  // and this session isn't unlocked — so the very FIRST render is already the
  // lock screen. A useState(false)+useEffect would paint the app's private data
  // for one frame before the lock appeared (a real leak). Safe to read
  // localStorage here because PrivacyLock only ever renders on the client
  // (wrapped in <ClientOnly> in layout.tsx), so there's no SSR/hydration flash.
  const [locked, setLocked] = useState(() => hasPin() && !isUnlocked());
  const [digits, setDigits] = useState("");
  const [error, setError] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (digits.length !== PIN_LENGTH) return;
    let active = true;
    (async () => {
      const ok = await verifyPin(digits);
      if (!active) return;
      if (ok) {
        markUnlocked();
        buzz(15);
        setLocked(false);
      } else {
        setError(true);
        buzz(40);
        setTimeout(() => {
          setDigits("");
          setError(false);
        }, 500);
      }
    })();
    return () => { active = false; };
  }, [digits]);

  if (!locked) return <>{children}</>;

  const press = (n: string) => {
    setDigits((d) => (d.length < PIN_LENGTH ? d + n : d));
    buzz(8);
  };
  const back = () => setDigits((d) => d.slice(0, -1));

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-[#f3ecdd] dark:bg-[#161009] px-8">
      <BrandMark size={44} />
      <div className="mt-4 flex items-center gap-2 text-gray-500">
        <Lock size={15} />
        <p className="text-sm font-medium">أدخل رمز الدخول</p>
      </div>

      {/* نقاط الرمز */}
      <div className={`flex gap-3 mt-7 ${error ? "animate-shake" : ""}`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
              i < digits.length
                ? error
                  ? "bg-red-500 border-red-500"
                  : "bg-brand-500 border-brand-500"
                : "border-gray-300 dark:border-[#5a4a34]"
            }`}
          />
        ))}
      </div>

      {/* لوحة الأرقام */}
      <div className="grid grid-cols-3 gap-4 mt-10 max-w-[15rem] w-full">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
          <button
            key={n}
            onClick={() => press(n)}
            className="h-16 rounded-full bg-white/70 dark:bg-white/5 text-2xl font-bold text-gray-700 press active:bg-brand-100/70"
          >
            {n}
          </button>
        ))}
        <span />
        <button
          onClick={() => press("0")}
          className="h-16 rounded-full bg-white/70 dark:bg-white/5 text-2xl font-bold text-gray-700 press active:bg-brand-100/70"
        >
          0
        </button>
        <button
          onClick={back}
          disabled={!digits.length}
          className="h-16 rounded-full flex items-center justify-center text-gray-500 press disabled:opacity-30"
          aria-label="حذف"
        >
          <Delete size={24} />
        </button>
      </div>

      <button
        onClick={() => setShowHelp((v) => !v)}
        className="text-[12px] text-gray-500 hover:text-gray-700 mt-8 press underline underline-offset-4"
      >
        نسيت الرمز؟
      </button>
      {showHelp && (
        <p className="text-[11px] text-gray-400 mt-3 text-center leading-relaxed max-w-xs animate-fade-up">
          لا تقلق — القفل يخفي الشاشة فقط ولا يشفّر بياناتك، فلا شيء يضيع.
          امسح بيانات الموقع من إعدادات المتصفح ثم افتح مدار وأعد إدخال مفتاح
          المزامنة، فترجع كل بياناتك من السحابة كما هي. (أو استعِد من نسختك الاحتياطية.)
        </p>
      )}
    </div>
  );
}
