"use client";
import { useEffect, useState } from "react";
import { Download, Share, X, Plus } from "lucide-react";

// Nudge to install مدار as a real app. Hidden once installed (standalone) or
// dismissed. On Android/desktop Chrome it fires the native install prompt; on
// iOS Safari (no prompt API) it shows the Share → «إضافة إلى الشاشة الرئيسية»
// steps.
const DISMISS_KEY = "madar-install-dismissed";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

export function InstallHint() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const ua = window.navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);
    setIsIOS(ios);

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    // iOS never fires beforeinstallprompt → show the manual steps directly.
    if (ios) setShow(true);

    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  if (!show) return null;

  return (
    <div className="relative bg-white dark:bg-[#1c1610] border border-gray-100 dark:border-[#3a2e1e] rounded-2xl p-4 animate-fade-up">
      <button onClick={dismiss} className="absolute top-2.5 left-2.5 text-gray-300 hover:text-gray-500" aria-label="إخفاء">
        <X size={16} />
      </button>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-finance/10 flex items-center justify-center text-finance shrink-0">
          <Download size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-gray-800 dark:text-white">ثبّت مدار كتطبيق</div>
          {isIOS && !deferred ? (
            <p className="text-[12px] text-gray-500 leading-relaxed mt-1">
              اضغط زر المشاركة <Share size={12} className="inline align-middle text-finance" /> في سفاري، ثم اختر
              <span className="font-semibold text-gray-700 dark:text-gray-200"> «إضافة إلى الشاشة الرئيسية» </span>
              <Plus size={12} className="inline align-middle" /> — يفتح كتطبيق حقيقي وأسرع.
            </p>
          ) : (
            <>
              <p className="text-[12px] text-gray-500 leading-relaxed mt-1">
                افتحه كتطبيق حقيقي على جهازك — أسرع، بملء الشاشة، ويعمل بدون اتصال.
              </p>
              <button
                onClick={install}
                className="mt-2 text-xs font-bold bg-finance text-white rounded-xl px-3 py-1.5 press"
              >
                ثبّت الآن
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
