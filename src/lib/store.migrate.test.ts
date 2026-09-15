import { describe, it, expect } from "vitest";
import { migratePersisted } from "./store";
import { isValidBackupPayload } from "./backupValidation";
import type { AppData } from "./types";

// ===== حارسُ سلسلة الهجرة =====
// هذا **المسارُ الوحيد في التطبيق الذي يعمل مرّةً واحدة لكلّ مستخدمٍ لكلّ
// ترقية، بلا إعادةٍ وبلا تراجع** — وكان بلا اختبارٍ واحد.
//
// وخطؤه لا يُرى: إن رمى ابتلعه `persist` فأقلع المالكُ على تطبيقٍ فارغ، وإن
// رشّح بياناتٍ خطأً اختفت المعاملاتُ من التخزين المحلّي ثمّ **نشرت المزامنةُ
// الخسارة** إلى بقيّة الأجهزة. وv17 وحدها تحذف أربع مجموعات وتُسقط كلّ معاملةٍ
// مؤجَّلة؛ وv3 تجمع سقوفَ أقسامٍ قديمة في قسمٍ واحد — حسابٌ على مال المالك
// يجري مرّةً ولا يراه أحد.
//
// هذه اختباراتُ **توصيف**: تثبّت ما تفعله السلسلةُ اليوم كما هو، قبل أن
// يمسّها أحد. فشلُ أيٍّ منها بعد تعديلٍ = التعديل غيّر مصير بياناتٍ محفوظة.

type Loose = Record<string, unknown>;
const rows = (d: AppData, key: string) => (d as unknown as Loose)[key] as Loose[] | undefined;

describe("لا ترمي أبداً — رميةٌ واحدة تعني إقلاعاً على تطبيقٍ فارغ", () => {
  it("حمولةٌ غائبة أو فارغة", () => {
    for (const v of [1, 5, 10, 17]) {
      expect(() => migratePersisted(undefined, v)).not.toThrow();
      expect(() => migratePersisted(null, v)).not.toThrow();
      expect(() => migratePersisted({}, v)).not.toThrow();
    }
  });

  it("حقولٌ غائبةٌ أو `null` — محروسةٌ بـ`?? []` فلا ترمي", () => {
    const sparse = { transactions: null, budgets: null, categories: null, reserves: null };
    for (const v of [1, 3, 8, 16, 17]) {
      expect(() => migratePersisted(structuredClone(sparse), v), `v${v}`).not.toThrow();
    }
  });

  // ⚠️ **ثغرةٌ موثَّقةٌ لا مُصلَحة** (كشفها هذا الملفّ عند كتابته، ٠٫١٫٤٢٤):
  // الحراسةُ كلُّها `?? []` — وهي تمسك `null`/`undefined` ولا تمسك **النوع
  // الخطأ**. فحمولةٌ فيها `transactions: "نصّ"` ترمي `TypeError`، و`persist`
  // يبتلع الرمية، فيُقلع المالك على **تطبيقٍ فارغ** والبياناتُ المشوّهة باقيةٌ
  // في IndexedDB تُعيد الكرّة كلَّ إقلاع.
  //
  // لم تُصلَح هنا عمداً: هذا المسار يعمل مرّةً واحدة بلا تراجع، وتغييرُه يحتاج
  // قرارَ المالك لا اجتهادَ جولةِ تنظيف. والاحتمالُ منخفض (الكتلة يكتبها
  // `JSON.stringify` للحالة نفسِها، فالقوائمُ قوائمُ دائماً) — التشوّهُ يحتاج
  // كتابةً ناقصةً إلى IndexedDB أو عبثاً خارجياً.
  //
  // **الاختبارُ يثبّت السلوك الحاليّ لا السلوك المرغوب.** إن حُرست الأنواع يوماً
  // فسيسقط هذا الاختبار — وذلك هو الإشعار المقصود: بدّله إلى `.not.toThrow()`.
  it("نوعٌ خطأ (لا غياب) يرمي اليوم — موثَّقٌ لا مقبول", () => {
    expect(() => migratePersisted({ transactions: "لا قائمة" }, 1)).toThrow(TypeError);
  });

  it("وكلُّ نسخةٍ من ١ إلى ١٧ تمرّ على حمولةٍ واقعية", () => {
    for (let v = 1; v <= 18; v++) {
      expect(() => migratePersisted(v1Payload(), v), `v${v}`).not.toThrow();
    }
  });
});

// حمولةُ v1 واقعية: أقسامٌ عربية قديمة، دخلٌ، وسقوفٌ تنهار على قسمٍ واحد.
function v1Payload(): Loose {
  return {
    transactions: [
      { id: "t1", date: "2024-01-05", amount: 100, category: "طعام", note: "سوق", type: "صرف" },
      { id: "t2", date: "2024-01-06", amount: 50, category: "مواصلات", note: "", type: "صرف" },
      { id: "t3", date: "2024-01-07", amount: 9000, category: "راتب", note: "", type: "دخل" },
      { id: "t4", date: "2024-01-08", amount: 300, category: "كمالي", note: "", type: "صرف", big: true },
    ],
    budgets: [
      { category: "طعام", limit: 800 },
      { category: "مواصلات", limit: 200 },
      { category: "صحة", limit: 100 },
      { category: "كمالي", limit: 500 },
    ],
    journalEntries: [{ id: "j1", date: "2024-01-05", content: "نص" }],
    prayerLogs: [],
  };
}

describe("v2 — الدخلُ يخرج، والأقسامُ المجهولة تخرج", () => {
  const out = migratePersisted(v1Payload(), 1);
  const txs = rows(out, "transactions") ?? [];

  it("لا معاملةَ دخلٍ تبقى", () => {
    expect(txs.some((t) => t.type === "دخل")).toBe(false);
    expect(txs.map((t) => t.id)).not.toContain("t3");
  });

  it("والمصاريفُ الثلاثة الباقية نجت", () => {
    expect(txs.map((t) => t.id).sort()).toEqual(["t1", "t2", "t4"]);
  });
});

describe("v3 — حسابٌ على مال المالك يجري مرّةً واحدة", () => {
  const out = migratePersisted(v1Payload(), 1);
  const budgets = rows(out, "budgets") ?? [];
  const txs = rows(out, "transactions") ?? [];

  it("الأقسامُ العربية القديمة صارت معرّفات", () => {
    expect(txs.find((t) => t.id === "t1")?.category).toBe("cat-essentials"); // طعام
    expect(txs.find((t) => t.id === "t2")?.category).toBe("cat-essentials"); // مواصلات
    expect(txs.find((t) => t.id === "t4")?.category).toBe("cat-luxuries");   // كمالي
  });

  it("**والسقوفُ تُجمع ولا يسقط منها ريال**", () => {
    // طعام ٨٠٠ + مواصلات ٢٠٠ + صحة ١٠٠ ⇒ أساسيات ١١٠٠ (لا ٨٠٠ ولا ١٠٠).
    const essentials = budgets.find((b) => b.category === "cat-essentials");
    expect(essentials?.limit).toBe(1100);
    expect(budgets.find((b) => b.category === "cat-luxuries")?.limit).toBe(500);
    // ومجموعُ السقوف بعد الانهيار = مجموعُها قبله.
    expect(budgets.reduce((s, b) => s + (b.limit as number), 0)).toBe(1600);
  });
});

describe("v6 — علامةُ «صرف كبير» تُنزع ولا تُسقط المعاملة", () => {
  it("المعاملةُ باقيةٌ بلا `big`", () => {
    const txs = rows(migratePersisted(v1Payload(), 1), "transactions") ?? [];
    const t4 = txs.find((t) => t.id === "t4");
    expect(t4).toBeDefined();
    expect(t4).not.toHaveProperty("big");
    expect(t4?.amount).toBe(300);
  });
});

describe("v17 — الكتلةُ المُتلِفة: أربعُ مجموعاتٍ تُحذف ومعاملاتٌ تُرشَّح", () => {
  const before: Loose = {
    transactions: [
      { id: "keep", date: "2026-01-01", amount: 10, category: "cat-essentials", note: "" },
      { id: "drop", date: "2026-01-02", amount: 20, category: "cat-essentials", note: "", deferred: true },
      {
        id: "strip", date: "2026-01-03", amount: 30, category: "cat-essentials", note: "",
        planId: "p1", planRole: "installment", planInstallmentNo: 2, planLinkedAt: 123,
      },
    ],
    recurring: [{ id: "r1" }],
    installmentPlans: [{ id: "p1" }],
    assets: [{ id: "a1" }],
    shelfItems: [{ id: "s1" }],
  };
  const out = migratePersisted(structuredClone(before), 16);
  const txs = rows(out, "transactions") ?? [];

  it("المعاملةُ المؤجَّلة تُحذف والعاديّة تبقى", () => {
    expect(txs.map((t) => t.id)).toEqual(["keep", "strip"]);
  });

  it("وحقولُ الخطّة تُنزع عمّا بقي — بلا مساسٍ بالمبلغ", () => {
    const strip = txs.find((t) => t.id === "strip")!;
    for (const f of ["planId", "planRole", "planInstallmentNo", "planLinkedAt", "deferred"]) {
      expect(strip, f).not.toHaveProperty(f);
    }
    expect(strip.amount).toBe(30);
    expect(strip.category).toBe("cat-essentials");
  });

  it("والمجموعاتُ الأربع تختفي من الحالة", () => {
    for (const k of ["recurring", "installmentPlans", "assets", "shelfItems"]) {
      expect(out as unknown as Loose, k).not.toHaveProperty(k);
    }
  });

  it("وحمولةٌ على v17 أصلاً لا تُمسّ", () => {
    const at17 = { transactions: [{ id: "x", date: "2026-01-01", amount: 5, category: "c", note: "" }] };
    const same = migratePersisted(structuredClone(at17), 17);
    expect(rows(same, "transactions")).toEqual(at17.transactions);
  });
});

describe("v18 — الرحلةُ المفردة تصير قائمة", () => {
  // المظروف كان يحمل `trip` واحدة، فبدءُ رحلةٍ ثانية عليه يمحو الأولى. الهجرةُ
  // تحوّلها إلى `trips[]` **بمعرّفٍ مشتقّ** من تاريخ بدئها لا عشوائيّ: جهازان
  // يهاجران اللقطةَ نفسَها يصلان إلى المعرّف نفسِه، فلا تتضاعف عند أوّل دمج.
  const before = {
    reserves: [
      { id: "f1", name: "سفر", icon: "🎒", color: "#000", deposits: [], createdAt: "2026-01-01",
        trip: { startedAt: "2026-03-10", endedAt: "2026-03-14" } },
      { id: "f2", name: "جارية", icon: "✈️", color: "#000", deposits: [], createdAt: "2026-01-01",
        trip: { startedAt: "2026-06-01" } },
      { id: "f3", name: "بلا سفر", icon: "📦", color: "#000", deposits: [], createdAt: "2026-01-01" },
    ],
  };
  const out = migratePersisted(structuredClone(before), 17);
  const funds = rows(out, "reserves") ?? [];

  it("المنتهيةُ تُنقل بتاريخيها", () => {
    expect(funds[0].trips).toEqual([{ id: "trip-2026-03-10", startedAt: "2026-03-10", endedAt: "2026-03-14" }]);
  });

  it("والجاريةُ تبقى جاريةً (بلا `endedAt` مخترَع)", () => {
    expect(funds[1].trips).toEqual([{ id: "trip-2026-06-01", startedAt: "2026-06-01" }]);
  });

  it("والحقلُ القديم يختفي فلا يبقى مصدران", () => {
    for (const f of funds) expect(f).not.toHaveProperty("trip");
  });

  it("ومظروفٌ بلا سفرٍ لا يكتسب قائمةً فارغة", () => {
    expect(funds[2]).not.toHaveProperty("trips");
  });

  it("والمعرّفُ مشتقٌّ — هجرتان للقطة نفسِها تعطيان المعرّف نفسَه", () => {
    const again = rows(migratePersisted(structuredClone(before), 17), "reserves") ?? [];
    expect((again[0].trips as { id: string }[])[0].id).toBe((funds[0].trips as { id: string }[])[0].id);
  });
});

describe("السلسلةُ كاملةً من v1: لا فقدَ غيرَ المقصود، وناتجٌ صالح", () => {
  const out = migratePersisted(v1Payload(), 1);

  it("المذكراتُ تعبر بلا مساس", () => {
    expect(rows(out, "journalEntries")).toEqual([{ id: "j1", date: "2024-01-05", content: "نص" }]);
  });

  it("والحقولُ التي تضيفها النسخُ اللاحقة حاضرة", () => {
    const o = out as unknown as Loose;
    expect(o.reserves).toEqual([]);
    expect(o.futureLetters).toEqual([]);
    expect(o.salaryDay).toBe(27);
    expect(o.themePalette).toBe("madar");
    expect(o.sectionPalettes).toEqual({});
  });

  it("**والناتجُ يمرّ من بوّابة التحقّق نفسِها التي تحرس النسخ الاحتياطية**", () => {
    // إن رفضه المُدقّق فالمالكُ لا يستطيع تصدير ما هاجر إليه — عطلٌ صامت.
    expect(isValidBackupPayload(out)).toBe(true);
  });
});
