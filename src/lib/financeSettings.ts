import type { FinanceSettingsProfile } from "./types";

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))]
    : [];
}

function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "string" && item.trim().length > 0).map(([key, item]) => [key.trim(), (item as string).trim()]));
}

/** Validate and normalize an explicitly imported local owner profile. */
export function parseFinanceSettingsProfile(value: unknown): FinanceSettingsProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ملف إعدادات الحسابات غير صالح");
  const raw = value as Record<string, unknown>;
  if (raw.format !== "madar-bank-settings" || raw.version !== 1) throw new Error("إصدار ملف إعدادات الحسابات غير مدعوم");
  const pattern = raw.salaryPattern && typeof raw.salaryPattern === "object" && !Array.isArray(raw.salaryPattern)
    ? raw.salaryPattern as Record<string, unknown>
    : undefined;
  const day = typeof pattern?.day === "number" && Number.isInteger(pattern.day) && pattern.day >= 1 && pattern.day <= 31
    ? pattern.day
    : undefined;
  const amounts = Array.isArray(pattern?.amounts)
    ? pattern.amounts.filter((item): item is number => typeof item === "number" && Number.isFinite(item) && item > 0)
    : undefined;
  return {
    format: "madar-bank-settings",
    version: 1,
    ownerAccounts: strings(raw.ownerAccounts),
    ownerWallets: strings(raw.ownerWallets),
    ownerAliases: strings(raw.ownerAliases),
    salaryPayers: strings(raw.salaryPayers),
    payerAliases: stringMap(raw.payerAliases),
    ...(pattern ? {
      salaryPattern: {
        ...(typeof pattern.accountId === "string" && pattern.accountId.trim() ? { accountId: pattern.accountId.trim() } : {}),
        ...(typeof pattern.payer === "string" && pattern.payer.trim() ? { payer: pattern.payer.trim() } : {}),
        ...(day !== undefined ? { day } : {}),
        ...(amounts?.length ? { amounts } : {}),
      },
    } : {}),
    merchantRules: stringMap(raw.merchantRules),
    cashbackEnabled: raw.cashbackEnabled === true,
    ...(typeof raw.cashbackEnvelopeId === "string" && raw.cashbackEnvelopeId.trim() ? { cashbackEnvelopeId: raw.cashbackEnvelopeId.trim() } : {}),
  };
}
