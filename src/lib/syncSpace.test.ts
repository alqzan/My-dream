import { describe, it, expect } from "vitest";
import {
  syncSpaceProblem,
  isValidSyncSpace,
  describeSyncSpaceProblem,
  MAX_SYNC_SPACE_BYTES,
} from "./syncSpace";

// العطل الذي أنشأ هذا الملف: رابطٌ (`https://alqzan.github.io/My-dream/`) حُفظ
// في خانة «مفتاح المزامنة»، فصار مقطعَ مسارٍ في `doc(db, "userData", key)`.
// Firestore ترمي تزامنياً — `Invalid segment (…). Paths must not contain // in
// them.` — ومنادو الدالة داخل useEffect، فتسلّق الرمي إلى حدّ الخطأ وأسقط
// التطبيق كاملاً على **كل** إقلاع، بلا طريقٍ للوصول إلى الإعدادات لتصحيحه.
describe("syncSpaceProblem — صلاحية المفتاح كمقطع مسار Firestore", () => {
  it("يرفض الرابط الذي أقفل التطبيق (العطل الأصلي بنصّه)", () => {
    expect(syncSpaceProblem("https://alqzan.github.io/My-dream/")).toBe("slash");
    expect(isValidSyncSpace("https://alqzan.github.io/My-dream/")).toBe(false);
  });

  it("يرفض أيّ «/» مهما قلّ — لا `//` وحدها", () => {
    // شرط Firestore على معرّف المستند أوسع من رسالة خطئها: مقطعٌ واحد بلا
    // فواصل. `a/b` لا يرمي بل يصير مسارين — أخطر: يكتب في مساحةٍ أخرى صامتاً.
    expect(syncSpaceProblem("a/b")).toBe("slash");
    expect(syncSpaceProblem("/leading")).toBe("slash");
    expect(syncSpaceProblem("trailing/")).toBe("slash");
  });

  it("يرفض عنوان الـWorker أيضاً (اللبس الآخر في إعداد مستورد الذكريات)", () => {
    expect(syncSpaceProblem("https://madar-r2-gateway.example.workers.dev")).toBe("slash");
  });

  it("يرفض الفارغ والمسافات وحدها", () => {
    expect(syncSpaceProblem("")).toBe("empty");
    expect(syncSpaceProblem(null)).toBe("empty");
    expect(syncSpaceProblem(undefined)).toBe("empty");
    expect(syncSpaceProblem("   ")).toBe("empty");
  });

  it("يرفض `.` و`..` والصيغة المحجوزة `__…__`", () => {
    expect(syncSpaceProblem(".")).toBe("dots");
    expect(syncSpaceProblem("..")).toBe("dots");
    expect(syncSpaceProblem("__id__")).toBe("reserved");
  });

  it("يرفض محارف التحكّم غير المرئية", () => {
    expect(syncSpaceProblem("abc\u0000def")).toBe("control");
    expect(syncSpaceProblem("abc\ndef")).toBe("control");
    // المسافة العادية ليست محرف تحكّم — عليها تنبيه `isWeakKey` في
    // SyncKeyCard، ولا تمنعها هذه (Firestore تقبلها مقطعاً صالحاً).
    expect(syncSpaceProblem("key with spaces and length")).toBeNull();
  });

  it("يرفض ما تجاوز 1500 بايت، ويقبل ما دونها بالبايت لا بالحرف", () => {
    expect(syncSpaceProblem("a".repeat(MAX_SYNC_SPACE_BYTES))).toBeNull();
    expect(syncSpaceProblem("a".repeat(MAX_SYNC_SPACE_BYTES + 1))).toBe("tooLong");
    // العربية بايتان لكل حرف في UTF-8 — الحدّ بالبايت لا بالطول.
    expect(syncSpaceProblem("م".repeat(MAX_SYNC_SPACE_BYTES / 2 + 1))).toBe("tooLong");
  });

  it("يقبل المفتاح الذي يولّده التطبيق فعلاً (40 خانة hex)", () => {
    const generated = "a3f9c1e40b7d2856fa10cc93be5147d0e6a2b8f4";
    expect(syncSpaceProblem(generated)).toBeNull();
    expect(isValidSyncSpace(generated)).toBe(true);
  });

  it("رسالةٌ عربية لكل حالة، ولا تُسرّب القيمة نفسها أبداً", () => {
    const secret = "https://alqzan.github.io/My-dream/";
    for (const p of ["empty", "slash", "dots", "reserved", "control", "tooLong"] as const) {
      const msg = describeSyncSpaceProblem(p);
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).not.toContain(secret);
    }
  });
});
