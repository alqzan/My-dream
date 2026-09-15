import { describe, it, expect } from "vitest";
import { isStorageUrl, hashFromStorageUrl, photoHash, mediaHashOf, mediaTombKey } from "./mediaHash";

// ===== بصمةُ الوسائط: عقدٌ بين وحدتين لا تريان بعضهما =====
// `sync.ts` يحوّل الصورة إلى مرجعٍ سحابيّ ببصمتها، و`store.ts` يختم شاهدَ حذفٍ
// بالبصمة نفسِها. **لو اختلفتا لما طابق الشاهدُ مرجعَه أبداً**: صورةٌ يحذفها
// المالك تبقى حيّةً على الأجهزة الأخرى وتعود، أو — في الاتجاه المعاكس — يُختم
// شاهدٌ على بصمةٍ خطأ فتختفي صورةٌ لم تُحذف. الملفُّ كان بلا اختبارٍ واحد.
// والصيغةُ نفسُها عقد: ٣٢ محرفاً hex. تغييرُها يُيتّم كلَّ ما في R2.

describe("البصمةُ من رابطٍ سحابيّ", () => {
  it("رابطُ الوسيط الجديد: البصمةُ في `hash`", () => {
    const url = "https://w.example.com/v1/media/blob?hash=0123456789abcdef0123456789abcdef&exp=1";
    expect(hashFromStorageUrl(url)).toBe("0123456789abcdef0123456789abcdef");
    expect(isStorageUrl(url)).toBe(true);
  });

  it("وحروفُها الكبيرة تُخفَّض — فلا تنقسم البصمةُ الواحدة اثنتين", () => {
    const upper = "https://w.example.com/b?hash=0123456789ABCDEF0123456789ABCDEF";
    expect(hashFromStorageUrl(upper)).toBe("0123456789abcdef0123456789abcdef");
  });

  it("والرابطُ القديم (Firebase): البصمةُ آخرُ مقطعٍ في المسار", () => {
    const legacy = "https://firebasestorage.googleapis.com/v0/b/x/o/media%2Fabcdef0123456789abcdef0123456789?alt=media";
    expect(hashFromStorageUrl(legacy)).toBe("abcdef0123456789abcdef0123456789");
  });

  it("وما ليس بصمةً يُرفض — لا يُخترع مرجع", () => {
    for (const bad of [
      "https://w.example.com/b?hash=قصير",
      "https://w.example.com/b?hash=0123456789abcdef0123456789abcdefEXTRA",
      "https://example.com/photo.jpg",
      "ليس رابطاً",
      "",
    ]) {
      expect(hashFromStorageUrl(bad), bad).toBeNull();
      expect(isStorageUrl(bad), bad).toBe(false);
    }
  });
});

describe("البصمةُ من البايتات", () => {
  it("٣٢ محرف hex — الصيغةُ عقدٌ مع ما هو مخزَّنٌ في R2 اليوم", async () => {
    const hash = await photoHash("data:image/webp;base64,AAAA");
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it("**قيمةٌ مثبَّتة**: تغيُّرها يُيتّم كلَّ وسائط السحابة", async () => {
    // SHA-256 لـ`data:image/webp;base64,AAAA`، أوّل ٣٢ محرفاً.
    expect(await photoHash("data:image/webp;base64,AAAA"))
      .toBe("fc816836f9cca8fb1e3f50f8abaf1f7b");
  });

  it("نفسُ البايتات ⇒ نفسُ البصمة، واختلافُ محرفٍ يغيّرها", async () => {
    const a = await photoHash("data:image/webp;base64,AAAA");
    expect(await photoHash("data:image/webp;base64,AAAA")).toBe(a);
    expect(await photoHash("data:image/webp;base64,AAAB")).not.toBe(a);
  });
});

describe("mediaHashOf — البوّابةُ التي يشترك فيها الطرفان", () => {
  it("تقرأ الرابط والبايتات معاً، وتردّ ما عداهما", async () => {
    const url = "https://w.example.com/b?hash=0123456789abcdef0123456789abcdef";
    expect(await mediaHashOf(url)).toBe("0123456789abcdef0123456789abcdef");
    expect(await mediaHashOf("data:image/webp;base64,AAAA")).toMatch(/^[a-f0-9]{32}$/);
    expect(await mediaHashOf("")).toBeNull();
    expect(await mediaHashOf("blob:https://x/y")).toBeNull();
  });

  it("**والصورةُ نفسُها تعطي البصمةَ نفسَها قبل الرفع وبعده** — وهذا كلُّ الغرض", async () => {
    const bytes = "data:image/webp;base64,AAAA";
    const local = await mediaHashOf(bytes);
    const afterUpload = await mediaHashOf(`https://w.example.com/b?hash=${local}&exp=9`);
    expect(afterUpload).toBe(local);
  });
});

describe("مفتاحُ شاهدِ حذف الوسيط", () => {
  it("يفرّق بالمذكرة والنوع والبصمة", () => {
    expect(mediaTombKey("e1", "photos", "abc")).toBe(mediaTombKey("e1", "photos", "abc"));
    expect(mediaTombKey("e1", "photos", "abc")).not.toBe(mediaTombKey("e2", "photos", "abc"));
    expect(mediaTombKey("e1", "photos", "abc")).not.toBe(mediaTombKey("e1", "audios", "abc"));
    expect(mediaTombKey("e1", "photos", "abc")).not.toBe(mediaTombKey("e1", "photos", "abd"));
  });
});
