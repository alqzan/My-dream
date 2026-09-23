"use client";
import { useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/components/ui/UndoToast";
import { useAppStore } from "@/lib/store";
import { toIndicDigits } from "@/lib/utils";
import { parseFinanceSettingsProfile } from "@/lib/financeSettings";
import type { FinanceSettingsProfile } from "@/lib/types";
import { Landmark, Upload, Check } from "lucide-react";

/** Optional, explicit import for a user's private ownership profile. Generic
 * installs remain empty until the owner chooses a profile file. */
export function FinanceOwnershipCard() {
  const applyProfile = useAppStore((state) => state.applyFinanceSettingsProfile);
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<FinanceSettingsProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function readProfile(file: File) {
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setProfile(null);
      setError("الملف ليس JSON صالحاً");
      return;
    }
    try {
      const parsed = parseFinanceSettingsProfile(raw);
      setProfile(parsed);
      setError(null);
    } catch (cause) {
      setProfile(null);
      setError(cause instanceof Error ? cause.message : "ملف إعدادات الحسابات غير صالح");
    }
  }

  function apply() {
    if (!profile) return;
    applyProfile(profile);
    showToast("تم تطبيق إعدادات ملكية الحسابات — تُحفظ في بياناتك وتُزامَن مع أجهزتك", "success");
    setProfile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Landmark size={16} className="text-finance" />
          <span className="text-sm font-semibold text-gray-700">ملكية الحسابات البنكية</span>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          الإعدادات العامة تبدأ بلا أسماء أو أرقام. استورد ملفك الخاص صراحةً لتحديد حساباتك ومحافظك وجهات الراتب وقواعد التجار.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readProfile(file);
          }}
        />
        <Button variant="secondary" onClick={() => fileRef.current?.click()} className="w-full flex items-center justify-center gap-2">
          <Upload size={15} /> استيراد ملف إعدادات خاص
        </Button>
        {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        {profile && (
          <div className="space-y-2 bg-finance/5 rounded-xl px-3 py-2 text-xs text-gray-600">
            <p>تم التحقق: {toIndicDigits(String(profile.ownerAccounts.length))} حساب، {toIndicDigits(String(profile.ownerWallets.length))} محفظة، {toIndicDigits(String(profile.salaryPayers.length))} جهة راتب.</p>
            <Button onClick={apply} className="w-full flex items-center justify-center gap-2 bg-finance hover:bg-finance/90">
              <Check size={15} /> تطبيق الإعدادات على هذا الجهاز
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
