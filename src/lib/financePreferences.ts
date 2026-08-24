export const FINANCE_DISPLAY_IDS = [
  "curve",
  "cycle",
  "budgets",
  "daily",
  "shelf",
  "recurring",
  "installments",
  "assets",
  "reserves",
  "history",
] as const;

export type FinanceDisplayId = (typeof FINANCE_DISPLAY_IDS)[number];
export type FinanceDisplayVisibility = Partial<Record<FinanceDisplayId, boolean>>;

export const FINANCE_DISPLAY_STORAGE_KEY = "madar-finance-display";

export const FINANCE_DISPLAY_LABELS: Record<FinanceDisplayId, { title: string; description: string }> = {
  curve: { title: "منحنى الصرف", description: "مقارنة صرفك الفعلي بخط الميزانية" },
  cycle: { title: "حالة الدورة", description: "المتاح، الصرف، الأيام، والانضباط" },
  budgets: { title: "سقوف الإنفاق", description: "الملخص الدائري وإدارة السقوف معًا" },
  daily: { title: "الميزانية اليومية", description: "البدل اليومي وضبط دورة الراتب" },
  shelf: { title: "الرفّ", description: "المشتريات التي تنتظر قبل اتخاذ القرار" },
  recurring: { title: "المتكررة والقادم", description: "الالتزامات والمصاريف القادمة" },
  installments: { title: "الأقساط", description: "خطط التقسيط ودفعاتها" },
  assets: { title: "الأصول", description: "الأجهزة والمقتنيات واستهلاكها" },
  reserves: { title: "الاحتياطيات", description: "الأوعية والادخار والتعبئة" },
  history: { title: "آخر العمليات", description: "التقويم وسجل المصروفات" },
};

function isFinanceDisplayId(value: string): value is FinanceDisplayId {
  return (FINANCE_DISPLAY_IDS as readonly string[]).includes(value);
}

export function readFinanceDisplayVisibility(): FinanceDisplayVisibility {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(FINANCE_DISPLAY_STORAGE_KEY) || "null") as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") return {};
    return Object.fromEntries(
      Object.entries(raw).filter(([key, value]) => isFinanceDisplayId(key) && typeof value === "boolean")
    ) as FinanceDisplayVisibility;
  } catch {
    return {};
  }
}

export function saveFinanceDisplayVisibility(visibility: FinanceDisplayVisibility): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FINANCE_DISPLAY_STORAGE_KEY, JSON.stringify(visibility));
  } catch {
    // تفضيل جهازي فقط؛ تبقى الجلسة الحالية عاملة حتى إن منع المتصفح التخزين.
  }
}

export function isFinanceDisplayVisible(
  visibility: FinanceDisplayVisibility,
  id: FinanceDisplayId,
): boolean {
  return visibility[id] !== false;
}
