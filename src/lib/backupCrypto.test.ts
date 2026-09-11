import { describe, it, expect } from "vitest";
import { encryptJson, decryptJson, isEncryptedBackup, type EncryptedBackup } from "./backupCrypto";

// ===================== لماذا يُختبر هذا الملفّ =====================
// هذا هو المسارُ الوحيد الذي يستطيع أن **يُتلف** بيانات المالك بلا إنذار:
// انحدارٌ فيه لا يُسقط التطبيق ولا يُظهر خطأً — يُخرج ملفَّ نسخةٍ احتياطية
// يبدو سليماً ولا يُفتح إلّا يومَ الحاجة إليه. فكلُّ اختبارٍ هنا ذهابٌ وعودة
// حقيقيّان عبر `crypto.subtle` (بلا محاكاة)، لا فحصُ شكل.

// الدورات ٦٠٠ ألفاً، فكلُّ عمليةِ اشتقاقٍ محسوسة — مهلةٌ سخيّة لبيئة CI.
const SLOW = 30_000;

const sample = {
  transactions: [{ id: "t1", date: "2026-09-11", amount: 12.5, category: "c", note: "قهوة" }],
  journalEntries: [{ id: "j1", date: "2026-09-11", content: "نصٌّ عربيٌّ فيه ﷽ ورموز 🌙" }],
  nested: { deep: { list: [1, 2, 3], nil: null, yes: true } },
  lastUpdated: "2026-09-11T00:00:00.000Z",
};

describe("backupCrypto — ذهابٌ وعودة", () => {
  it("يعيد الكائن كما هو بالضبط", async () => {
    const blob = await encryptJson(sample, "كلمة سرّ قوية 123");
    expect(await decryptJson(JSON.parse(blob) as EncryptedBackup, "كلمة سرّ قوية 123")).toEqual(sample);
  }, SLOW);

  it("الناتجُ غلافُ JSON صالح، ولا يسرّب النصَّ الصريح", async () => {
    const blob = await encryptJson(sample, "س");
    const w = JSON.parse(blob) as EncryptedBackup;
    expect(isEncryptedBackup(w)).toBe(true);
    expect(w.salt).toBeTruthy();
    expect(w.iv).toBeTruthy();
    expect(blob).not.toContain("قهوة");
    expect(blob).not.toContain("transactions");
  }, SLOW);

  it("كلمةُ مرورٍ خاطئة تفشل ولا تُرجع قمامة", async () => {
    const w = JSON.parse(await encryptJson(sample, "الصحيحة")) as EncryptedBackup;
    await expect(decryptJson(w, "الخاطئة")).rejects.toThrow();
  }, SLOW);

  it("ملحٌ جديدٌ ومتّجهٌ جديد لكلّ تصدير (لا نصَّ مشفَّرٌ متكرّر)", async () => {
    const [a, b] = await Promise.all([encryptJson(sample, "س"), encryptJson(sample, "س")]);
    const wa = JSON.parse(a) as EncryptedBackup;
    const wb = JSON.parse(b) as EncryptedBackup;
    expect(wa.salt).not.toBe(wb.salt);
    expect(wa.iv).not.toBe(wb.iv);
    expect(wa.data).not.toBe(wb.data);
  }, SLOW);

  it("العبثُ بالنصّ المشفَّر يُكتشَف (AES-GCM موثَّق)", async () => {
    const w = JSON.parse(await encryptJson(sample, "س")) as EncryptedBackup;
    const bytes = atob(w.data).split("");
    bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 0xff);
    await expect(decryptJson({ ...w, data: btoa(bytes.join("")) }, "س")).rejects.toThrow();
  }, SLOW);

  it("حمولةٌ كبيرة (شبيهةُ نسخةٍ فيها صور) تعبر بلا انهيار مكدّس", async () => {
    // `bufToBase64` تقطّع بـ0x8000؛ النشرُ بلا تقطيعٍ كان ينهار هنا.
    const big = { photos: Array.from({ length: 40 }, (_, i) => `data:image/png;base64,${"A".repeat(20_000)}#${i}`) };
    const w = JSON.parse(await encryptJson(big, "س")) as EncryptedBackup;
    expect(await decryptJson(w, "س")).toEqual(big);
  }, SLOW);
});

describe("isEncryptedBackup — تمييزُ الغلاف", () => {
  it("ترفض ما ليس غلافاً", () => {
    for (const bad of [null, undefined, 0, "", "nope", {}, { __madar_enc: "madar-enc-v1" }, [],
      { __madar_enc: "madar-enc-v9", salt: "a", iv: "b", data: "c" }]) {
      expect(isEncryptedBackup(bad)).toBe(false);
    }
  });

  it("تقبل النسختين المعروفتين", () => {
    const shell = { salt: "a", iv: "b", data: "c" };
    expect(isEncryptedBackup({ ...shell, __madar_enc: "madar-enc-v1" })).toBe(true);
    expect(isEncryptedBackup({ ...shell, __madar_enc: "madar-enc-v2" })).toBe(true);
  });
});

describe("نسخةُ الغلاف — رفعُ الدورات لا يُتلف ملفّاً قديماً", () => {
  it("التصديرُ اليوم يكتب v2", async () => {
    const w = JSON.parse(await encryptJson({ a: 1 }, "س")) as EncryptedBackup;
    expect(w.__madar_enc).toBe("madar-enc-v2");
  }, SLOW);

  // ملفُّ v1 حقيقيّ: مبنيٌّ هنا بـ١٥٠ ألف دورة (ما كان يكتبه التطبيق قبل
  // الرفع)، ثمّ يُفتح بالمسار العامّ. لو قرأ فكُّ التشفير عددَ الدورات من
  // الثابت الحاليّ بدل الغلاف، لسقط هذا الاختبار — وهو بالضبط ما يحرسه.
  it("وملفُّ v1 القديم يُفتح كما هو", async () => {
    const password = "كلمة قديمة";
    const payload = { note: "نسخةٌ من العام الماضي", n: 7 };
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const baseKey = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
    );
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 150_000, hash: "SHA-256" },
      baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(payload))
    );
    const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
    const legacy: EncryptedBackup = {
      __madar_enc: "madar-enc-v1",
      salt: b64(salt.buffer as ArrayBuffer),
      iv: b64(iv.buffer as ArrayBuffer),
      data: b64(cipher),
    };

    expect(isEncryptedBackup(legacy)).toBe(true);
    expect(await decryptJson(legacy, password)).toEqual(payload);
  }, SLOW);
});
