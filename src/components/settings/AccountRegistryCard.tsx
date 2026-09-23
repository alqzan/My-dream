"use client";

import { useState } from "react";
import { ChevronDown, Landmark, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useAppStore } from "@/lib/store";
import { toIndicDigits } from "@/lib/utils";
import type { Account } from "@/lib/types";

/**
 * The parser may discover an instrument, but discovery is not ownership.
 * This deliberately starts collapsed and makes the owner confirm both
 * ownership and funding kind before a card participates in cash matching.
 */
export function AccountRegistryCard() {
  const accounts = useAppStore((state) => state.accounts ?? []);
  const upsertAccount = useAppStore((state) => state.upsertAccount);
  const [open, setOpen] = useState(false);

  function update(account: Account, patch: Partial<Account>) {
    upsertAccount({ ...account, ...patch });
  }

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-start min-h-[44px]"
      >
        <Landmark size={16} className="text-finance shrink-0" aria-hidden />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-gray-700">سجل ملكية الحسابات</span>
          <span className="block text-[11px] text-gray-400 mt-0.5">
            {accounts.length ? `${toIndicDigits(String(accounts.length))} حساب/بطاقة مكتشفة` : "لم تُكتشف حسابات بعد"}
          </span>
        </span>
        <ChevronDown size={17} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <div className="mt-3 space-y-2 border-t border-[var(--border-subtle)] pt-3">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            عيّن ملكيتك وطبيعة التمويل لكل بطاقة. الحساب المجهول أو غير المملوك يبقى خارج مطابقة النقد حتى تؤكده.
          </p>
          {accounts.length === 0 ? (
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-400">ستظهر الحسابات بعد مراجعة رسالة مالية موثوقة.</p>
          ) : accounts.map((account) => (
            <div key={account.id} className="rounded-xl bg-gray-50 dark:bg-white/5 px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={15} className={account.isOwn ? "text-emerald-600" : "text-gray-300"} aria-hidden />
                <span className="flex-1 min-w-0 text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">
                  {account.label || account.bank} ···{account.last4}
                </span>
                <label className="flex items-center gap-1 text-[10px] text-gray-500 shrink-0">
                  <input
                    type="checkbox"
                    checked={account.isOwn}
                    onChange={(event) => update(account, { isOwn: event.target.checked })}
                  />
                  ملكي
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={account.label ?? ""}
                  onChange={(event) => update(account, { label: event.target.value || undefined })}
                  placeholder="اسم اختياري"
                  aria-label="اسم الحساب"
                  className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px]"
                />
                <select
                  value={account.fundingKind}
                  onChange={(event) => update(account, { fundingKind: event.target.value as Account["fundingKind"] })}
                  aria-label="نوع التمويل"
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px]"
                >
                  <option value="unknown">غير محدد</option>
                  <option value="debit">نقدي/مدين</option>
                  <option value="credit">ائتماني</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
