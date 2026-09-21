"use client";

import { Card } from "@/components/ui/Card";
import { useAppStore } from "@/lib/store";
import { Gift } from "lucide-react";

/** Cashback is opt-in because it creates a separate non-bank asset. */
export function CashbackSettingsCard() {
  const enabled = useAppStore((state) => state.cashbackEnabled ?? false);
  const envelopeId = useAppStore((state) => state.cashbackEnvelopeId);
  const reserves = useAppStore((state) => state.reserves);
  const setSettings = useAppStore((state) => state.setCashbackSettings);

  return (
    <Card>
      <div className="flex items-start gap-2">
        <Gift size={16} className="text-finance mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0 space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setSettings(event.target.checked, envelopeId)}
            />
            احتسب الاسترداد النقدي كرصيد مستقل
          </label>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            عند التفعيل يُودَع كل مصدر مرة واحدة في مظروف تختاره، ولا يُعامل كأنه نقد متاح في الحساب.
          </p>
          <select
            value={envelopeId ?? ""}
            onChange={(event) => setSettings(enabled, event.target.value || undefined)}
            disabled={!enabled}
            aria-label="مظروف الاسترداد النقدي"
            className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs disabled:opacity-50"
          >
            <option value="">اختر مظروفاً</option>
            {reserves.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
          </select>
        </div>
      </div>
    </Card>
  );
}
