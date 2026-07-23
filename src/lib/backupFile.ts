// تصدير نسخةٍ احتياطية سريعة (غير مشفّرة) كملف JSON — شبكة أمانٍ قبل إجراءٍ
// مُتلِف كمسح خطة الحفظ. الصيغة متوافقة مع مستورد النسخ في BackupCard: كتلة
// `__meta` بجانب حقول AppData المسطّحة، وchecksum يُحسب على البيانات نفسها
// بترتيب مفاتيحها — فيتحقّق منها الاستيراد كـ«سليمة». لا يضمّن الوسائط البعيدة
// (كافٍ للحفظ الذي لا وسائط له؛ للنسخة الكاملة استعمل بطاقة الإعدادات).
import type { AppData } from "./types";
import { today } from "./utils";

// FNV-1a — نفس خوارزمية checksum في BackupCard حتى يتطابق التحقّق عند الاستيراد.
export function hashBackup(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function downloadPlainBackup(data: AppData, tag = ""): void {
  if (typeof window === "undefined") return;
  const meta = {
    app: "madar",
    createdAt: new Date().toISOString(),
    checksum: hashBackup(JSON.stringify(data)),
  };
  const withMeta = { __meta: meta, ...data };
  const blob = new Blob([JSON.stringify(withMeta)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `madar-backup-${today()}${tag ? `-${tag}` : ""}.json`;
  a.click();
  URL.revokeObjectURL(url);
  try { window.localStorage.setItem("madar-last-backup", today()); } catch { /* غير حرج */ }
}
